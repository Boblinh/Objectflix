



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

  
  
  

  function renderWatch() {
    const item = state.item;
    const episode = state.episode;

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
            <h2>${item.title}</h2>
            <div class="watch-meta">
              <span>${item.match}</span>
              <span>${item.year}</span>
              <span>${item.rating}</span>
              <span>${item.duration}</span>
            </div>
            <p class="watch-description">${item.description}</p>
            <div class="pill-row">${item.genres.map((genre) => `<span class="pill">${genre}</span>`).join('')}</div>
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

        <section>
          <div class="section-heading">
            <h3>Episodes</h3>
            <p>${item.episodes.length} episodes streamed live from the Objectflix API.</p>
          </div>
          <div class="episode-list">
            ${item.episodes.map((ep) => renderEpisodeCard(item, ep)).join('')}
          </div>
        </section>

        <section>
          <div class="section-heading">
            <h3>Recommended Shows</h3>
            <p>More polished picks with similar energy.</p>
          </div>
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
        </section>
      </div>
    `;

    if (hasVideo) void mountWatchPlayer();
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
              <select class="player-control-select player-control-select--small" id="watchAudioMode" title="Audio Mode">
                <option value="original">Original</option>
                <option value="stereo">Stereo</option>
                <option value="virtual">Virtual 7.1</option>
              </select>
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

          <div class="audio-panel is-hidden" id="watchAudioPanel">
            <div class="audio-panel__heading">
              <span class="audio-panel__title">Virtual 7.1 Headphones</span>
              <span class="audio-panel__status" id="watchAudioPanelStatus"></span>
            </div>
            <label class="audio-panel__row" for="watchHrtfProfile">
              <span>HRTF Profile</span>
              <select class="player-control-select player-control-select--small" id="watchHrtfProfile">
                <option value="itu">ITU 7.1 (Natural)</option>
                <option value="cinema">Cinema</option>
                <option value="wide">Wide</option>
              </select>
            </label>
            <label class="audio-panel__row" for="watchSurroundIntensity">
              <span>Surround <output id="watchSurroundIntensityValue">1.00</output></span>
              <input class="player-range player-range--panel" id="watchSurroundIntensity" type="range" min="0" max="1.5" value="1" step="0.01" />
            </label>
            <label class="audio-panel__row" for="watchCenterLevel">
              <span>Center <output id="watchCenterLevelValue">1.00</output></span>
              <input class="player-range player-range--panel" id="watchCenterLevel" type="range" min="0" max="1.5" value="1" step="0.01" />
            </label>
            <label class="audio-panel__row" for="watchLfeLevel">
              <span>Bass <output id="watchLfeLevelValue">1.00</output></span>
              <input class="player-range player-range--panel" id="watchLfeLevel" type="range" min="0" max="2" value="1" step="0.01" />
            </label>
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
      audioMode: 'watchAudioMode',
      hrtfProfile: 'watchHrtfProfile',
      surroundIntensity: 'watchSurroundIntensity',
      centerLevel: 'watchCenterLevel',
      lfeLevel: 'watchLfeLevel',
      audioPanel: 'watchAudioPanel',
      audioPanelStatus: 'watchAudioPanelStatus',
      surroundIntensityValue: 'watchSurroundIntensityValue',
      centerLevelValue: 'watchCenterLevelValue',
      lfeLevelValue: 'watchLfeLevelValue',
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
    if (episode.released === false) {
      SHARED.showUnreleasedNoticeModal(episode);
      return;
    }
    state.item = item;
    state.episode = episode;
    updateUrl(item.id, episode.id);
    renderWatch();
    window.scrollTo({ top: 0 });
  }

  function playTitle(id) {
    const item = state.library.find((entry) => entry.id === id);
    if (!item) return;
    const episode = item.episodes[0] || null;
    if (!episode) return;
    state.item = item;
    state.episode = episode;
    updateUrl(item.id, episode.id);
    renderWatch();
    window.scrollTo({ top: 0 });
  }


  function bindEvents() {
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const actionButton = target.closest('[data-action]');
      if (!actionButton) return;
      const { action, id, episode } = actionButton.dataset;

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
    if (!user) {
      window.location.replace('index.html');
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    let showId = urlParams.get('id');
    let episodeId = urlParams.get('ep') || '';
    const showAcronym = urlParams.get('show') || '';

    showLoading();

    SHARED.restoreArgUnlock();

    void (async () => {
      try {
        state.library = await SHARED.loadLibrary();
        await SHARED.injectSecretEpisodes(state.library, state.secretEpisodes);
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
      renderWatch();
    })();
  }

  bindEvents();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
