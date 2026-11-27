(() => {
  const M = window.OBJECTFLIX_MEMBERSHIP;
  const { escapeHTML: esc, icon } = M;
  const grid = document.getElementById('eventGrid');
  const detail = document.getElementById('eventDetail');
  const alert = document.getElementById('movieAlert');
  let events = [];
  let filter = 'upcoming';
  let selected = null;
  let detailRequest = 0;
  const names = { newbie: 'Newbie', 'announcers-pick': "Announcer's Pick", 'fan-favorite': 'Fan Favorite', 'grand-champion': 'Grand Champion' };
  // Formats an event's Unix start or end time for the viewer's locale.
  const dateTime = (seconds) => new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  // Maps API event states to the short labels shown in the schedule.
  const statusLabel = (status) => ({ upcoming: 'Coming up', live: 'Live now', completed: 'Completed', cancelled: 'Cancelled' }[status] || status);
  // Displays or clears the Movie Nights alert banner.
  function showError(text) { alert.textContent = text; alert.classList.toggle('is-hidden', !text); }

  // Filters the loaded events and renders the schedule cards or empty state.
  function renderEvents() {
    const shown = events.filter((event) => filter === 'all' || (filter === 'upcoming' ? ['upcoming', 'live'].includes(event.status) : ['completed', 'cancelled'].includes(event.status)));
    grid.innerHTML = shown.length ? shown.map((event) => {
      const when = new Date(event.startsAt * 1000);
      return `<article class="event-card event-card--${esc(event.status)}"><div class="event-date" aria-hidden="true"><span>${esc(when.toLocaleDateString(undefined, { month: 'short' }))}</span><strong>${when.getDate()}</strong></div><div><span class="event-status event-status--${esc(event.status)}">${statusLabel(event.status)}</span>${event.earlyAnnouncement ? '<span class="event-early">Supporter first look</span>' : ''}<h2>${esc(event.title)}</h2><time class="event-time" datetime="${when.toISOString()}">${esc(dateTime(event.startsAt))}</time><p>${esc(event.description.length > 170 ? `${event.description.slice(0, 167)}…` : event.description)}</p><div class="event-card__actions"><a class="text-link" data-event-id="${esc(event.id)}" href="#${encodeURIComponent(event.id)}">Meet the night ${icon('arrow-up-right')}</a><span>PUBLIC · EVERYONE'S INVITED</span></div></div></article>`;
    }).join('') : `<div class="movie-empty">${icon('tv')}<h2>${filter === 'past' ? 'Our story is just getting started.' : 'A good night is on its way.'}</h2><p>${filter === 'past' ? 'Completed Movie Nights will have a home right here.' : 'No events are scheduled in this view yet. Check back for the next gathering.'}</p></div>`;
    grid.setAttribute('aria-busy', 'false');
  }

  // Loads the public schedule and restores event details from the URL fragment.
  async function loadEvents() {
    showError(''); grid.setAttribute('aria-busy', 'true');
    try {
      const result = await M.request('/api/movie-nights', { public: true });
      events = result.events;
      renderEvents();
      if (location.hash) await openEvent(decodeURIComponent(location.hash.slice(1)), false);
    } catch (error) {
      showError(error.message);
      grid.innerHTML = `<div class="movie-empty">${icon('tv')}<h2>A little intermission.</h2><p>The calendar is unavailable right now. Use Refresh schedule to try again.</p></div>`;
      grid.setAttribute('aria-busy', 'false');
    }
  }

  // Renders one event's playback, RSVP, poll, theme suggestion, and supporter details.
  function renderDetail(data) {
    const { event, viewer } = data;
    const open = ['upcoming', 'live'].includes(event.status);
    const login = `<a class="button button--secondary" href="${M.authLink('movie-nights.html')}">Sign in to take part</a>`;
    detail.innerHTML = `<div class="event-detail__heading"><div><span class="event-status event-status--${esc(event.status)}">${statusLabel(event.status)}</span>${viewer.supporterBadge ? '<span class="profile-supporter-badge">Movie Night supporter</span>' : ''}<h2>${esc(event.title)}</h2><time class="event-time" datetime="${new Date(event.startsAt * 1000).toISOString()}">${esc(dateTime(event.startsAt))} – ${esc(dateTime(event.endsAt))}</time></div><button class="event-detail__close" type="button" data-close-event aria-label="Close event details">×</button></div><p class="event-description">${esc(event.description)}</p>
      <div class="event-playback"><div><strong>On the screen: ${esc(event.episodeTitle)}</strong><p>${event.playbackAvailable ? 'The host has started the night. Opens in your Objectflix player.' : event.status === 'live' ? 'Playback is currently unavailable for this event.' : 'The host opens playback when the event is live.'}</p></div><div class="member-form__actions">${viewer.authenticated ? `${open ? `<button class="button button--secondary" type="button" data-event-action="${viewer.going ? 'leave' : 'rsvp'}">${viewer.going ? 'Leave RSVP list' : 'Save my spot'}</button>` : ''}${event.playbackAvailable ? `<button class="button button--primary" type="button" data-event-action="join">${icon('play')} Join the Movie Night</button>` : ''}` : open ? login : ''}</div></div>
      <p class="event-inline-status" id="eventStatusMessage" role="status">${viewer.going ? 'Your spot is saved. Glad you’re joining us.' : ''}</p>
      ${data.polls.length ? `<div class="event-polls">${data.polls.map((poll) => `<form class="poll-form" data-poll="${esc(poll.id)}"><fieldset ${poll.canVote ? '' : 'disabled'}><legend>${esc(poll.question)}</legend>${poll.options.map((option) => `<label class="poll-option"><input type="radio" name="optionId" value="${esc(option.id)}" ${poll.selectedOption === option.id ? 'checked' : ''} required /><span>${esc(option.label)}</span><span>${option.votes} vote${option.votes === 1 ? '' : 's'}</span></label>`).join('')}</fieldset><p class="poll-note">${poll.minPlan === 'newbie' ? 'Public poll · every member can take part' : `${esc(names[poll.minPlan] || poll.minPlan)} and above`}<br />Voting closes ${esc(dateTime(poll.closesAt))}</p><button class="button button--secondary" type="submit" ${poll.canVote ? '' : 'disabled'}>${poll.canVote ? poll.selectedOption ? 'Update my vote' : 'Cast my vote' : 'Voting not available'}</button><p class="poll-note" role="status"></p></form>`).join('')}</div>` : ''}
      <div class="event-suggestions"><div><h3>Themes from the clubhouse.</h3>${data.suggestions.length ? data.suggestions.map((suggestion) => `<article class="theme-suggestion"><strong>${esc(suggestion.theme)}</strong><span>${esc(suggestion.status)}</span><p>${esc(suggestion.description)}</p></article>`).join('') : '<p>No themes have been shared here yet.</p>'}</div><div>${event.canSuggestTheme ? `<form class="member-form" id="themeSuggestionForm"><h3>Got a theme in mind?</h3><label>Your theme<input name="theme" required minlength="3" maxlength="120" placeholder="A night worth getting the gang together for" /></label><label>Tell us a little more<textarea name="description" required minlength="5" maxlength="1000" rows="3" placeholder="What makes this a great Movie Night?"></textarea></label><button class="button button--secondary" type="submit">Suggest my theme ${icon('arrow-right')}</button><p class="event-inline-status" role="status"></p></form>` : '<p>Available supporter features are listed on the membership page.</p><a class="text-link" href="./membership.html">Explore Movie Night Support ↗</a>'}</div></div>
      ${data.supporters.length ? `<div class="event-supporters"><p class="eyebrow">A LITTLE THANK-YOU</p><h3>Making nights like this a little brighter.</h3><p>These supporters chose to be recognized at this event.</p><ul class="supporter-names">${data.supporters.map((supporter) => `<li>${esc(supporter.displayName)}${supporter.title ? ` · ${esc(supporter.title)}` : ''}</li>`).join('')}</ul></div>` : ''}`;
  }

  // Fetches one event's details and ignores stale responses from earlier selections.
  async function openEvent(id, focus = true) {
    const requestId = ++detailRequest;
    detail.classList.remove('is-hidden');
    detail.setAttribute('aria-busy', 'true');
    try {
      const data = await M.request(`/api/movie-nights/${encodeURIComponent(id)}`, { public: true });
      if (requestId !== detailRequest) return;
      selected = id;
      renderDetail(data);
      if (focus) { detail.scrollIntoView({ behavior: 'smooth', block: 'start' }); detail.focus({ preventScroll: true }); }
    } catch (error) {
      if (requestId !== detailRequest) return;
      detail.innerHTML = `<div class="event-detail__heading"><h2>This night is out of reach.</h2><button class="event-detail__close" type="button" data-close-event aria-label="Close event details">×</button></div><p class="event-description">${esc(error.message)}</p>`;
    } finally { if (requestId === detailRequest) detail.setAttribute('aria-busy', 'false'); }
  }

  document.addEventListener('click', async (event) => {
    const target = event.target;
    const filterButton = target.closest('[data-event-filter]');
    if (filterButton) { filter = filterButton.dataset.eventFilter; document.querySelectorAll('[data-event-filter]').forEach((button) => button.setAttribute('aria-pressed', String(button === filterButton))); renderEvents(); }
    const eventLink = target.closest('[data-event-id]');
    if (eventLink) { event.preventDefault(); history.replaceState(null, '', `#${encodeURIComponent(eventLink.dataset.eventId)}`); await openEvent(eventLink.dataset.eventId); }
    if (target.closest('[data-close-event]')) { detailRequest++; detail.classList.add('is-hidden'); history.replaceState(null, '', location.pathname); grid.querySelector('[data-event-id]')?.focus({ preventScroll: true }); selected = null; }
    const action = target.closest('[data-event-action]');
    if (!action || !selected) return;
    const id = selected;
    action.disabled = true;
    const kind = action.dataset.eventAction;
    try {
      if (kind === 'join') {
        const result = await M.request(`/api/movie-nights/${encodeURIComponent(id)}/join`, { method: 'POST' });
        const url = new URL(result.watchUrl);
        if (url.origin !== location.origin || !url.pathname.endsWith('/watch.html')) throw new Error('The player address is not configured for this site.');
        location.assign(url.href);
      } else {
        await M.request(`/api/movie-nights/${encodeURIComponent(id)}/rsvp`, { method: kind === 'leave' ? 'DELETE' : 'POST' });
        await openEvent(id, false);
      }
    } catch (error) { document.getElementById('eventStatusMessage').textContent = error.message; }
    finally { action.disabled = false; }
  });

  detail.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector('[role="status"]');
    const id = selected;
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      if (form.dataset.poll) await M.request(`/api/movie-nights/${encodeURIComponent(id)}/polls/${encodeURIComponent(form.dataset.poll)}/vote`, { method: 'PUT', body: data });
      else if (form.id === 'themeSuggestionForm') await M.request(`/api/movie-nights/${encodeURIComponent(id)}/suggestions`, { method: 'POST', body: data });
      await openEvent(id, false);
      document.getElementById('eventStatusMessage').textContent = form.dataset.poll ? 'Your vote is in. Thanks for joining in!' : 'Your theme is with the hosts for review. Thank you!';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });

  document.getElementById('refreshEvents').addEventListener('click', loadEvents);
  document.getElementById('movieTimezone').textContent = `Times shown in ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`;
  M.load().then((account) => document.getElementById('hostMovieNight').classList.toggle('is-hidden', !account?.isStaff)).catch(() => {});
  window.addEventListener('hashchange', () => { if (location.hash) void openEvent(decodeURIComponent(location.hash.slice(1))); });
  void loadEvents();
})();
