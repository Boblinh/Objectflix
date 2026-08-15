// src/gate.js
// Entry page logic for index.html: auth gate + "Who's watching?" profiles.
// Load this classic script AFTER data.js (needs window.OBJECTFLIX_DATA).
(() => {
  const data = window.OBJECTFLIX_DATA || { profiles: [] };
  const profiles = data.profiles;

  const elements = {
    profileGate: document.getElementById('profileGate'),
    profileGrid: document.getElementById('profileGrid'),
  };

  let dynamicProfiles = [];

  function currentUser() {
    return JSON.parse(localStorage.getItem('objectflix_current_user') || 'null');
  }

  function renderProfileGate(profilesToRender) {
    elements.profileGrid.innerHTML = `${profilesToRender.map(renderProfileCard).join('')}
      <button class="add-profile" type="button" id="addProfileBtn" aria-label="Add profile">
        <div class="profile-avatar">+</div>
        <div class="profile-name">Add Profile</div>
      </button>`;

    document.getElementById('addProfileBtn').addEventListener('click', addProfile);
  }

  function renderProfileCard(profile) {
    return `
      <button class="profile-card" type="button" data-profile-id="${profile.id}" aria-label="Choose profile ${profile.name}">
        <div class="profile-avatar ${profile.className}">${profile.avatar}</div>
        <div class="profile-name">${profile.name}</div>
      </button>
    `;
  }

  function selectProfile(profileId) {
    const profile = dynamicProfiles.find((p) => p.id === profileId) || dynamicProfiles[0];
    if (!profile) return;
    try {
      sessionStorage.setItem('objectflix_active_profile', JSON.stringify(profile));
    } catch {
      // sessionStorage unavailable — ignore
    }
    window.location.href = 'browse.html';
  }

  function addProfile() {
    const name = prompt('Enter profile name:');
    if (!name) return;
    const user = currentUser();
    if (!user) return;

    let userProfiles = JSON.parse(localStorage.getItem(`objectflix_profiles_${user.email}`) || 'null') || [];
    const newProfile = {
      id: 'p' + (userProfiles.length + 1),
      name: name,
      avatar: name[0].toUpperCase(),
      className: 'profile-avatar--gradient-a', // Default
    };

    userProfiles.push(newProfile);
    localStorage.setItem(`objectflix_profiles_${user.email}`, JSON.stringify(userProfiles));
    dynamicProfiles = userProfiles;
    renderProfileGate(userProfiles);
  }

  function showOnboarding() {
    const modal = document.getElementById('onboardingModal');
    modal.classList.remove('is-hidden');
    document.getElementById('closeOnboardingBtn').addEventListener('click', () => {
      modal.classList.add('is-hidden');
      localStorage.removeItem('onboarding_needed');
    });
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const profileButton = target.closest('[data-profile-id]');
      if (profileButton) {
        selectProfile(profileButton.dataset.profileId);
      }
    });
  }

  function init() {
    const user = currentUser();
    if (!user) {
      window.Auth.open();
      return;
    }

    let userProfiles = JSON.parse(localStorage.getItem(`objectflix_profiles_${user.email}`) || 'null');
    if (!userProfiles) {
      userProfiles = profiles;
      localStorage.setItem(`objectflix_profiles_${user.email}`, JSON.stringify(userProfiles));
    }
    dynamicProfiles = userProfiles;

    renderProfileGate(userProfiles);
    bindEvents();
    elements.profileGate.classList.remove('is-hidden');

    if (localStorage.getItem('onboarding_needed') === 'true') {
      showOnboarding();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
