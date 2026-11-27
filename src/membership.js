// Objectflix: this is the membership part, kept here so the rest of the app knows exactly where to look.
(() => {
  const M = window.OBJECTFLIX_MEMBERSHIP;
  const { escapeHTML: esc, icon } = M;
  const elements = Object.fromEntries(['membershipAlert', 'membershipReturn', 'membershipCurrent', 'planGrid', 'featureComparison', 'plannedPerksList', 'memberWorkspace', 'cosmeticsOptions', 'cosmeticsChecks'].map((id) => [id, document.getElementById(id)]));
  const placeholders = [
    { id: 'newbie', name: 'Newbie', free: true }, { id: 'announcers-pick', name: "Announcer's Pick" },
    { id: 'fan-favorite', name: 'Fan Favorite' }, { id: 'grand-champion', name: 'Grand Champion' },
  ];
  let catalog = null;
  let account = null;
  let busy = false;
  let refreshTimer;
  const date = (seconds) => seconds ? new Date(seconds * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Not scheduled';

  function message(text) {
    elements.membershipAlert.textContent = text;
    elements.membershipAlert.classList.toggle('is-hidden', !text);
  }

  function renderPlans() {
    const plans = catalog?.plans || placeholders;
    elements.planGrid.innerHTML = plans.map((plan, index) => {
      const member = account?.membership;
      const current = member?.planId === plan.id;
      const existing = member?.billing.hasSubscription;
      const manage = existing && member.billing.subscribedPlanId === plan.id;
      let action;
      if (manage && !plan.free) action = `<button class="button button--ink" data-billing="portal" type="button">Manage membership ${icon('arrow-up-right')}</button>`;
      else if (plan.free && existing) action = `<button class="button button--secondary" data-billing="portal" data-plan="newbie" type="button">Return to Newbie</button>`;
      else if (current) action = '<button class="button button--secondary" disabled type="button">Your current membership</button>';
      else if (plan.free) action = '<a class="button button--secondary" href="./index.html">Make yourself at home</a>';
      else if (!plan.checkoutAvailable) action = '<button class="button button--secondary" disabled type="button">Pricing not set yet</button>';
      else if (!account) action = `<a class="button button--primary" href="${M.authLink()}" target="_top">Sign in to join ${icon('arrow-right')}</a>`;
      else action = `<button class="button button--primary" type="button" data-billing="${existing ? 'portal' : 'checkout'}" data-plan="${esc(plan.id)}">${existing ? 'Switch to this plan' : 'Choose this membership'} ${icon('arrow-right')}</button>`;
      const previous = plans[index - 1];
      const perks = (catalog?.perks || []).filter((perk) => perk.enabled && perk.implemented && plan.entitlements?.[perk.id] && (!previous || !previous.entitlements?.[perk.id]));
      return `<article class="plan-card plan-card--${esc(plan.id)} ${current ? 'plan-card--current' : ''}"><div class="plan-card__top"><span class="plan-character" aria-hidden="true">${['◡', '✳', '♡', '✦'][index]}</span><span class="plan-card__number">0${index + 1}</span>${current ? '<span class="current-plan-label">YOUR MEMBERSHIP</span>' : ''}</div><h3>${esc(plan.name)}</h3><p class="plan-description">${esc(plan.description || 'A place in the Objectflix clubhouse.')}</p><div class="plan-price ${!plan.free && !plan.price ? 'plan-price--pending' : ''}"><strong>${plan.free ? 'Free' : plan.price ? esc(M.priceLabel(plan.price)) : 'To be announced'}</strong><span>${plan.free ? 'a place for everyone' : 'per month'}</span></div>${action}<div class="plan-includes">${index ? `<p>Everything enabled in <strong>${esc(previous.name)}</strong>, plus:</p>` : '<p>Your little corner of the universe:</p>'}<ul>${catalog ? perks.map((perk) => `<li>${icon('check')}<span>${esc(perk.label)}</span></li>`).join('') || '<li>See the feature comparison below.</li>' : '<li>Current benefits will appear when the membership service is connected.</li>'}</ul></div></article>`;
    }).join('');
    elements.planGrid.setAttribute('aria-busy', 'false');
    if (busy) elements.planGrid.querySelectorAll('[data-billing]').forEach((button) => { button.disabled = true; });
  }

  function renderComparison() {
    if (!catalog) {
      elements.featureComparison.innerHTML = '<p class="member-loading">The feature comparison is temporarily unavailable. <button class="text-link" data-refresh type="button">Try again ↗</button></p>';
      document.getElementById('plannedPerks').classList.add('is-hidden');
      return;
    }
    const shipped = catalog.perks.filter((perk) => perk.implemented && perk.enabled);
    elements.featureComparison.innerHTML = `<table class="feature-table"><caption class="sr-only">Currently enabled membership benefits</caption><thead><tr><th scope="col">A little more to love</th>${catalog.plans.map((plan) => `<th scope="col">${esc(plan.name)}</th>`).join('')}</tr></thead><tbody>${shipped.map((perk) => `<tr><th scope="row">${esc(perk.label)}</th>${catalog.plans.map((plan) => `<td>${plan.entitlements[perk.id] ? `<span class="feature-included">${icon('check')}<span class="sr-only">Included</span></span>` : '<span aria-label="Not included">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    document.getElementById('plannedPerks').classList.remove('is-hidden');
    elements.plannedPerksList.innerHTML = catalog.plans.filter((plan) => !plan.free).map((plan) => `<div><h3>${esc(plan.name)}</h3><ul>${catalog.perks.filter((perk) => !perk.implemented && perk.minPlan === plan.id).map((perk) => `<li>${esc(perk.label)} <span>Proposed</span></li>`).join('')}</ul></div>`).join('');
  }

  function renderAccount() {
    const member = account?.membership;
    if (!member) {
      elements.membershipCurrent.innerHTML = `<div><span class="eyebrow">YOUR PLACE IN THE CLUBHOUSE</span><h2>Already one of the gang?</h2><p>Sign in with a verified account to see your current membership and manage billing.</p></div><a class="button button--ink" href="${M.authLink()}" target="_top">View my membership ${icon('arrow-right')}</a>`;
      elements.memberWorkspace.classList.add('is-hidden');
    } else {
      const billing = member.billing;
      const status = member.status.replace(/_/g, ' ');
      let detail = member.status === 'free' ? 'Free to watch. Free to be part of it.' : `Billing status: ${status}.`;
      if (billing.cancelAtPeriodEnd) detail += ` Cancellation scheduled${billing.cancelAt || billing.periodEnd ? ` for ${date(billing.cancelAt || billing.periodEnd)}` : ''}.`;
      else if (billing.hasSubscription && billing.periodEnd) detail += ` Current billing period ends ${date(billing.periodEnd)}.`;
      if (member.planId === 'newbie' && billing.hasSubscription) detail += ' Paid perks are waiting for a verified, current payment.';
      elements.membershipCurrent.innerHTML = `<div><p class="eyebrow">YOUR CURRENT ACCESS</p><h2>${esc(member.planName)} <span class="membership-status">${esc(member.status)}</span></h2><p>${esc(detail)}</p></div><div class="member-form__actions">${billing.hasCustomer ? `<button class="button button--ink" data-billing="portal" type="button">Manage billing ${icon('arrow-up-right')}</button>` : ''}<button class="text-link" data-refresh type="button">Refresh status ↻</button></div>`;
      renderWardrobe();
    }
    elements.membershipCurrent.setAttribute('aria-busy', 'false');
    document.getElementById('movieAdminLink').classList.toggle('is-hidden', !account?.isStaff);
    document.getElementById('featureSuggestionSection').classList.toggle('is-hidden', !member?.entitlements.feature_suggestions);
  }

  function renderWardrobe() {
    const member = account.membership;
    const prefs = member.preferences;
    elements.memberWorkspace.classList.remove('is-hidden');
    document.getElementById('memberAvatarLetter').textContent = account.user.displayName.slice(0, 1).toUpperCase();
    document.getElementById('memberPreviewName').textContent = account.user.displayName;
    document.getElementById('memberPreviewTitle').textContent = prefs.showTitle || prefs.showBadge ? member.planName : '';
    elements.cosmeticsOptions.innerHTML = [['frames', 'frame', 'Profile frame'], ['themes', 'theme', 'Color theme'], ['decorations', 'decoration', 'A little decoration']].map(([group, field, label]) => `<label>${label}<select name="${field}">${account.cosmetics[group].map((option) => `<option value="${esc(option.id)}" ${prefs[field] === option.id ? 'selected' : ''} ${option.available ? '' : 'disabled'}>${esc(option.label)}${option.available ? '' : ' · not in this plan'}</option>`).join('')}</select></label>`).join('');
    elements.cosmeticsChecks.innerHTML = [['showBadge', 'supporter_badge', 'Show my supporter badge'], ['showTitle', 'supporter_title', 'Show my Grand Champion title'], ['recognitionOptIn', 'movie_recognition', 'Recognize me by display name at Movie Nights I join']].map(([field, perk, label]) => `<label class="member-checkbox"><input type="checkbox" name="${field}" ${prefs[field] ? 'checked' : ''} ${member.entitlements[perk] ? '' : 'disabled'} /><span>${label}${member.entitlements[perk] ? '' : ' (not in this plan)'}</span></label>`).join('');
    M.applyAppearance();
  }

  async function refresh() {
    message('');
    const [plans, member] = await Promise.allSettled([M.request('/api/membership/plans', { public: true }), M.load(true)]);
    if (plans.status === 'fulfilled') catalog = plans.value;
    else { catalog = null; message(plans.reason.message); }
    if (member.status === 'fulfilled') account = member.value;
    else { account = null; message(member.reason.message); }
    renderAccount(); renderPlans(); renderComparison();
  }

  async function confirmReturn(attempt = 0) {
    await refresh();
    const member = account?.membership;
    if (member && member.planId !== 'newbie' && member.status === 'active') {
      elements.membershipReturn.textContent = `Your verified membership is ${member.planName}. Thanks for being part of the clubhouse.`;
      return;
    }
    if (attempt < 9 && M.session()) refreshTimer = setTimeout(() => confirmReturn(attempt + 1), 3000);
    else elements.membershipReturn.textContent = 'Your account shows the latest verified status. Delayed payments can take longer; use Refresh status to check again.';
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-billing], [data-refresh]');
    if (!button || busy) return;
    if (button.hasAttribute('data-refresh')) { await refresh(); return; }
    busy = true; message('');
    document.querySelectorAll('[data-billing]').forEach((item) => { item.disabled = true; });
    try { await M.billing(button.dataset.billing, button.dataset.plan); }
    catch (error) { message(error.message); elements.membershipAlert.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    finally { busy = false; renderPlans(); renderAccount(); }
  });

  document.getElementById('cosmeticsForm').addEventListener('change', (event) => {
    const field = event.target.name;
    if (!['frame', 'theme', 'decoration'].includes(field)) return;
    document.getElementById('memberAvatarPreview').dataset[`member${field[0].toUpperCase()}${field.slice(1)}`] = event.target.value;
  });
  document.getElementById('cosmeticsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    const status = document.getElementById('cosmeticsStatus');
    submit.disabled = true; status.textContent = 'Saving your style…';
    try {
      await M.request('/api/membership/preferences', { method: 'PUT', body: { frame: data.get('frame'), theme: data.get('theme'), decoration: data.get('decoration'), showBadge: data.has('showBadge'), showTitle: data.has('showTitle'), recognitionOptIn: data.has('recognitionOptIn') } });
      account = await M.load(true); renderWardrobe(); status.textContent = 'A little more you. Saved!';
    } catch (error) { status.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  document.getElementById('featureSuggestionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    const status = document.getElementById('featureSuggestionStatus');
    button.disabled = true;
    try { await M.request('/api/membership/feature-suggestions', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); form.reset(); status.textContent = 'Your idea is with the team. Thank you!'; }
    catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  window.addEventListener('pagehide', () => clearTimeout(refreshTimer));
  renderPlans();
  const returned = new URLSearchParams(window.location.search);
  if (returned.get('checkout') === 'returned') {
    elements.membershipReturn.classList.remove('is-hidden');
    elements.membershipReturn.textContent = 'Welcome back. Checking the latest verified Stripe status…';
    void confirmReturn();
  } else {
    if (returned.get('checkout') === 'cancelled') { elements.membershipReturn.classList.remove('is-hidden'); elements.membershipReturn.textContent = 'Checkout was closed. You can keep exploring and choose a membership whenever you like.'; }
    void refresh();
  }
})();
