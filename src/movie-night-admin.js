(() => {
  const M = window.OBJECTFLIX_MEMBERSHIP;
  const esc = M.escapeHTML;
  const prefix = '/api/movie-night-admin';
  let rights = [];
  let events = [];
  let editingId = null;
  // Formats a Unix timestamp for the host desk's event and permission lists.
  const date = (value) => new Date(value * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  // Converts a form date value to Unix seconds, rejecting invalid input.
  const seconds = (value) => { const result = new Date(value).getTime() / 1000; if (!Number.isFinite(result)) throw new Error('Please enter a valid date and time.'); return Math.floor(result); };
  // Converts Unix seconds into the local date-time format used by form inputs.
  const localDate = (seconds) => { const date = new Date(seconds * 1000); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const alert = document.getElementById('hostAlert');
  // Displays an admin operation error in the host alert banner.
  function errorMessage(error) { alert.textContent = error.message; alert.classList.remove('is-hidden'); }

  // Fetches host data and rebuilds the permission, event, poll, and suggestion lists.
  async function loadDesk() {
    const [permissions, schedule, themes] = await Promise.all([M.request(`${prefix}/rights`), M.request(`${prefix}/events`), M.request(`${prefix}/suggestions`)]);
    rights = permissions.rights;
    events = schedule.events;
    const selectedRights = document.getElementById('eventRights').value;
    document.getElementById('eventRights').innerHTML = '<option value="">Choose a permission record</option>' + rights.map((right) => `<option value="${esc(right.id)}">${esc(right.episode_title)} · ${right.revoked_at ? 'REVOKED' : `until ${esc(date(right.valid_until))}`}</option>`).join('');
    document.getElementById('eventRights').value = selectedRights;
    document.getElementById('pollEvent').innerHTML = '<option value="">Choose a Movie Night</option>' + events.filter((event) => ['upcoming', 'live'].includes(event.status)).map((event) => `<option value="${esc(event.id)}">${esc(event.title)}</option>`).join('');
    document.getElementById('rightsList').innerHTML = rights.length ? rights.map((right) => `<article class="host-record"><div><h3>${esc(right.episode_title)}</h3><p>${esc(right.rights_holder)} · ${esc(date(right.valid_from))} – ${esc(date(right.valid_until))}</p><p>${esc(right.permission_reference)}</p><code>${esc(right.id)}</code></div>${right.revoked_at ? '<span class="event-status event-status--cancelled">Revoked</span>' : `<button class="button button--secondary" type="button" data-revoke-rights="${esc(right.id)}">Revoke permission</button>`}</article>`).join('') : '<p class="host-small-status">No streaming permissions recorded yet.</p>';
    document.getElementById('hostEventList').innerHTML = events.length ? events.map((event) => `<article class="host-record"><div><span class="event-status event-status--${esc(event.status)}">${esc(event.status)}</span><h3>${esc(event.title)}</h3><p>${esc(date(event.starts_at))} – ${esc(date(event.ends_at))}</p><code>${esc(event.id)}</code></div><div class="member-form__actions"><button class="button button--secondary" type="button" data-edit-event="${esc(event.id)}">Edit event</button>${event.announce_at * 1000 <= Date.now() ? `<a class="text-link" href="./movie-nights.html#${encodeURIComponent(event.id)}">View event ↗</a>` : ''}</div></article>`).join('') : '<p class="host-small-status">Create your first Movie Night above.</p>';
    document.getElementById('hostSuggestions').innerHTML = themes.suggestions.length ? themes.suggestions.map((suggestion) => `<article class="host-record"><div><span class="host-small-status">${esc(suggestion.event_title)} · ${esc(suggestion.status)}</span><h3>${esc(suggestion.theme)}</h3><p>${esc(suggestion.description)}</p></div><div class="member-form__actions"><button class="button button--secondary" type="button" data-suggestion-id="${esc(suggestion.id)}" data-suggestion-status="approved" ${suggestion.status === 'approved' ? 'disabled' : ''}>Approve</button><button class="button button--ghost" type="button" data-suggestion-id="${esc(suggestion.id)}" data-suggestion-status="declined" ${suggestion.status === 'declined' ? 'disabled' : ''}>Decline</button></div></article>`).join('') : '<p class="host-small-status">Community suggestions will arrive here.</p>';
  }

  // Runs a form operation while showing its result and preventing duplicate submissions.
  async function submitForm(event, operation) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const status = form.querySelector('[role="status"]');
    submit.disabled = true; status.textContent = 'Saving…';
    try { await operation(new FormData(form), form); status.textContent = 'Saved. The clubhouse is up to date.'; }
    catch (error) { status.textContent = error.message; }
    finally { submit.disabled = false; }
  }

  document.getElementById('episodeSearchForm').addEventListener('submit', (event) => submitForm(event, async (data) => {
    const response = await M.request(`${prefix}/episodes?q=${encodeURIComponent(data.get('query'))}`);
    document.getElementById('rightsEpisode').innerHTML = '<option value="">Choose a catalog episode</option>' + response.episodes.map((episode) => `<option value="${esc(episode.id)}">${esc(episode.show_title)} — ${esc(episode.title)}</option>`).join('');
    if (!response.episodes.length) throw new Error('No matching episodes with a stream were found.');
  }));
  document.getElementById('rightsForm').addEventListener('submit', (event) => submitForm(event, async (data, form) => {
    await M.request(`${prefix}/rights`, { method: 'POST', body: { episodeId: data.get('episodeId'), rightsHolder: data.get('rightsHolder'), permissionReference: data.get('permissionReference'), validFrom: seconds(data.get('validFrom')), validUntil: seconds(data.get('validUntil')), permissionVerified: data.has('permissionVerified') } });
    form.reset(); await loadDesk();
  }));
  document.getElementById('eventForm').addEventListener('submit', (event) => submitForm(event, async (data) => {
    const permission = rights.find((right) => right.id === data.get('rightsId'));
    if (!permission) throw new Error('Choose a recorded streaming permission.');
    const body = { title: data.get('title'), description: data.get('description'), status: data.get('status'), rightsId: permission.id, episodeId: permission.episode_id,
      startsAt: seconds(data.get('startsAt')), endsAt: seconds(data.get('endsAt')), announceAt: seconds(data.get('announceAt')), priorityAnnounceAt: seconds(data.get('priorityAnnounceAt') || data.get('announceAt')) };
    const saved = await M.request(`${prefix}/events${editingId ? `/${encodeURIComponent(editingId)}` : ''}`, { method: editingId ? 'PUT' : 'POST', body });
    if (!editingId) {
      editingId = saved.id;
      document.getElementById('eventEditorTitle').textContent = 'Edit the scene.';
      document.getElementById('saveEventButton').textContent = 'Save event changes';
    }
    await loadDesk();
  }));
  document.getElementById('pollForm').addEventListener('submit', (event) => submitForm(event, async (data, form) => {
    const options = data.get('options').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 8 || new Set(options).size !== options.length) throw new Error('Enter 2–8 distinct poll options, one per line.');
    await M.request(`${prefix}/events/${encodeURIComponent(data.get('eventId'))}/polls`, { method: 'POST', body: { question: data.get('question'), minPlan: data.get('minPlan'), opensAt: seconds(data.get('opensAt')), closesAt: seconds(data.get('closesAt')), options } });
    form.reset();
  }));
  document.getElementById('resetEventEditor').addEventListener('click', () => { editingId = null; document.getElementById('eventForm').reset(); document.getElementById('eventEditorTitle').textContent = '2. Set the scene.'; document.getElementById('saveEventButton').textContent = 'Create Movie Night'; });
  document.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-event]');
    if (edit) {
      const record = events.find((item) => item.id === edit.dataset.editEvent);
      if (!record) return;
      editingId = record.id;
      const form = document.getElementById('eventForm');
      for (const [field, column] of [['title', 'title'], ['description', 'description'], ['status', 'status'], ['rightsId', 'rights_id']]) form.elements[field].value = record[column];
      for (const [field, column] of [['startsAt', 'starts_at'], ['endsAt', 'ends_at'], ['announceAt', 'announce_at'], ['priorityAnnounceAt', 'priority_announce_at']]) form.elements[field].value = localDate(record[column]);
      document.getElementById('eventEditorTitle').textContent = 'Edit the scene.';
      document.getElementById('saveEventButton').textContent = 'Save event changes';
      form.scrollIntoView({ behavior: 'smooth', block: 'center' }); form.elements.title.focus({ preventScroll: true });
    }
    const action = event.target.closest('[data-revoke-rights], [data-suggestion-id]');
    if (!action) return;
    action.disabled = true;
    try {
      if (action.dataset.revokeRights) await M.request(`${prefix}/rights/${encodeURIComponent(action.dataset.revokeRights)}/revoke`, { method: 'POST' });
      else await M.request(`${prefix}/suggestions/${encodeURIComponent(action.dataset.suggestionId)}`, { method: 'PATCH', body: { status: action.dataset.suggestionStatus } });
      await loadDesk();
    } catch (error) { errorMessage(error); }
    finally { action.disabled = false; }
  });

  M.load().then(async (account) => {
    if (!account?.isStaff) {
      document.getElementById('hostAccess').innerHTML = `This desk is for authorized Movie Night hosts. <a class="text-link" href="${M.authLink('movie-night-admin.html')}">Sign in with your staff account ↗</a>`;
      return;
    }
    document.getElementById('hostAccess').textContent = `Welcome, ${account.user.displayName}. You’re signed in as a Movie Night host.`;
    await loadDesk(); document.getElementById('hostWorkspace').classList.remove('is-hidden');
  }).catch((error) => { document.getElementById('hostAccess').textContent = error.message; });
})();
