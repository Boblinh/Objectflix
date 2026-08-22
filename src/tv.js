


(() => {
  const SHARED = window.OBJECTFLIX_SHARED;
  const API = window.OBJECTFLIX_API;

  
  const TV_SIGNALS = [
    'SmartTV', 'Smart TV', 'Tizen', 'Web0S', 'webOS',
    'SamsungBrowser', 'SonyPlayStation', 'PlayStation',
    'Xbox', 'Nintendo',
    'Roku', 'Dalvik', 'AmazonWebServices',
    'AppleTV', 'Apple TV',
    'Chromecast', 'GoogleTV', 'Google TV',
    'Android TV', 'MiTV', 'Mi Box',
    'FireTV', 'Fire TV',
    'Vizio', 'Hisense', 'TCL',
    'MIBrowser', 'Mango Browser',
    'NTT', 'Philips', 'Coocaa',
  ];

  function isTVDevice() {
    
    if (new URLSearchParams(window.location.search).get('tv') === '1') return true;
    const ua = navigator.userAgent || '';
    return TV_SIGNALS.some((sig) => ua.includes(sig));
  }

  
  function runRedirectCountdown() {
    const warning = document.getElementById('tvWarning');
    const countdownEl = document.getElementById('tvCountdown');
    const stayBtn = document.getElementById('tvStayBtn');
    const leaveBtn = document.getElementById('tvLeaveBtn');

    
    if (!warning) {
      document.getElementById('tvApp').classList.add('is-active');
      initTV();
      return;
    }

    warning.style.display = '';
    let remaining = 10;
    countdownEl.textContent = remaining;

    const interval = setInterval(() => {
      remaining--;
      countdownEl.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(interval);
        window.location.href = 'browse.html';
      }
    }, 1000);

    stayBtn.addEventListener('click', () => {
      clearInterval(interval);
      warning.classList.add('is-hidden');
      document.getElementById('tvApp').classList.add('is-active');
      initTV();
    });

    leaveBtn.addEventListener('click', () => {
      clearInterval(interval);
      window.location.href = 'browse.html';
    });
  }

  
  function startClock() {
    const el = document.getElementById('tvClock');
    if (!el) return;
    const tick = () => {
      const now = new Date();
      el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    tick();
    setInterval(tick, 30000);
  }

  
  let library = [];

  async function loadCatalog() {
    library = await SHARED.loadLibrary();
    return library;
  }

  
  function renderHero() {
    const hero = document.getElementById('tvHero');
    if (!library.length) return;

    const featured = library[Math.floor(Math.random() * library.length)];
    const firstEp = featured.episodes[0];

    hero.innerHTML = `
      <div class="tv-hero__bg" style="background-image:url('${featured.backdrop}')"></div>
      <div class="tv-hero__gradient"></div>
      <div class="tv-hero__content">
        <div class="tv-hero__eyebrow">Featured</div>
        <h1 class="tv-hero__title">${esc(featured.title)}</h1>
        <p class="tv-hero__desc">${esc(featured.description)}</p>
        <div class="tv-hero__actions">
          <button class="tv-btn tv-btn--primary tv-focusable" data-tv-action="play" data-tv-show="${featured.id}" type="button">
            ▶ Play
          </button>
          <button class="tv-btn tv-btn--ghost tv-focusable" data-tv-action="details" data-tv-show="${featured.id}" type="button">
            More Info
          </button>
        </div>
      </div>
    `;
  }

  
  function renderRows() {
    const container = document.getElementById('tvRows');
    if (!library.length) return;

    const rows = [
      { title: 'All Shows', items: library },
      { title: 'Recently Added', items: [...library].reverse().slice(0, 6) },
      { title: 'Most Episodes', items: [...library].sort((a, b) => b.episodes.length - a.episodes.length).slice(0, 6) },
    ];

    container.innerHTML = rows.map((row) => `
      <div class="tv-row">
        <h2 class="tv-row__title">${esc(row.title)}</h2>
        <div class="tv-row__scroll">
          ${row.items.map((item) => {
            const epCount = item.episodes.length;
            const acronym = SHARED.acronymFor(item);
            return `
              <div class="tv-card tv-focusable" tabindex="0" role="button"
                   data-tv-action="details" data-tv-show="${item.id}"
                   aria-label="${esc(item.title)} — ${epCount} episodes">
                <img class="tv-card__img" src="${item.poster}" alt="" loading="lazy" />
                <div class="tv-card__overlay">
                  <div class="tv-card__label">${esc(item.title)}</div>
                  <div class="tv-card__meta">${epCount} episodes</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');
  }

  function openDetails(showId) {
    const item = library.find((s) => s.id === showId);
    if (!item) return;

    const modal = document.getElementById('tvModal');
    const card = document.getElementById('tvModalCard');

    card.innerHTML = `
      <img class="tv-modal__hero" src="${item.backdrop}" alt="" />
      <div class="tv-modal__body">
        <h2 class="tv-modal__title">${esc(item.title)}</h2>
        <p class="tv-modal__desc">${esc(item.description)}</p>
        <div class="tv-modal__episodes">
          ${item.episodes.map((ep, i) => `
            <div class="tv-ep tv-focusable" tabindex="0" role="button"
                 data-tv-action="play-ep" data-tv-show="${item.id}" data-tv-ep="${ep.id}"
                 aria-label="Episode ${ep.episodeNumber}: ${esc(ep.title)}">
              <span class="tv-ep__num">${ep.episodeNumber}</span>
              <span class="tv-ep__title">${esc(ep.title)}</span>
              ${ep.duration ? `<span class="tv-ep__dur">${esc(ep.duration)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    modal.classList.remove('is-hidden');

    
    requestAnimationFrame(() => {
      const first = card.querySelector('.tv-ep');
      if (first) first.focus();
    });
  }

  function closeModal() {
    document.getElementById('tvModal').classList.add('is-hidden');
  }

  
  function playEpisode(showId, episodeId) {
    window.location.href = `tv-watch.html?id=${showId}&ep=${episodeId}`;
  }

  function playShow(showId) {
    const item = library.find((s) => s.id === showId);
    if (!item || !item.episodes.length) return;
    playEpisode(showId, item.episodes[0].id);
  }

  
  function handleKeydown(e) {
    const key = e.key;

    
    if (key === 'Escape') {
      const modal = document.getElementById('tvModal');
      if (!modal.classList.contains('is-hidden')) {
        e.preventDefault();
        closeModal();
        return;
      }
    }

    
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      const focused = document.activeElement;
      if (!focused || !focused.classList.contains('tv-focusable')) return;

      e.preventDefault();

      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        
        const row = focused.closest('.tv-row__scroll, .tv-modal__episodes, .tv-hero__actions');
        if (!row) return;
        const items = [...row.querySelectorAll('.tv-focusable')];
        const idx = items.indexOf(focused);
        if (idx === -1) return;

        const next = key === 'ArrowRight'
          ? items[idx + 1]
          : items[idx - 1];

        if (next) {
          next.focus();
          next.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      } else {
        
        const allRows = [...document.querySelectorAll('.tv-row__scroll, .tv-hero__actions')];
        
        const modal = document.getElementById('tvModal');
        if (!modal.classList.contains('is-hidden')) {
          allRows.unshift(modal.querySelector('.tv-modal__episodes'));
        }

        const currentRow = focused.closest('.tv-row__scroll, .tv-hero__actions, .tv-modal__episodes');
        const rowIdx = allRows.indexOf(currentRow);
        if (rowIdx === -1) return;

        const itemsInRow = [...currentRow.querySelectorAll('.tv-focusable')];
        const colIdx = itemsInRow.indexOf(focused);

        const targetRow = key === 'ArrowDown'
          ? allRows[rowIdx + 1]
          : allRows[rowIdx - 1];

        if (targetRow) {
          const targetItems = [...targetRow.querySelectorAll('.tv-focusable')];
          const target = targetItems[Math.min(colIdx, targetItems.length - 1)];
          if (target) {
            target.focus();
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
    }

    
    if (key === 'Enter' || key === ' ') {
      const focused = document.activeElement;
      if (!focused || !focused.classList.contains('tv-focusable')) return;
      e.preventDefault();
      handleAction(focused);
    }
  }

  
  function handleAction(el) {
    const action = el.dataset.tvAction;
    const showId = el.dataset.tvShow;
    const epId = el.dataset.tvEp;

    switch (action) {
      case 'play':
        playShow(showId);
        break;
      case 'details':
        openDetails(showId);
        break;
      case 'play-ep':
        playEpisode(showId, epId);
        break;
    }
  }

  
  function bindEvents() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('.tv-focusable');
      if (el) handleAction(el);
    });

    document.addEventListener('keydown', handleKeydown);

    
    document.getElementById('tvModal').addEventListener('click', (e) => {
      if (e.target.id === 'tvModal') closeModal();
    });
  }

  
  function esc(str) {
    return (str || '').replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)
    );
  }

  
  async function initTV() {
    startClock();

    try {
      await loadCatalog();
      renderHero();
      renderRows();

      
      const loadingScreen = document.getElementById('tvLoadingScreen');
      if (loadingScreen) loadingScreen.remove();

      
      requestAnimationFrame(() => {
        const firstBtn = document.querySelector('.tv-hero .tv-focusable');
        if (firstBtn) firstBtn.focus();
      });
    } catch (err) {
      console.error('[TV] Failed to load catalog:', err);
      const loadingScreen = document.getElementById('tvLoadingScreen');
      if (loadingScreen) loadingScreen.remove();
      document.getElementById('tvRows').innerHTML = `
        <div style="text-align:center;padding:80px 20px;color:var(--muted)">
          <p style="font-size:1.3rem;margin-bottom:8px">Couldn't load the library</p>
          <p>${esc(err.message)}</p>
        </div>
      `;
    }
  }

  
  bindEvents();

  if (isTVDevice()) {
    document.getElementById('tvApp').classList.add('is-active');
    initTV();
  } else {
    runRedirectCountdown();
  }
})();
