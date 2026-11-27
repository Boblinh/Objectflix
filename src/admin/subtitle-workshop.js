(() => {
  const M = window.OBJECTFLIX_MEMBERSHIP;
  const endpoints = window.OBJECTFLIX_CONFIG.endpoints;
  const list = document.getElementById('subtitleAdminList');
  const status = document.getElementById('subtitleAdminStatus');
  const queue = document.getElementById('subtitleAdminQueue');
  const preview = document.getElementById('subtitlePreview');
  const escape = M.escapeHTML;
  let activeQueue = 'reports';
  let reports = [];
  let submissions = [];

  // Displays a moderation status message and applies its visual state.
  function setStatus(message, state = '') {
    status.innerHTML = message;
    status.dataset.state = state;
  }

  // Converts a Unix timestamp in seconds to local time, using “Just now” when absent.
  function date(seconds) {
    return seconds ? new Date(seconds * 1000).toLocaleString() : 'Just now';
  }

  // Renders the current subtitle issue reports and their available review actions.
  function renderReports() {
    document.getElementById('reportQueueCount').textContent = String(reports.filter((row) => row.status === 'open').length);
    if (!reports.length) {
      list.innerHTML = '<div class="subtitle-admin-empty">No subtitle notes in this queue. The tracks are behaving themselves.</div>';
      return;
    }
    list.innerHTML = reports.map((row) => `<article class="subtitle-admin-card" data-record-id="${escape(row.id)}">
      <div class="subtitle-admin-card__top"><div><div class="subtitle-admin-card__meta">${escape(row.showTitle)} · ${escape(row.episodeTitle)} · ${date(row.createdAt)}</div><h2>${escape(({ typo: 'Typo or translation', timing: 'Timing issue', missing: 'Missing line', other: 'Other note' })[row.kind] || row.kind)}</h2></div><span class="subtitle-admin-pill">${escape(row.status)}</span></div>
      <p>${escape(row.details)}</p>
      ${row.timeSeconds !== null && row.timeSeconds !== undefined ? `<p><strong>At ${Math.floor(row.timeSeconds / 60)}:${String(row.timeSeconds % 60).padStart(2, '0')}</strong>${row.direction ? ` · subtitles appear too ${escape(row.direction)}` : ''}</p>` : ''}
      ${row.correctedText ? `<p><strong>Suggested text:</strong> ${escape(row.correctedText)}</p>` : ''}
      <p class="subtitle-admin-card__meta">Track: ${escape(row.subtitleId || 'not specified')} · From ${escape(row.reporter)}</p>
      ${row.status === 'open' ? `<textarea data-resolution placeholder="Optional note about the fix or next step"></textarea><div class="subtitle-admin-actions"><button type="button" data-report-id="${escape(row.id)}" data-review="resolved">Mark resolved</button><button type="button" data-report-id="${escape(row.id)}" data-review="rejected">Dismiss</button></div>` : row.resolution ? `<p><strong>Admin note:</strong> ${escape(row.resolution)}</p>` : ''}
    </article>`).join('');
  }

  // Renders pending fan subtitle submissions with preview and moderation controls.
  function renderSubmissions() {
    document.getElementById('submissionQueueCount').textContent = String(submissions.filter((row) => row.status === 'pending').length);
    if (!submissions.length) {
      list.innerHTML = '<div class="subtitle-admin-empty">No fan-made subtitle tracks waiting for review. Nice and quiet in here.</div>';
      return;
    }
    list.innerHTML = submissions.map((row) => `<article class="subtitle-admin-card" data-record-id="${escape(row.id)}">
      <div class="subtitle-admin-card__top"><div><div class="subtitle-admin-card__meta">${escape(row.showTitle)} · ${escape(row.episodeTitle)} · ${date(row.createdAt)}</div><h2>${escape(row.language.toUpperCase())} track · ${escape(row.format.toUpperCase())}</h2></div><span class="subtitle-admin-pill">${escape(row.status)}</span></div>
      <p>Submitted by <strong>${escape(row.contributor)}</strong>. Attribution: <strong>${escape(row.attribution)}</strong>.</p>
      <p class="subtitle-admin-card__meta">Creator permission confirmed · ${escape(row.id)}</p>
      ${row.status === 'pending' ? `<textarea data-review-note placeholder="Optional note for the contributor"></textarea><div class="subtitle-admin-actions"><button type="button" data-preview-id="${escape(row.id)}">Preview subtitle file</button><button type="button" data-submission-id="${escape(row.id)}" data-review="approved">Approve &amp; add to episode</button><button type="button" data-submission-id="${escape(row.id)}" data-review="rejected">Reject</button></div>` : row.reviewNote ? `<p><strong>Review note:</strong> ${escape(row.reviewNote)}</p>` : ''}
    </article>`).join('');
  }

  // Updates queue-tab selection and displays the currently selected moderation queue.
  function render() {
    document.querySelectorAll('[data-queue]').forEach((button) => {
      const active = button.dataset.queue === activeQueue;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    if (activeQueue === 'reports') renderReports();
    else renderSubmissions();
  }

  // Loads open reports and pending submissions, then shows the right queue or access error.
  async function load() {
    setStatus('Loading the moderation queue…');
    try {
      const [reportData, submissionData] = await Promise.all([
        M.request(`${endpoints.subtitleAdminReports}?status=open`),
        M.request(`${endpoints.subtitleAdminSubmissions}?status=pending`),
      ]);
      reports = reportData.reports || [];
      submissions = submissionData.submissions || [];
      status.textContent = '';
      queue.classList.remove('is-hidden');
      render();
    } catch (error) {
      if (error.status === 401) {
        setStatus(`Sign in with your verified admin account to review community subtitles. <a href="${M.authLink('subtitle-workshop-admin.html')}">Sign in ↗</a>`, 'error');
      } else if (error.status === 403) {
        setStatus('This account is not authorized to moderate subtitle submissions.', 'error');
      } else {
        setStatus(`${escape(error.message || 'The moderation queue could not be loaded.')} <button type="button" data-reload>Try again</button>`, 'error');
      }
    }
  }

  // Saves a report resolution or submission decision, then reloads both moderation queues.
  async function review(type, id, decision, note) {
    const endpoint = type === 'report'
      ? `${endpoints.subtitleAdminReports}/${encodeURIComponent(id)}`
      : `${endpoints.subtitleAdminSubmissions}/${encodeURIComponent(id)}`;
    const body = type === 'report' ? { status: decision, resolution: note } : { status: decision, reviewNote: note };
    try {
      await M.request(endpoint, { method: 'PATCH', body });
      await load();
    } catch (error) {
      setStatus(escape(error.message || 'Could not save the review decision.'), 'error');
    }
  }

  // Fetches a submission's text and opens it in the read-only subtitle preview panel.
  async function showPreview(id) {
    try {
      const data = await M.request(`${endpoints.subtitleAdminSubmissions}/${encodeURIComponent(id)}/content`);
      const record = submissions.find((row) => row.id === id);
      document.getElementById('subtitlePreviewTitle').textContent = `${record?.showTitle || 'Episode'} · ${record?.language?.toUpperCase() || ''}.${data.format}`;
      document.getElementById('subtitlePreviewMeta').textContent = `Submitted by ${record?.contributor || 'viewer'} · credit: ${record?.attribution || 'not provided'}`;
      document.getElementById('subtitlePreviewContent').textContent = data.content;
      preview.classList.remove('is-hidden');
      document.querySelector('[data-close-preview]')?.focus();
    } catch (error) {
      setStatus(escape(error.message || 'Could not open this subtitle preview.'), 'error');
    }
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.queue) { activeQueue = target.dataset.queue; render(); return; }
    if (target.hasAttribute('data-reload')) { void load(); return; }
    if (target.hasAttribute('data-close-preview')) { preview.classList.add('is-hidden'); return; }
    if (target.dataset.previewId) { void showPreview(target.dataset.previewId); return; }
    if (target.dataset.reportId) {
      const card = target.closest('[data-record-id]');
      const note = card?.querySelector('[data-resolution]')?.value?.trim() || '';
      void review('report', target.dataset.reportId, target.dataset.review, note);
      return;
    }
    if (target.dataset.submissionId) {
      const card = target.closest('[data-record-id]');
      const note = card?.querySelector('[data-review-note]')?.value?.trim() || '';
      void review('submission', target.dataset.submissionId, target.dataset.review, note);
    }
  });

  void load();
})();
