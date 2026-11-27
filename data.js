(() => {
  
  

  // Generates encoded SVG placeholder artwork with a simple face and wrapped title.
  const createPlaceholderImage = (title, width = 1280, height = 720, palette = ['#e5dcef', '#f6f1fa', '#a18bb7']) => {
    const [a, b, c] = palette;
    // Escapes text characters that would otherwise change the generated SVG markup.
    const escapeXML = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
    const portrait = height > width;
    const fontSize = width * (portrait ? 0.086 : 0.065);
    const maxChars = portrait ? 16 : 25;
    const lines = [];
    for (const word of String(title).split(/\s+/)) {
      if (!lines.length || `${lines[lines.length - 1]} ${word}`.length > maxChars) lines.push(word);
      else lines[lines.length - 1] += ` ${word}`;
    }
    const unit = Math.min(width, height);
    const cx = width * (portrait ? 0.5 : 0.77);
    const cy = height * (portrait ? 0.38 : 0.5);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="100%" height="100%" fill="${a}"/>
        <circle cx="${width * 0.1}" cy="${height * 0.04}" r="${unit * 0.48}" fill="${b}"/>
        <circle cx="${width * 0.98}" cy="${height * 0.98}" r="${unit * 0.48}" fill="${c}" opacity=".28"/>
        <g transform="translate(${cx} ${cy}) rotate(-12)">
          <rect x="${-unit * 0.24}" y="${-unit * 0.23}" width="${unit * 0.48}" height="${unit * 0.46}" rx="${unit * 0.14}" fill="${c}"/>
          <ellipse cx="${-unit * 0.09}" cy="${-unit * 0.04}" rx="${unit * 0.018}" ry="${unit * 0.032}" fill="#30372a"/>
          <ellipse cx="${unit * 0.09}" cy="${-unit * 0.04}" rx="${unit * 0.018}" ry="${unit * 0.032}" fill="#30372a"/>
          <path d="M${-unit * 0.09} ${unit * 0.075} Q0 ${unit * 0.2} ${unit * 0.09} ${unit * 0.075}" stroke="#30372a" stroke-width="${unit * 0.013}" stroke-linecap="round" fill="none"/>
        </g>
        <text x="8%" y="${height * 0.1}" fill="#536048" font-family="Arial, sans-serif" font-size="${unit * 0.022}" letter-spacing="${unit * 0.004}">AN OBJECTFLIX DISCOVERY</text>
        <text x="8%" y="${height * (portrait ? 0.7 : 0.65)}" fill="#30372a" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="-2">${lines.slice(0, 4).map((line, index) => `<tspan x="8%" dy="${index ? fontSize * 1.06 : 0}">${escapeXML(line)}</tspan>`).join('')}</text>
        <text x="8%" y="94%" fill="#596b4c" font-family="Arial, sans-serif" font-size="${unit * 0.019}" letter-spacing="${unit * 0.002}">A LITTLE WORLD OF ITS OWN. ↗</text>
      </svg>
    `;

    const encoded = encodeURIComponent(svg).replace(/[!'()*~]/g, (ch) =>
      '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')
    );

    return `data:image/svg+xml;charset=UTF-8,${encoded}`;
  };

  const profiles = [];

  const trendingSearches = ['BFDI', 'BFDIA', 'BFB', 'TPOT', 'Object shows', 'Animation'];
  const searchFilters = ['All', 'Movies', 'TV Shows', 'Originals', 'Family', 'Sci-Fi', 'Comedy'];

  
  
  const SETTINGS_DEFAULTS = {
    defaultAssistant: 'firey',
    conversationContext: 8,
    argEnabled: true,
    defaultBucket: 'objectflix-videos',
  };

  // Uses the configured settings key or the legacy default when config is unavailable.
  const SETTINGS_KEY = () => window.OBJECTFLIX_CONFIG?.admin?.settingsKey || 'objectflix_admin_settings';

  window.OBJECTFLIX_SETTINGS = {
    // Merges valid saved values over defaults and returns the full settings object.
    getAll() {
      const merged = { ...SETTINGS_DEFAULTS };
      try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY()) || '{}');
        for (const key in saved) {
          if (key in merged) merged[key] = saved[key];
        }
      } catch {
        
      }
      return merged;
    },
    // Returns one setting or its fallback when that key has no saved value.
    get(key, fallback) {
      const all = this.getAll();
      return all[key] !== undefined ? all[key] : fallback;
    },
    // Saves one setting while preserving the other values and returns the assigned value.
    set(key, value) {
      const current = this.getAll();
      current[key] = value;
      try {
        localStorage.setItem(SETTINGS_KEY(), JSON.stringify(current));
      } catch {
        
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
