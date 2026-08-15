// src/shared.js
// Shared catalog helpers used by browse.html and watch.html.
// Load this classic script AFTER config.js, api.js and data.js.
(() => {
  const data = window.OBJECTFLIX_DATA || { profiles: [], trendingSearches: [], searchFilters: [] };
  const API = window.OBJECTFLIX_API;

  function toAbsoluteMediaUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    const base = window.OBJECTFLIX_CONFIG?.apiBaseUrl || '';
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  function stableHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function deriveYear(description) {
    const match = (description || '').match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : '—';
  }

  function deriveMatch(id) {
    return `${88 + (stableHash(id) % 11)}% Match`;
  }

  function deriveRating(id) {
    const ratings = ['TV-Y7', 'TV-PG', 'TV-14', 'TV'];
    return ratings[stableHash(id) % ratings.length];
  }

  function deriveGenres(title, id) {
    const pool = ['Animation', 'Comedy', 'Adventure', 'Family', 'Sci-Fi', 'Drama'];
    const hash = stableHash(title + id);
    const first = pool[hash % pool.length];
    const second = pool[(hash >> 3) % pool.length];
    const genres = new Set(['Animation', 'Comedy', first, second]);
    return [...genres].slice(0, 3);
  }

  const SHOW_PALETTES = [
    ['#241216', '#17181b', '#7b1f2d'],
    ['#0f2237', '#13151a', '#376f9d'],
    ['#143223', '#15181a', '#3f996c'],
    ['#1b1634', '#111217', '#6a53c8'],
    ['#3d140f', '#17181b', '#b14c33'],
    ['#33250d', '#17181b', '#7d5a1c'],
  ];

  function paletteFor(id) {
    return SHOW_PALETTES[stableHash(id) % SHOW_PALETTES.length];
  }

  function formatEpisodeMeta(episode) {
    return episode.duration || `Ep ${episode.episodeNumber}`;
  }

  // Returns the short acronym for a show title (used for artwork filenames),
  // e.g. "Battle for Dream Island: The Power of Two (TPOT)" -> "TPOT".
  function acronymFor(show) {
    const t = (show.title || '').toLowerCase();
    if (t.includes('power of two') || t.includes('tpot')) return 'TPOT';
    if (t.includes('bfdia') || t.includes('dream island again')) return 'BFDIA';
    if (t.includes('battle for bfb') || t === 'bfb' || t.includes('bfb (')) return 'BFB';
    if (t.includes('battle for bfdi') || t === 'bfdi') return 'BFDI';
    if (t.includes('bfdie')) return 'BFDIE';
    if (t.includes('bfdi')) return 'BFDI';
    if (t.includes('idfb')) return 'IDFB';
    return '';
  }

  const LOGO_FILES = {
    TPOT: './assets/logos/TPOT.png',
    BFDIA: './assets/logos/BFDIA.png',
    BFB: './assets/logos/BFB.png',
    BFDI: './assets/logos/BFDI.png',
    BFDIE: './assets/logos/BFDIE.png',
    IDFB: './assets/logos/IDFB.webp',
  };

  // Shows that have real artwork on disk. IDFB has a backdrop but no official
  // poster, so its poster keeps the generated placeholder instead.
  const SHOWS_WITH_POSTERS = new Set(['TPOT', 'BFDIA', 'BFB', 'BFDI', 'BFDIE']);
  const SHOWS_WITH_BACKDROPS = new Set(['TPOT', 'BFDIA', 'BFB', 'BFDI', 'BFDIE', 'IDFB']);

  function logoFor(show) {
    const acronym = acronymFor(show);
    const logoFile = LOGO_FILES[acronym];
    if (logoFile) return logoFile;
    return window.createPlaceholderImage(show.title.toUpperCase(), 700, 1050, paletteFor(show.id));
  }

  function buildCatalogItem(show, seasons, episodes) {
    const palette = paletteFor(show.id);
    const episodeCount = episodes.length;
    const acronym = acronymFor(show);
    return {
      id: show.id,
      title: show.title,
      type: 'Series',
      year: deriveYear(show.description),
      rating: deriveRating(show.id),
      duration: episodeCount ? `${episodeCount} episodes` : 'Series',
      match: deriveMatch(show.id),
      genres: deriveGenres(show.title, show.id),
      description: show.description || '',
      backdrop: SHOWS_WITH_BACKDROPS.has(acronym)
        ? `./assets/backdrops/${acronym}.png`
        : window.createPlaceholderImage(show.title.toUpperCase(), 1600, 900, palette),
      poster: SHOWS_WITH_POSTERS.has(acronym)
        ? `./assets/posters/${acronym}.png`
        : window.createPlaceholderImage(show.title.toUpperCase(), 700, 1050, palette),
      logo: logoFor(show),
      progress: 0,
      category: 'shows',
      featured: false,
      seasons: seasons.map((season) => ({
        id: season.id,
        showId: season.showId,
        title: season.title,
        episodeCount: season.episodeCount,
      })),
      episodes: episodes.sort((a, b) => a.episodeNumber - b.episodeNumber).map((episode) => ({
        id: episode.id,
        seasonId: episode.seasonId,
        showId: episode.showId,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        description: episode.description || '',
        videoUrl: episode.videoUrl,
        duration: undefined,
      })),
    };
  }

  async function loadLibrary() {
    const shows = await API.listShows();
    const items = [];

    for (const show of shows) {
      const seasons = await API.getShowSeasons(show.id);
      const allEpisodes = [];
      for (const season of seasons) {
        const episodes = await API.getSeasonEpisodes(season.id);
        allEpisodes.push(...episodes.map((episode) => ({ ...episode, seasonId: season.id, showId: show.id })));
      }
      items.push(buildCatalogItem(show, seasons, allEpisodes));
    }

    applyCatalogPatches(items);

    injectUpcomingEpisodes(items);

    // Sort shows to put BFDI before BFB
    items.sort((a, b) => {
      const titleA = a.title.toLowerCase();
      const titleB = b.title.toLowerCase();
      if (titleA.includes('battle for bfdi') && !titleB.includes('battle for bfdi')) return -1;
      if (!titleA.includes('battle for bfdi') && titleB.includes('battle for bfdi')) return 1;
      return b.episodes.length - a.episodes.length;
    });

    // Pick a random show to spotlight as the hero each time the library loads.
    if (items.length) {
      const featuredIndex = Math.floor(Math.random() * items.length);
      items[featuredIndex].featured = true;
    }

    return items;
  }

  function buildRows(items) {
    const rows = [];
    if (!items.length) return rows;

    rows.push({ title: 'Continue Watching', key: 'continue', items: items.filter((item) => item.progress > 0).map((item) => item.id) });
    rows.push({ title: 'Trending Now', key: 'trending', items: items.slice(0, 4).map((item) => item.id) });
    rows.push({ title: 'Popular Object Shows', key: 'shows', items: items.map((item) => item.id) });
    rows.push({ title: 'Recently Added', key: 'recent', items: [...items].reverse().slice(0, 5).map((item) => item.id) });
    rows.push({ title: 'Objectflix Originals', key: 'originals', items: items.map((item) => item.id) });
    rows.push({ title: 'Recommended For You', key: 'recommended', items: items.map((item) => item.id) });

    return rows;
  }

  function nextEpisode(item, episode) {
    if (!episode) return item.episodes[0] || null;
    const index = item.episodes.findIndex((ep) => ep.id === episode.id);
    return item.episodes[index + 1] || null;
  }

  function createAvatarImage(profile) {
    const colors = {
      'profile-avatar--gradient-a': ['#7b1f2d', '#e64553'],
      'profile-avatar--gradient-b': ['#203a8d', '#48a6ff'],
      'profile-avatar--gradient-c': ['#295846', '#6ddb9d'],
      'profile-avatar--gradient-d': ['#5e3a0d', '#f0ad4e'],
    };
    const palette = colors[profile.className] || ['#7b1f2d', '#e64553'];
    return window.createPlaceholderImage(profile.avatar, 200, 200, palette);
  }

  // ARG helpers -----------------------------------------------------------

  function applyArgUnlock(unlocked) {
    window.OBJECTFLIX_API.setUnlocked(unlocked);
    try {
      if (unlocked) localStorage.setItem(window.OBJECTFLIX_CONFIG.arg.storageKey, '1');
      else localStorage.removeItem(window.OBJECTFLIX_CONFIG.arg.storageKey);
    } catch {
      // localStorage unavailable — ignore
    }
  }

  function restoreArgUnlock() {
    let persisted = false;
    try {
      persisted = localStorage.getItem(window.OBJECTFLIX_CONFIG.arg.storageKey) === '1';
    } catch {
      // localStorage unavailable — ignore
    }
    if (persisted && window.OBJECTFLIX_SETTINGS?.get?.('argEnabled') !== false) applyArgUnlock(true);
  }

  // Fetches the hidden ARG episodes and attaches them to matching library
  // items. Mutates `library` in place; returns the list of injected episodes.
  async function injectSecretEpisodes(library, secretEpisodesMap) {
    const { hiddenEpisodes } = window.OBJECTFLIX_CONFIG.arg;
    const injected = [];

    for (const hidden of hiddenEpisodes) {
      if (secretEpisodesMap.has(hidden.id)) continue;

      let episode;
      try {
        episode = await API.getEpisode(hidden.id);
      } catch {
        continue;
      }

      const item = library.find((entry) => entry.id === episode.showId);
      if (!item) continue;

      const catalogEpisode = {
        id: episode.id,
        seasonId: episode.seasonId,
        showId: episode.showId,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        description: episode.description || '',
        videoUrl: episode.videoUrl,
        duration: undefined,
        secret: true,
        fakeDuration: hidden.fakeDuration,
      };

      if (!item.episodes.some((existing) => existing.id === catalogEpisode.id)) {
        item.episodes.push(catalogEpisode);
        item.episodes.sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));
      }
      if (!secretEpisodesMap.has(episode.id)) {
        secretEpisodesMap.set(episode.id, true);
        injected.push(catalogEpisode);
      }
    }

    return injected;
  }

  // Admin catalog overrides --------------------------------------------------
  // The admin panel edits a lightweight "catalog patch" store in localStorage.
  // These patches add/update/remove shows and episodes on top of the live API
  // catalog so admin edits show up everywhere the library is rendered.

  function catalogPatchKey() {
    return window.OBJECTFLIX_CONFIG?.admin?.catalogKey || 'objectflix_admin_catalog';
  }

  function loadCatalogPatches() {
    try {
      const raw = localStorage.getItem(catalogPatchKey());
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveCatalogPatches(patches) {
    try {
      localStorage.setItem(catalogPatchKey(), JSON.stringify(patches || {}));
    } catch {
      // localStorage unavailable — ignore
    }
  }

  function applyCatalogPatches(items) {
    const patches = loadCatalogPatches();
    if (!patches) return items;

    const removedShows = patches.removedShows || {};
    const updatedShows = patches.updatedShows || {};
    const removedEpisodes = patches.removedEpisodes || {};
    const updatedEpisodes = patches.updatedEpisodes || {};
    const addedEpisodes = patches.addedEpisodes || [];
    const addedShows = patches.addedShows || [];

    for (let i = items.length - 1; i >= 0; i--) {
      if (removedShows[items[i].id]) items.splice(i, 1);
    }

    for (const item of items) {
      const showPatch = updatedShows[item.id];
      if (showPatch) {
        if (showPatch.title) item.title = showPatch.title;
        if (showPatch.description) item.description = showPatch.description;
      }
      item.episodes = item.episodes
        .filter((episode) => !removedEpisodes[episode.id])
        .map((episode) => (updatedEpisodes[episode.id] ? { ...episode, ...updatedEpisodes[episode.id] } : episode));
    }

    for (const draft of addedShows) {
      if (removedShows[draft.id]) continue;
      if (items.some((entry) => entry.id === draft.id)) continue;
      items.push(buildCatalogItem(
        { id: draft.id, title: draft.title || draft.id, description: draft.description || '' },
        [{ id: `${draft.id}~s1`, showId: draft.id, title: 'Season 1', episodeCount: 0 }],
        []
      ));
    }

    for (const ep of addedEpisodes) {
      if (removedEpisodes[ep.id]) continue;
      const item = items.find((entry) => entry.id === ep.showId);
      if (!item || item.episodes.some((existing) => existing.id === ep.id)) continue;
      item.episodes.push({
        id: ep.id,
        seasonId: ep.seasonId || item.seasons[0]?.id || `${ep.showId}~s1`,
        showId: ep.showId,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        description: ep.description || '',
        videoUrl: ep.videoUrl || null,
        duration: undefined,
      });
      item.episodes.sort((a, b) => String(a.episodeNumber).localeCompare(String(b.episodeNumber), undefined, { numeric: true }));
    }

    return items;
  }

  function injectUpcomingEpisodes(library) {
    const upcomingList = window.OBJECTFLIX_CONFIG?.upcoming?.episodes || [];
    for (const upcoming of upcomingList) {
      const show = library.find((entry) => acronymFor(entry) === upcoming.showAcronym || entry.title.toLowerCase().includes(upcoming.showAcronym.toLowerCase()));
      if (!show) continue;

      const catalogEpisode = {
        id: upcoming.id,
        seasonId: show.seasons[0]?.id || 's1',
        showId: show.id,
        episodeNumber: upcoming.episodeNumber,
        title: upcoming.title,
        description: upcoming.description,
        videoUrl: null,
        released: false,
        releaseDate: upcoming.releaseDate,
        duration: 'Upcoming',
      };

      if (!show.episodes.some((existing) => existing.id === catalogEpisode.id || existing.episodeNumber === catalogEpisode.episodeNumber)) {
        show.episodes.push(catalogEpisode);
        show.episodes.sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));
      }
    }
  }

  function showUnreleasedNoticeModal(episode) {
    let modal = document.getElementById('unreleasedNoticeModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'unreleasedNoticeModal';
      modal.className = 'modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal__backdrop" data-close-unreleased="true"></div>
      <div class="modal__panel" role="document" style="max-width:540px;text-align:center;padding:48px 36px;">
        <button class="modal__close" id="closeUnreleasedBtn" type="button" aria-label="Close notice">×</button>
        <div style="font-size:3.5rem;margin-bottom:16px;">📅</div>
        <p class="eyebrow">OBJECTFLIX PREMIERE ARCHIVE</p>
        <h2 style="font-size:1.8rem;margin-bottom:16px;">${episode.title}</h2>
        <p style="font-size:1.15rem;color:var(--text);margin-bottom:12px;font-weight:600;">This episode hasn't been released yet! Check back later.</p>
        <p style="color:var(--muted);margin-bottom:28px;">Expected Release Date: <strong style="color:var(--text);">${episode.releaseDate}</strong></p>
        <div class="button-row" style="justify-content:center;">
          <button class="button button--primary" type="button" id="gotItUnreleasedBtn">Got It</button>
        </div>
      </div>
    `;

    modal.classList.remove('is-hidden');

    const closeModal = () => modal.classList.add('is-hidden');
    modal.querySelector('#closeUnreleasedBtn')?.addEventListener('click', closeModal, { once: true });
    modal.querySelector('#gotItUnreleasedBtn')?.addEventListener('click', closeModal, { once: true });
    modal.querySelector('.modal__backdrop')?.addEventListener('click', closeModal, { once: true });
  }

  window.OBJECTFLIX_SHARED = {
    toAbsoluteMediaUrl,
    stableHash,
    paletteFor,
    formatEpisodeMeta,
    acronymFor,
    logoFor,
    buildCatalogItem,
    loadLibrary,
    buildRows,
    nextEpisode,
    createAvatarImage,
    applyArgUnlock,
    restoreArgUnlock,
    injectSecretEpisodes,
    injectUpcomingEpisodes,
    showUnreleasedNoticeModal,
    loadCatalogPatches,
    saveCatalogPatches,
  };
})();
