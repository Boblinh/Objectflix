

(() => {
  const API = window.OBJECTFLIX_API;

  const MAX_PROFILES = 4;
  const AVATAR_CLASSES = [
    'profile-avatar--gradient-a',
    'profile-avatar--gradient-b',
    'profile-avatar--gradient-c',
    'profile-avatar--gradient-d',
  ];
  const CACHE_PREFIX = 'objectflix_profiles_';

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
  };

  let dynamicProfiles = [];
  let editingProfile = null;
  let selectedClass = AVATAR_CLASSES[0];

  function currentUser() {
    return JSON.parse(localStorage.getItem('objectflix_current_user') || 'null');
  }

  // Stable identity for server-side storage: Discord users key by their
  // Discord id (works on every device), email users key by their address.
  function accountKey(user) {
    if (!user) return null;
    if (user.provider === 'discord' && user.id) return `discord:${user.id}`;
    return (user.email || '').toLowerCase() || null;
  }

  function cacheProfiles(account, profiles) {
    try {
      localStorage.setItem(CACHE_PREFIX + account, JSON.stringify(profiles));
    } catch {
      
    }
  }

  function readCachedProfiles(account) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_PREFIX + account) || 'null');
      return Array.isArray(cached) ? cached : [];
    } catch {
      return [];
    }
  }

  function renderProfileGate(profilesToRender) {
    const cards = profilesToRender.map(renderProfileCard).join('');
    const addBtn = profilesToRender.length >= MAX_PROFILES
      ? ''
      : `<button class="add-profile" type="button" id="addProfileBtn" aria-label="Add profile">
          <div class="profile-avatar">+</div>
          <div class="profile-name">Add Profile</div>
        </button>`;
    elements.profileGrid.innerHTML = cards + addBtn;

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
        <button class="profile-card" type="button" data-profile-id="${profile.id}" aria-label="Choose profile ${profile.name}">
          <div class="profile-avatar ${profile.className}">${profile.avatar}</div>
          <div class="profile-name">${profile.name}</div>
        </button>
        <button class="profile-edit" type="button" data-edit-profile-id="${profile.id}" aria-label="Edit profile ${profile.name}">&#9998;</button>
      </div>
    `;
  }

  function selectProfile(profileId) {
    const profile = dynamicProfiles.find((p) => p.id === profileId) || dynamicProfiles[0];
    if (!profile) return;
    try {
      sessionStorage.setItem('objectflix_active_profile', JSON.stringify(profile));
    } catch {
      
    }
    window.location.href = 'browse.html';
  }

  function openModal(profile) {
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
  }

  function renderSwatches() {
    elements.swatchRow.innerHTML = AVATAR_CLASSES.map((className) => `
      <button type="button" class="avatar-swatch ${className} ${className === selectedClass ? 'is-selected' : ''}"
        data-class-name="${className}" aria-label="Avatar color"></button>
    `).join('');
  }

  function showError(message) {
    elements.errorEl.textContent = message;
    elements.errorEl.classList.remove('is-hidden');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const user = currentUser();
    const account = accountKey(user);
    if (!account) return;

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
        const updated = await API.updateProfile(editingProfile.id, { account, name, avatar, className: selectedClass });
        dynamicProfiles = dynamicProfiles.map((p) => (p.id === updated.id ? updated : p));
      } else {
        const created = await API.createProfile({ account, name, avatar, className: selectedClass });
        dynamicProfiles = [...dynamicProfiles, created];
      }
      cacheProfiles(account, dynamicProfiles);
      closeModal();
      renderProfileGate(dynamicProfiles);
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      elements.submitBtn.disabled = false;
    }
  }

  async function handleDelete() {
    if (!editingProfile) return;
    const user = currentUser();
    const account = accountKey(user);
    if (!account) return;
    if (!confirm(`Delete the profile "${editingProfile.name}"? Its likes and list will be orphaned.`)) return;

    elements.deleteBtn.disabled = true;
    try {
      await API.deleteProfile(editingProfile.id, account);
      dynamicProfiles = dynamicProfiles.filter((p) => p.id !== editingProfile.id);
      cacheProfiles(account, dynamicProfiles);
      closeModal();
      renderProfileGate(dynamicProfiles);
    } catch (err) {
      showError(err.message || 'Could not delete this profile.');
    } finally {
      elements.deleteBtn.disabled = false;
    }
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

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

      // Long-press / right-click intent is handled via the explicit edit
      // affordance instead: a small pencil shown on hover.
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

    document.getElementById('manageProfilesButton')?.addEventListener('click', () => {
      elements.profileGrid.classList.toggle('is-managing');
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
    const user = currentUser();
    if (!user) {
      window.Auth.open();
      return;
    }

    const account = accountKey(user);
    bindEvents();

    // Show cached profiles immediately (offline-friendly), then reconcile
    // with the server as the source of truth.
    dynamicProfiles = readCachedProfiles(account);
    renderProfileGate(dynamicProfiles);
    elements.profileGate.classList.remove('is-hidden');

    try {
      const serverProfiles = await API.listProfiles(account);
      dynamicProfiles = serverProfiles;
      cacheProfiles(account, serverProfiles);
    } catch {
      
    }
    renderProfileGate(dynamicProfiles);

    if (localStorage.getItem('onboarding_needed') === 'true') {
      showOnboarding();
    }
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
