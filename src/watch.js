



(() => {
  const SHARED = window.OBJECTFLIX_SHARED;

  const elements = {
    watchView: document.getElementById('watchView'),
  };

  const state = {
    item: null,
    episode: null,
    player: null,
    library: [],
    secretEpisodes: new Map(),
    booted: false,
    isGuest: false,
    reviewRating: 0,
  };

  
  window.OBJECTFLIX_WATCH = {
    get player() { return state.player; },
    get item() { return state.item; },
    get episode() { return state.episode; },
    get library() { return state.library; },
    playEpisode,
    playTitle,
    SHARED,
  };

  
  
  

  function currentUser() {
    return JSON.parse(localStorage.getItem('objectflix_current_user') || 'null');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function formatReviewDate(ts) {
    try { return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return ''; }
  }

  
  
  

  function showLoading() {
    elements.watchView.innerHTML = `
      <section class="section" style="min-height:60vh;display:grid;place-items:center;text-align:center">
        <div class="player-loading" role="status" aria-live="polite">
          <span class="loading-spinner" aria-hidden="true"></span>
          <span>Loading the Objectflix library…</span>
        </div>
      </section>
    `;
  }

  function renderError(error) {
    const message = error?.message || 'Something went wrong while loading the library.';
    elements.watchView.innerHTML = `
      <section class="section" style="min-height:60vh;display:grid;place-items:center;text-align:center">
        <div>
          <p class="eyebrow">CONNECTION LOST</p>
          <h2>Couldn't reach the Objectflix library</h2>
          <p style="max-width:520px;margin:12px auto 24px;color:var(--muted)">${message}</p>
          <a class="button button--primary" href="browse.html">Back to Browse</a>
        </div>
      </section>
    `;
  }

  function renderShowNotFound(message) {
    elements.watchView.innerHTML = `
      <section class="section" style="min-height:60vh;display:grid;place-items:center;text-align:center">
        <div>
          <p class="eyebrow">NOTHING PLAYING</p>
          <h2>${message}</h2>
          <p style="max-width:520px;margin:12px auto 24px;color:var(--muted)">Pick a title from the catalog to start watching.</p>
          <a class="button button--primary" href="browse.html">Browse Shows</a>
        </div>
      </section>
    `;
  }

  
  
  

  function resolveEpisode(item, episodeId) {
    if (!item) return null;
    if (!episodeId) return item.episodes[0] || null;
    return item.episodes.find((ep) => ep.id === episodeId) || item.episodes[0] || null;
  }

  function updateUrl(showId, episodeId) {
    const url = new URL(window.location.href);
    url.searchParams.set('id', showId);
    url.searchParams.set('ep', episodeId);
    window.history.replaceState({}, '', url);
  }

  
  
  

  function guardContent(item, proceed) {
    const warning = window.OBJECTFLIX_WARNING;
    if (!warning) {
      proceed();
      return;
    }
    const shown = warning.guard(item, {
      onContinue: proceed,
      onCancel: () => {
        if (state.booted) return;
        if (window.history.length > 1) window.history.back();
        else window.location.href = 'browse.html';
      },
    });
    if (!shown) proceed();
  }

  function renderWatch() {
    const item = state.item;
    const episode = state.episode;
    state.booted = true;

    if (state.player) {
      state.player.destroy();
      state.player = null;
    }

    const hasVideo = Boolean(episode?.videoUrl);
    const next = SHARED.nextEpisode(item, episode);

    if (item && episode) {
      document.title = `${episode.episodeNumber}. ${episode.title} — ${item.title} | Objectflix`;
    }

    elements.watchView.innerHTML = `
      <div class="watch-layout">
        <div class="watch-main">
        <button class="watch-expand-btn is-hidden" type="button" data-action="expand-side">Show episodes, reviews & more ⇤</button>
        <section class="player-panel" aria-label="Video player">
          ${hasVideo
            ? renderWatchPlayerMarkup(item, episode)
            : `
              <div class="player-screen ${episode ? 'player-screen--active' : ''}">
                ${episode ? `<div class="player-screen__meta"><span class="eyebrow">NOW PLAYING</span><strong>${episode.title}</strong><span class="player-screen__hint">No stream available for this episode yet.</span></div>` : ''}
              </div>
            `}
        </section>

        <div class="watch-grid">
          <section class="watch-hero">
            <p class="eyebrow">NOW WATCHING</p>
            <h1>${episode.episodeNumber}. ${episode.title}</h1>
            <div class="watch-meta">
              <span>${item.title}</span>
              <span>${item.match}</span>
              <span>${item.year}</span>
              <span>${item.rating}</span>
              <span>${item.duration}</span>
              ${state.isGuest ? '<span class="guest-badge">GUEST MODE</span>' : ''}
            </div>
            <p class="watch-description">${episode.description || item.description}</p>
            <div class="pill-row">${item.genres.map((genre) => `<span class="pill">${genre}</span>`).join('')}</div>
            ${state.isGuest ? '<p class="watch-guest-note">You’re watching as a guest. <a href="auth.html">Sign in</a> to save progress and unlock your profiles.</p>' : ''}
          </section>

          <aside class="next-panel">
            <p class="eyebrow">UP NEXT</p>
            <h3>${next ? next.title : 'No more episodes'}</h3>
            <p>${next ? (next.description || 'Next episode details will appear here.') : 'You’ve reached the end of this show.'}</p>
            <div class="button-row">
              <button class="button button--primary" type="button" data-action="next-episode" ${next ? '' : 'disabled'}>Play Next Episode</button>
              <button class="button button--secondary" type="button" data-action="details" data-id="${item.id}">Show Details</button>
            </div>
          </aside>
        </div>
        </div>

        <aside class="watch-side">
        <section class="watch-tabs">
          <div class="watch-tabs__nav" role="tablist" aria-label="Watch page sections">
            <button class="watch-tab is-active" type="button" role="tab" data-tab="episodes" aria-selected="true">Episodes <span class="watch-tab__count">${item.episodes.length}</span></button>
            <button class="watch-tab" type="button" role="tab" data-tab="reviews" aria-selected="false" id="reviewsTab">Reviews <span class="watch-tab__count" id="reviewsTabCount">0</span></button>
            <button class="watch-tab" type="button" role="tab" data-tab="recommended" aria-selected="false">Recommended</button>
            <button class="watch-tab-collapse" type="button" data-action="collapse-side" aria-label="Collapse side panel" title="Collapse">⇥</button>
            <div class="watch-tabs__spacer"></div>
            <div class="carousel-controls" data-carousel-controls>
              <button class="carousel-button" type="button" data-carousel="ep-prev" aria-label="Scroll left"><svg class="ui-icon" aria-hidden="true"><use href="./assets/ui/icons.svg#arrow-left"></use></svg></button>
              <button class="carousel-button" type="button" data-carousel="ep-next" aria-label="Scroll right"><svg class="ui-icon" aria-hidden="true"><use href="./assets/ui/icons.svg#arrow-right"></use></svg></button>
            </div>
          </div>
          <div class="watch-tabs__body">
            <div class="watch-tab-panel is-active" data-panel="episodes" role="tabpanel">
              <div class="episode-carousel" id="episodeCarousel">
                ${item.episodes.map((ep) => renderEpisodeCard(item, ep)).join('')}
              </div>
            </div>
            <div class="watch-tab-panel" data-panel="reviews" role="tabpanel">
              <div class="watch-reviews">
                <div class="reviews-summary" id="reviewsAverage"></div>
                <p class="sr-only" id="reviewsSummary">Loading reviews…</p>
                <form class="review-form" id="reviewForm">
                  <div class="review-stars" id="reviewStars" role="radiogroup" aria-label="Rate this episode from 1 to 10">
                    ${Array.from({ length: 10 }, (_, i) => `<button type="button" class="review-star" data-star="${i + 1}" aria-label="${i + 1} out of 10">★</button>`).join('')}
                    <span class="review-rating-hint" id="reviewRatingHint">Tap a star to rate (1–10)</span>
                  </div>
                  <label class="community-label">Your thoughts
                    <textarea class="community-textarea" id="reviewBody" required maxlength="2000" placeholder="What did you think of this episode?"></textarea>
                  </label>
                  <div class="review-form-row">
                    <label class="community-label">Name
                      <input class="community-input" id="reviewName" maxlength="80" value="${escapeHtml(state.isGuest ? 'Guest' : (currentUser()?.displayName || currentUser()?.username || ''))}" />
                    </label>
                    <label class="review-guest-toggle">
                      <input type="checkbox" id="reviewGuestToggle" ${state.isGuest ? 'checked disabled' : ''} />
                      <span>Post as guest</span>
                    </label>
                  </div>
                  <div class="community-footer">
                    <button class="button button--primary" type="submit" id="reviewSubmitBtn">Post Review</button>
                  </div>
                  <p class="auth-alert is-hidden" id="reviewError" role="alert"></p>
                </form>
                <div class="reviews-list" id="reviewsList"></div>
              </div>
            </div>
            <div class="watch-tab-panel" data-panel="recommended" role="tabpanel">
              <div class="recommend-grid">
                ${state.library.filter((entry) => entry.id !== item.id).slice(0, 4).map((entry) => `
                  <article class="recommend-card">
                    <img src="${entry.backdrop}" alt="${entry.title} backdrop placeholder" />
                    <div class="recommend-card__content">
                      <div class="recommend-card__title">${entry.title}</div>
                      <div class="card-meta"><span>${entry.match}</span><span>${entry.duration}</span></div>
                      <button class="button button--secondary" type="button" data-action="play" data-id="${entry.id}">Watch</button>
                    </div>
                  </article>
                `).join('')}
              </div>
            </div>
          </div>
        </section>
        </aside>
      </div>
    `;

    if (hasVideo) void mountWatchPlayer();
    void initReviews();
    bindReviewEvents();
  }

  function renderWatchPlayerMarkup(item, episode) {
    return `
      <div class="objectflix-player is-loading" id="watchPlayer" tabindex="0" aria-label="Video player. Press Space or K to play and pause.">
        <div class="player-media">
          <video
            id="watchVideo"
            data-episode-id="${episode.id}"
            preload="metadata"
            playsinline
            webkit-playsinline="true"
            disablepictureinpicture
          >
            Your browser does not support HTML video.
          </video>

          <canvas id="watchSubtitleCanvas" class="JASSUB"></canvas>

          <div class="player-loading" role="status" aria-live="polite">
            <span class="loading-spinner" aria-hidden="true"></span>
            <span>Loading ${item.title} — ${episode.title}</span>
          </div>

          <button class="center-play" id="watchCenterPlay" type="button" aria-label="Play video">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" /></svg>
          </button>

          <div class="player-message is-hidden" id="watchPlayerMessage" role="alert">
            <strong id="watchPlayerMessageTitle"></strong>
            <span id="watchPlayerMessageText"></span>
          </div>
        </div>

        <div class="player-controls">
          <label class="progress-control" for="watchProgress">
            <span class="sr-only">Video progress</span>
            <input
              class="player-range player-range--progress"
              id="watchProgress"
              type="range"
              min="0"
              max="100"
              value="0"
              step="0.01"
              aria-valuetext="0 minutes 0 seconds"
            />
          </label>

          <div class="controls-row">
            <div class="controls-group">
              <button class="player-control-button" id="watchPlayPause" type="button" aria-label="Play video">
                <svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" /></svg>
                <svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg>
              </button>

              <div class="volume-control">
                <button class="player-control-button" id="watchMute" type="button" aria-label="Mute video">
                  <svg class="icon-volume" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zm11.5-.8v7.6a4.5 4.5 0 0 0 0-7.6zm0-3v2.1a7 7 0 0 1 0 9.4v2.1a9 9 0 0 0 0-13.6z" /></svg>
                  <svg class="icon-muted" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zm11.2.1 1.4 1.4 1.4-1.4 1.4 1.4-1.4 1.4 1.4-1.4 1.4-1.4 1.4-1.4 1.4-1.4 1.4-1.4 1.4-1.4z" /></svg>
                </button>
                <label class="volume-slider-wrap" for="watchVolume">
                  <span class="sr-only">Volume</span>
                  <input class="player-range player-range--volume" id="watchVolume" type="range" min="0" max="1" value="1" step="0.01" />
                </label>
              </div>

              <div class="time-display" aria-live="off">
                <span id="watchCurrentTime">0:00</span>
                <span aria-hidden="true">/</span>
                <span id="watchTotalDuration">0:00</span>
              </div>
            </div>

            <div class="controls-group">
              <select class="player-control-select" id="watchSubtitleSelect" title="Select Subtitles">
                <option value="">Off</option>
              </select>
              <span class="subtitle-indicator" id="watchSubtitleIndicator" title="Subtitle status">ASS</span>
              <button class="player-control-button" id="watchFullscreen" type="button" aria-label="Enter fullscreen">
                <svg class="icon-enter-fullscreen" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM6 15v3h3v2H4v-5zm12 3v-3h2v5h-5v-2z" /></svg>
                <svg class="icon-exit-fullscreen" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4V7h3V4zm6 0h2v3h3v2h-5zM4 15h5v5H7v-3H4zm11 0h5v2h-3v3h-2z" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderEpisodeCard(item, episode) {
    const active = state.episode && state.episode.id === episode.id;
    const secret = episode.secret;
    const unreleased = episode.released === false;
    return `
      <article class="episode-card ${active ? 'episode-card--active' : ''} ${secret ? 'episode-card--secret' : ''} ${unreleased ? 'episode-card--upcoming' : ''}">
        <div class="episode-card__content">
          <div class="episode-card__title">${episode.episodeNumber}. ${episode.title}${secret ? ' <span class="secret-badge">SECRET</span>' : ''}${unreleased ? ' <span class="upcoming-badge" style="background:#7c3aed;color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:4px;margin-left:6px;font-weight:700;">UPCOMING</span>' : ''}</div>
          <div class="card-meta"><span>${SHARED.formatEpisodeMeta(episode)}</span>${unreleased ? '<span>Unreleased</span>' : (episode.videoUrl ? '<span>Streaming ready</span>' : '')}</div>
          <p>${episode.description || (unreleased ? `This episode hasn't been released yet! Check back later. Expected release: ${episode.releaseDate}` : (secret ? 'Recovered from the Objectflix ARG. The real edition was thought to be lost forever.' : 'No description available.'))}</p>
          <div class="button-row">
            <button class="button ${unreleased ? 'button--secondary' : 'button--primary'}" type="button" data-action="play-episode" data-id="${item.id}" data-episode="${episode.id}">${unreleased ? '📅 Release Info' : '▶ Play'}</button>
          </div>
        </div>
      </article>
    `;
  }


  function askAdminsForCurrentEpisode() {
    window.OBJECTFLIX_COMMUNITY?.openEpisodeRequest?.({
      title: state.item?.title || '',
      episodeNumber: String(state.episode?.episodeNumber ?? ''),
      episodeTitle: state.episode?.title || '',
    });
  }

  function showEpisodeMissingScreen() {
    if (state.player) {
      state.player.destroy();
      state.player = null;
    }
    const panel = elements.watchView.querySelector('.player-panel');
    if (!panel || !state.episode) return;
    panel.innerHTML = `
      <div class="player-screen player-screen--active">
        <div class="player-screen__meta">
          <span class="eyebrow">NOT AVAILABLE</span>
          <strong>${state.episode.title}</strong>
          <span class="player-screen__hint">The episode is not on the backend right now... You could ask for admins to upload them on demand!</span>
          <button class="button button--primary" type="button" id="askAdminsBtn" style="margin-top:18px">Ask Admins</button>
        </div>
      </div>
    `;
    panel.querySelector('#askAdminsBtn')?.addEventListener('click', askAdminsForCurrentEpisode);

    const params = new URLSearchParams(window.location.search);
    if (params.get('ask')) {
      params.delete('ask');
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
      askAdminsForCurrentEpisode();
    }
  }

  async function mountWatchPlayer() {
    const Player = window.ObjectflixPlayer;
    if (!Player) {
      console.warn('ObjectflixPlayer module not loaded; player unavailable.');
      return;
    }

    const episodeId = state.episode?.id;
    if (!episodeId) return;

    const ids = {
      video: 'watchVideo',
      canvas: 'watchSubtitleCanvas',
      controls: 'watchPlayer',
      centerPlay: 'watchCenterPlay',
      playPause: 'watchPlayPause',
      mute: 'watchMute',
      fullscreen: 'watchFullscreen',
      progress: 'watchProgress',
      volume: 'watchVolume',
      currentTime: 'watchCurrentTime',
      totalDuration: 'watchTotalDuration',
      subtitleIndicator: 'watchSubtitleIndicator',
      subtitleSelect: 'watchSubtitleSelect',
      message: 'watchPlayerMessage',
      messageTitle: 'watchPlayerMessageTitle',
      messageText: 'watchPlayerMessageText',
    };

    const playerElements = {};
    for (const [key, id] of Object.entries(ids)) {
      playerElements[key] = document.getElementById(id);
      if (!playerElements[key]) {
        console.error(`Watch player element #${id} not found.`);
        return;
      }
    }

    let subtitles = [];
    let subtitleUrl = null;
    try {
      subtitles = await window.OBJECTFLIX_API.getEpisodeSubtitles(episodeId);
      if (subtitles.length) subtitleUrl = SHARED.toAbsoluteMediaUrl(subtitles[0].url);
    } catch {
    }

    if (state.episode?.id !== episodeId) return;
    if (!playerElements.video.isConnected) return;

    if (!(await SHARED.isEpisodeStreamable(state.episode.videoUrl))) {
      if (state.episode?.id !== episodeId || !playerElements.video.isConnected) return;
      showEpisodeMissingScreen();
      return;
    }

    const player = new Player({ ...playerElements, fakeDuration: state.episode.fakeDuration });
    state.player = player;

    if (playerElements.subtitleSelect) {
      playerElements.subtitleSelect.innerHTML = '<option value="">Off</option>';
      subtitles.forEach((sub) => {
        const opt = document.createElement('option');
        opt.value = SHARED.toAbsoluteMediaUrl(sub.url);
        const langName = sub.language === 'en' ? 'English' : sub.language === 'vn' ? 'Vietnamese' : (sub.language || 'Unknown').toUpperCase();
        opt.textContent = langName;
        playerElements.subtitleSelect.appendChild(opt);
      });
      if (subtitleUrl) {
        playerElements.subtitleSelect.value = subtitleUrl;
      }
      playerElements.subtitleSelect.addEventListener('change', (event) => {
        player.setSubtitleTrack(event.target.value);
      });
    }

    player.load({ src: state.episode.videoUrl, subtitleUrl });
  }


  function playEpisode(itemId, episodeId) {
    const item = state.library.find((entry) => entry.id === itemId) || state.item;
    if (!item) return;
    const episode = item.episodes.find((ep) => ep.id === episodeId);
    if (!episode) return;
    guardContent(item, () => {
      if (episode.released === false) {
        SHARED.showUnreleasedNoticeModal(episode);
        return;
      }
      state.item = item;
      state.episode = episode;
      updateUrl(item.id, episode.id);
      renderWatch();
      window.scrollTo({ top: 0 });
    });
  }

  function playTitle(id) {
    const item = state.library.find((entry) => entry.id === id);
    if (!item) return;
    guardContent(item, () => {
      const episode = item.episodes[0] || null;
      if (!episode) return;
      state.item = item;
      state.episode = episode;
      updateUrl(item.id, episode.id);
      renderWatch();
      window.scrollTo({ top: 0 });
    });
  }


  function localReviewsKey() { return `objectflix_reviews_${state.episode.id}`; }
  function readLocalReviews() {
    try { return JSON.parse(localStorage.getItem(localReviewsKey()) || '[]'); } catch { return []; }
  }
  function writeLocalReviews(list) {
    try { localStorage.setItem(localReviewsKey(), JSON.stringify(list)); } catch {}
  }

  async function initReviews() {
    const container = document.getElementById('reviewsList');
    const avgEl = document.getElementById('reviewsAverage');
    const summaryEl = document.getElementById('reviewsSummary');
    if (!container || !state.episode) return;
    let reviews = [];
    try {
      const res = await window.OBJECTFLIX_API.listEpisodeReviews(state.episode.id);
      reviews = res.reviews || [];
      if (reviews.length === 0) reviews = readLocalReviews();
    } catch {
      reviews = readLocalReviews();
    }
    const count = reviews.length;
    const average = count ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null;
    if (avgEl) {
      avgEl.innerHTML = count
        ? `<span class="reviews-avg">${average}/10</span> <span class="reviews-count">${count} review${count === 1 ? '' : 's'}</span>`
        : '';
    }
    if (summaryEl) summaryEl.textContent = count ? `${count} review${count === 1 ? '' : 's'} · avg ${average}/10` : 'Be the first to review this episode.';
    const tabCount = document.getElementById('reviewsTabCount');
    if (tabCount) tabCount.textContent = String(count);
    container.innerHTML = reviews.length
      ? reviews.slice().reverse().map((r) => `
          <article class="review-card">
            <div class="review-card__head">
              <span class="review-author">${escapeHtml(r.authorName)}${r.authorType === 'guest' ? ' <span class="guest-badge">GUEST</span>' : ''}</span>
              <span class="review-rating">${'★'.repeat(r.rating)}<span class="review-rating-num">${r.rating}/10</span></span>
            </div>
            <p class="review-body">${escapeHtml(r.body)}</p>
            <span class="review-date">${formatReviewDate(r.createdAt)}</span>
          </article>
        `).join('')
      : '<p class="reviews-empty">No reviews yet. Share your thoughts above!</p>';
  }

  function bindReviewEvents() {
    const stars = document.querySelectorAll('#reviewStars .review-star');
    const hint = document.getElementById('reviewRatingHint');
    stars.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.reviewRating = Number(btn.dataset.star);
        stars.forEach((s) => s.classList.toggle('is-lit', Number(s.dataset.star) <= state.reviewRating));
        if (hint) hint.textContent = `${state.reviewRating}/10`;
      });
    });

    const guestToggle = document.getElementById('reviewGuestToggle');
    const nameInput = document.getElementById('reviewName');
    if (guestToggle && nameInput) {
      guestToggle.addEventListener('change', () => {
        if (guestToggle.checked) {
          if (!nameInput.value.trim() || nameInput.value.trim() === (currentUser()?.displayName || '')) {
            nameInput.value = 'Guest';
          }
        } else {
          const u = currentUser();
          nameInput.value = u?.displayName || u?.username || '';
        }
      });
    }

    const form = document.getElementById('reviewForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('reviewError');
        const submitBtn = document.getElementById('reviewSubmitBtn');
        const body = document.getElementById('reviewBody')?.value?.trim() || '';
        const name = document.getElementById('reviewName')?.value?.trim() || 'Guest';
        const guest = document.getElementById('reviewGuestToggle')?.checked ?? state.isGuest;
        if (!state.reviewRating) {
          if (errorEl) { errorEl.textContent = 'Please pick a star rating first.'; errorEl.classList.remove('is-hidden'); }
          return;
        }
        if (!body) {
          if (errorEl) { errorEl.textContent = 'Please write a review.'; errorEl.classList.remove('is-hidden'); }
          return;
        }
        if (errorEl) errorEl.classList.add('is-hidden');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Posting…'; }
        try {
          try {
            await window.OBJECTFLIX_API.submitEpisodeReview({
              episodeId: state.episode.id,
              rating: state.reviewRating,
              body,
              authorName: name,
              authorType: guest ? 'guest' : 'account',
              userId: guest ? null : (currentUser()?.id || null),
            });
          } catch {
            const list = readLocalReviews();
            list.push({ id: 'local-' + Date.now(), episodeId: state.episode.id, rating: state.reviewRating, body, authorName: name, authorType: guest ? 'guest' : 'account', userId: guest ? null : (currentUser()?.id || null), createdAt: Date.now() });
            writeLocalReviews(list);
          }
          const bodyEl = document.getElementById('reviewBody');
          if (bodyEl) bodyEl.value = '';
          state.reviewRating = 0;
          stars.forEach((s) => s.classList.remove('is-lit'));
          if (hint) hint.textContent = 'Tap a star to rate (1–10)';
          await initReviews();
        } catch (err) {
          if (errorEl) { errorEl.textContent = err?.message || 'Could not post review.'; errorEl.classList.remove('is-hidden'); }
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Post Review'; }
        }
      });
    }

    
    document.querySelectorAll('[data-carousel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const carousel = document.getElementById('episodeCarousel');
        if (!carousel) return;
        const dir = btn.dataset.carousel === 'ep-next' ? 1 : -1;
        carousel.scrollBy({ left: dir * 320, behavior: 'smooth' });
      });
    });

    
    document.querySelectorAll('.watch-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.watch-tab').forEach((t) => {
          const active = t === tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', String(active));
        });
        document.querySelectorAll('.watch-tab-panel').forEach((panel) => {
          panel.classList.toggle('is-active', panel.dataset.panel === tab.dataset.tab);
        });
        const controls = document.querySelector('[data-carousel-controls]');
        if (controls) controls.style.display = tab.dataset.tab === 'episodes' ? '' : 'none';
      });
    });
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const actionButton = target.closest('[data-action]');
      if (!actionButton) return;
      const { action, id, episode } = actionButton.dataset;

      if (action === 'collapse-side') {
        const layout = document.querySelector('.watch-layout');
        layout?.classList.add('is-collapsed');
        document.querySelector('.watch-expand-btn')?.classList.remove('is-hidden');
      }
      if (action === 'expand-side') {
        document.querySelector('.watch-layout')?.classList.remove('is-collapsed');
        document.querySelector('.watch-expand-btn')?.classList.add('is-hidden');
      }
      if (action === 'play-episode') playEpisode(id, episode);
      if (action === 'next-episode') {
        const next = SHARED.nextEpisode(state.item, state.episode);
        if (next) playEpisode(state.item.id, next.id);
      }
      if (action === 'play') playTitle(id);
      if (action === 'details') {
        window.location.href = `browse.html?details=${encodeURIComponent(id)}`;
      }
    });
  }


  function init() {
    const user = currentUser();
    const guestMode = !user || user.provider === 'guest' || localStorage.getItem('objectflix_guest') === 'true';
    state.isGuest = guestMode;
    if (guestMode && !user) {
      const guestUser = { provider: 'guest', id: 'guest', displayName: 'Guest', username: 'guest', email: '' };
      localStorage.setItem('objectflix_current_user', JSON.stringify(guestUser));
      localStorage.setItem('objectflix_guest', 'true');
    }

    const urlParams = new URLSearchParams(window.location.search);
    let showId = urlParams.get('id');
    let episodeId = urlParams.get('ep') || '';
    const showAcronym = urlParams.get('show') || '';

    showLoading();

    SHARED.restoreArgUnlock();

    void (async () => {
      try {
        const movieNightId = urlParams.get('movieNight');
        if (movieNightId) {
          const event = await window.OBJECTFLIX_MEMBERSHIP.request(`/api/movie-nights/${encodeURIComponent(movieNightId)}/join`, { method: 'POST' });
          const permitted = new URL(event.watchUrl);
          showId = permitted.searchParams.get('id');
          episodeId = permitted.searchParams.get('ep');
          if (!showId || !episodeId) throw new Error('This Movie Night has no available episode.');
        }
        state.library = await SHARED.loadLibrary();
        await SHARED.injectSecretEpisodes(state.library, state.secretEpisodes);
        if (SHARED.isArgUnlocked()) state.library = SHARED.applyArgArchiveFilter(state.library);
      } catch (error) {
        console.error('Failed to load the Objectflix library:', error);
        renderError(error);
        return;
      }

      if (!showId && showAcronym) {
        const found = SHARED.findShow(state.library, showAcronym);
        if (!found) {
          renderShowNotFound(`Show "${showAcronym}" not found.`);
          return;
        }
        showId = found.id;
        if (episodeId) {
          const ep = found.episodes.find((e) => String(e.episodeNumber) === String(episodeId));
          if (ep) {
            episodeId = ep.id;
            window.history.replaceState(null, '', `watch.html?id=${found.id}&ep=${ep.id}`);
          }
        }
      }

      if (!showId) {
        renderShowNotFound('No show selected.');
        return;
      }

      state.item = state.library.find((entry) => entry.id === showId) || null;
      if (!state.item) {
        renderShowNotFound(`"${showId}" is not in the catalog.`);
        return;
      }

      state.episode = resolveEpisode(state.item, episodeId);
      guardContent(state.item, () => {
        renderWatch();
      });
    })();
  }

  bindEvents();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
