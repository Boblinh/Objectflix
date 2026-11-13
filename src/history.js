
(() => {
  const key = () => {
    try { const profile = JSON.parse(sessionStorage.getItem('objectflix_active_profile') || 'null'); return profile?.id ? `objectflix_history_${profile.id}` : null; }
    catch { return null; }
  };
  function entries() {
    try { const saved = JSON.parse(localStorage.getItem(key()) || '[]'); return Array.isArray(saved) ? saved : []; }
    catch { return []; }
  }
  let lastSaved = 0;
  function record(video, force = false) {
    const storageKey = key();
    const watch = window.OBJECTFLIX_WATCH;
    if (!storageKey || !watch?.item || !watch?.episode || !video.closest('#watchView') || !Number.isFinite(video.duration) || video.duration <= 0 || video.currentTime < 1) return;
    if (!force && Date.now() - lastSaved < 15000) return;
    lastSaved = Date.now();
    const row = { showId: watch.item.id, episodeId: watch.episode.id, title: watch.item.title, episodeTitle: watch.episode.title,
      position: Math.min(video.currentTime, video.duration), duration: video.duration, updatedAt: Date.now() };
    try { localStorage.setItem(storageKey, JSON.stringify([row, ...entries().filter((entry) => entry.episodeId !== row.episodeId)].slice(0, 200))); }
    catch {  }
  }
  document.addEventListener('timeupdate', (event) => { if (event.target instanceof HTMLVideoElement) record(event.target); }, true);
  for (const type of ['pause', 'ended']) document.addEventListener(type, (event) => { if (event.target instanceof HTMLVideoElement) record(event.target, true); }, true);
  document.addEventListener('loadedmetadata', (event) => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement) || !video.closest('#watchView')) return;
    const episode = window.OBJECTFLIX_WATCH?.episode;
    const saved = entries().find((entry) => entry.episodeId === episode?.id);
    if (saved && saved.position > 10 && saved.position < video.duration * 0.95 && video.currentTime < 2) video.currentTime = saved.position;
  }, true);
  window.addEventListener('pagehide', () => { const video = document.querySelector('#watchView video'); if (video) record(video, true); });
  window.OBJECTFLIX_HISTORY = { entries, clear() { const storageKey = key(); if (storageKey) localStorage.removeItem(storageKey); } };
})();
