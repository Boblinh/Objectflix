(() => {
  const SEVERITY = {
    standard: { icon: '\u26a0', label: 'Content Warning' },
    mature: { icon: '\u26a0', label: 'Mature Content' },
    'very-strong': { icon: '\ud83d\udea8', label: 'Very Strong Content Warning' },
    adult: { icon: '\ud83d\udea8', label: 'Adult Content' },
  };

  const CHARACTER = {
    firey: { name: 'Firey', icon: '\ud83d\udd25' },
    leafy: { name: 'Leafy', icon: '\ud83c\udf43' },
  };

  const DIALOGUE = {
    standard: {
      firey: "It's not really the kind of scary where monsters jump out at you. It builds slowly and sticks around.",
      leafy: "It's heavy on mood and light on jump scares, but take it easy if you're sensitive.",
    },
    mature: {
      firey: 'Just so you know, this one doesn\u2019t let up.',
      leafy: 'This mystery gets pretty dark.',
    },
    'very-strong': {
      firey: '...yeah no.',
      leafy: 'I\u2019d skip this one unless you\u2019re really sure.',
    },
    adult: {
      firey: 'You were warned.',
      leafy: 'Please be careful with this one \u2014 it\u2019s not for everyone.',
    },
  };

  const RECORDS = [
    {
      id: '20000000-0000-4000-8000-000000000101',
      keywords: ['one', 'hfjone', 'hfj one'],
      age: 12,
      character: 'firey',
      contentWarnings: [
        'Psychological horror',
        'Death themes',
        'Frightening or disturbing scenes',
      ],
    },
    {
      id: '20000000-0000-4000-8000-000000000102',
      keywords: ['the nightly manor', 'nightly manor'],
      age: 14,
      character: 'leafy',
      contentWarnings: [
        'Murder / violent deaths',
        'Horror',
        'Psychological distress',
        'Disturbing situations',
      ],
    },
    {
      id: '20000000-0000-4000-8000-000000000103',
      keywords: ['object terror'],
      age: 17,
      character: 'firey',
      contentWarnings: [
        'Graphic violence',
        'Gore',
        'Disturbing imagery',
        'Strong language',
        'Sexual material',
      ],
    },
    {
      id: '20000000-0000-4000-8000-000000000104',
      keywords: ['tripwire'],
      age: 14,
      character: 'leafy',
      contentWarnings: [
        'Psychological horror',
        'Distressing eliminations',
        'Existential dread',
        'Captivity in a simulation',
      ],
      dialogue: 'No monsters jumping out \u2014 just a game that quietly stops feeling like a game.',
    },
  ];

  const CONFIRM_KEY = 'objectflix.cw.confirmed';

  function tokens(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function levelFor(age) {
    if (age >= 18) return 'adult';
    if (age >= 17) return 'very-strong';
    if (age >= 14) return 'mature';
    if (age >= 12) return 'standard';
    return null;
  }

  function recordFor(item) {
    if (!item) return null;
    const byId = RECORDS.find((record) => item.id && record.id === item.id);
    if (byId) return byId;
    const titleTokens = tokens(item.title);
    for (const record of RECORDS) {
      for (const keyword of record.keywords || []) {
        const keywordTokens = tokens(keyword);
        if (keywordTokens.length && keywordTokens.every((token) => titleTokens.includes(token))) {
          return record;
        }
      }
    }
    return null;
  }

  function requiredFor(item) {
    const record = recordFor(item);
    if (!record) return null;
    const level = levelFor(record.age);
    return level ? { ...record, level } : null;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function confirmedIds() {
    try {
      return new Set(JSON.parse(localStorage.getItem(CONFIRM_KEY)) || []);
    } catch {
      return new Set();
    }
  }

  function isConfirmed(id) {
    return confirmedIds().has(id);
  }

  function confirm(id) {
    try {
      const ids = confirmedIds();
      ids.add(id);
      localStorage.setItem(CONFIRM_KEY, JSON.stringify([...ids]));
    } catch {
    }
  }

  let modalRoot = null;
  let lastFocused = null;
  let pending = null;
  let keydownHandler = null;

  function buildModal() {
    const modal = document.createElement('div');
    modal.className = 'modal cw-modal is-hidden';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modal__backdrop cw-modal__backdrop" data-cw-action="cancel"></div>
      <div class="modal__panel cw-modal__panel" role="document" tabindex="-1">
        <div class="cw-modal__accent"></div>
        <div class="cw-modal__rating" id="cwAge" role="img" aria-label="Age rating">17<span class="cw-modal__plus">+</span></div>
        <p class="cw-modal__eyebrow"><span class="cw-modal__icon" id="cwIcon" aria-hidden="true">\u26a0</span><span class="cw-modal__headline" id="cwHeading"></span></p>
        <h2 class="cw-modal__title" id="cwTitle">Title</h2>
        <p class="cw-modal__rated" id="cwRated"></p>
        <div class="cw-modal__divider"></div>
        <div class="cw-modal__body" id="cwBody"></div>
        <div class="cw-modal__remember">
          <label class="cw-modal__remember-label">
            <input class="cw-modal__check" id="cwRemember" type="checkbox" checked />
            <span>Don\u2019t show this warning again for this show</span>
          </label>
        </div>
        <div class="cw-modal__actions">
          <button class="cw-modal__continue" type="button" data-cw-action="continue">Continue</button>
          <button class="cw-modal__cancel" type="button" data-cw-action="cancel">Go Back</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-cw-action]').forEach((el) => {
      el.addEventListener('click', (event) => {
        settle(event.currentTarget.dataset.cwAction === 'continue');
      });
    });

    keydownHandler = (event) => {
      if (modal.classList.contains('is-hidden') || !pending) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        settle(false);
        return;
      }
      if (event.key === 'Tab') {
        const focusables = Array.from(modal.querySelectorAll('.cw-modal__continue, .cw-modal__cancel'));
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', keydownHandler);

    return modal;
  }

  function render(modal, item, record) {
    const level = record.level || levelFor(record.age) || 'standard';
    const sev = SEVERITY[level] || SEVERITY.standard;
    const character = CHARACTER[record.character] || CHARACTER.firey;
    const dialogue = record.dialogue || (DIALOGUE[level] && DIALOGUE[level][record.character]) || DIALOGUE[level].firey;
    const warnings = Array.isArray(record.contentWarnings) ? record.contentWarnings : [];
    const title = item?.title || 'This show';
    const chips = warnings.length
      ? `<p class="cw-modal__intro">This show contains</p><div class="cw-modal__chips">${warnings
          .map((w) => `<span class="cw-modal__chip">${escapeHtml(w)}</span>`)
          .join('')}</div>`
      : '';
    const adultLine = level === 'adult'
      ? '<p class="cw-modal__adultline">It contains mature material that may not be suitable for all ages.</p>'
      : '';

    modal.className = `modal cw-modal cw-modal--${level} is-hidden`;
    modal.querySelector('.cw-modal__rating').innerHTML = `${record.age}<span class="cw-modal__plus">+</span>`;
    modal.querySelector('.cw-modal__icon').textContent = sev.icon;
    modal.querySelector('.cw-modal__headline').textContent = sev.label;
    modal.querySelector('.cw-modal__title').textContent = title;
    modal.querySelector('.cw-modal__rated').innerHTML = `You\u2019re about to watch <strong>${escapeHtml(title)}</strong>, rated <strong>${record.age}+</strong>.`;
    modal.querySelector('.cw-modal__body').innerHTML = [
      adultLine,
      chips,
      `<blockquote class="cw-modal__quote">
        <span class="cw-modal__avatar" aria-hidden="true">${character.icon}</span>
        <div class="cw-modal__quote-body">
          <span class="cw-modal__char-name">${character.name}</span>
          <p class="cw-modal__quote-text">\u201c${escapeHtml(dialogue)}\u201d</p>
        </div>
      </blockquote>`,
    ].join('');
  }

  function open(item, record, opts) {
    if (!record) return;
    if (!modalRoot) modalRoot = buildModal();
    render(modalRoot, item, record);
    lastFocused = document.activeElement;
    pending = { ...opts, itemId: item?.id };
    modalRoot.classList.remove('is-hidden');
    const continueBtn = modalRoot.querySelector('.cw-modal__continue');
    if (continueBtn) {
      continueBtn.focus();
    }
  }

  function settle(confirmed) {
    if (!modalRoot) return;
    modalRoot.classList.add('is-hidden');
    const current = pending;
    pending = null;
    if (lastFocused && lastFocused.isConnected) {
      lastFocused.focus();
    }
    lastFocused = null;
    if (!current) return;
    if (confirmed) {
      const remember = modalRoot?.querySelector('#cwRemember');
      if (current.itemId && (!remember || remember.checked)) confirm(current.itemId);
      if (typeof current.onContinue === 'function') current.onContinue();
    } else if (typeof current.onCancel === 'function') {
      current.onCancel();
    }
  }

  function guard(item, opts) {
    const record = requiredFor(item);
    if (!record) return false;
    if (isConfirmed(item?.id)) return false;
    open(item, record, opts);
    return true;
  }

  window.OBJECTFLIX_WARNING = {
    recordFor,
    requiredFor,
    guard,
    open,
    isConfirmed,
    confirm,
  };
})();