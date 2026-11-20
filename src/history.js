(() => {
  const key = () => {
    try {
      const profile = JSON.parse(sessionStorage.getItem('objectflix_active_profile') || 'null');
      return profile?.id ? `objectflix_history_${profile.id}` : null;
    } catch {
      return null;
    }
  };

  function entries() {
    try {
      const saved = JSON.parse(localStorage.getItem(key()) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  function saveEntries(rows) {
    const storageKey = key();
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(rows.slice(0, 200)));
    } catch {}
  }

  let lastSaved = 0;
  let cloudReady = false;
  let sdkPromise = null;

  async function firestore() {
    try {
      const { firebaseConfigured } = await import('./firebase-config.js');
      if (!firebaseConfigured()) return null;
      if (!sdkPromise) {
        sdkPromise = (async () => {
          const { getFirebase } = await import('./firebase.js');
          const { auth, db, firestoreSdk } = await getFirebase();
          return { auth, db, sdk: firestoreSdk };
        })();
      }
      const ctx = await sdkPromise;
      const user = ctx?.auth?.currentUser;
      if (!user) return null;
      return { ...ctx, user, path: ['users', user.uid, 'history'] };
    } catch {
      return null;
    }
  }

  async function loadCloud() {
    const ctx = await firestore();
    if (!ctx) return;
    try {
      const snapshot = await ctx.sdk.getDocs(ctx.sdk.collection(ctx.db, ...ctx.path));
      const remote = snapshot.docs.map((doc) => doc.data()).filter((row) => row && row.episodeId);
      if (!remote.length) return;
      const merged = new Map();
      for (const row of [...remote, ...entries()]) {
        const prev = merged.get(row.episodeId);
        if (!prev || (row.updatedAt || 0) > (prev.updatedAt || 0)) merged.set(row.episodeId, row);
      }
      saveEntries([...merged.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
      cloudReady = true;
    } catch {}
  }

  async function pushCloud(row) {
    const ctx = await firestore();
    if (!ctx) return;
    try {
      await ctx.sdk.setDoc(ctx.sdk.doc(ctx.db, ...ctx.path, row.episodeId), row);
      cloudReady = true;
    } catch {}
  }

  function record(video, force = false) {
    const storageKey = key();
    const watch = window.OBJECTFLIX_WATCH;
    if (!storageKey || !watch?.item || !watch?.episode || !video.closest('#watchView') || !Number.isFinite(video.duration) || video.duration <= 0 || video.currentTime < 1) return;
    if (!force && Date.now() - lastSaved < 15000) return;
    lastSaved = Date.now();
    const row = {
      showId: watch.item.id,
      episodeId: watch.episode.id,
      title: watch.item.title,
      episodeTitle: watch.episode.title,
      position: Math.min(video.currentTime, video.duration),
      duration: video.duration,
      updatedAt: Date.now(),
    };
    saveEntries([row, ...entries().filter((entry) => entry.episodeId !== row.episodeId)]);
    void pushCloud(row);
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

  window.OBJECTFLIX_HISTORY = {
    entries,
    async clear() {
      const storageKey = key();
      if (storageKey) localStorage.removeItem(storageKey);
      const ctx = await firestore();
      if (!ctx) return;
      try {
        const snapshot = await ctx.sdk.getDocs(ctx.sdk.collection(ctx.db, ...ctx.path));
        await Promise.all(snapshot.docs.map((doc) => ctx.sdk.deleteDoc(doc.ref)));
        cloudReady = false;
      } catch {}
    },
    get cloudReady() { return cloudReady; },
    refresh: loadCloud,
  };

  void loadCloud();
})();
