(() => {
  
  if (window.self !== window.top) {
    document.documentElement.classList.add('in-page-modal');
    return;
  }

  const PAGES = {
    membership: { src: './membership.html', title: 'Membership' },
    'movie-nights': { src: './movie-nights.html', title: 'Movie Nights' },
  };

  let overlay = null;
  let lastFocused = null;

  // Creates the reusable iframe overlay once and wires its close controls.
  function buildOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'modal is-hidden page-modal';
    overlay.id = 'pageModal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Page');
    overlay.innerHTML = `
      <div class="modal__backdrop" data-page-modal-close="true"></div>
      <div class="modal__panel page-modal__panel" role="document">
        <button class="modal__close" type="button" aria-label="Close" data-page-modal-close="true">×</button>
        <div class="page-modal__head">
          <p class="eyebrow" id="pageModalEyebrow">OBJECTFLIX CLUBHOUSE</p>
          <h2 id="pageModalTitle">Membership</h2>
        </div>
        <div class="page-modal__frame-wrap">
          <iframe class="page-modal__frame" id="pageModalFrame" title="Page content"></iframe>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-page-modal-close]').forEach((el) => {
      el.addEventListener('click', closeModal);
    });
    return overlay;
  }

  // Opens a supported page in the overlay and moves keyboard focus into it.
  function openModal(name) {
    const page = PAGES[name];
    if (!page) return;
    const el = buildOverlay();
    lastFocused = document.activeElement;
    document.getElementById('pageModalTitle').textContent = page.title;
    const frame = document.getElementById('pageModalFrame');
    frame.src = page.src;
    frame.title = page.title;
    el.classList.remove('is-hidden');
    document.body.classList.add('page-modal-open');
    el.querySelector('.modal__close')?.focus();
  }

  // Hides the overlay, unloads its iframe, and restores the previous focus target.
  function closeModal() {
    if (!overlay || overlay.classList.contains('is-hidden')) return;
    overlay.classList.add('is-hidden');
    document.body.classList.remove('page-modal-open');
    const frame = document.getElementById('pageModalFrame');
    if (frame) frame.src = 'about:blank';
    if (lastFocused instanceof HTMLElement && lastFocused.isConnected) lastFocused.focus();
    lastFocused = null;
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const trigger = target.closest('[data-modal-page]');
    if (trigger) {
      event.preventDefault();
      openModal(trigger.getAttribute('data-modal-page'));
      return;
    }
    if (target.closest('[data-page-modal-close]')) {
      event.preventDefault();
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });

  
  try {
    const name = new URLSearchParams(window.location.search).get('modal');
    if (name && PAGES[name]) {
      // Defers the requested modal until its page elements can receive focus.
      const open = () => openModal(name);
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open);
      else open();
    }
  } catch {}
})();
