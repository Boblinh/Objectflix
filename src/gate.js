// Objectflix: this is the gate part, kept here so the rest of the app knows exactly where to look.


(() => {
  const API = window.OBJECTFLIX_API;
  const MEMBERSHIP = window.OBJECTFLIX_MEMBERSHIP;

  const MAX_PROFILES = 4;
  const AVATAR_CLASSES = [
    'profile-avatar--gradient-a',
    'profile-avatar--gradient-b',
    'profile-avatar--gradient-c',
    'profile-avatar--gradient-d',
  ];
  const elements = {
    profileGate: document.getElementById('profileGate'),
    profileGrid: document.getElementById('profileGrid'),
    modal: document.getElementById('profileModal'),
    modalTitle: document.getElementById('profileModalTitle'),
    form: document.getElementById('profileForm'),
    nameInput: document.getElementById('profileNameInput'),
    avatarInput: document.getElementById('profileAvatarInput'),
    swatchRow: document.getElementById('profileSwatchRow'),
    errorEl: document.getElementById('profileModalError'),
    submitBtn: document.getElementById('profileSubmitBtn'),
    deleteBtn: document.getElementById('profileDeleteBtn'),
    cancelBtn: document.getElementById('profileCancelBtn'),
    manageBtn: document.getElementById('manageProfilesButton'),
  };

  let dynamicProfiles = [];
  let editingProfile = null;
  let selectedClass = AVATAR_CLASSES[0];
  let lastFocusedElement = null;
  let profileSession = null;

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function currentUser() {
    try {
      return JSON.parse(localStorage.getItem('objectflix_current_user') || 'null');
    } catch {
      return null;
    }
  }

  function clearActiveProfile() {
    try {
      sessionStorage.removeItem('objectflix_active_profile');
    } catch {
    }
  }

  function sameSession(expected) {
    const current = MEMBERSHIP.session();
    return Boolean(expected && current && current.accessToken === expected.accessToken && current.userId === expected.userId);
  }

  function requireProfileSession() {
    if (sameSession(profileSession)) return true;
    renderProfileLoadError(new API.ApiError('Sign in with Google or Discord to access your profiles.', 401));
    return false;
  }

  function renderProfileLoadError(error) {
    dynamicProfiles = [];
    profileSession = null;
    editingProfile = null;
    clearActiveProfile();
    elements.modal.classList.add('is-hidden');
    elements.manageBtn.disabled = true;
    elements.profileGrid.setAttribute('aria-busy', 'false');
    const verificationRequired = error.status === 401 || error.status === 403;
    elements.profileGrid.innerHTML = `
      <div class="profile-empty-hint" id="profileLoadError" role="alert">
        <p>${escapeHTML(error.message || 'Your profiles could not be loaded. Please try again.')}</p>
        ${verificationRequired
          ? '<a class="button button--primary" href="./auth.html?verify=1">Sign in with Google or Discord</a>'
          : '<button class="button button--primary" type="button" id="retryProfilesBtn">Try again</button>'}
      </div>
    `;
    document.getElementById('retryProfilesBtn')?.addEventListener('click', loadProfiles);
  }

  async function loadProfiles() {
    const expectedSession = MEMBERSHIP.session();
    profileSession = null;
    dynamicProfiles = [];
    clearActiveProfile();
    elements.manageBtn.disabled = true;
    elements.profileGrid.setAttribute('aria-busy', 'true');
    elements.profileGrid.innerHTML = '<p class="profile-empty-hint" role="status">Loading your profiles…</p>';
    try {
      const serverProfiles = await API.listProfiles();
      if (!sameSession(expectedSession)) {
        renderProfileLoadError(new API.ApiError('Your account changed. Please sign in again to access your profiles.', 401));
        return;
      }
      profileSession = expectedSession;
      dynamicProfiles = serverProfiles;
      renderProfileGate(dynamicProfiles);
      if (localStorage.getItem('onboarding_needed') === 'true') showOnboarding();
    } catch (error) {
      renderProfileLoadError(error);
    } finally {
      elements.profileGrid.setAttribute('aria-busy', 'false');
    }
  }

  function renderProfileGate(profilesToRender) {
    elements.manageBtn.disabled = false;
    const cards = profilesToRender.map(renderProfileCard).join('');
    const addBtn = profilesToRender.length >= MAX_PROFILES
      ? ''
      : `<button class="add-profile" type="button" id="addProfileBtn" aria-label="Add profile">
          <div class="profile-avatar" aria-hidden="true">+</div>
          <div class="profile-name">A new character</div>
        </button>`;
    elements.profileGrid.innerHTML = cards + addBtn;
    window.OBJECTFLIX_MEMBERSHIP?.applyAppearance();

    document.getElementById('addProfileBtn')?.addEventListener('click', () => openModal(null));

    if (!profilesToRender.length) {
      elements.profileGrid.insertAdjacentHTML(
        'beforeend',
        '<div class="profile-empty-hint">No profiles yet — create your first one to start watching.</div>'
      );
    }
  }

  function renderProfileCard(profile) {
    return `
      <div class="profile-card-wrap">
        <button class="profile-card" type="button" data-profile-id="${escapeHTML(profile.id)}" aria-label="Choose profile ${escapeHTML(profile.name)}">
          <div class="profile-avatar ${AVATAR_CLASSES.includes(profile.className) ? profile.className : AVATAR_CLASSES[0]}"><span class="profile-avatar__letter">${escapeHTML(profile.avatar)}</span><span class="profile-avatar__smile" aria-hidden="true"></span></div>
          <div class="profile-name">${escapeHTML(profile.name)}</div>
        </button>
        <button class="profile-edit" type="button" data-edit-profile-id="${escapeHTML(profile.id)}" aria-label="Edit profile ${escapeHTML(profile.name)}">&#9998;</button>
      </div>
    `;
  }

  function selectProfile(profileId) {
    if (!requireProfileSession()) return;
    const profile = dynamicProfiles.find((p) => p.id === profileId);
    if (!profile) return;
    try {
      sessionStorage.setItem('objectflix_active_profile', JSON.stringify(profile));
    } catch {
      
    }
    window.location.href = 'browse.html';
  }

  function openModal(profile) {
    if (!requireProfileSession()) return;
    lastFocusedElement = document.activeElement;
    editingProfile = profile;
    selectedClass = profile?.className || AVATAR_CLASSES[0];
    elements.modalTitle.textContent = profile ? 'Edit Profile' : 'Add Profile';
    elements.submitBtn.textContent = profile ? 'Save Changes' : 'Create Profile';
    elements.deleteBtn.classList.toggle('is-hidden', !profile);
    elements.errorEl.classList.add('is-hidden');
    elements.nameInput.value = profile?.name || '';
    elements.avatarInput.value = profile?.avatar || '';
    renderSwatches();
    elements.modal.classList.remove('is-hidden');
    elements.avatarInput.dataset.touched = '';
    elements.nameInput.focus();
  }

  function closeModal() {
    elements.modal.classList.add('is-hidden');
    editingProfile = null;
    if (lastFocusedElement?.isConnected) lastFocusedElement.focus();
  }

  function renderSwatches() {
    elements.swatchRow.innerHTML = AVATAR_CLASSES.map((className) => `
      <button type="button" class="avatar-swatch ${className} ${className === selectedClass ? 'is-selected' : ''}"
        data-class-name="${className}" aria-label="${['Peach', 'Lilac', 'Mint', 'Sunshine'][AVATAR_CLASSES.indexOf(className)]} avatar" aria-pressed="${className === selectedClass}"></button>
    `).join('');
  }

  function showError(message) {
    elements.errorEl.textContent = message;
    elements.errorEl.classList.remove('is-hidden');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!requireProfileSession()) return;

    const name = elements.nameInput.value.trim().slice(0, 30);
    if (!name) {
      showError('Please enter a profile name.');
      return;
    }

    const avatarInput = elements.avatarInput.value.trim();
    const avatar = (avatarInput || name)[0].toUpperCase();
    elements.errorEl.classList.add('is-hidden');
    elements.submitBtn.disabled = true;

    try {
      if (editingProfile) {
        const updated = await API.updateProfile(editingProfile.id, { name, avatar, className: selectedClass });
        if (!requireProfileSession()) return;
        dynamicProfiles = dynamicProfiles.map((p) => (p.id === updated.id ? updated : p));
      } else {
        const created = await API.createProfile({ name, avatar, className: selectedClass });
        if (!requireProfileSession()) return;
        dynamicProfiles = [...dynamicProfiles, created];
      }
      closeModal();
      renderProfileGate(dynamicProfiles);
    } catch (err) {
      if (err.status === 401 || err.status === 403) renderProfileLoadError(err);
      else showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      elements.submitBtn.disabled = false;
    }
  }

  async function handleDelete() {
    if (!editingProfile) return;
    if (!requireProfileSession()) return;
    if (!confirm(`Delete the profile "${editingProfile.name}"? Its likes and list will be orphaned.`)) return;

    elements.deleteBtn.disabled = true;
    try {
      await API.deleteProfile(editingProfile.id);
      if (!requireProfileSession()) return;
      dynamicProfiles = dynamicProfiles.filter((p) => p.id !== editingProfile.id);
      closeModal();
      renderProfileGate(dynamicProfiles);
    } catch (err) {
      if (err.status === 401 || err.status === 403) renderProfileLoadError(err);
      else showError(err.message || 'Could not delete this profile.');
    } finally {
      elements.deleteBtn.disabled = false;
    }
  }

  function bindEvents() {
    window.addEventListener('storage', (event) => {
      if (event.key === 'objectflix_current_user' || event.key === null) window.location.reload();
    });
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const swatch = target.closest('[data-class-name]');
      if (swatch) {
        selectedClass = swatch.dataset.className;
        renderSwatches();
        return;
      }

      const profileButton = target.closest('[data-profile-id]');
      if (profileButton) {
        selectProfile(profileButton.dataset.profileId);
        return;
      }

      const editButton = target.closest('[data-edit-profile-id]');
      if (editButton) {
        const profile = dynamicProfiles.find((p) => p.id === editButton.dataset.editProfileId);
        if (profile) openModal(profile);
      }
    });

    elements.form.addEventListener('submit', handleSubmit);
    elements.cancelBtn.addEventListener('click', closeModal);
    elements.deleteBtn.addEventListener('click', handleDelete);
    document.getElementById('profileModalBackdrop').addEventListener('click', closeModal);

    document.getElementById('manageProfilesButton')?.addEventListener('click', (event) => {
      const managing = elements.profileGrid.classList.toggle('is-managing');
      event.currentTarget.setAttribute('aria-pressed', String(managing));
      event.currentTarget.textContent = managing ? 'Done editing' : 'Manage profiles';
    });

    document.addEventListener('keydown', (event) => {
      if (elements.modal.classList.contains('is-hidden')) return;
      if (event.key === 'Escape') closeModal();
      if (event.key !== 'Tab') return;
      const focusable = [...elements.modal.querySelectorAll('button, input')].filter((element) => !element.disabled && element.getClientRects().length);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });

    elements.nameInput.addEventListener('input', () => {
      if (!editingProfile && !elements.avatarInput.dataset.touched) {
        elements.avatarInput.value = (elements.nameInput.value.trim()[0] || '').toUpperCase();
      }
    });
    elements.avatarInput.addEventListener('input', () => {
      elements.avatarInput.dataset.touched = 'true';
      elements.avatarInput.value = elements.avatarInput.value.slice(-1).toUpperCase();
    });
  }

  async function init() {
    clearActiveProfile();
    const user = currentUser();
    if (!user) {
      return;
    }

    document.getElementById('welcomeLanding').classList.add('is-hidden');
    document.querySelector('.welcome-nav__explore').classList.add('is-hidden');
    bindEvents();

    elements.profileGate.classList.remove('is-hidden');
    await loadProfiles();
  }

  function showOnboarding() {
    const modal = document.getElementById('onboardingModal');
    modal.classList.remove('is-hidden');
    document.getElementById('closeOnboardingBtn').addEventListener('click', () => {
      modal.classList.add('is-hidden');
      localStorage.removeItem('onboarding_needed');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
