



(() => {
  const SHARED = window.OBJECTFLIX_SHARED;
  const API = window.OBJECTFLIX_API;

  let library = [];
  let currentItem = null;
  let currentEpisode = null;
  let player = null;
  let controlsTimer = null;
  let progressDragging = false;

  
  const $ = (id) => document.getElementById(id);

  const dom = {
    player: $('tvPlayer'),
    media: $('tvPlayerMedia'),
    video: $('tvVideo'),
    canvas: $('tvSubtitleCanvas'),
    centerPlay: $('tvCenterPlay'),
    loading: $('tvLoading'),
    loadingText: $('tvLoadingText'),
    message: $('tvMessage'),
    messageTitle: $('tvMessageTitle'),
    messageText: $('tvMessageText'),
    controls: $('tvControls'),
    progressWrap: $('tvProgressWrap'),
    progressFill: $('tvProgressFill'),
    progressThumb: $('tvProgressThumb'),
    playPause: $('tvPlayPause'),
    skipBack: $('tvSkipBack'),
    skipForward: $('tvSkipForward'),
    currentTime: $('tvCurrentTime'),
    totalDuration: $('tvTotalDuration'),
    mute: $('tvMute'),
    volumeBar: $('tvVolumeBar'),
    volumeFill: $('tvVolumeFill'),
    volumeSlider: $('tvVolumeSlider'),
    progressSlider: $('tvProgressSlider'),
    nextEp: $('tvNextEp'),
    fullscreen: $('tvFullscreen'),
    backBtn: $('tvBackBtn'),
    showName: $('tvShowName'),
    epTitle: $('tvEpTitle'),
    epInfo: $('tvEpInfo'),
    nextBanner: $('tvNextBanner'),
    nextTitle: $('tvNextTitle'),
    nextBannerBtn: $('tvNextBannerBtn'),
  };

  
  function currentUser() {
    return JSON.parse(localStorage.getItem('objectflix_current_user') || 'null');
  }

  
  function formatTime(s) {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  function esc(str) {
    return (str || '').replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)
    );
  }

  
  function showControls() {
    dom.controls.classList.remove('is-hidden');
    dom.epInfo.classList.remove('is-hidden');
    scheduleHide();
  }

  function hideControls() {
    if (!dom.video.paused && !dom.player.matches(':focus-within')) {
      dom.controls.classList.add('is-hidden');
      dom.epInfo.classList.add('is-hidden');
      dom.nextBanner.classList.add('is-hidden');
    }
  }

  function scheduleHide() {
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(hideControls, 4000);
  }

  
  function syncPlayPauseUI() {
    const paused = dom.video.paused || dom.video.ended;
    const playIcon = dom.playPause.querySelector('.icon-play');
    const pauseIcon = dom.playPause.querySelector('.icon-pause');
    playIcon.style.display = paused ? '' : 'none';
    pauseIcon.style.display = paused ? 'none' : '';
    dom.playPause.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');

    dom.centerPlay.classList.toggle('is-hidden', !paused);
  }

  function syncTimeUI() {
    const cur = dom.video.currentTime;
    const dur = dom.video.duration;
    dom.currentTime.textContent = formatTime(cur);
    dom.totalDuration.textContent = formatTime(dur);

    if (!progressDragging && Number.isFinite(dur) && dur > 0) {
      const pct = (cur / dur) * 100;
      dom.progressFill.style.width = `${pct}%`;
      dom.progressThumb.style.left = `${pct}%`;
      dom.progressWrap.setAttribute('aria-valuenow', Math.round(pct));
    }
  }

  function syncVolumeUI() {
    const muted = dom.video.muted || dom.video.volume === 0;
    const volIcon = dom.mute.querySelector('.icon-volume');
    const muteIcon = dom.mute.querySelector('.icon-muted');
    volIcon.style.display = muted ? 'none' : '';
    muteIcon.style.display = muted ? '' : 'none';
    dom.volumeFill.style.width = `${muted ? 0 : dom.video.volume * 100}%`;
  }

  
  async function initPlayer() {
    const Player = window.ObjectflixPlayer;
    if (!Player) {
      console.error('[TV Watch] ObjectflixPlayer not loaded');
      return;
    }

    player = new Player({
      video: dom.video,
      canvas: dom.canvas,
      controls: dom.player,
      centerPlay: dom.centerPlay,
      playPause: dom.playPause,
      mute: dom.mute,
      fullscreen: dom.fullscreen,
      progress: dom.progressSlider,
      volume: $('tvVolumeSlider'),
      currentTime: dom.currentTime,
      totalDuration: dom.totalDuration,
      subtitleIndicator: { classList: { add() {}, remove() {} }, dataset: {} },
      message: dom.message,
      messageTitle: dom.messageTitle,
      messageText: dom.messageText,
      fakeDuration: currentEpisode.fakeDuration || null,
      audioMode: null,
      hrtfProfile: null,
      surroundIntensity: null,
      centerLevel: null,
      lfeLevel: null,
      audioPanel: null,
      audioPanelStatus: null,
      surroundIntensityValue: null,
      centerLevelValue: null,
      lfeLevelValue: null,
    });

    
    let subtitleUrl = null;
    try {
      const subs = await API.getEpisodeSubtitles(currentEpisode.id);
      if (subs && subs.length > 0) {
        const en = subs.find((s) => s.language === 'en') || subs[0];
        subtitleUrl = en.url;
      }
    } catch {}

    if (currentEpisode.videoUrl && !(await SHARED.isEpisodeStreamable(currentEpisode.videoUrl))) {
      dom.loading.classList.add('is-hidden');
      showMessage('Not Available', 'The episode is not on the backend right now... You could ask for admins to upload them on demand!');
      showAskAdminsButton();
      return;
    }

    player.load({ src: currentEpisode.videoUrl, subtitleUrl });

    
    dom.video.addEventListener('play', () => { syncPlayPauseUI(); scheduleHide(); });
    dom.video.addEventListener('pause', () => { syncPlayPauseUI(); showControls(); });
    dom.video.addEventListener('ended', () => { syncPlayPauseUI(); showNextBanner(); });
    dom.video.addEventListener('timeupdate', syncTimeUI);
    dom.video.addEventListener('durationchange', syncTimeUI);
    dom.video.addEventListener('volumechange', syncVolumeUI);
    dom.video.addEventListener('waiting', () => { dom.loading.classList.remove('is-hidden'); });
    dom.video.addEventListener('playing', () => { dom.loading.classList.add('is-hidden'); });
    dom.video.addEventListener('canplay', () => { dom.loading.classList.add('is-hidden'); });
    dom.video.addEventListener('loadedmetadata', () => {
      dom.loading.classList.add('is-hidden');
      syncTimeUI();
    });
    dom.video.addEventListener('error', () => {
      dom.loading.classList.add('is-hidden');
      showMessage('Playback Error', 'This video could not be loaded.');
    });

    showControls();
    dom.video.play().catch(() => {});
  }

  
  function seekFromEvent(e) {
    const rect = dom.progressWrap.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (Number.isFinite(dom.video.duration)) {
      dom.video.currentTime = ratio * dom.video.duration;
    }
    syncTimeUI();
  }

  
  function setVolumeFromEvent(e) {
    const rect = dom.volumeBar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    dom.video.volume = ratio;
    dom.video.muted = ratio === 0;
    dom.volumeSlider.value = ratio;
    syncVolumeUI();
  }

  
  function showNextBanner() {
    if (!currentItem || !currentEpisode) return;
    const next = SHARED.nextEpisode(currentItem, currentEpisode);
    if (!next) return;

    dom.nextTitle.textContent = next.title;
    dom.nextBanner.classList.remove('is-hidden');
    dom.nextBannerBtn.dataset.nextId = next.id;
    dom.nextBannerBtn.focus();
  }

  function playNextEpisode() {
    if (!currentItem || !currentEpisode) return;
    const next = SHARED.nextEpisode(currentItem, currentEpisode);
    if (!next) return;
    window.location.href = `tv-watch.html?id=${currentItem.id}&ep=${next.id}`;
  }

  
  function showMessage(title, text) {
    dom.message.querySelector('#tvAskAdminsBtn')?.remove();
    dom.messageTitle.textContent = title;
    dom.messageText.textContent = text;
    dom.message.classList.remove('is-hidden');
  }

  function showAskAdminsButton() {
    if (document.getElementById('tvAskAdminsBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'tvAskAdminsBtn';
    btn.type = 'button';
    btn.className = 'tv-ask-admins';
    btn.textContent = 'Ask Admins';
    btn.addEventListener('click', () => {
      window.location.href = `watch.html?id=${encodeURIComponent(currentItem.id)}&ep=${encodeURIComponent(currentEpisode.id)}&ask=1`;
    });
    dom.message.appendChild(btn);
  }

  
  function handleKeydown(e) {
    const key = e.key;

    
    showControls();

    switch (key) {
      case 'ArrowLeft': {
        e.preventDefault();
        
        if (document.activeElement === dom.progressWrap) {
          dom.video.currentTime = Math.max(0, dom.video.currentTime - 10);
        } else {
          
          moveFocus(-1);
        }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (document.activeElement === dom.progressWrap) {
          dom.video.currentTime = Math.min(dom.video.duration || 0, dom.video.currentTime + 10);
        } else {
          moveFocus(1);
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        moveFocusVertical(-1);
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        moveFocusVertical(1);
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const focused = document.activeElement;
        if (focused && focused.classList.contains('tv-focusable')) {
          focused.click();
        } else {
          
          player?.togglePlayback();
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        window.location.href = `tv.html`;
        break;
      }
      case 'MediaPlayPause': {
        e.preventDefault();
        player?.togglePlayback();
        break;
      }
      case 'MediaTrackNext': {
        e.preventDefault();
        playNextEpisode();
        break;
      }
      case 'MediaTrackPrevious': {
        e.preventDefault();
        
        dom.video.currentTime = 0;
        break;
      }
    }
  }

  
  function getFocusables() {
    return [
      dom.skipBack,
      dom.playPause,
      dom.skipForward,
      dom.mute,
      dom.volumeBar,
      dom.nextEp,
      dom.fullscreen,
    ].filter(Boolean);
  }

  function moveFocus(delta) {
    const items = getFocusables();
    const idx = items.indexOf(document.activeElement);
    const next = idx === -1 ? items[0] : items[(idx + delta + items.length) % items.length];
    if (next) next.focus();
  }

  function moveFocusVertical(delta) {
    
    if (delta < 0) {
      dom.backBtn.focus();
    } else {
      dom.playPause.focus();
    }
  }

  
  function bindEvents() {
    
    dom.playPause.addEventListener('click', () => player?.togglePlayback());
    dom.centerPlay.addEventListener('click', () => player?.togglePlayback());

    
    dom.skipBack.addEventListener('click', () => player?.seekBy(-10));
    dom.skipForward.addEventListener('click', () => player?.seekBy(10));

    
    dom.mute.addEventListener('click', () => player?.toggleMute());

    
    dom.fullscreen.addEventListener('click', () => player?.toggleFullscreen());

    
    dom.nextEp.addEventListener('click', playNextEpisode);
    dom.nextBannerBtn.addEventListener('click', playNextEpisode);

    
    dom.backBtn.addEventListener('click', () => {
      window.location.href = 'tv.html';
    });

    
    dom.progressWrap.addEventListener('mousedown', (e) => {
      progressDragging = true;
      seekFromEvent(e);
    });
    document.addEventListener('mousemove', (e) => {
      if (progressDragging) seekFromEvent(e);
    });
    document.addEventListener('mouseup', () => {
      progressDragging = false;
    });

    
    dom.volumeBar.addEventListener('mousedown', (e) => setVolumeFromEvent(e));
    document.addEventListener('mousemove', (e) => {
      if (document.activeElement === dom.volumeBar || e.buttons === 1) {
        
      }
    });

    
    document.addEventListener('keydown', handleKeydown);

    
    dom.player.addEventListener('pointermove', showControls);
    dom.player.addEventListener('pointerdown', showControls);
  }

  
  async function init() {
    if (!currentUser()) {
      window.location.replace('index.html');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const showId = params.get('id');
    const episodeId = params.get('ep');

    if (!showId) {
      showMessage('No Episode', 'No show selected. Go back to browse and pick an episode.');
      return;
    }

    bindEvents();
    dom.loading.classList.remove('is-hidden');

    try {
      library = await SHARED.loadLibrary();
    } catch (err) {
      console.error('[TV Watch] Failed to load library:', err);
      showMessage('Library Error', 'Could not load the Objectflix library.');
      return;
    }

    currentItem = library.find((s) => s.id === showId);
    if (!currentItem) {
      showMessage('Show Not Found', `"${showId}" is not in the catalog.`);
      return;
    }

    if (episodeId) {
      currentEpisode = currentItem.episodes.find((e) => e.id === episodeId);
    }
    if (!currentEpisode) {
      currentEpisode = currentItem.episodes[0];
    }
    if (!currentEpisode) {
      showMessage('No Episodes', 'This show has no episodes available.');
      return;
    }

    
    dom.showName.textContent = currentItem.title;
    dom.epTitle.textContent = currentEpisode.title;
    dom.loadingText.textContent = `Loading ${currentEpisode.title}…`;

    document.title = `${currentEpisode.title} — Objectflix TV`;

    initPlayer();
  }

  init();
})();
