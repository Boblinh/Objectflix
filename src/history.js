(() => {
  // Builds the per-profile localStorage key, or returns null when no profile is selected.
  const key = () => {
    try {
      const profile = JSON.parse(sessionStorage.getItem('objectflix_active_profile') || 'null');
      return profile?.id ? `objectflix_history_${profile.id}` : null;
    } catch {
      return null;
    }
  };

  // Loads the current profile's watch history, returning an empty list for invalid data.
  function entries() {
    try {
      const saved = JSON.parse(localStorage.getItem(key()) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  // Saves at most the 200 newest history rows for the active profile.
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

  // Lazily initializes Firebase and returns the signed-in user's history collection context.
  async function firestore() {
    try {
      const { isFirebaseConfigured } = await import('./firebase.js');
      if (!isFirebaseConfigured()) return null;
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

  // Merges remote history with local rows by episode, keeping each row's newest update time.
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

  // Writes one watch-history row to the signed-in user's Firestore collection when available.
  async function pushCloud(row) {
    const ctx = await firestore();
    if (!ctx) return;
    try {
      await ctx.sdk.setDoc(ctx.sdk.doc(ctx.db, ...ctx.path, row.episodeId), row);
      cloudReady = true;
    } catch {}
  }

  // Saves valid watch progress locally and remotely, throttling routine updates unless forced.
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
    // Clears local history and, when signed in, deletes every row in the user's cloud history.
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
    // Reports whether a Firestore history read or write has succeeded in this session.
    get cloudReady() { return cloudReady; },
    refresh: loadCloud,
  };

  void loadCloud();
})();
