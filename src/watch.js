// Objectflix: this is the watch part, kept here so the rest of the app knows exactly where to look.




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
    subtitleTracks: [],
    workshop: { reports: [], submissions: [] },
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
    state.subtitleTracks = [];

    if (item && episode) {
      document.title = `${episode.episodeNumber}. ${episode.title} — ${item.title} | Objectflix`;
    }

    elements.watchView.innerHTML = `
      <div class="watch-layout">
        <main class="watch-main-column">
          <div class="watch-breadcrumb"><a href="browse.html">The clubhouse</a><span aria-hidden="true">/</span><span>${escapeHtml(item.title)}</span></div>
          <section class="player-panel" aria-label="Video player">
            ${hasVideo ? renderWatchPlayerMarkup(item, episode) : `
              <div class="player-screen ${episode ? 'player-screen--active' : ''}">
                ${episode ? `<div class="player-screen__meta"><span class="eyebrow">NOW PLAYING</span><strong>${escapeHtml(episode.title)}</strong><span class="player-screen__hint">No stream available for this episode yet.</span></div>` : ''}
              </div>`}
          </section>

          <section class="watch-now-card" aria-labelledby="watchEpisodeTitle">
            <div class="watch-poster"><img src="${escapeHtml(item.poster)}" alt="" /></div>
            <div class="watch-now-card__copy">
              <p class="eyebrow"><span class="watch-live-dot"></span> NOW PLAYING · ${escapeHtml(item.title)}</p>
              <h1 id="watchEpisodeTitle">${escapeHtml(episode.episodeNumber)}. ${escapeHtml(episode.title)}</h1>
              <div class="watch-meta"><span>${escapeHtml(item.year)}</span><span>${escapeHtml(item.rating)}</span><span>${escapeHtml(item.duration)}</span>${state.isGuest ? '<span class="guest-badge">GUEST MODE</span>' : ''}</div>
            </div>
            <div class="watch-now-card__actions"><button class="watch-round-action" type="button" data-action="share-episode" aria-label="Share this episode" title="Share episode">↗</button><button class="button button--soft" type="button" data-action="details" data-id="${escapeHtml(item.id)}">Show details</button></div>
          </section>

          <div class="watch-lower-grid">
            <section class="watch-description-card"><div class="watch-section-kicker">THE STORY SO FAR</div><p>${escapeHtml(episode.description || item.description || 'A little world of its own.')}</p><div class="watch-tag-row">${(item.genres || []).map((genre) => `<span>${escapeHtml(genre)}</span>`).join('')}</div>${state.isGuest ? '<p class="watch-guest-note">Watching as a guest. <a href="auth.html">Sign in</a> to save progress and unlock your profiles.</p>' : ''}</section>
            <section class="watch-next-card"><div class="watch-next-card__top"><span class="watch-next-mark">✳</span><div><p class="eyebrow">UP NEXT</p><h2>${escapeHtml(next ? `${next.episodeNumber}. ${next.title}` : 'That’s a wrap for now')}</h2></div></div><p>${escapeHtml(next ? (next.description || 'Keep the story going with the next episode.') : 'You’ve reached the end of the available episodes.')}</p><button class="button button--primary" type="button" data-action="next-episode" ${next ? '' : 'disabled'}>${next ? 'Keep watching' : 'All caught up'} <span aria-hidden="true">→</span></button></section>
          </div>
        </main>

        <aside class="watch-side" aria-label="Episode and community details">
          <section class="watch-tabs">
            <div class="watch-side__heading"><div><p class="eyebrow">STAY A LITTLE LONGER</p><h2>${escapeHtml(item.title)}<span aria-hidden="true">.</span></h2></div><span class="watch-side__count">${item.episodes.length} eps</span></div>
            <div class="watch-tabs__nav" role="tablist" aria-label="Watch page sections">
              <button class="watch-tab is-active" type="button" role="tab" id="watchTabEpisodes" data-tab="episodes" aria-controls="watchPanelEpisodes" aria-selected="true">Episodes</button>
              <button class="watch-tab" type="button" role="tab" id="watchTabSubtitles" data-tab="subtitles" aria-controls="watchPanelSubtitles" aria-selected="false">Subtitles</button>
              <button class="watch-tab" type="button" role="tab" id="reviewsTab" data-tab="reviews" aria-controls="watchPanelReviews" aria-selected="false">Reviews <span class="watch-tab__count" id="reviewsTabCount">0</span></button>
              <button class="watch-tab" type="button" role="tab" id="watchTabRecommended" data-tab="recommended" aria-controls="watchPanelRecommended" aria-selected="false">For you</button>
            </div>
            <div class="watch-tabs__body">
              <div class="watch-tab-panel is-active" id="watchPanelEpisodes" data-panel="episodes" role="tabpanel" aria-labelledby="watchTabEpisodes"><div class="episode-carousel" id="episodeCarousel">${item.episodes.map((ep) => renderEpisodeCard(item, ep)).join('')}</div></div>
              <div class="watch-tab-panel" id="watchPanelSubtitles" data-panel="subtitles" role="tabpanel" aria-labelledby="watchTabSubtitles">${renderSubtitleWorkshop(item, episode)}</div>
              <div class="watch-tab-panel" id="watchPanelReviews" data-panel="reviews" role="tabpanel" aria-labelledby="reviewsTab">
                <div class="watch-reviews"><div class="reviews-summary" id="reviewsAverage"></div><p class="sr-only" id="reviewsSummary">Loading reviews…</p>
                  <form class="review-form" id="reviewForm"><div class="review-stars" id="reviewStars" role="radiogroup" aria-label="Rate this episode from 1 to 10">${Array.from({ length: 10 }, (_, i) => `<button type="button" class="review-star" data-star="${i + 1}" aria-label="${i + 1} out of 10">★</button>`).join('')}<span class="review-rating-hint" id="reviewRatingHint">Tap a star to rate (1–10)</span></div>
                    <label class="community-label">Your thoughts<textarea class="community-textarea" id="reviewBody" required maxlength="2000" placeholder="What stayed with you?"></textarea></label>
                    <div class="review-form-row"><label class="community-label">Name<input class="community-input" id="reviewName" maxlength="80" value="${escapeHtml(state.isGuest ? 'Guest' : (currentUser()?.displayName || currentUser()?.username || ''))}" /></label><label class="review-guest-toggle"><input type="checkbox" id="reviewGuestToggle" ${state.isGuest ? 'checked disabled' : ''} /><span>Post as guest</span></label></div>
                    <div class="community-footer"><button class="button button--primary" type="submit" id="reviewSubmitBtn">Post a little review</button></div><p class="auth-alert is-hidden" id="reviewError" role="alert"></p>
                  </form><div class="reviews-list" id="reviewsList"></div></div>
              </div>
              <div class="watch-tab-panel" id="watchPanelRecommended" data-panel="recommended" role="tabpanel" aria-labelledby="watchTabRecommended"><div class="recommend-grid">${state.library.filter((entry) => entry.id !== item.id).slice(0, 4).map((entry) => `
                <article class="recommend-card"><img src="${escapeHtml(entry.backdrop)}" alt="" loading="lazy" /><div class="recommend-card__content"><div class="recommend-card__title">${escapeHtml(entry.title)}</div><div class="card-meta"><span>${escapeHtml(entry.match)}</span><span>${escapeHtml(entry.duration)}</span></div><button class="button button--secondary" type="button" data-action="play" data-id="${escapeHtml(entry.id)}">Step inside</button></div></article>`).join('')}</div></div>
            </div>
          </section>
        </aside>
      </div>
    `;

    if (hasVideo) void mountWatchPlayer();
    void initReviews();
    void initSubtitleWorkshop();
    bindReviewEvents();
    bindSubtitleWorkshopEvents();
  }

  // The theme controller now lives with the rest of the clubhouse, so watch mode just waves hello.

  function renderSubtitleWorkshop(item, episode) {
    const canUpload = Boolean(window.OBJECTFLIX_MEMBERSHIP?.session());
    const episodeId = escapeHtml(episode.id);
    return `<div class="subtitle-workshop">
      <div class="subtitle-workshop__intro"><span class="subtitle-workshop__icon" aria-hidden="true">Aa</span><div><p class="eyebrow">HELP THE NEXT VIEWER</p><h3>Subtitle Workshop</h3><p>Spot a typo or timing wobble? Help us make this episode easier to enjoy.</p></div></div>
      <form class="subtitle-workshop-form" id="subtitleReportForm">
        <input type="hidden" name="episodeId" value="${episodeId}" />
        <label>What went wrong?<select class="community-input" id="subtitleIssueKind" name="kind"><option value="typo">A typo or translation</option><option value="timing">The timing feels off</option><option value="missing">A line is missing</option><option value="other">Something else</option></select></label>
        <label>Subtitle track<select class="community-input" id="subtitleReportTrack" name="subtitleId"><option value="">No specific track</option></select></label>
        <div class="subtitle-timing-row"><label>At (seconds)<input class="community-input" id="subtitleReportTime" name="timeSeconds" type="number" min="0" max="86400" step="1" placeholder="e.g. 42" /></label><button class="button button--soft" type="button" data-action="capture-subtitle-time">Use current time</button></div>
        <label class="is-hidden" id="subtitleDirectionWrap">Timing direction<select class="community-input" name="direction"><option value="early">Subtitles appear too early</option><option value="late">Subtitles appear too late</option></select></label>
        <label>What should we know?<textarea class="community-textarea" name="details" required maxlength="1000" rows="3" placeholder="Tell us what you noticed…"></textarea></label>
        <label>Suggested corrected text <span class="workshop-optional">(optional)</span><textarea class="community-textarea" name="correctedText" maxlength="1000" rows="2" placeholder="If you know the fix, share it here."></textarea></label>
        <button class="button button--primary" type="submit">Send a subtitle note <span aria-hidden="true">→</span></button><p class="subtitle-workshop-status" id="subtitleReportStatus" role="status"></p>
      </form>
      <div class="subtitle-workshop-divider"><span></span><span>OR SHARE YOUR OWN TRACK</span><span></span></div>
      ${canUpload ? `<form class="subtitle-workshop-form" id="subtitleUploadForm"><input type="hidden" name="episodeId" value="${episodeId}" />
        <label>Language code<input class="community-input" name="language" required maxlength="12" value="en" placeholder="en, vi, es…" /></label>
        <label>Your .ASS / .SSA subtitle file<input class="community-input workshop-file" name="subtitleFile" type="file" accept=".ass,.ssa,text/plain" required /><span class="workshop-help">ASS/SSA files up to 400 KiB. This player uses styled ASS subtitles.</span></label>
        <label>Credit / attribution<input class="community-input" name="attribution" required minlength="2" maxlength="120" placeholder="Your name or how the community should credit you" /></label>
        <label class="workshop-rights"><input type="checkbox" name="rightsConfirmed" required /><span>I made this subtitle or have permission to share it, and I’m okay with Objectflix crediting the source.</span></label>
        <button class="button button--soft" type="submit">Send for admin review <span aria-hidden="true">↗</span></button><p class="subtitle-workshop-status" id="subtitleUploadStatus" role="status"></p>
      </form><div class="subtitle-my-submissions" id="subtitleMySubmissions"></div>`
      : `<div class="subtitle-signin-note"><p>Fan-made tracks need a verified account so we can keep contributor credit attached.</p><a href="./auth.html?verify=1&amp;returnTo=${encodeURIComponent(`watch.html?id=${item.id}&ep=${episode.id}`)}">Sign in to submit a track ↗</a></div>`}
    </div>`;
  }

  async function initSubtitleWorkshop() {
    const container = document.getElementById('subtitleMySubmissions');
    if (!container || !window.OBJECTFLIX_MEMBERSHIP?.session()) return;
    try {
      state.workshop = await window.OBJECTFLIX_API.listMySubtitleWorkshopItems();
      const own = state.workshop.submissions.filter((row) => row.episodeId === state.episode?.id);
      container.innerHTML = own.length ? `<p class="workshop-history-title">Your submissions for this episode</p>${own.map((row) => `<div class="workshop-history-row"><span>${escapeHtml(row.language.toUpperCase())} · ${escapeHtml(row.format.toUpperCase())}</span><span class="workshop-status workshop-status--${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></div>${row.reviewNote ? `<p class="workshop-help">${escapeHtml(row.reviewNote)}</p>` : ''}`).join('')}` : '';
    } catch {
      container.textContent = 'Your previous submissions could not be loaded right now.';
    }
  }

  function bindSubtitleWorkshopEvents() {
    const kind = document.getElementById('subtitleIssueKind');
    kind?.addEventListener('change', () => {
      const isTiming = kind.value === 'timing';
      document.getElementById('subtitleDirectionWrap')?.classList.toggle('is-hidden', !isTiming);
      document.getElementById('subtitleReportTime')?.toggleAttribute('required', isTiming);
    });

    document.getElementById('subtitleReportForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const status = document.getElementById('subtitleReportStatus');
      const data = new FormData(form);
      const reportKind = String(data.get('kind') || 'other');
      button.disabled = true;
      status.textContent = 'Sending your note…';
      try {
        const report = await window.OBJECTFLIX_API.submitSubtitleReport({
          episodeId: state.episode.id,
          subtitleId: String(data.get('subtitleId') || '') || null,
          kind: reportKind,
          timeSeconds: reportKind === 'timing' ? Number(data.get('timeSeconds')) : (data.get('timeSeconds') ? Number(data.get('timeSeconds')) : null),
          direction: reportKind === 'timing' ? String(data.get('direction')) : null,
          details: String(data.get('details') || '').trim(),
          correctedText: String(data.get('correctedText') || '').trim() || null,
        });
        form.reset();
        document.getElementById('subtitleDirectionWrap')?.classList.add('is-hidden');
        status.textContent = `Thank you — note ${report.id.slice(0, 8)} is with the subtitle team.`;
      } catch (error) {
        status.textContent = error.message || 'Could not send your report. Please try again.';
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById('subtitleUploadForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const status = document.getElementById('subtitleUploadStatus');
      const data = new FormData(form);
      const file = data.get('subtitleFile');
      if (!(file instanceof File) || !file.size) { status.textContent = 'Choose an ASS or SSA subtitle file first.'; return; }
      const format = file.name.split('.').pop()?.toLowerCase();
      if (!['ass', 'ssa'].includes(format) || file.size > 400 * 1024) { status.textContent = 'Choose a .ASS or .SSA file no larger than 400 KiB.'; return; }
      if (!window.OBJECTFLIX_MEMBERSHIP?.session()) { status.textContent = 'Please sign in with a verified account before submitting a track.'; return; }
      button.disabled = true;
      status.textContent = 'Sending your track for review…';
      try {
        const submission = await window.OBJECTFLIX_API.submitSubtitleFile({
          episodeId: state.episode.id,
          language: String(data.get('language') || '').trim(),
          format,
          attribution: String(data.get('attribution') || '').trim(),
          rightsConfirmed: data.has('rightsConfirmed'),
          content: await file.text(),
        });
        form.reset();
        status.textContent = `Your ${format.toUpperCase()} track is in the review queue. Reference: ${submission.id.slice(0, 8)}.`;
        void initSubtitleWorkshop();
      } catch (error) {
        status.textContent = error.message || 'Could not submit this track. Please try again.';
      } finally {
        button.disabled = false;
      }
    });
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
    state.subtitleTracks = subtitles;

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
        opt.textContent = sub.attribution ? `${langName} · fan-made by ${sub.attribution}` : langName;
        playerElements.subtitleSelect.appendChild(opt);
      });
      if (subtitleUrl) {
        playerElements.subtitleSelect.value = subtitleUrl;
      }
      playerElements.subtitleSelect.addEventListener('change', (event) => {
        player.setSubtitleTrack(event.target.value);
        const selected = subtitles.find((sub) => SHARED.toAbsoluteMediaUrl(sub.url) === event.target.value);
        const reportTrack = document.getElementById('subtitleReportTrack');
        if (reportTrack && selected) reportTrack.value = selected.id;
      });
    }
    const reportTrack = document.getElementById('subtitleReportTrack');
    if (reportTrack) {
      reportTrack.innerHTML = `<option value="">No specific track</option>${subtitles.map((sub) => {
        const langName = sub.language === 'en' ? 'English' : sub.language === 'vn' ? 'Vietnamese' : (sub.language || 'Unknown').toUpperCase();
        const label = sub.attribution ? `${langName} · fan-made by ${sub.attribution}` : langName;
        return `<option value="${escapeHtml(sub.id)}">${escapeHtml(label)}</option>`;
      }).join('')}`;
      if (subtitles.length) reportTrack.value = subtitles[0].id;
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

      if (action === 'capture-subtitle-time') {
        const current = state.player?.elements.video.currentTime;
        const input = document.getElementById('subtitleReportTime');
        if (Number.isFinite(current) && input) {
          input.value = String(Math.floor(current));
          input.focus();
        }
      }
      if (action === 'share-episode') {
        const url = window.location.href;
        const title = `${state.item?.title || 'Objectflix'} · ${state.episode?.title || 'Episode'}`;
        if (navigator.share) navigator.share({ title, url }).catch(() => {});
        else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => { actionButton.textContent = 'Copied!'; setTimeout(() => { actionButton.textContent = '↗'; }, 1500); }).catch(() => {});
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
