


(() => {
  const { trendingSearches, searchFilters } = window.OBJECTFLIX_DATA || { trendingSearches: [], searchFilters: [] };
  const SHARED = window.OBJECTFLIX_SHARED;
  // Escapes catalog and profile values before they enter browse-page HTML.
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  // Builds an SVG use element for a named icon in the shared sprite.
  const icon = (name) => `<svg class="ui-icon" aria-hidden="true"><use href="./assets/ui/icons.svg#${name}"></use></svg>`;
  const fullTitles = { BFDI: 'Battle for Dream Island', BFDIA: 'Battle for Dream Island Again', BFB: 'Battle for BFDI', TPOT: 'Battle for Dream Island: The Power of Two', BFDIE: 'Battle for Dream Island Elsewhere', IDFB: 'dnalsI maerD rof elttaB' };
  // Uses a configured long title for known acronyms, otherwise keeps the catalog title.
  const displayTitle = (item) => fullTitles[item.title.toUpperCase()] || item.title;
  // Excludes upcoming episodes so play controls only target released entries.
  const releasedEpisodes = (item) => item.episodes.filter((episode) => episode.released !== false);
  // Returns the released episode count, or a coming-soon label when none are available.
  const episodeLabel = (item) => {
    const count = releasedEpisodes(item).length;
    return count ? `${count} episode${count === 1 ? '' : 's'}` : 'Coming soon';
  };

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
    homeFilter: 'All',
    heroIndex: 0,
    discovery: { query: '', loading: false, results: [], error: '' },
  };

  const arg = {
    clicks: 0,
    timer: null,
    unlocked: false,
    secretEpisodes: new Map(),
  };

  let library = [];

  const viewMap = {
    home: elements.homeView,
    shows: elements.homeView,
    movies: elements.homeView,
    originals: elements.homeView,
    'my-list': elements.homeView,
    history: elements.homeView,
    search: elements.searchView,
  };

  
  
  

  // Reads the current account from localStorage, returning null if the stored value is invalid.
  function currentUser() {
    try {
      return JSON.parse(localStorage.getItem('objectflix_current_user') || 'null');
    } catch {
      return null;
    }
  }

  // Restores the selected profile, creating a guest profile when no account is signed in.
  function restoreActiveProfile() {
    let profile = null;
    try {
      profile = JSON.parse(sessionStorage.getItem('objectflix_active_profile') || 'null');
    } catch {
      
    }

    const user = currentUser();
    const isGuest = !user || user.provider === 'guest' || localStorage.getItem('objectflix_guest') === 'true';

    if (!profile) {
      if (isGuest) {
        profile = { id: 'guest', name: 'Guest', avatarClass: 'profile-avatar--gradient-a', guest: true };
        return { profile, userProfiles: [profile] };
      }
      window.location.href = 'index.html';
      return { profile: null, userProfiles: [] };
    }
    return { profile, userProfiles: [profile] };
  }

  // Applies the active profile's avatar and greeting, then loads its saved lists and appearance.
  function applyCurrentProfile() {
    if (!state.currentProfile) return;
    elements.avatarButton.style.backgroundImage = `url("${SHARED.createAvatarImage(state.currentProfile)}")`;
    elements.avatarButton.setAttribute('aria-label', `Current profile: ${state.currentProfile.name}`);
    document.getElementById('profileGreeting').textContent = state.currentProfile.name;
    loadLists();
    updateListCount();
    window.OBJECTFLIX_MEMBERSHIP?.applyAppearance();
  }

  // Loads this profile's saved titles and likes, resetting both sets if storage is invalid.
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

  // Persists the active profile's saved-title IDs in localStorage.
  function saveList() {
    const profile = state.currentProfile;
    if (!profile) return;
    try {
      localStorage.setItem(`objectflix_mylist_${profile.id}`, JSON.stringify([...state.myList]));
    } catch {
      
    }
  }

  // Persists the active profile's liked-title IDs in localStorage.
  function saveLikes() {
    const profile = state.currentProfile;
    if (!profile) return;
    try {
      localStorage.setItem(`objectflix_likes_${profile.id}`, JSON.stringify([...state.likedTitles]));
    } catch {
      
    }
  }

  
  
  

  // Loads the catalog, applies unlocked ARG content, renders browse views, and opens linked details.
  async function bootLibrary() {
    state.libraryLoading = true;
    state.libraryError = null;
    elements.homeView.setAttribute('aria-busy', 'true');
    try {
      library = await SHARED.loadLibrary();
      if (SHARED.isArgUnlocked()) {
        await SHARED.injectSecretEpisodes(library, arg.secretEpisodes);
        library = SHARED.applyArgArchiveFilter(library);
      }
      window.OBJECTFLIX_LIBRARY = library;
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
      renderSearch();
    } finally {
      elements.homeView.setAttribute('aria-busy', 'false');
    }
  }

  // Displays placeholder cards while the catalog is loading.
  function showSkeletons() {
    const skeleton = `
      <div class="browse-loading" role="status">
        <span class="sr-only">Getting your little universe ready…</span>
        <div class="skeleton skeleton--heading"></div>
        <div class="skeleton skeleton--spotlight"></div>
        <div class="skeleton skeleton--heading"></div>
        <div class="skeleton-grid">${Array.from({ length: 5 }).map(() => '<div class="skeleton skeleton--poster"></div>').join('')}</div>
      </div>
    `;

    elements.homeView.innerHTML = skeleton;
  }

  // Replaces the home view with a retry prompt and an escaped catalog-load error.
  function renderLibraryError(error) {
    const message = error?.message || 'Something went wrong while loading the library.';
    elements.homeView.innerHTML = `
      <section class="empty-state empty-state--connection">
        <span class="empty-state__icon">${icon('tv')}</span>
        <p class="eyebrow">A LITTLE INTERMISSION</p>
        <h1>The clubhouse is a little out of reach.</h1>
        <p>${escapeHTML(message)}</p>
        <button class="button button--primary" type="button" data-action="retry">Let's try again ${icon('arrow-right')}</button>
      </section>
    `;
  }

  
  
  

  // Renders the active browse view, including history, discovery, spotlight, and catalog rows.
  function renderHome() {
    if (state.libraryLoading) { showSkeletons(); return; }
    if (state.libraryError) { renderLibraryError(state.libraryError); return; }

    const isHome = state.currentView === 'home';
    const activeItems = getHomeItemsForView(state.currentView).filter((item) => state.homeFilter === 'All' || item.genres.includes(state.homeFilter));
    const headings = {
      home: ['YOUR DAILY DOSE OF OBJECT ENERGY', 'Find your happy place.', 'Familiar faces. Unexpected adventures. A little something just for you.'],
      shows: ['A WHOLE UNIVERSE TO EXPLORE', "The gang's all here.", 'From the very first challenge to your next favorite universe.'],
      movies: ['MAKE IT A MOVIE NIGHT', 'Big stories. One sitting.', 'Get comfy. Your next feature-length adventure belongs right here.'],
      originals: ['A LITTLE SOMETHING DIFFERENT', 'Only in this little universe.', 'Meet the stories in the Objectflix Originals collection.'],
      'my-list': ['THE GOOD STUFF, SAVED FOR LATER', 'Your own little universe.', `${getHomeItemsForView('my-list').length} saved favorites. Ready whenever you are.`],
      history: ['THE STORIES YOU HAVE BEEN LIVING', 'A little trip down memory lane.', 'Your viewing history on this device. Pick up a familiar story.'],
    };
    const [eyebrow, title, subtitle] = headings[state.currentView] || headings.home;
    const heading = `<div class="browse-heading"><div><p class="eyebrow">${eyebrow}</p><h1 tabindex="-1" id="browseViewTitle">${title}</h1><p>${subtitle}</p></div><span class="happy-stamp" aria-hidden="true">GOOD SHOWS<br /><span>good mood.</span>✳</span></div>`;
    const filters = `<div class="discovery-filters"><span>Your kind of fun</span><div class="filter-row" role="group" aria-label="Filter shows by genre">${['All', 'Comedy', 'Adventure', 'Family', 'Sci-Fi'].map((filter) => `<button class="filter-chip ${state.homeFilter === filter ? 'is-active' : ''}" type="button" data-home-filter="${filter}" aria-pressed="${state.homeFilter === filter}">${filter === 'All' ? `${icon('grid')} Everything` : filter}</button>`).join('')}</div><span class="discovery-filters__count">${activeItems.length} titles to explore</span></div>`;

    if (!isHome) {
      if (state.currentView === 'history') {
        const history = (window.OBJECTFLIX_HISTORY?.entries() || []).filter((entry) => activeItems.some((item) => item.id === entry.showId));
        elements.homeView.innerHTML = `${heading}${filters}${history.length ? `<div class="history-tools"><p>Saved on this device, for this profile.</p><button class="text-link" type="button" data-action="clear-history">Clear my history</button></div><div class="history-list">${history.map((entry) => {
          const item = library.find((show) => show.id === entry.showId);
          const episode = item.episodes.find((ep) => ep.id === entry.episodeId);
          return `<article class="history-row"><img src="${escapeHTML(item.backdrop)}" alt="" loading="lazy" /><div><p class="eyebrow">${escapeHTML(displayTitle(item))}</p><h2>${escapeHTML(entry.episodeTitle)}</h2><p>${new Date(entry.updatedAt).toLocaleDateString()} · ${Math.round(entry.position / 60)} of ${Math.round(entry.duration / 60)} minutes</p></div>${episode ? `<button class="button button--secondary" type="button" data-action="play-episode" data-id="${escapeHTML(item.id)}" data-episode="${escapeHTML(episode.id)}">${icon('play')} ${entry.position / entry.duration < 0.95 ? 'Resume' : 'Watch again'}</button>` : '<span>Episode unavailable</span>'}</article>`;
        }).join('')}</div>` : renderEmptyView()}`;
        return;
      }
      elements.homeView.innerHTML = `${heading}${filters}${activeItems.length ? `<div class="catalog-grid">${activeItems.map((item) => renderMediaCard(item)).join('')}</div>` : renderEmptyView()}`;
      return;
    }

    const history = window.OBJECTFLIX_HISTORY?.entries() || [];
    const favorites = library.filter((item) => state.myList.has(item.id) || state.likedTitles.has(item.id) || history.some((entry) => entry.showId === item.id));
    const interests = new Map();
    favorites.forEach((item) => item.genres.forEach((genre) => interests.set(genre, (interests.get(genre) || 0) + 1)));
    // Scores a title by how often its genres appear among this profile's favorites.
    const relevance = (item) => item.genres.reduce((score, genre) => score + (interests.get(genre) || 0), 0);
    const available = activeItems.filter((item) => releasedEpisodes(item).length).sort((a, b) => relevance(b) - relevance(a));
    const upcoming = activeItems.filter((item) => !releasedEpisodes(item).length);
    const continueItems = activeItems.filter((item) => item.progress > 0);
    elements.homeView.innerHTML = `
      ${heading}
      ${isHome ? renderDiscoveryConcierge() : ''}
      ${renderSpotlight()}
      ${filters}
      ${continueItems.length ? renderRow({ key: 'continue', title: 'Right where you left the fun', description: 'Your next episode is calling.', items: continueItems }) : ''}
      ${available.length ? renderRow({ key: 'shows', title: 'Meet your next obsession', description: 'A few wonderfully weird worlds to get lost in.', items: available }) : ''}
      ${!activeItems.length ? renderEmptyView() : ''}
      <section class="discovery-banner" aria-label="Discover a random show"><span class="discovery-banner__doodle" aria-hidden="true">✳</span><div><p class="eyebrow">LET A LITTLE CHAOS DECIDE</p><h2>Your next favorite might surprise you.</h2><p>One click. A whole new rabbit hole.</p></div><button class="button button--ink" type="button" data-action="surprise">${icon('shuffle')} Pick something for me</button></section>
      ${upcoming.length ? renderRow({ key: 'upcoming', title: 'Good things on the horizon', description: 'A sneak peek at the stories making their way here.', items: upcoming }) : ''}
      <div class="clubhouse-note"><span aria-hidden="true">♡</span><p>Every good clubhouse grows together. <button type="button" data-community-action="request-show">Tell us what you'd love to watch.</button></p>${icon('arrow-up-right')}</div>
    `;
  }

  // Builds the mood-search form, suggestions, status, and any discovery results.
  function renderDiscoveryConcierge() {
    const discovery = state.discovery;
    const results = discovery.results || [];
    return `<section class="discovery-concierge" aria-labelledby="discoveryTitle">
      <div class="discovery-concierge__intro">
        <span class="discovery-concierge__spark" aria-hidden="true">✦</span>
        <div><p class="eyebrow">A LITTLE AI MAGIC</p><h2 id="discoveryTitle">Tell us what you’re in the mood for<span class="brand-dot">.</span></h2><p>Describe the feeling, the chaos level, or how much time you have. We’ll find a real match from the clubhouse.</p></div>
      </div>
      <form class="discovery-form" data-discovery-form>
        <label class="sr-only" for="discoveryInput">Describe what you want to watch</label>
        <input id="discoveryInput" name="query" type="search" maxlength="240" value="${escapeHTML(discovery.query)}" placeholder="Something funny, chaotic, and easy to start…" autocomplete="off" />
        <button class="button button--ink" type="submit" ${discovery.loading ? 'disabled' : ''}>${discovery.loading ? 'Finding a little world…' : `${icon('sparkles')} Find my show`}</button>
      </form>
      <div class="discovery-prompts" aria-label="Discovery ideas">
        ${['A cozy show for a rainy day', 'Maximum chaos, please', 'Something like BFDI but stranger', 'I only have 30 minutes'].map((prompt) => `<button type="button" data-discovery-prompt="${escapeHTML(prompt)}">${escapeHTML(prompt)}</button>`).join('')}
      </div>
      ${discovery.error ? `<p class="discovery-status" role="alert">${escapeHTML(discovery.error)}</p>` : ''}
      ${results.length ? `<div class="discovery-results" aria-live="polite"><div class="discovery-results__heading"><div><p class="eyebrow">THE CONCIERGE SUGGESTS</p><h3>A few worlds worth opening</h3></div><button type="button" class="text-link" data-discovery-clear>Start over</button></div><div class="discovery-results__grid">${results.map((result) => renderDiscoveryResult(result)).join('')}</div></div>` : ''}
    </section>`;
  }

  // Builds one recommendation card with match details, watch/explore, and save controls.
  function renderDiscoveryResult(result) {
    const item = result.item;
    const id = escapeHTML(item.id);
    const title = escapeHTML(displayTitle(item));
    const inList = state.myList.has(item.id);
    return `<article class="discovery-result">
      <button class="discovery-result__art" type="button" data-action="details" data-id="${id}" aria-label="Explore ${title}"><img src="${escapeHTML(item.poster)}" alt="${title}" loading="lazy" /><span>${result.match}% match</span></button>
      <div class="discovery-result__copy"><div><p class="eyebrow">${escapeHTML(result.vibe)}</p><h3><button type="button" data-action="details" data-id="${id}">${title}</button></h3><p>${escapeHTML(result.reason)}</p></div><div class="discovery-result__actions"><button class="button button--primary" type="button" data-action="${releasedEpisodes(item).length ? 'play' : 'details'}" data-id="${id}">${icon(releasedEpisodes(item).length ? 'play' : 'arrow-up-right')} ${releasedEpisodes(item).length ? 'Watch' : 'Explore'}</button><button class="save-button ${inList ? 'is-saved' : ''}" type="button" data-action="toggle-list" data-id="${id}" aria-label="${inList ? 'Remove from' : 'Add to'} my list: ${title}" aria-pressed="${inList}">${icon(inList ? 'check' : 'bookmark')}</button></div></div>
    </article>`;
  }

  // Requests catalog recommendations for a nonempty query and stores the results or error.
  async function runDiscovery(query) {
    const text = String(query || '').trim();
    if (!text || state.discovery.loading) return;
    state.discovery = { query: text, loading: true, results: [], error: '' };
    renderHome();
    const concierge = window.OBJECTFLIX_AI_DISCOVERY;
    try {
      const results = concierge ? await concierge.discoverShows(text, library) : [];
      state.discovery.loading = false;
      state.discovery.results = results;
      state.discovery.error = results.length ? '' : 'The concierge is still learning this clubhouse. Try a mood, a genre, or a show you already love.';
    } catch (error) {
      state.discovery.loading = false;
      state.discovery.error = error.message || 'The concierge lost the plot. Try again in a moment.';
    }
    renderHome();
    document.getElementById('discoveryInput')?.focus({ preventScroll: true });
  }

  // Selects up to three released shows, prioritizing configured spotlight favorites.
  function spotlightPicks() {
    const order = ['BFDI', 'TPOT', 'BFB'];
    const picks = library.filter((item) => releasedEpisodes(item).length && !item.backdrop.startsWith('data:'));
    picks.sort((a, b) => {
      // Places configured spotlight shows first and sends all other titles to the end.
      const rank = (item) => { const index = order.indexOf(SHARED.acronymFor(item)); return index < 0 ? order.length : index; };
      return rank(a) - rank(b);
    });
    return (picks.length ? picks : library).slice(0, 3);
  }

  // Renders the current featured show and its pagination, watch, details, and save actions.
  function renderSpotlight() {
    const picks = spotlightPicks();
    if (!picks.length) return '';
    state.heroIndex %= picks.length;
    const featured = picks[state.heroIndex];
    const inList = state.myList.has(featured.id);
    return `<section class="spotlight spotlight--${state.heroIndex}" aria-label="In the spotlight: ${escapeHTML(displayTitle(featured))}">
      <div class="spotlight__copy">
        <p class="spotlight__eyebrow">${icon('sun')} A LITTLE SPOTLIGHT</p>
        <h2>${escapeHTML(displayTitle(featured))}</h2>
        <div class="spotlight__meta"><span>${escapeHTML(featured.rating)}</span><span>${escapeHTML(episodeLabel(featured))}</span><span>Animation</span></div>
        <p class="spotlight__description">${escapeHTML(featured.description)}</p>
        <div class="button-row"><button class="button button--ink" type="button" data-action="${releasedEpisodes(featured).length ? 'play' : 'details'}" data-id="${escapeHTML(featured.id)}">${icon('play')} ${releasedEpisodes(featured).length ? 'Let’s watch' : 'Meet the show'}</button><button class="button button--outline" type="button" data-action="details" data-id="${escapeHTML(featured.id)}">Meet the show ${icon('arrow-up-right')}</button><button class="save-button ${inList ? 'is-saved' : ''}" type="button" data-action="toggle-list" data-id="${escapeHTML(featured.id)}" aria-label="${inList ? 'Remove from' : 'Add to'} my list: ${escapeHTML(featured.title)}" aria-pressed="${inList}">${icon(inList ? 'check' : 'bookmark')}</button></div>
        <div class="spotlight__pagination" role="group" aria-label="Choose a featured show">${picks.map((item, index) => `<button class="spotlight-dot ${index === state.heroIndex ? 'is-active' : ''}" type="button" data-featured="${index}" aria-label="Feature ${escapeHTML(displayTitle(item))}" aria-pressed="${index === state.heroIndex}"></button>`).join('')}<span>${String(state.heroIndex + 1).padStart(2, '0')} <span>/</span> ${String(picks.length).padStart(2, '0')}</span></div>
      </div>
      <div class="spotlight__art"><span class="spotlight__orbit" aria-hidden="true"></span><button class="spotlight__image" type="button" data-action="details" data-id="${escapeHTML(featured.id)}" aria-label="More about ${escapeHTML(displayTitle(featured))}"><img src="${escapeHTML(featured.backdrop)}" alt="${escapeHTML(displayTitle(featured))}" fetchpriority="high" /></button><span class="spotlight__sticker" aria-hidden="true">CERTIFIED<br /><strong>object<br />energy.</strong></span><span class="spotlight__caption" aria-hidden="true">small objects. BIG personalities. ↗</span><span class="spotlight__spark" aria-hidden="true">✳</span></div>
    </section>`;
  }

  // Returns the empty-state markup tailored to the current list, history, or genre filter.
  function renderEmptyView() {
    const isList = state.currentView === 'my-list';
    const isHistory = state.currentView === 'history';
    const filtered = state.homeFilter !== 'All';
    return `
      <section class="empty-state">
        <span class="empty-state__icon">${icon(isList ? 'bookmark' : 'sparkles')}</span>
        <h2>${filtered ? 'A different vibe, perhaps?' : isHistory ? 'Your next adventure starts here.' : isList ? 'A little empty. A lot of possibilities.' : 'Good stories take a little time.'}</h2>
        <p>${filtered ? 'No shows match this genre here yet. Try another, or explore the whole gang.' : isHistory ? 'Watch an episode and it will appear here. Your history stays on this device.' : isList ? 'Tap the bookmark on a show to give it a home right here.' : 'This part of the clubhouse is still growing. There’s plenty to explore in the meantime.'}</p>
        <button class="button button--primary" type="button" ${filtered ? 'data-home-filter="All"' : 'data-view="shows"'}>${filtered ? 'Show every genre' : 'Find something to love'} ${icon('arrow-right')}</button>
      </section>
    `;
  }

  // Filters the catalog to the requested browse category, list, or history shows.
  function getHomeItemsForView(view) {
    if (view === 'history') {
      const ids = [...new Set((window.OBJECTFLIX_HISTORY?.entries() || []).map((entry) => entry.showId))];
      return ids.map((id) => library.find((item) => item.id === id)).filter(Boolean);
    }
    if (view === 'shows') return library.filter((item) => item.category === 'shows');
    if (view === 'movies') return library.filter((item) => item.category === 'movies');
    if (view === 'originals') return library.filter((item) => item.category === 'originals' || item.type === 'Original');
    if (view === 'my-list') return library.filter((item) => state.myList.has(item.id));
    return library;
  }

  // Builds a horizontal carousel section from a title, description, and item list.
  function renderRow(row) {
    return `
      <section class="section show-shelf" aria-label="${row.title}">
        <div class="section-heading">
          <div>
            <h2>${row.title}<span class="brand-dot">.</span></h2>
            <p>${row.description}</p>
          </div>
          <div class="carousel-controls" aria-label="${row.title} carousel controls">
            <button class="text-link" type="button" data-view="shows">View all ${icon('arrow-up-right')}</button>
            <button class="carousel-button" type="button" data-carousel-direction="left" aria-label="Scroll ${row.title} left">${icon('arrow-left')}</button>
            <button class="carousel-button" type="button" data-carousel-direction="right" aria-label="Scroll ${row.title} right">${icon('arrow-right')}</button>
          </div>
        </div>
        <div class="carousel-shell">
          <div class="carousel" tabindex="0" aria-label="${row.title}">
            ${row.items.map((item) => renderMediaCard(item, row.key === 'continue')).join('')}
          </div>
        </div>
      </section>
    `;
  }

  // Renders a catalog card with detail, save, upcoming, and optional viewing-progress controls.
  function renderMediaCard(item, showProgress = false) {
    const inList = state.myList.has(item.id);
    const upcoming = !releasedEpisodes(item).length;
    const id = escapeHTML(item.id);
    const title = escapeHTML(displayTitle(item));
    return `
      <article class="show-card ${upcoming ? 'show-card--upcoming' : ''}">
        <div class="show-card__art">
          <button class="show-card__cover" type="button" data-action="details" data-id="${id}" aria-label="Explore ${title}"><img src="${escapeHTML(item.poster)}" alt="${title}" loading="lazy" decoding="async" /><span class="show-card__peek">Meet the show ${icon('arrow-up-right')}</span></button>
          <span class="show-card__badge">${upcoming ? 'ON THE HORIZON' : escapeHTML(item.type.toUpperCase())}</span>
          <button class="save-button ${inList ? 'is-saved' : ''}" type="button" data-action="toggle-list" data-id="${id}" aria-label="${inList ? 'Remove from' : 'Add to'} my list: ${title}" aria-pressed="${inList}">${icon(inList ? 'check' : 'bookmark')}</button>
          ${showProgress ? `<div class="progress" role="progressbar" aria-label="Viewing progress for ${title}" aria-valuenow="${Math.round(item.progress * 100)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.round(item.progress * 100)}%"></span></div>` : ''}
        </div>
        <div class="show-card__info"><h3><button type="button" data-action="details" data-id="${id}">${title}</button></h3><div><span>${escapeHTML(episodeLabel(item))}</span><span class="show-card__rating">${escapeHTML(item.rating)}</span></div></div>
      </article>
    `;
  }

  
  
  

  // Rebuilds search filters and trending terms, then displays results or library status.
  function renderSearch() {
    elements.searchFilters.innerHTML = searchFilters
      .map((filter) => `<button class="filter-chip ${state.activeFilter === filter ? 'is-active' : ''}" data-filter="${filter}" type="button" aria-pressed="${state.activeFilter === filter}">${filter}</button>`)
      .join('');

    elements.trendingSearches.innerHTML = trendingSearches
      .map((term) => `<button class="chip" type="button" data-trending-term="${escapeHTML(term)}">${escapeHTML(term)} ${icon('arrow-up-right')}</button>`)
      .join('');

    if (state.libraryLoading || state.libraryError) {
      elements.searchSummary.textContent = state.libraryLoading ? 'Getting the good stuff ready…' : 'The library is a little out of reach.';
      elements.searchResults.innerHTML = state.libraryError ? '<button class="button button--primary" type="button" data-action="retry">Try again</button>' : '';
      return;
    }

    refreshSearchResults();
  }

  // Matches all query terms against catalog text, applies the active filter, and renders results.
  function refreshSearchResults() {
    const query = state.searchQuery;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results = library.filter((item) => {
      const text = `${item.title} ${displayTitle(item)} ${SHARED.acronymFor(item)} ${item.description} ${item.genres.join(' ')} object shows`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
    const filtered = applyFilter(results);
    elements.searchSummary.textContent = query
      ? `${filtered.length} result${filtered.length === 1 ? '' : 's'} for “${query}”`
      : `${filtered.length} little worlds to explore`;
    elements.searchResults.innerHTML = filtered.length
      ? filtered.map((item) => renderMediaCard(item)).join('')
      : renderNoResults(query);
  }

  // Filters titles by the selected catalog category or genre.
  function applyFilter(items) {
    return items.filter((item) => {
      if (state.activeFilter === 'All') return true;
      if (state.activeFilter === 'Movies') return item.category === 'movies';
      if (state.activeFilter === 'TV Shows') return item.category === 'shows';
      if (state.activeFilter === 'Originals') return item.category === 'originals' || item.type === 'Original';
      return (item.genres || []).includes(state.activeFilter);
    });
  }

  // Returns search empty-state markup that includes the query when one was supplied.
  function renderNoResults(query) {
    return `<div class="empty-state search-empty"><span class="empty-state__icon">${icon('search')}</span><h2>No little worlds found. Yet.</h2><p>${query ? `We couldn't find “${escapeHTML(query)}”. Try another name or a broader search.` : 'Nothing matches this filter just yet.'}</p><button class="button button--primary" type="button" data-action="clear-search">Explore everything ${icon('arrow-right')}</button></div>`;
  }

  
  
  

  // Opens a title's details dialog with its episodes, watch controls, and profile actions.
  function openDetails(id) {
    const item = library.find((entry) => entry.id === id);
    if (!item) return;
    if (elements.detailsModal.classList.contains('is-hidden')) {
      state.lastFocusedElement = document.activeElement;
    }
    state.selectedTitle = item;
    const inList = state.myList.has(id);
    const liked = state.likedTitles.has(id);
    elements.modalContent.innerHTML = `
      <div class="details-art"><img src="${escapeHTML(item.backdrop)}" alt="${escapeHTML(displayTitle(item))}" /><span class="details-art__label">A WHOLE LOT OF CHARACTER.</span></div>
      <div class="details-intro">
        <p class="eyebrow">${escapeHTML(item.type.toUpperCase())} · ${releasedEpisodes(item).length ? 'YOUR NEXT LITTLE ESCAPE' : 'ON THE HORIZON'}</p>
        <h2 id="modalTitle">${escapeHTML(displayTitle(item))}</h2>
        <div class="modal-meta">${item.year !== '—' ? `<span>${escapeHTML(item.year)}</span>` : ''}<span>${escapeHTML(item.rating)}</span><span>${escapeHTML(episodeLabel(item))}</span></div>
        <p class="modal-description">${escapeHTML(item.description)}</p>
        <div class="button-row">
          ${releasedEpisodes(item).length ? `<button class="button button--primary" type="button" data-action="play" data-id="${escapeHTML(id)}">${icon('play')} Let's watch</button>` : ''}
          <button class="button button--secondary ${inList ? 'is-saved' : ''}" type="button" data-action="toggle-list" data-id="${escapeHTML(id)}" aria-pressed="${inList}" aria-label="${inList ? 'Remove from' : 'Add to'} my list: ${escapeHTML(item.title)}">${icon(inList ? 'check' : 'bookmark')} ${inList ? 'In my list' : 'Save for later'}</button>
          <button class="save-button ${liked ? 'is-liked' : ''}" type="button" data-action="like" data-id="${escapeHTML(id)}" aria-label="${liked ? 'Unlike' : 'Like'} ${escapeHTML(item.title)}" aria-pressed="${liked}">${icon('heart')}</button>
        </div>
        <div class="pill-row">${item.genres.map((genre) => `<span class="pill">${escapeHTML(genre)}</span>`).join('')}</div>
      </div>
      <div class="details-episodes">
          <div class="section-heading"><h3>One more episode?</h3><p>${escapeHTML(episodeLabel(item))}</p></div>
          <div class="episode-list">
            ${item.episodes.map((episode) => `
              <article class="episode-card ${episode.secret ? 'episode-card--secret' : ''} ${episode.released === false ? 'episode-card--upcoming' : ''}">
                <div class="episode-card__content">
                  <div class="episode-card__title">${escapeHTML(episode.episodeNumber)}. ${escapeHTML(episode.title)}${episode.secret ? ' <span class="secret-badge">SECRET</span>' : ''}${episode.released === false ? ' <span class="upcoming-badge">UPCOMING</span>' : ''}</div>
                  <div class="card-meta"><span>${escapeHTML(SHARED.formatEpisodeMeta(episode))}</span>${episode.released === false ? '<span>Coming soon</span>' : (episode.videoUrl ? '<span>Ready to watch</span>' : '')}</div>
                  <p>${escapeHTML(episode.description || (episode.released === false ? `A new adventure is on its way. Expected release: ${episode.releaseDate}` : (episode.secret ? 'A little secret, recovered from the Objectflix archive.' : 'Jump in and see where the story goes.')))}</p>
                  <div class="button-row">
                    <button class="button ${episode.released === false ? 'button--secondary' : 'button--primary'}" type="button" data-action="play-episode" data-id="${escapeHTML(id)}" data-episode="${escapeHTML(episode.id)}" aria-label="${episode.released === false ? 'Release information for' : 'Play'} ${escapeHTML(episode.title)}">${icon(episode.released === false ? 'info' : 'play')} ${episode.released === false ? 'Release info' : 'Play'}</button>
                  </div>
                </div>
              </article>
            `).join('')}
          </div>
      </div>
    `;
    elements.detailsModal.classList.remove('is-hidden');
    elements.closeModalButton.focus();
  }

  // Closes the details dialog, clears selection, and returns focus to its prior target.
  function closeDetails() {
    const wasOpen = !elements.detailsModal.classList.contains('is-hidden');
    elements.detailsModal.classList.add('is-hidden');
    state.selectedTitle = null;
    if (wasOpen && state.lastFocusedElement instanceof HTMLElement && state.lastFocusedElement.isConnected) {
      state.lastFocusedElement.focus();
    } else if (wasOpen) {
      document.getElementById('browseViewTitle')?.focus({ preventScroll: true });
    }
    state.lastFocusedElement = null;
  }


  // Opens the resume or first released episode for a title, falling back to its details.
  function playTitle(id) {
    const item = library.find((entry) => entry.id === id);
    if (!item) return;
    const episode = releasedEpisodes(item).find((entry) => entry.id === item.resumeEpisodeId) || releasedEpisodes(item)[0];
    if (!episode) { openDetails(id); return; }
    window.location.href = `watch.html?id=${encodeURIComponent(item.id)}&ep=${encodeURIComponent(episode ? episode.id : '')}`;
  }

  // Plays a released episode by catalog IDs, or shows release information if it is upcoming.
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


  // Toggles a title in the active profile's saved list and updates visible controls.
  function toggleMyList(id) {
    const item = library.find((entry) => entry.id === id);
    if (!item) return;
    if (state.myList.has(id)) {
      state.myList.delete(id);
    } else {
      state.myList.add(id);
    }
    saveList();
    updateListCount();
    const saved = state.myList.has(id);
    document.querySelectorAll('[data-action="toggle-list"]').forEach((button) => {
      if (button.dataset.id !== id) return;
      button.classList.toggle('is-saved', saved);
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', `${saved ? 'Remove from' : 'Add to'} my list: ${displayTitle(item)}`);
      button.innerHTML = icon(saved ? 'check' : 'bookmark') + (button.classList.contains('button') ? saved ? ' In my list' : ' Save for later' : '');
    });
    if (state.currentView === 'my-list') {
      const focusInGrid = elements.homeView.contains(document.activeElement);
      renderHome();
      if (focusInGrid) document.getElementById('browseViewTitle')?.focus({ preventScroll: true });
    }
    showToast(saved ? `${displayTitle(item)} has a home in your list.` : `${displayTitle(item)} removed from your list.`);
  }

  // Refreshes every visible saved-list count from the active profile's set.
  function updateListCount() {
    document.querySelectorAll('[data-list-count]').forEach((count) => { count.textContent = state.myList.size; });
  }

  // Displays a temporary browse toast, replacing any existing hide timer.
  function showToast(message) {
    const toast = document.getElementById('browseToast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  // Opens a random released title's details, or reports when the catalog has no items yet.
  function surpriseMe() {
    const available = library.filter((item) => releasedEpisodes(item).length);
    const picks = available.length ? available : library;
    if (!picks.length) { showToast('The good stuff is still loading. Try again in a moment.'); return; }
    openDetails(picks[Math.floor(Math.random() * picks.length)].id);
  }

  // Toggles the active profile's like for a title and updates matching controls.
  function toggleLike(id) {
    if (state.likedTitles.has(id)) {
      state.likedTitles.delete(id);
    } else {
      state.likedTitles.add(id);
    }
    saveLikes();
    const liked = state.likedTitles.has(id);
    document.querySelectorAll('[data-action="like"]').forEach((button) => {
      if (button.dataset.id !== id) return;
      button.classList.toggle('is-liked', liked);
      button.setAttribute('aria-pressed', String(liked));
      button.setAttribute('aria-label', `${liked ? 'Unlike' : 'Like'} ${state.selectedTitle?.title || 'show'}`);
    });
    showToast(liked ? 'A little love for a great show.' : 'Like removed.');
  }

  // Scrolls the button's carousel by most of its visible width in the chosen direction.
  function scrollCarousel(button) {
    const section = button.closest('.section');
    const carousel = section?.querySelector('.carousel');
    if (!carousel) return;
    const direction = button.dataset.carouselDirection === 'left' ? -1 : 1;
    carousel.scrollBy({ left: carousel.clientWidth * 0.82 * direction, behavior: 'smooth' });
  }


  // Counts logo clicks within the configured time window and unlocks the ARG when reached.
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

  // Unlocks and loads secret episodes, then refreshes the catalog views with the result.
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
      library = SHARED.applyArgArchiveFilter(library);
      window.OBJECTFLIX_LIBRARY = library;
      renderHome();
      renderSearch();
    }).catch((error) => {
      console.error('ARG unlock failed:', error);
      showArgToast('Signal lost — try the ritual again.');
    });
  }

  // Displays or reuses the temporary toast used for ARG unlock status.
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


  // Switches browse views, updates the URL and navigation state, and renders the chosen panel.
  function changeView(view, updateHistory = true) {
    if (!Object.hasOwn(viewMap, view)) view = 'home';
    if (state.currentView !== view) state.homeFilter = 'All';
    state.currentView = view;

    if (updateHistory) {
      const url = new URL(window.location.href);
      url.hash = view === 'home' ? '' : view;
      if (url.href !== window.location.href) window.history.pushState(null, '', url);
    }

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
      renderSearch();
      elements.searchInput.focus({ preventScroll: true });
    }

    if (['home', 'shows', 'movies', 'originals', 'my-list', 'history'].includes(view)) {
      renderHome();
    }

    elements.mobileMenu.classList.add('is-hidden');
    elements.menuToggle.setAttribute('aria-expanded', 'false');
    if (updateHistory) window.scrollTo({ top: 0, behavior: 'instant' });
  }


  // Delegates browse actions and wires search, navigation, modal, keyboard, and menu behavior.
  function bindEvents() {
    document.addEventListener('submit', (event) => {
      const form = event.target.closest?.('[data-discovery-form]');
      if (!form) return;
      event.preventDefault();
      runDiscovery(new FormData(form).get('query'));
    });

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const prompt = target.closest('[data-discovery-prompt]');
      if (prompt) {
        runDiscovery(prompt.dataset.discoveryPrompt);
        return;
      }
      if (target.closest('[data-discovery-clear]')) {
        state.discovery = { query: '', loading: false, results: [], error: '' };
        renderHome();
        document.getElementById('discoveryInput')?.focus({ preventScroll: true });
        return;
      }
      const navButton = target.closest('[data-view]');
      if (navButton) {
        event.preventDefault();
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
        if (action === 'surprise') surpriseMe();
        if (action === 'clear-history') {
          window.OBJECTFLIX_HISTORY?.clear();
          library.forEach((item) => { item.progress = 0; delete item.resumeEpisodeId; });
          renderHome();
          document.getElementById('browseViewTitle')?.focus({ preventScroll: true });
          showToast('Your viewing history on this device has been cleared.');
        }
        if (action === 'clear-search') {
          state.searchQuery = '';
          state.activeFilter = 'All';
          elements.searchInput.value = '';
          renderSearch();
          elements.searchInput.focus();
        }
        if (action === 'retry') {
          showSkeletons();
          void bootLibrary();
          renderSearch();
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
        elements.searchFilters.querySelector(`[data-filter="${CSS.escape(state.activeFilter)}"]`)?.focus({ preventScroll: true });
        return;
      }

      const homeFilter = target.closest('[data-home-filter]');
      if (homeFilter) {
        state.homeFilter = homeFilter.dataset.homeFilter;
        renderHome();
        elements.homeView.querySelector(`[data-home-filter="${CSS.escape(state.homeFilter)}"]`)?.focus({ preventScroll: true });
        return;
      }

      const featured = target.closest('[data-featured]');
      if (featured) {
        state.heroIndex = Number(featured.dataset.featured);
        elements.homeView.querySelector('.spotlight').outerHTML = renderSpotlight();
        elements.homeView.querySelector(`[data-featured="${state.heroIndex}"]`)?.focus({ preventScroll: true });
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

    elements.menuToggle.addEventListener('click', () => {
      const isOpen = !elements.mobileMenu.classList.contains('is-hidden');
      elements.mobileMenu.classList.toggle('is-hidden', isOpen);
      elements.menuToggle.setAttribute('aria-expanded', String(!isOpen));
    });

    document.addEventListener('keydown', (event) => {
      const detailsOpen = !elements.detailsModal.classList.contains('is-hidden');
      if (event.key === 'Escape') {
        closeDetails();
        if (!elements.mobileMenu.classList.contains('is-hidden')) {
          elements.mobileMenu.classList.add('is-hidden');
          elements.menuToggle.setAttribute('aria-expanded', 'false');
          elements.menuToggle.focus();
        }
      }
      if (event.key === 'Tab' && detailsOpen) {
        const buttons = [...elements.detailsModal.querySelectorAll('button, a[href], input, select, [tabindex="0"]')].filter((element) => !element.disabled && element.getClientRects().length);
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input, textarea, select, [contenteditable="true"]') && !document.querySelector('.modal:not(.is-hidden), .assistant-panel:not(.is-hidden)')) {
        event.preventDefault();
        changeView('search');
      }
    });

    document.addEventListener('click', (event) => {
      if (!elements.mobileMenu.classList.contains('is-hidden') && !event.target.closest('#mobileMenu, #menuToggle')) {
        elements.mobileMenu.classList.add('is-hidden');
        elements.menuToggle.setAttribute('aria-expanded', 'false');
      }
    });

    window.addEventListener('popstate', () => changeView(window.location.hash.slice(1) || 'home', false));
  }


  // Restores guest/account and profile state, then wires the page and begins loading the catalog.
  function init() {
    const user = currentUser();
    const isGuest = !user || user.provider === 'guest' || localStorage.getItem('objectflix_guest') === 'true';
    if (!user && !isGuest) {
      window.location.replace('index.html');
      return;
    }
    if (isGuest && !user) {
      localStorage.setItem('objectflix_current_user', JSON.stringify({ provider: 'guest', id: 'guest', displayName: 'Guest', username: 'guest', email: '' }));
      localStorage.setItem('objectflix_guest', 'true');
    }

    const adminSession = window.OBJECTFLIX_ADMIN?.session?.();
    const adminLink = document.getElementById('adminLink');
    if (adminLink && adminSession) {
      adminLink.classList.remove('is-hidden');
    }

    const { profile } = restoreActiveProfile();
    if (!profile) return;
    state.currentProfile = profile;

    SHARED.restoreArgUnlock();
    applyCurrentProfile();

    bindEvents();
    state.libraryLoading = true;
    changeView(window.location.hash.slice(1) || 'home', false);
    void bootLibrary();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
