
// Discord OAuth setup
// 1. Go to https://discord.com/developers/applications -> New Application
// 2. Copy the Application ID as clientId and the Client Secret
// 3. Add your redirect URI under OAuth2 -> Redirects (must match EXACTLY).
//    For local testing: http://localhost:8000/index.html
const ENV = window.__OBJECTFLIX_ENV__ || {};
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
    window.Auth = this; // Make globally accessible
    this.handleDiscordCallback();
  },

  bindEvents() {
    this.elements.tabSignIn.addEventListener('click', () => this.setMode('signin'));
    this.elements.tabSignUp.addEventListener('click', () => this.setMode('signup'));
    this.elements.authToggleModeBtn.addEventListener('click', () => this.setMode(this.state.mode === 'signin' ? 'signup' : 'signin'));
    this.elements.form.addEventListener('submit', (e) => this.handleSubmit(e));
    
    document.getElementById('authCloseBtn').addEventListener('click', () => this.close());
    document.getElementById('gateAuthButton')?.addEventListener('click', () => this.open());
    document.getElementById('loginDiscordBtn').addEventListener('click', () => this.handleDiscordLogin());
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
    this.elements.gate.classList.remove('is-hidden');
  },

  close() {
    const currentUser = JSON.parse(localStorage.getItem('objectflix_current_user') || 'null');
    if (!currentUser) {
      alert('You must sign in to continue.');
      return;
    }
    this.elements.gate.classList.add('is-hidden');
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

    // Simulate API delay
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
      alert('Account created! Please sign in.');
      this.setMode('signin');
    } else {
      const users = JSON.parse(localStorage.getItem('objectflix_users') || '{}');
      if (users[email] && users[email].password === password) {
        this.state.user = { email };
        localStorage.setItem('objectflix_current_user', JSON.stringify(this.state.user));
        alert('Signed in successfully!');
        this.close();
        location.reload();
      } else {
        this.showError('Invalid email or password.');
      }
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
    // Remove ?code=... from the URL so a refresh doesn't re-run the callback
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

