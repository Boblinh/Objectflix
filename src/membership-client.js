
(() => {
  const SESSION_KEY = 'objectflix_verified_session';
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icon = (name) => `<svg class="ui-icon" aria-hidden="true"><use href="./assets/ui/icons.svg#${name}"></use></svg>`;
  let cached = null;
  let loadedAt = 0;
  let pending = null;

  class MembershipError extends Error {
    constructor(message, status = 0, code = '') { super(message); this.status = status; this.code = code; }
  }

  function session() {
    try {
      const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      const user = JSON.parse(localStorage.getItem('objectflix_current_user') || 'null');
      if (!value || value.expiresAt * 1000 <= Date.now() || value.userId !== `${user?.provider}:${user?.id}`) return null;
      return value;
    } catch { return null; }
  }

  async function request(path, { method = 'GET', body, public: isPublic = false } = {}) {
    const verified = session();
    if (!verified && !isPublic) throw new MembershipError('Sign in with Google or Discord to verify your account.', 401, 'authentication_required');
    const headers = { Accept: 'application/json' };
    if (verified) headers.Authorization = `Bearer ${verified.accessToken}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(`${window.OBJECTFLIX_CONFIG.apiBaseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000), cache: 'no-store' });
    } catch { throw new MembershipError('Could not reach Objectflix. Check your connection and try again.'); }
    let result;
    try { result = await response.json(); } catch { throw new MembershipError('This service is not available yet. Please try again later.', response.status); }
    if (response.status === 401) {
      sessionStorage.removeItem(SESSION_KEY);
      cached = null;
      applyAppearance();
      if (isPublic && verified) return request(path, { method, body, public: true });
    }
    if (!response.ok) throw new MembershipError(result.error || 'Something went wrong. Please try again.', response.status, result.code);
    return result;
  }

  async function load(force = false) {
    if (!session()) { cached = null; return null; }
    if (!force && cached && Date.now() - loadedAt < 60000) return cached;
    if (pending) return pending;
    pending = request('/api/membership/me').then((result) => {
      cached = result;
      loadedAt = Date.now();
      applyAppearance();
      window.dispatchEvent(new CustomEvent('objectflix:membership', { detail: result.membership }));
      return result;
    }).finally(() => { pending = null; });
    return pending;
  }

  function applyAppearance() {
    const member = session() ? cached?.membership : null;
    const prefs = member?.preferences || {};
    document.querySelectorAll('#avatarButton, .profile-card .profile-avatar, [data-member-avatar]').forEach((avatar) => {
      avatar.dataset.memberFrame = prefs.frame || 'none';
      avatar.dataset.memberTheme = prefs.theme || 'default';
      avatar.dataset.memberDecoration = prefs.decoration || 'none';
    });
    document.querySelectorAll('.profile-card').forEach((profile) => {
      profile.querySelector('.profile-supporter-badge')?.remove();
      if (prefs.showBadge) {
        const badge = document.createElement('span');
        badge.className = 'profile-supporter-badge';
        badge.textContent = member.planName;
        profile.appendChild(badge);
      }
    });
    document.querySelectorAll('[data-membership-label]').forEach((label) => { label.textContent = member?.planName || 'Membership'; });
  }

  async function billing(action, planId) {
    const result = await request(`/api/membership/${action}`, { method: 'POST', body: planId ? { planId } : {} });
    const url = new URL(result.url);
    const expected = action === 'portal' ? 'billing.stripe.com' : 'checkout.stripe.com';
    if (url.protocol !== 'https:' || url.hostname !== expected) throw new MembershipError('A valid Stripe session could not be opened.');
    if (window.self !== window.top) window.top.location.assign(url.href);
    else window.location.assign(url.href);
  }

  function priceLabel(price) {
    if (!price) return 'Pricing to be announced';
    const zeroDecimal = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
    const currency = price.currency.toUpperCase();
    const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    const digits = zeroDecimal.has(currency) ? 0 : ['BHD', 'JOD', 'KWD', 'OMR', 'TND'].includes(currency) ? 3 : 2;
    return formatter.format(price.unitAmount / (10 ** digits));
  }

  function authLink(returnTo = 'membership.html') {
    return `./auth.html?verify=1&returnTo=${encodeURIComponent(returnTo)}`;
  }

  function init() {
    const header = document.querySelector('[data-member-header]');
    if (header) {
      const active = document.body.dataset.memberPage;
      header.innerHTML = `<a class="logo" href="./index.html" aria-label="Objectflix home"><img class="brand-mark" src="./assets/ui/objectflix-mark.svg" alt="" width="38" height="38" /><span class="logo__text">objectflix<span class="brand-dot">.</span></span></a><nav aria-label="Objectflix"><a href="./browse.html">Browse</a><a href="./movie-nights.html" ${active === 'movie-nights' ? 'aria-current="page"' : ''}>Movie Nights</a><a href="./membership.html" ${active === 'membership' ? 'aria-current="page"' : ''}>Membership</a></nav><a class="member-nav__profile" href="./index.html">${icon('user')}<span>My profile</span></a>`;
    }
    if (session()) load().catch(() => {  });
  }

  window.OBJECTFLIX_MEMBERSHIP = { request, load, session, billing, applyAppearance, escapeHTML, icon, priceLabel, authLink, get current() { return cached; } };
  window.addEventListener('storage', (event) => { if (event.key === 'objectflix_current_user') { cached = null; applyAppearance(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
