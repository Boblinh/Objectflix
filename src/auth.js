





const ENV = window.__OBJECTFLIX_ENV__ || {};
const CONFIG = window.OBJECTFLIX_CONFIG || {};
const GOOGLE_CLIENT_ID = ENV.GOOGLE_CLIENT_ID || '';
const GOOGLE_AUTH_ENDPOINT = `${CONFIG.apiBaseUrl || ''}/api/auth/google`;
const DISCORD_CONFIG = {
  clientId: ENV.DISCORD_CLIENT_ID || 'PASTE_DISCORD_CLIENT_ID',
  clientSecret: ENV.DISCORD_CLIENT_SECRET || '',
  redirectUri: window.location.origin + window.location.pathname,
};

export const Auth = {
  state: {
    mode: 'signin',
    user: null
  },
  elements: {
    gate: document.getElementById('authGate'),
    form: document.getElementById('authForm'),
    tabSignIn: document.getElementById('tabSignIn'),
    tabSignUp: document.getElementById('tabSignUp'),
    nameFieldGroup: document.getElementById('nameFieldGroup'),
    confirmPasswordFieldGroup: document.getElementById('confirmPasswordFieldGroup'),
    authTitle: document.getElementById('auth-title'),
    authBtnText: document.getElementById('authBtnText'),
    authToggleText: document.getElementById('authToggleText'),
    authToggleModeBtn: document.getElementById('authToggleModeBtn'),
  },

  init() {
    this.bindEvents();
    window.Auth = this;
    this.handleDiscordCallback();
    this.handleGoogleCallback();
  },

  bindEvents() {
    this.elements.tabSignIn.addEventListener('click', () => this.setMode('signin'));
    this.elements.tabSignUp.addEventListener('click', () => this.setMode('signup'));
    this.elements.authToggleModeBtn.addEventListener('click', () => this.setMode(this.state.mode === 'signin' ? 'signup' : 'signin'));
    this.elements.form.addEventListener('submit', (e) => this.handleSubmit(e));
    
    document.getElementById('authCloseBtn')?.addEventListener('click', () => this.close());
    document.getElementById('gateAuthButton')?.addEventListener('click', () => this.open());
    document.getElementById('loginDiscordBtn').addEventListener('click', () => this.handleDiscordLogin());
    document.getElementById('loginGoogleBtn')?.addEventListener('click', () => this.handleGoogleLogin());
  },

  setMode(mode) {
    this.state.mode = mode;
    this.elements.tabSignIn.classList.toggle('is-active', mode === 'signin');
    this.elements.tabSignUp.classList.toggle('is-active', mode === 'signup');
    this.elements.nameFieldGroup.classList.toggle('is-hidden', mode === 'signin');
    this.elements.confirmPasswordFieldGroup.classList.toggle('is-hidden', mode === 'signin');
    this.elements.authTitle.textContent = mode === 'signin' ? 'Sign In' : 'Sign Up';
    this.elements.authBtnText.textContent = mode === 'signin' ? 'Sign In' : 'Sign Up';
    this.elements.authToggleText.textContent = mode === 'signin' ? 'New to Objectflix?' : 'Already have an account?';
    this.elements.authToggleModeBtn.textContent = mode === 'signin' ? 'Sign up now' : 'Sign in';
  },

  open() {
    this.elements.gate?.classList.remove('is-hidden');
  },

  close() {
    const currentUser = JSON.parse(localStorage.getItem('objectflix_current_user') || 'null');
    if (!currentUser) {
      alert('You must sign in to continue.');
      return;
    }
    this.elements.gate?.classList.add('is-hidden');
  },

  async handleSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const alertEl = document.getElementById('authAlert');
    
    alertEl.classList.add('is-hidden');

    if (!email || !password) {
      this.showError('Please fill in all fields.');
      return;
    }

    
    await new Promise(resolve => setTimeout(resolve, 800));

    if (this.state.mode === 'signup') {
      const confirmPassword = document.getElementById('authConfirmPassword').value;
      if (password !== confirmPassword) {
        this.showError('Passwords do not match.');
        return;
      }
      
      const users = JSON.parse(localStorage.getItem('objectflix_users') || '{}');
      if (users[email]) {
        this.showError('User already exists.');
        return;
      }
      
      users[email] = { password };
      localStorage.setItem('objectflix_users', JSON.stringify(users));
      localStorage.setItem('onboarding_needed', 'true');
      this.state.user = { email };
      localStorage.setItem('objectflix_current_user', JSON.stringify(this.state.user));
      window.location.assign('./index.html');
    } else {
      const users = JSON.parse(localStorage.getItem('objectflix_users') || '{}');
      if (users[email] && users[email].password === password) {
        this.state.user = { email };
        localStorage.setItem('objectflix_current_user', JSON.stringify(this.state.user));
        alert('Signed in successfully!');
        this.close();
        window.location.assign('./index.html');
      } else {
        this.showError('Invalid email or password.');
      }
    }
  },

  handleGoogleLogin() {
    if (!GOOGLE_CLIENT_ID) {
      this.showError('Google login is not configured. Add a Google Client ID first.');
      return;
    }

    const state = crypto.randomUUID();
    sessionStorage.setItem('objectflix_google_oauth_state', state);
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: window.location.origin + window.location.pathname,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });

    window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  },

  async handleGoogleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (!code && !error) return;
    window.history.replaceState({}, document.title, window.location.pathname);

    const expectedState = sessionStorage.getItem('objectflix_google_oauth_state');
    sessionStorage.removeItem('objectflix_google_oauth_state');

    if (error || !code || !state || state !== expectedState) {
      this.showError('Google sign-in was cancelled or could not be verified.');
      return;
    }

    const alertEl = document.getElementById('authAlert');
    alertEl.textContent = 'Completing Google sign-in...';
    alertEl.classList.remove('is-hidden');

    try {
      const res = await fetch(GOOGLE_AUTH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          redirectUri: window.location.origin + window.location.pathname,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Google sign-in failed.');
      localStorage.setItem('objectflix_current_user', JSON.stringify(data.session));
      window.location.assign('./index.html');
    } catch (err) {
      console.error('Google sign-in failed:', err);
      this.showError(err.message || 'Google sign-in failed. Please try again.');
    }
  },

  handleDiscordLogin() {
    const { clientId, redirectUri } = DISCORD_CONFIG;
    if (!clientId || clientId.startsWith('PASTE_')) {
      this.showError('Discord login is not configured yet. Open src/auth.js and add your Discord Client ID and Secret.');
      return;
    }
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'identify email',
    });
    window.location.href = `https://discord.com/oauth2/authorize?${params.toString()}`;
  },

  async handleDiscordCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (params.has('state')) return;

    if (error) {
      this.showError('Discord sign-in was cancelled.');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    if (!code) return;

    const alertEl = document.getElementById('authAlert');
    alertEl.textContent = 'Completing Discord sign-in...';
    alertEl.classList.remove('is-hidden');
    document.getElementById('authBtnText').textContent = 'Connecting...';

    try {
      const token = await this.exchangeDiscordCode(code);
      const user = await this.fetchDiscordUser(token);
      this.completeDiscordLogin(user);
    } catch (err) {
      console.error('Discord sign-in failed:', err);
      this.showError('Discord sign-in failed. Please try again.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  },

  async exchangeDiscordCode(code) {
    const { clientId, clientSecret, redirectUri } = DISCORD_CONFIG;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
    const res = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
    const data = await res.json();
    return data.access_token;
  },

  async fetchDiscordUser(token) {
    const res = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Discord user fetch failed (${res.status})`);
    return res.json();
  },

  completeDiscordLogin(user) {
    const email = user.email || `${user.username}@discord.local`;
    const session = {
      provider: 'discord',
      id: user.id,
      email,
      username: user.username,
      displayName: user.global_name || user.username,
      avatar: user.avatar || null,
    };
    localStorage.setItem('objectflix_current_user', JSON.stringify(session));
    
    window.history.replaceState({}, document.title, window.location.pathname);
    alert(`Signed in as ${session.displayName}!`);
    location.reload();
  },

  showError(message) {
    const alertEl = document.getElementById('authAlert');
    alertEl.textContent = message;
    alertEl.classList.remove('is-hidden');
  }
};

