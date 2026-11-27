// Objectflix: this is the theme part, kept here so the rest of the app knows exactly where to look.
(() => {
  // Five tiny moods, now touring every Objectflix room instead of hiding backstage.
  const THEMES = ['light', 'dark', 'crimson', 'purple', 'ocean'];
  const COLORS = { light: '#f5f2e9', dark: '#101114', crimson: '#190b10', purple: '#140f20', ocean: '#0b151b' };

  function storageKey() {
    try {
      const profile = JSON.parse(sessionStorage.getItem('objectflix_active_profile') || 'null');
      return `objectflix_theme_${profile?.id || 'guest'}`;
    } catch { return 'objectflix_theme_guest'; }
  }

  function savedTheme() {
    try {
      const profile = JSON.parse(sessionStorage.getItem('objectflix_active_profile') || 'null');
      const id = profile?.id || 'guest';
      return localStorage.getItem(storageKey()) || localStorage.getItem(`objectflix_watch_theme_${id}`) || 'light';
    } catch { return 'light'; }
  }

  function apply(theme, persist = false) {
    const value = THEMES.includes(theme) ? theme : 'light';
    document.documentElement.dataset.theme = value;
    document.documentElement.dataset.watchTheme = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[value]);
    document.querySelectorAll('#watchThemeSelect, #globalThemeSelect').forEach((picker) => { picker.value = value; });
    if (persist) {
      try { localStorage.setItem(storageKey(), value); } catch {}
    }
  }

  function pickerMarkup(id, label) {
    return `<label class="${id === 'globalThemeSelect' ? 'global-theme-picker' : 'watch-theme-picker'}"><span aria-hidden="true">◐</span><span class="sr-only">${label}</span><select id="${id}" aria-label="Choose a theme"><option value="light">Light</option><option value="dark">Dark</option><option value="crimson">Crimson</option><option value="purple">Purple</option><option value="ocean">Ocean</option></select></label>`;
  }

  apply(savedTheme());
  const existing = document.getElementById('watchThemeSelect');
  if (existing) existing.addEventListener('change', (event) => apply(event.target.value, true));
  else if (document.body?.classList.contains('objectflix-v2')) {
    document.body.insertAdjacentHTML('afterbegin', pickerMarkup('globalThemeSelect', 'Choose site theme'));
    document.getElementById('globalThemeSelect').addEventListener('change', (event) => apply(event.target.value, true));
  }

  window.OBJECTFLIX_THEME = { apply, themes: THEMES };
})();
