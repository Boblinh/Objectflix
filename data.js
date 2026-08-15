(() => {
  
  

  const createPlaceholderImage = (title, width = 1280, height = 720, palette = ['#241216', '#17181b', '#7b1f2d']) => {
    const [a, b, c] = palette;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${a}"/>
            <stop offset="48%" stop-color="${b}"/>
            <stop offset="100%" stop-color="${c}"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        <circle cx="${width * 0.82}" cy="${height * 0.24}" r="${height * 0.15}" fill="#ffffff15"/>
        <circle cx="${width * 0.18}" cy="${height * 0.74}" r="${height * 0.19}" fill="#e5091420"/>
        <text x="7%" y="78%" fill="#f5f5f7" font-family="Inter, Arial, sans-serif" font-size="${Math.max(width * 0.055, 28)}" font-weight="800">${title}</text>
        <text x="7%" y="86%" fill="#a3a7b3" font-family="Inter, Arial, sans-serif" font-size="${Math.max(width * 0.02, 14)}" font-weight="600">OBJECTFLIX PLACEHOLDER ART</text>
      </svg>
    `;

    const encoded = encodeURIComponent(svg).replace(/[!'()*~]/g, (ch) =>
      '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')
    );

    return `data:image/svg+xml;charset=UTF-8,${encoded}`;
  };

  const profiles = [
    { id: 'p1', name: 'Leaf', avatar: 'L', className: 'profile-avatar--gradient-a' },
    { id: 'p2', name: 'Clover', avatar: 'C', className: 'profile-avatar--gradient-b' },
    { id: 'p3', name: 'Brick', avatar: 'B', className: 'profile-avatar--gradient-c' },
    { id: 'p4', name: 'Nova', avatar: 'N', className: 'profile-avatar--gradient-d' },
  ];

  const trendingSearches = ['BFDI', 'BFDIA', 'BFB', 'TPOT', 'Object shows', 'Animation'];
  const searchFilters = ['All', 'Movies', 'TV Shows', 'Originals', 'Family', 'Sci-Fi', 'Comedy'];

  // Objectflix-wide settings shared by every page. Stored in localStorage under
  // the key configured in src/config.js (admin.settingsKey).
  const SETTINGS_DEFAULTS = {
    defaultAssistant: 'firey',
    conversationContext: 8,
    argEnabled: true,
    defaultBucket: 'objectflix-videos',
  };

  const SETTINGS_KEY = () => window.OBJECTFLIX_CONFIG?.admin?.settingsKey || 'objectflix_admin_settings';

  window.OBJECTFLIX_SETTINGS = {
    getAll() {
      const merged = { ...SETTINGS_DEFAULTS };
      try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY()) || '{}');
        for (const key in saved) {
          if (key in merged) merged[key] = saved[key];
        }
      } catch {
        // ignore malformed settings
      }
      return merged;
    },
    get(key, fallback) {
      const all = this.getAll();
      return all[key] !== undefined ? all[key] : fallback;
    },
    set(key, value) {
      const current = this.getAll();
      current[key] = value;
      try {
        localStorage.setItem(SETTINGS_KEY(), JSON.stringify(current));
      } catch {
        // localStorage unavailable — ignore
      }
      return value;
    },
  };

  window.createPlaceholderImage = createPlaceholderImage;
  window.OBJECTFLIX_DATA = {
    profiles,
    trendingSearches,
    searchFilters,
  };
})();
