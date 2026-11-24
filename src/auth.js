





import { isFirebaseConfigured, getFirebase } from './firebase.js';

const ENV = window.__OBJECTFLIX_ENV__ || {};
const CONFIG = window.OBJECTFLIX_CONFIG || {};
const FIREBASE_AUTH_ENDPOINT = `${CONFIG.apiBaseUrl || ''}/api/auth/firebase`;
const DISCORD_AUTH_ENDPOINT = `${CONFIG.apiBaseUrl || ''}/api/auth/discord`;
const DISCORD_CONFIG = {
  clientId: ENV.DISCORD_CLIENT_ID || 'PASTE_DISCORD_CLIENT_ID',
  redirectUri: window.location.origin + window.location.pathname,
};

function authReturnTarget(value) {
  const staticTargets = ['membership.html', 'movie-nights.html', 'movie-night-admin.html', 'subtitle-workshop-admin.html'];
  if (staticTargets.includes(value)) return value;
  if (typeof value !== 'string' || !value.startsWith('watch.html?')) return null;
  const params = new URLSearchParams(value.slice('watch.html?'.length));
  const id = params.get('id');
  const episode = params.get('ep');
  if (!/^[0-9a-f-]{36}$/i.test(id || '') || !/^[0-9a-f-]{36}$/i.test(episode || '') || [...params.keys()].some((key) => !['id', 'ep'].includes(key))) return null;
  return `watch.html?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(episode)}`;
}

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
    window.Auth = this;
    if (!this.elements.form) return;
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    const returnTarget = authReturnTarget(returnTo);
    if (returnTarget) sessionStorage.setItem('objectflix_auth_return', returnTarget);
    if (new URLSearchParams(window.location.search).has('verify')) document.getElementById('authVerificationNote')?.classList.remove('is-hidden');
    this.bindEvents();
    this.setMode(new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'signup' : 'signin');
    this.handleDiscordCallback();
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
    document.getElementById('authTogglePassword')?.addEventListener('click', (event) => {
      const input = document.getElementById('authPassword');
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      event.currentTarget.textContent = visible ? 'Hide' : 'Show';
      event.currentTarget.setAttribute('aria-pressed', String(visible));
      event.currentTarget.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    });
    [this.elements.tabSignIn, this.elements.tabSignUp].forEach((tab) => {
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const signIn = event.key === 'Home' || (event.key !== 'End' && this.state.mode === 'signup');
        this.setMode(signIn ? 'signin' : 'signup');
        (signIn ? this.elements.tabSignIn : this.elements.tabSignUp).focus();
      });
    });
  },

  setMode(mode) {
    this.state.mode = mode;
    this.elements.tabSignIn.classList.toggle('is-active', mode === 'signin');
    this.elements.tabSignUp.classList.toggle('is-active', mode === 'signup');
    this.elements.nameFieldGroup.classList.toggle('is-hidden', mode === 'signin');
    this.elements.confirmPasswordFieldGroup.classList.toggle('is-hidden', mode === 'signin');
    this.elements.tabSignIn.setAttribute('aria-selected', String(mode === 'signin'));
    this.elements.tabSignUp.setAttribute('aria-selected', String(mode === 'signup'));
    this.elements.tabSignIn.tabIndex = mode === 'signin' ? 0 : -1;
    this.elements.tabSignUp.tabIndex = mode === 'signup' ? 0 : -1;
    document.getElementById('authFormPanel')?.setAttribute('aria-labelledby', mode === 'signin' ? 'tabSignIn' : 'tabSignUp');
    document.getElementById('authPassword').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
    document.getElementById('authSubtitle').textContent = mode === 'signin' ? 'Sign in and pick up the fun right where you left it.' : 'Make a little space for yourself in the object universe.';
    document.getElementById('authAlert').classList.add('is-hidden');
    this.elements.authTitle.textContent = mode === 'signin' ? 'Hey, you. Welcome in.' : 'Your kind of people.';
    this.elements.authBtnText.textContent = mode === 'signin' ? 'Let me in' : 'Make yourself at home';
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

  finishLogin(user, credentials) {
    sessionStorage.removeItem('objectflix_active_profile');
    localStorage.removeItem('objectflix_guest');
    sessionStorage.removeItem('objectflix_verified_session');
    if (credentials?.accessToken && credentials?.expiresAt) {
      sessionStorage.setItem('objectflix_verified_session', JSON.stringify({ accessToken: credentials.accessToken, expiresAt: credentials.expiresAt, userId: `${user.provider}:${user.id}` }));
    }
    localStorage.setItem('objectflix_current_user', JSON.stringify(user));
    const returnTo = sessionStorage.getItem('objectflix_auth_return');
    sessionStorage.removeItem('objectflix_auth_return');
    window.location.assign(authReturnTarget(returnTo) ? `./${authReturnTarget(returnTo)}` : './index.html');
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
      this.finishLogin(this.state.user);
    } else {
      const users = JSON.parse(localStorage.getItem('objectflix_users') || '{}');
      if (users[email] && users[email].password === password) {
        this.state.user = { email };
        this.finishLogin(this.state.user);
      } else {
        this.showError('Invalid email or password.');
      }
    }
  },

  async handleGoogleLogin() {
    if (!isFirebaseConfigured()) {
      this.showError('Google sign-in is not configured. Add your Firebase web config in src/firebase-config.js.');
      return;
    }

    const alertEl = document.getElementById('authAlert');
    try {
      if (alertEl) {
        alertEl.textContent = 'Opening Google sign-in…';
        alertEl.classList.remove('is-hidden');
      }
      const { auth, authSdk } = await getFirebase();
      const { GoogleAuthProvider, signInWithPopup } = authSdk;
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(auth, provider);
      const user = credential.user;
      if (!user?.email || !user.emailVerified) {
        throw new Error('A verified Google email is required.');
      }
      const idToken = await user.getIdToken();

      if (alertEl) alertEl.textContent = 'Completing Google sign-in…';
      const res = await fetch(FIREBASE_AUTH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Google sign-in failed.');
      this.finishLogin(data.session, data);
    } catch (err) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
      console.error('Firebase Google sign-in failed:', err);
      this.showError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      if (alertEl) alertEl.classList.add('is-hidden');
    }
  },

  handleDiscordLogin() {
    const { clientId, redirectUri } = DISCORD_CONFIG;
    if (!clientId || clientId.startsWith('PASTE_')) {
      this.showError('Discord login is not configured yet. Add your Discord Client ID first.');
      return;
    }

    const state = crypto.randomUUID();
    sessionStorage.setItem('objectflix_discord_oauth_state', state);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'identify email',
      state,
      prompt: 'consent',
    });

    window.location.assign(`https://discord.com/oauth2/authorize?${params.toString()}`);
  },

  async handleDiscordCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (!code && !error) return;
    if (!state && !error) return;
    window.history.replaceState({}, document.title, window.location.pathname);

    const expectedState = sessionStorage.getItem('objectflix_discord_oauth_state');
    sessionStorage.removeItem('objectflix_discord_oauth_state');

    if (error || !code || state !== expectedState) {
      this.showError('Discord sign-in was cancelled or could not be verified.');
      return;
    }

    const alertEl = document.getElementById('authAlert');
    alertEl.textContent = 'Completing Discord sign-in...';
    alertEl.classList.remove('is-hidden');

    try {
      const res = await fetch(DISCORD_AUTH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          redirectUri: DISCORD_CONFIG.redirectUri,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Discord sign-in failed.');

      this.finishLogin(data.session, data);
    } catch (err) {
      console.error('Discord sign-in failed:', err);
      this.showError(err.message || 'Discord sign-in failed. Please try again.');
    }
  },

  showError(message) {
    const alertEl = document.getElementById('authAlert');
    alertEl.textContent = message;
    alertEl.classList.remove('is-hidden');
  }
};

