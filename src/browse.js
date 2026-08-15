// src/browse.js
// Browse page logic for browse.html: library rows, search, details modal, ARG.
// Load AFTER config.js, api.js, data.js and shared.js (classic scripts).
(() => {
  const { profiles, trendingSearches, searchFilters } = window.OBJECTFLIX_DATA || { profiles: [], trendingSearches: [], searchFilters: [] };
  const SHARED = window.OBJECTFLIX_SHARED;

  const elements = {
    appRoot: document.getElementById('appRoot'),
    avatarButton: document.getElementById('avatarButton'),
    homeView: document.getElementById('homeView'),
    searchView: document.getElementById('searchView'),
    detailsModal: document.getElementById('detailsModal'),
    modalContent: document.getElementById('modalContent'),
    closeModalButton: document.getElementById('closeModalButton'),
    menuToggle: document.getElementById('menuToggle'),
    mobileMenu: document.getElementById('mobileMenu'),
    searchInput: document.getElementById('searchInput'),
    searchResults: document.getElementById('searchResults'),
    searchFilters: document.getElementById('searchFilters'),
    searchSummary: document.getElementById('searchSummary'),
    trendingSearches: document.getElementById('trendingSearches'),
    searchNavButton: document.getElementById('searchNavButton'),
  };

  const state = {
    currentProfile: null,
    currentView: 'home',
    selectedTitle: null,
    activeFilter: 'All',
    searchQuery: '',
    myList: new Set(),
    likedTitles: new Set(),
    lastFocusedElement: null,
    libraryLoading: false,
    libraryError: null,
    searchController: null,
  };

  const arg = {
    clicks: 0,
    timer: null,
    unlocked: false,
    secretEpisodes: new Map(),
  };

  let library = [];
  let rows = [];

  const viewMap = {
    home: elements.homeView,
    shows: elements.homeView,
    movies: elements.homeView,
    originals: elements.homeView,
    'my-list': elements.homeView,
    search: elements.searchView,
  };

  // ------------------------------------------------------------------
  // Auth / profile bootstrap
  // ------------------------------------------------------------------

  function currentUser() {
    return JSON.parse(localStorage.getItem('objectflix_current_user') || 'null');
  }

  function restoreActiveProfile() {
    let profile = null;
    try {
      profile = JSON.parse(sessionStorage.getItem('objectflix_active_profile') || 'null');
    } catch {
      // ignore
    }

    const user = currentUser();
    let userProfiles = [];
    if (user) {
      userProfiles = JSON.parse(localStorage.getItem(`objectflix_profiles_${user.email}`) || 'null') || [];
    }
    if (!userProfiles.length) userProfiles = profiles;

    if (!profile || !userProfiles.some((p) => p.id === profile.id)) {
      profile = userProfiles[0] || null;
    }
    return { profile, userProfiles };
  }

  function applyCurrentProfile() {
    if (!state.currentProfile) return;
    elements.avatarButton.style.backgroundImage = `url("${SHARED.createAvatarImage(state.currentProfile)}")`;
    elements.avatarButton.setAttribute('aria-label', `Current profile: ${state.currentProfile.name}`);
    loadLists();
  }

  function loadLists() {
    const profile = state.currentProfile;
    if (!profile) return;
    try {
      state.myList = new Set(JSON.parse(localStorage.getItem(`objectflix_mylist_${profile.id}`) || '[]'));
      state.likedTitles = new Set(JSON.parse(localStorage.getItem(`objectflix_likes_${profile.id}`) || '[]'));
    } catch {
      state.myList = new Set();
      state.likedTitles = new Set();
    }
  }

  function saveList() {
    const profile = state.currentProfile;
    if (!profile) return;
    try {
      localStorage.setItem(`objectflix_mylist_${profile.id}`, JSON.stringify([...state.myList]));
    } catch {
      // ignore
    }
  }

  function saveLikes() {
    const profile = state.currentProfile;
    if (!profile) return;
    try {
      localStorage.setItem(`objectflix_likes_${profile.id}`, JSON.stringify([...state.likedTitles]));
    } catch {
      // ignore
    }
  }

  // ------------------------------------------------------------------
  // Library loading
  // ------------------------------------------------------------------

  async function bootLibrary() {
    state.libraryLoading = true;
    try {
      library = await SHARED.loadLibrary();
      rows = SHARED.buildRows(library);
      state.libraryLoading = false;
      renderHome();
      renderSearch();

      const detailsParam = new URLSearchParams(window.location.search).get('details');
      if (detailsParam) {
        const item = library.find((entry) => entry.id === detailsParam);
        if (item) openDetails(item.id);
      }
    } catch (error) {
      console.error('Failed to load the Objectflix library:', error);
      state.libraryLoading = false;
      state.libraryError = error;
      renderLibraryError(error);
    }
  }

  function showSkeletons() {
    const skeleton = `
      <section class="section">
        <div class="section-heading"><div class="skeleton" style="width:220px;height:28px;border-radius:999px"></div></div>
        <div class="carousel">
          ${Array.from({ length: 5 }).map(() => '<div class="media-card skeleton"></div>').join('')}
        </div>
      </section>
    `;

    elements.homeView.innerHTML = skeleton;
  }

  function renderLibraryError(error) {
    const message = error?.message || 'Something went wrong while loading the library.';
    elements.homeView.innerHTML = `
      <section class="section" style="min-height:60vh;display:grid;place-items:center;text-align:center">
        <div>
          <p class="eyebrow">CONNECTION LOST</p>
          <h2>Couldn't reach the Objectflix library</h2>
          <p style="max-width:520px;margin:12px auto 24px;color:var(--muted)">${message}</p>
          <button class="button button--primary" type="button" data-action="retry">Try Again</button>
        </div>
      </section>
    `;
  }

  // ------------------------------------------------------------------
  // Home view
  // ------------------------------------------------------------------

  function renderHome() {
    const featured = library.find((item) => item.featured) || library[0];
    const activeItems = getHomeItemsForView(state.currentView);

    if (!featured && !activeItems.length) {
      elements.homeView.innerHTML = renderEmptyView();
      return;
    }

    if (featured) {
      const hasRealLogo = !!featured.logo && !featured.logo.startsWith('data:');
      const heroTitle = hasRealLogo
        ? `<img class="hero__logo" src="${featured.logo}" alt="${featured.title}" />`
        : `<h1 class="hero__title">${featured.title}</h1>`;

      elements.homeView.innerHTML = `
        <section class="hero" id="home">
          <div class="hero__backdrop">
            <img class="hero__backdrop-img" src="${featured.backdrop}" alt="${featured.title} backdrop" />
            <div class="hero__overlay"></div>
          </div>
          <div class="hero__content">
            <div class="hero__brandline"><span class="hero__brandmark">O</span> OBJECTFLIX ORIGINAL</div>
            ${heroTitle}
            <p class="hero__tagline">EVERY OBJECT HAS A STORY</p>
            <div class="hero__meta">
              <span class="match-score">${featured.match}</span>
              <span>${featured.year}</span>
              <span class="rating-box">${featured.rating}</span>
              <span>${featured.duration}</span>
            </div>
            <p class="hero__description">${featured.description}</p>
            <div class="button-row">
              <button class="button button--primary" type="button" data-action="play" data-id="${featured.id}">▶ Play</button>
              <button class="button button--secondary" type="button" data-action="details" data-id="${featured.id}">More Info</button>
            </div>
          </div>
        </section>
        ${rows.map((row) => renderRow(row, activeItems)).join('')}
      `;
    } else {
      elements.homeView.innerHTML = rows.map((row) => renderRow(row, activeItems)).join('');
    }

    if (!activeItems.length && state.currentView !== 'home') {
      elements.homeView.innerHTML += renderEmptyView();
    }
  }

  function renderEmptyView() {
    const labels = { movies: 'Movies', originals: 'Originals', 'my-list': 'My List' };
    const label = labels[state.currentView] || 'This category';
    return `
      <section class="section" style="min-height:40vh;display:grid;place-items:center;text-align:center">
        <div>
          <h2>No titles in ${label} yet</h2>
          <p style="max-width:480px;margin:12px auto 24px;color:var(--muted)">The Objectflix catalog is live — check back as the library grows.</p>
          <button class="button button--secondary" type="button" data-action="browse-all">Browse All Shows</button>
        </div>
      </section>
    `;
  }

  function getHomeItemsForView(view) {
    if (view === 'shows') return library.filter((item) => item.category === 'shows');
    if (view === 'movies') return library.filter((item) => item.category === 'movies');
    if (view === 'originals') return library.filter((item) => item.category === 'originals' || item.type === 'Original');
    if (view === 'my-list') return library.filter((item) => state.myList.has(item.id));
    return library;
  }

  function renderRow(row, activeItems) {
    const rowItems = row.items
      .map((id) => library.find((item) => item.id === id))
      .filter(Boolean)
      .filter((item) => activeItems.some((active) => active.id === item.id));

    if (!rowItems.length) return '';

    return `
      <section class="section" aria-label="${row.title}">
        <div class="section-heading">
          <div>
            <h2>${row.title}</h2>
            <p>${getRowDescription(row.key)}</p>
          </div>
          <div class="carousel-controls" aria-label="${row.title} carousel controls">
            <button class="carousel-button" type="button" data-carousel-direction="left" aria-label="Scroll ${row.title} left">←</button>
            <button class="carousel-button" type="button" data-carousel-direction="right" aria-label="Scroll ${row.title} right">→</button>
          </div>
        </div>
        <div class="carousel-shell">
          <div class="carousel" tabindex="0">
            ${rowItems.map((item) => renderMediaCard(item, row.key === 'continue')).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function getRowDescription(key) {
    const descriptions = {
      continue: 'Pick up right where you left off.',
      trending: 'Big energy. Big buzz. Big watchlist potential.',
      shows: 'Serialized picks with strong object-show flavor.',
      recent: 'Fresh additions with cinematic polish.',
      originals: 'Exclusive stories built for the Objectflix spotlight.',
      favorites: 'Curated by community taste and repeat rewatches.',
      recommended: 'Tailored to your current vibe and genres.',
    };

    return descriptions[key] || 'Curated just for you.';
  }

  function renderMediaCard(item, showProgress = false) {
    const inList = state.myList.has(item.id);
    const isLiked = state.likedTitles.has(item.id);
    return `
      <article class="media-card" tabindex="0" aria-label="${item.title}">
        <img class="media-card__thumb" src="${item.poster}" alt="${item.title} poster placeholder" />
        <div class="media-card__badge">${item.type === 'Original' ? 'O ORIGINAL' : item.type.toUpperCase()}</div>
        <div class="media-card__overlay">
          <div class="media-card__title">${item.title}</div>
          <div class="card-meta">
            <span>${item.match}</span>
            <span>${item.rating}</span>
            <span>${item.duration}</span>
          </div>
          ${showProgress ? `<div class="progress" aria-label="Viewing progress"><span style="width:${Math.round(item.progress * 100)}%"></span></div>` : ''}
          <div class="card-actions">
            <button class="button button--primary" type="button" data-action="play" data-id="${item.id}">Play</button>
            <button class="button button--secondary" type="button" data-action="toggle-list" data-id="${item.id}" aria-pressed="${inList}">${inList ? 'In My List' : '+ My List'}</button>
            <button class="card-icon-button" type="button" data-action="like" data-id="${item.id}" aria-label="${isLiked ? 'Unlike' : 'Like'} ${item.title}" aria-pressed="${isLiked}">${isLiked ? '♥' : '♡'}</button>
            <button class="card-icon-button" type="button" data-action="details" data-id="${item.id}" aria-label="More information about ${item.title}">i</button>
          </div>
        </div>
      </article>
    `;
  }

  // ------------------------------------------------------------------
  // Search view
  // ------------------------------------------------------------------

  function renderSearch() {
    elements.searchFilters.innerHTML = searchFilters
      .map((filter) => `<button class="filter-chip ${state.activeFilter === filter ? 'is-active' : ''}" data-filter="${filter}" type="button" aria-pressed="${state.activeFilter === filter}">${filter}</button>`)
      .join('');

    elements.trendingSearches.innerHTML = trendingSearches
      .map((term) => `<button class="chip" type="button" data-trending-term="${term}">${term}</button>`)
      .join('');

    if (!library.length && !state.searchQuery) {
      elements.searchSummary.textContent = state.libraryLoading ? 'Loading the live catalog…' : 'Browse the live Objectflix library.';
      elements.searchResults.innerHTML = '';
      return;
    }

    void refreshSearchResults();
  }

  async function refreshSearchResults() {
    if (state.searchController) {
      state.searchController.abort();
    }
    state.searchController = new AbortController();

    const query = state.searchQuery;
    elements.searchSummary.textContent = query
      ? `Searching “${query}”…`
      : 'Browse featured picks and curated categories.';

    try {
      let results = [];

      if (query) {
        const apiResults = await window.OBJECTFLIX_API.searchShows(query, { signal: state.searchController.signal });
        results = apiResults
          .map((show) => library.find((item) => item.id === show.id))
          .filter(Boolean);
      } else {
        results = [...library];
      }

      const filtered = applyFilter(results);
      if (state.searchController.signal.aborted) return;

      elements.searchSummary.textContent = query
        ? `${filtered.length} result${filtered.length === 1 ? '' : 's'} for “${query}”.`
        : `${filtered.length} titles in the live catalog.`;

      elements.searchResults.innerHTML = filtered.length
        ? filtered.map(renderResultCard).join('')
        : renderNoResults(query);
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Search failed:', error);
      elements.searchSummary.textContent = 'Search is unavailable right now.';
      elements.searchResults.innerHTML = renderNoResults(query, true);
    } finally {
      if (state.searchController.signal.aborted) return;
      state.searchController = null;
    }
  }

  function applyFilter(items) {
    return items.filter((item) => {
      if (state.activeFilter === 'All') return true;
      if (state.activeFilter === 'Movies') return item.category === 'movies';
      if (state.activeFilter === 'TV Shows') return item.category === 'shows';
      if (state.activeFilter === 'Originals') return item.category === 'originals' || item.type === 'Original';
      return (item.genres || []).includes(state.activeFilter);
    });
  }

  function renderNoResults(query, isError = false) {
    if (isError) {
      return `<p class="search-empty">Search is unavailable. Check your connection and try again.</p>`;
    }
    return query
      ? `<p class="search-empty">Nothing in the live catalog matches “${query}”.</p>`
      : `<p class="search-empty">No titles match this filter yet.</p>`;
  }

  function renderResultCard(item) {
    return `
      <article class="result-card">
        <img src="${item.poster}" alt="${item.title} poster placeholder" />
        <div class="result-card__content">
          <div class="result-card__title">${item.title}</div>
          <div class="card-meta">
            <span>${item.year}</span>
            <span>${item.rating}</span>
            <span>${item.duration}</span>
          </div>
          <p>${item.description}</p>
          <div class="button-row">
            <button class="button button--primary" type="button" data-action="play" data-id="${item.id}">Play</button>
            <button class="button button--secondary" type="button" data-action="details" data-id="${item.id}">Details</button>
          </div>
        </div>
      </article>
    `;
  }

  // ------------------------------------------------------------------
  // Details modal
  // ------------------------------------------------------------------

  function openDetails(id) {
    const item = library.find((entry) => entry.id === id);
    if (!item) return;
    if (elements.detailsModal.classList.contains('is-hidden')) {
      state.lastFocusedElement = document.activeElement;
    }
    state.selectedTitle = item;
    elements.modalContent.innerHTML = `
      <div class="modal-hero">
        <img src="${item.backdrop}" alt="${item.title} backdrop placeholder" />
        <img src="${item.logo}" class="modal-logo" alt="${item.title} logo" />
        <div class="modal-hero__overlay">
          <div>
            <p class="eyebrow">${item.type.toUpperCase()}</p>
            <h2 id="modalTitle">${item.title}</h2>
            <div class="modal-meta">
              <span>${item.match}</span>
              <span>${item.year}</span>
              <span>${item.rating}</span>
              <span>${item.duration}</span>
            </div>
            <div class="button-row">
              <button class="button button--primary" type="button" data-action="play" data-id="${item.id}">Play</button>
              <button class="button button--secondary" type="button" data-action="toggle-list" data-id="${item.id}" aria-pressed="${state.myList.has(item.id)}">${state.myList.has(item.id) ? 'In My List' : '+ My List'}</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-body">
        <div class="modal-poster">
          <img src="${item.poster}" alt="${item.title} poster placeholder" />
        </div>
        <div>
          <p class="modal-description">${item.description}</p>
          <div class="pill-row">${item.genres.map((genre) => `<span class="pill">${genre}</span>`).join('')}</div>
          <div class="section-heading"><h3>Episodes</h3><p>${item.episodes.length} available</p></div>
          <div class="episode-list">
            ${item.episodes.map((episode) => `
              <article class="episode-card ${episode.secret ? 'episode-card--secret' : ''} ${episode.released === false ? 'episode-card--upcoming' : ''}">
                <div class="episode-card__content">
                  <div class="episode-card__title">${episode.episodeNumber}. ${episode.title}${episode.secret ? ' <span class="secret-badge">SECRET</span>' : ''}${episode.released === false ? ' <span class="upcoming-badge" style="background:#7c3aed;color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:4px;margin-left:6px;font-weight:700;">UPCOMING</span>' : ''}</div>
                  <div class="card-meta"><span>${SHARED.formatEpisodeMeta(episode)}</span>${episode.released === false ? '<span>Unreleased</span>' : (episode.videoUrl ? '<span>Streaming ready</span>' : '')}</div>
                  <p>${episode.description || (episode.released === false ? `This episode hasn't been released yet! Check back later. Expected release: ${episode.releaseDate}` : (episode.secret ? 'Recovered from the Objectflix ARG. The real edition was thought to be lost forever.' : 'No description available.'))}</p>
                  <div class="button-row">
                    <button class="button ${episode.released === false ? 'button--secondary' : 'button--primary'}" type="button" data-action="play-episode" data-id="${item.id}" data-episode="${episode.id}">${episode.released === false ? '📅 Release Info' : '▶ Play'}</button>
                  </div>
                </div>
              </article>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    elements.detailsModal.classList.remove('is-hidden');
    elements.closeModalButton.focus();
  }

  function closeDetails() {
    const wasOpen = !elements.detailsModal.classList.contains('is-hidden');
    elements.detailsModal.classList.add('is-hidden');
    state.selectedTitle = null;
    if (wasOpen && state.lastFocusedElement instanceof HTMLElement && state.lastFocusedElement.isConnected) {
      state.lastFocusedElement.focus();
    }
    state.lastFocusedElement = null;
  }

  // ------------------------------------------------------------------
  // Play navigation (moves to watch.html)
  // ------------------------------------------------------------------

  function playTitle(id) {
    const item = library.find((entry) => entry.id === id);
    if (!item) return;
    const episode = item.episodes[0] || null;
    window.location.href = `watch.html?id=${encodeURIComponent(item.id)}&ep=${encodeURIComponent(episode ? episode.id : '')}`;
  }

  function playEpisode(itemId, episodeId) {
    const item = library.find((entry) => entry.id === itemId);
    if (!item) return;
    const episode = item.episodes.find((ep) => ep.id === episodeId);
    if (!episode) return;
    if (episode.released === false) {
      SHARED.showUnreleasedNoticeModal(episode);
      return;
    }
    window.location.href = `watch.html?id=${encodeURIComponent(item.id)}&ep=${encodeURIComponent(episode.id)}`;
  }

  // ------------------------------------------------------------------
  // List / likes
  // ------------------------------------------------------------------

  function toggleMyList(id) {
    if (state.myList.has(id)) {
      state.myList.delete(id);
    } else {
      state.myList.add(id);
    }
    saveList();
    renderHome();
    if (state.selectedTitle?.id === id) openDetails(id);
  }

  function toggleLike(id) {
    if (state.likedTitles.has(id)) {
      state.likedTitles.delete(id);
    } else {
      state.likedTitles.add(id);
    }
    saveLikes();
    renderHome();
  }

  function scrollCarousel(button) {
    const section = button.closest('.section');
    const carousel = section?.querySelector('.carousel');
    if (!carousel) return;
    const direction = button.dataset.carouselDirection === 'left' ? -1 : 1;
    carousel.scrollBy({ left: carousel.clientWidth * 0.82 * direction, behavior: 'smooth' });
  }

  // ------------------------------------------------------------------
  // ARG logo ritual
  // ------------------------------------------------------------------

  function handleLogoRitual() {
    const { logoClicksRequired, clickWindowMs } = window.OBJECTFLIX_CONFIG.arg;

    if (window.OBJECTFLIX_SETTINGS?.get?.('argEnabled') === false) return;
    if (arg.unlocked) return;

    arg.clicks += 1;
    clearTimeout(arg.timer);
    arg.timer = setTimeout(() => {
      arg.clicks = 0;
    }, clickWindowMs);

    if (arg.clicks >= logoClicksRequired) {
      arg.clicks = 0;
      clearTimeout(arg.timer);
      unlockArg();
    }
  }

  function unlockArg() {
    SHARED.applyArgUnlock(true);
    arg.unlocked = true;
    showArgToast('ARG unlocked — hunting for the lost episode…');

    void SHARED.injectSecretEpisodes(library, arg.secretEpisodes).then((injected) => {
      if (injected.length) {
        showArgToast(`Recovered ${injected.length} hidden episode${injected.length === 1 ? '' : 's'}: ${injected.map((ep) => ep.title).join(', ')}`);
      } else {
        showArgToast('The archive is silent… nothing recovered.');
      }
      renderHome();
      renderSearch();
    }).catch((error) => {
      console.error('ARG unlock failed:', error);
      showArgToast('Signal lost — try the ritual again.');
    });
  }

  function showArgToast(message) {
    let toast = document.querySelector('.arg-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'arg-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('arg-toast--visible');
    clearTimeout(showArgToast._hideTimer);
    showArgToast._hideTimer = setTimeout(() => {
      toast.classList.remove('arg-toast--visible');
    }, 4500);
  }

  // ------------------------------------------------------------------
  // View switching
  // ------------------------------------------------------------------

  function changeView(view) {
    state.currentView = view;

    [elements.homeView, elements.searchView]
      .forEach((section) => section.classList.remove('view--active'));
    (viewMap[view] || elements.homeView).classList.add('view--active');

    document.querySelectorAll('.nav-link').forEach((link) => {
      const isActive = link.dataset.view === view;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    if (view === 'search') {
      elements.searchInput.focus();
    }

    if (['home', 'shows', 'movies', 'originals', 'my-list'].includes(view)) {
      renderHome();
    }

    elements.mobileMenu.classList.add('is-hidden');
    elements.menuToggle.setAttribute('aria-expanded', 'false');
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const navButton = target.closest('[data-view]');
      if (navButton) {
        changeView(navButton.dataset.view);
        return;
      }

      const actionButton = target.closest('[data-action]');
      if (actionButton) {
        const { action, id, episode } = actionButton.dataset;
        if (action === 'details') openDetails(id);
        if (action === 'play') playTitle(id);
        if (action === 'play-episode') playEpisode(id, episode);
        if (action === 'toggle-list') toggleMyList(id);
        if (action === 'like') toggleLike(id);
        if (action === 'retry') {
          showSkeletons();
          void bootLibrary();
        }
        if (action === 'browse-all') changeView('home');
        return;
      }

      const carouselButton = target.closest('[data-carousel-direction]');
      if (carouselButton) {
        scrollCarousel(carouselButton);
        return;
      }

      const closeTrigger = target.closest('[data-close-modal="true"]');
      if (closeTrigger) {
        closeDetails();
        return;
      }

      const trend = target.closest('[data-trending-term]');
      if (trend) {
        state.searchQuery = trend.dataset.trendingTerm;
        elements.searchInput.value = state.searchQuery;
        renderSearch();
        changeView('search');
        return;
      }

      const filter = target.closest('[data-filter]');
      if (filter) {
        state.activeFilter = filter.dataset.filter;
        renderSearch();
      }
    });

    elements.closeModalButton.addEventListener('click', closeDetails);
    elements.searchNavButton.addEventListener('click', () => changeView('search'));

    document.querySelectorAll('.logo').forEach((logo) => {
      logo.addEventListener('click', handleLogoRitual);
    });

    elements.avatarButton.addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    elements.searchInput.addEventListener('input', (event) => {
      state.searchQuery = event.target.value.trim();
      renderSearch();
    });

    elements.searchInput.addEventListener('change', () => {
      if (!state.searchQuery && state.searchController) {
        state.searchController.abort();
      }
    });

    elements.menuToggle.addEventListener('click', () => {
      const isOpen = !elements.mobileMenu.classList.contains('is-hidden');
      elements.mobileMenu.classList.toggle('is-hidden', isOpen);
      elements.menuToggle.setAttribute('aria-expanded', String(!isOpen));
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeDetails();
      }
    });
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------

  function init() {
    const user = currentUser();
    if (!user) {
      window.location.replace('index.html');
      return;
    }

    // Show the Admin link only to authenticated administrators (Discord ID is
    // the source of truth). Directly visiting admin.html always re-checks.
    const adminSession = window.OBJECTFLIX_ADMIN?.session?.();
    const adminLink = document.getElementById('adminLink');
    if (adminLink && adminSession) {
      adminLink.classList.remove('is-hidden');
    }

    const { profile } = restoreActiveProfile();
    state.currentProfile = profile;

    SHARED.restoreArgUnlock();
    applyCurrentProfile();

    bindEvents();
    showSkeletons();
    void bootLibrary();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
