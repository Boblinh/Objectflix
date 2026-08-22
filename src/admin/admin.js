(() => {
  const ADMIN = window.OBJECTFLIX_ADMIN;
  const B2 = window.OBJECTFLIX_B2;
  const SHARED = window.OBJECTFLIX_SHARED;
  const CONFIG = window.OBJECTFLIX_CONFIG;
  const API = window.OBJECTFLIX_API;

  const SETTINGS = window.OBJECTFLIX_SETTINGS || null;
  const SETTINGS_STORAGE_KEY = CONFIG?.admin?.settingsKey || "objectflix_admin_settings";
  const SETTINGS_DEFAULTS = {
    defaultAssistant: "firey",
    conversationContext: 8,
    argEnabled: true,
    defaultBucket: "objectflix-videos",
  };

  function settingsAll() {
    if (SETTINGS && typeof SETTINGS.getAll === "function") return SETTINGS.getAll();
    const merged = { ...SETTINGS_DEFAULTS };
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
      for (const key in saved) {
        if (key in merged) merged[key] = saved[key];
      }
    } catch {
      
    }
    return merged;
  }

  function settingsGet(key, fallback) {
    const all = settingsAll();
    return all[key] !== undefined ? all[key] : fallback;
  }

  function settingsSet(key, value) {
    if (SETTINGS && typeof SETTINGS.set === "function") {
      settingsSet(key, value);
      return;
    }
    const all = settingsAll();
    all[key] = value;
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(all));
    } catch {
      
    }
  }

  const VIEW_PERMISSION = {
    dashboard: "dashboard.view",
    shows: "shows.manage",
    episodes: "episodes.manage",
    upload: "media.upload",
    queue: "media.queue",
    storage: "storage.manage",
    users: "users.manage",
    assistants: "assistants.configure",
    settings: "settings.manage",
  };

  const VIEWS = {
    dashboard: { title: "Dashboard", render: renderDashboard },
    shows: { title: "Shows", render: renderShows },
    episodes: { title: "Episodes", render: renderEpisodes },
    upload: { title: "Upload", render: renderUpload },
    queue: { title: "Upload Queue", render: renderQueue },
    storage: { title: "Storage", render: renderStorage },
    users: { title: "Users", render: renderUsers },
    assistants: { title: "Assistants", render: renderAssistants },
    settings: { title: "Settings", render: renderSettings },
  };

  let session = null;
  let rawCatalog = null;
  let activeView = "dashboard";
  let episodeViewShowId = null;
  let queuePollTimer = null;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[ch]);
  }

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function timeAgo(ts) {
    if (!ts) return "";
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return day < 7 ? `${day}d ago` : new Date(ts).toLocaleDateString();
  }

  function fmtDate(ts) {
    return ts ? new Date(ts).toLocaleString() : "";
  }

  function formatBytes(bytes) {
    if (!bytes) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function configuredBucketName(preferred) {
    const buckets = CONFIG.b2.buckets || [];
    if (preferred && buckets.some((b) => b.name === preferred)) return preferred;
    const def = buckets.find((b) => b.default) || buckets[0];
    return def?.name || preferred || "";
  }

  function getPatches() {
    return SHARED.loadCatalogPatches() || {};
  }

  function mergePatches(patchFragment) {
    const current = getPatches();
    for (const key of ["removedShows", "updatedShows", "removedEpisodes", "updatedEpisodes"]) {
      if (patchFragment[key]) current[key] = { ...(current[key] || {}), ...patchFragment[key] };
    }
    for (const key of ["addedShows", "addedEpisodes"]) {
      if (patchFragment[key]) {
        const existing = current[key] || [];
        for (const item of patchFragment[key]) {
          if (!existing.some((entry) => entry.id === item.id)) existing.push(item);
        }
        current[key] = existing;
      }
    }
    SHARED.saveCatalogPatches(current);
    return current;
  }

  async function loadRawCatalog() {
    const shows = await API.listShows();
    const raw = { shows: [] };
    for (const show of shows) {
      const seasons = await API.getShowSeasons(show.id);
      const episodes = [];
      for (const season of seasons) {
        const seasonEpisodes = await API.getSeasonEpisodes(season.id);
        for (const episode of seasonEpisodes) {
          episodes.push({ ...episode, seasonId: season.id, showId: show.id });
        }
      }
      raw.shows.push({ ...show, seasons, episodes });
    }
    rawCatalog = raw;
    return raw;
  }

  function buildCatalogModel() {
    const patches = getPatches();
    const removedShows = patches.removedShows || {};
    const updatedShows = patches.updatedShows || {};
    const removedEpisodes = patches.removedEpisodes || {};
    const updatedEpisodes = patches.updatedEpisodes || {};
    const addedShows = patches.addedShows || [];
    const addedEpisodes = patches.addedEpisodes || [];

    const shows = [];
    for (const show of rawCatalog?.shows || []) {
      if (removedShows[show.id]) continue;
      const showPatch = updatedShows[show.id] || {};
      const episodes = show.episodes
        .filter((episode) => !removedEpisodes[episode.id])
        .map((episode) => (updatedEpisodes[episode.id] ? { ...episode, ...updatedEpisodes[episode.id] } : episode));
      shows.push({
        id: show.id,
        title: showPatch.title || show.title,
        description: showPatch.description || show.description,
        live: true,
        episodes,
      });
    }

    for (const draft of addedShows) {
      if (removedShows[draft.id]) continue;
      if (shows.some((show) => show.id === draft.id)) continue;
      shows.push({
        id: draft.id,
        title: draft.title || draft.id,
        description: draft.description || "",
        live: false,
        episodes: [],
      });
    }

    for (const episode of addedEpisodes) {
      if (removedEpisodes[episode.id]) continue;
      const show = shows.find((entry) => entry.id === episode.showId);
      if (!show || show.episodes.some((existing) => existing.id === episode.id)) continue;
      show.episodes.push({
        id: episode.id,
        seasonId: episode.seasonId || `${episode.showId}~s1`,
        showId: episode.showId,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        description: episode.description || "",
        videoUrl: episode.videoUrl || null,
        added: true,
      });
    }

    for (const show of shows) {
      show.episodes.sort((a, b) =>
        String(a.episodeNumber).localeCompare(String(b.episodeNumber), undefined, { numeric: true })
      );
    }
    return shows;
  }

  function refreshNavCounts() {
    const shows = buildCatalogModel();
    const queue = B2.getUploads();
    const showsCount = document.querySelector('.admin-nav-item[data-view="shows"] .admin-nav-item__count');
    const queueCount = document.querySelector('.admin-nav-item[data-view="queue"] .admin-nav-item__count');
    if (showsCount) showsCount.textContent = shows.length;
    if (queueCount) queueCount.textContent = queue.length;
  }

  function seedNavCounts() {
    for (const view of ["shows", "queue"]) {
      const btn = document.querySelector(`.admin-nav-item[data-view="${view}"]`);
      if (btn && !btn.querySelector(".admin-nav-item__count")) {
        const span = document.createElement("span");
        span.className = "admin-nav-item__count";
        btn.appendChild(span);
      }
    }
    refreshNavCounts();
  }

  function showAccessDenied() {
    const user = ADMIN.currentUser();
    const denied = document.getElementById("accessDenied");
    const shell = document.getElementById("adminShell");
    const reason = document.getElementById("accessDeniedReason");
    if (user) {
      reason.textContent = `Signed in as ${user.displayName || user.username || "a viewer"} — this account is not on the approved administrator list. If you believe this is a mistake, contact the Objectflix owner.`;
    } else {
      reason.textContent = "You are not signed in. Administrators sign in with Discord and are matched by their Discord user ID.";
    }
    denied.classList.remove("is-hidden");
    shell.classList.add("is-hidden");
    document.title = "Access denied — Objectflix Admin";
  }

  function showShell() {
    document.getElementById("accessDenied").classList.add("is-hidden");
    document.getElementById("adminShell").classList.remove("is-hidden");
  }

  function renderIdentity() {
    const avatar = document.getElementById("adminIdentityAvatar");
    const name = document.getElementById("adminIdentityName");
    const role = document.getElementById("adminIdentityRole");
    if (avatar && session.identity.avatarUrl) {
      avatar.src = session.identity.avatarUrl;
      avatar.hidden = false;
    }
    name.textContent = session.user.displayName || session.user.username || "Administrator";
    role.textContent = session.role + (session.isOwner ? " · full access" : "");
    if (session.identity.changed.length) {
      const note = document.createElement("span");
      note.className = "admin-identity__note";
      note.textContent = `Note: Discord ${session.identity.changed.join(" / ")} changed since setup`;
      name.parentElement.appendChild(note);
    }
  }

  function showView(name) {
    const view = VIEWS[name];
    if (!view || !ADMIN.can(session, VIEW_PERMISSION[name])) return;
    activeView = name;

    $$(".admin-nav-item").forEach((btn) => {
      const match = btn.dataset.view === name;
      btn.classList.toggle("is-active", match);
      if (match) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    });

    $$(".admin-view").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === name);
    });

    const panel = document.getElementById("view" + name.charAt(0).toUpperCase() + name.slice(1));
    if (!panel) return;
    panel.innerHTML = '<div class="admin-field-hint" style="padding:24px 0">Loading…</div>';
    try {
      view.render(panel);
    } catch (err) {
      console.error(err);
      panel.innerHTML = `<div class="admin-card"><p>Something went wrong rendering this view.</p><pre>${esc(err.message)}</pre></div>`;
    }
    $("#adminMain")?.focus?.();
  }

  function bindSidebar() {
    $$(".admin-nav-item").forEach((btn) => {
      const perm = btn.dataset.permission;
      if (perm && !ADMIN.can(session, perm)) {
        btn.hidden = true;
        return;
      }
      btn.addEventListener("click", () => showView(btn.dataset.view));
    });
  }

  function openModal(title, contentHTML) {
    const modal = document.getElementById("adminModal");
    const content = document.getElementById("adminModalContent");
    content.innerHTML = `
      <div class="admin-modal__heading">
        <h2 id="adminModalTitle">${title}</h2>
      </div>
      ${contentHTML}
    `;
    modal.classList.remove("is-hidden");
    content.querySelector("input, select, textarea")?.focus?.();
  }

  function closeModal() {
    const modal = document.getElementById("adminModal");
    modal.classList.add("is-hidden");
    document.getElementById("adminModalContent").innerHTML = "";
  }

  function bindModal() {
    document.getElementById("adminModalClose").addEventListener("click", closeModal);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
  }

  function bindGlobalEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-admin-action]");
      if (!target) return;
      const action = target.dataset.adminAction;
      const showId = target.dataset.showId;
      const episodeId = target.dataset.episodeId;
      const id = target.dataset.id;

      const handlers = {
        "modal-close": () => closeModal(),
        "show-edit": () => openShowModal(showId),
        "show-add": () => openShowModal(null),
        "show-remove": () => removeShow(showId),
        "show-restore": () => restoreShow(showId),
        "episode-edit": () => openEpisodeModal(showId, episodeId),
        "episode-add": () => openEpisodeModal(showId, null),
        "episode-remove": () => removeEpisode(showId, episodeId),
        "episode-restore": () => restoreEpisode(showId, episodeId),
        "upload-check": () => void handleUploadCheck(),
        "upload-process": () => void B2.process(id).then(() => renderQueue($("#viewQueue"))),
        "upload-retry": () => {
          B2.retry(id);
          renderQueue($("#viewQueue"));
        },
        "upload-remove": () => {
          B2.removeUpload(id);
          renderQueue($("#viewQueue"));
        },
        "queue-clear-completed": () => {
          B2.clearCompleted();
          renderQueue($("#viewQueue"));
          refreshNavCounts();
        },
        "queue-clear-all": () => {
          B2.clearAll();
          renderQueue($("#viewQueue"));
          refreshNavCounts();
        },
        "storage-test": () => void handleStorageTest(),
        "storage-set-bucket": () => {
          settingsSet("defaultBucket", target.dataset.bucket);
          renderStorage($("#viewStorage"));
        },
        "user-remove": () => removeAccount(target.dataset.email),
        "sign-out": () => signOut(),
        "assistant-default": () => {
          settingsSet("defaultAssistant", target.dataset.assistant);
          B2.logActivity("Default assistant changed", target.dataset.assistant);
          renderAssistants($("#viewAssistants"));
        },
        "assistant-settings-save": () => saveAssistantContext(),
        "assistant-probe": () => void probeModels(),
        "ai-key-save": () => saveAiKey(),
        "ai-key-clear": () => clearAiKey(),
        "ai-key-remove": (e) => removeAiKey(Number(e.target.dataset.keyIndex)),
        "fb-key-save": (e) => saveFallbackKey(e.target.dataset.provider),
        "fb-key-clear": (e) => clearFallbackKeys(e.target.dataset.provider),
        "fb-key-remove": (e) => removeFallbackKey(e.target.dataset.provider, Number(e.target.dataset.keyIndex)),
        "history-clear": () => clearHistories(),
        "settings-reset": () => resetSettings(),
        "settings-view-catalog": () => viewCatalogPatches(),
        "catalog-clear": () => clearCatalogPatches(),
      };

      const handler = handlers[action];
      if (handler) handler();
    });

    document.addEventListener("change", (event) => {
      if (event.target.id === "episodesShowSelect") {
        episodeViewShowId = event.target.value;
        renderEpisodes($("#viewEpisodes"));
      }
    });
  }

  function statusPill(item) {
    const labels = {
      queued: "Queued",
      checking: "Checking",
      uploading: "Uploading",
      complete: "Complete",
      exists: "Already exists",
      failed: "Failed",
      "not-configured": "Not configured",
    };
    return `<span class="status-pill status-pill--${esc(item.status)}">${labels[item.status] || esc(item.status)}</span>`;
  }

  function renderDashboard(panel) {
    const shows = buildCatalogModel();
    const queue = B2.getUploads();
    const activity = B2.getActivity();
    const settings = settingsAll();
    const totalEpisodes = shows.reduce((n, show) => n + show.episodes.length, 0);
    const activeUploads = queue.filter((u) => ["queued", "checking", "uploading"].includes(u.status)).length;
    const completedUploads = queue.filter((u) => ["complete", "exists"].includes(u.status)).length;
    const b2Ready = B2.isConfigured();

    panel.innerHTML = `
      <div class="admin-view__heading">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back, ${esc(session.user.displayName || session.user.username)}. Here's what's happening on Objectflix.</p>
        </div>
      </div>

      <div class="admin-grid">
        <div class="stat-card">
          <div class="stat-card__label">Shows</div>
          <div class="stat-card__value">${shows.length}</div>
          <div class="stat-card__hint">in catalog</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Episodes</div>
          <div class="stat-card__value">${totalEpisodes}</div>
          <div class="stat-card__hint">across all shows</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Uploads</div>
          <div class="stat-card__value">${completedUploads}</div>
          <div class="stat-card__hint">${activeUploads} active in queue</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Media storage</div>
          <div class="stat-card__value" style="font-size:1.3rem">${b2Ready ? "Ready" : "Setup"}</div>
          <div class="stat-card__hint">${b2Ready ? "B2 credentials present" : "B2 credentials missing"}</div>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card__title">Quick status</div>
        <div class="kv-list">
          <div class="kv-list__row"><span class="kv-list__key">Default assistant</span><span class="kv-list__value">${esc(settings.defaultAssistant)}</span></div>
          <div class="kv-list__row"><span class="kv-list__key">Conversation context</span><span class="kv-list__value">${esc(settings.conversationContext)} messages</span></div>
          <div class="kv-list__row"><span class="kv-list__key">ARG teaser (logo ritual)</span><span class="kv-list__value">${settings.argEnabled ? "Enabled" : "Disabled"}</span></div>
          <div class="kv-list__row"><span class="kv-list__key">Default bucket</span><span class="kv-list__value">${esc(settings.defaultBucket)}</span></div>
          <div class="kv-list__row"><span class="kv-list__key">Admin role</span><span class="kv-list__value">${esc(session.role)}${session.isOwner ? " (full access)" : ""}</span></div>
          <div class="kv-list__row"><span class="kv-list__key">Signed in</span><span class="kv-list__value">${esc(session.user.username || session.user.displayName)} <code>${esc(session.user.id)}</code></span></div>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card__title">Recent activity</div>
        ${activity.length
          ? `
            <div class="activity-list">
              ${activity.slice(0, 8).map((entry) => `
                <div class="activity-item">
                  <time datetime="${new Date(entry.at).toISOString()}">${timeAgo(entry.at)}</time>
                  <span class="activity-item__action">${esc(entry.action)}</span>
                  <span class="activity-item__detail">${esc(entry.detail || "")}</span>
                </div>
              `).join("")}
            </div>
          `
          : '<p class="admin-field-hint">No activity yet.</p>'}
      </div>
    `;
  }

  function renderShows(panel) {
    if (!ADMIN.can(session, "shows.manage")) return;
    const shows = buildCatalogModel();
    const patches = getPatches();
    const removedShowsList = Object.keys(patches.removedShows || {}).map((id) => {
      const live = rawCatalog?.shows.find((s) => s.id === id);
      const added = (patches.addedShows || []).find((s) => s.id === id);
      return { id, title: live?.title || added?.title || id };
    });

    let html = `
      <div class="admin-view__heading">
        <div>
          <h1>Shows</h1>
          <p>Manage the Objectflix catalog. Changes are stored locally and overlaid on the live catalog.</p>
        </div>
        <button class="button button--primary" type="button" data-admin-action="show-add">+ Add Show</button>
      </div>

      <div class="admin-card admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Show</th>
              <th>ID</th>
              <th>Episodes</th>
              <th>Storage prefix</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${shows.map((show) => `
              <tr>
                <td><strong>${esc(show.title)}</strong></td>
                <td><code>${esc(show.id)}</code></td>
                <td>${show.episodes.length}</td>
                <td><code>${esc(B2.showPrefixFor(show.title))}</code></td>
                <td>${show.live ? '<span class="badge badge--ok">live</span>' : '<span class="badge badge--accent">admin-added</span>'}</td>
                <td>
                  <div class="row-actions">
                    <button class="button button--ghost button--small" type="button" data-admin-action="show-edit" data-show-id="${esc(show.id)}">Edit</button>
                    <button class="button button--ghost button--small" type="button" data-admin-action="show-remove" data-show-id="${esc(show.id)}">Remove</button>
                  </div>
                </td>
              </tr>
            `).join("") || '<tr><td colspan="6" class="admin-field-hint">No shows found. Add one to get started.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    if (removedShowsList.length) {
      html += `
        <div class="admin-card">
          <div class="admin-card__title">Removed shows (${removedShowsList.length})</div>
          ${removedShowsList.map((show) => `
            <div class="user-row">
              <div class="user-row__avatar">${esc((show.title || show.id).charAt(0).toUpperCase())}</div>
              <div style="flex:1">
                <strong>${esc(show.title)}</strong>
                <div class="admin-field-hint"><code>${esc(show.id)}</code> — hidden from the catalog</div>
              </div>
              <button class="button button--ghost button--small" type="button" data-admin-action="show-restore" data-show-id="${esc(show.id)}">Restore</button>
            </div>
          `).join("")}
        </div>
      `;
    }

    panel.innerHTML = html;
  }

  function openShowModal(showId) {
    if (!ADMIN.can(session, "shows.manage")) return;
    const shows = buildCatalogModel();
    const show = shows.find((s) => s.id === showId);
    const added = getPatches().addedShows?.some((s) => s.id === showId);
    const prefix = B2.showPrefixFor(show?.title || "");

    openModal(show ? "Edit show" : "Add show", `
      <form id="showForm" class="admin-form">
        <input type="hidden" name="id" value="${esc(show?.id || "")}" />
        <div class="admin-form-row">
          <label class="admin-label" for="showIdField">Show ID</label>
          <input class="admin-input" id="showIdField" name="showId" value="${esc(show?.id || "")}" ${show ? "readonly" : "required"} placeholder="e.g. bfdia" />
          <span class="admin-field-hint">Stable identifier used in URLs and storage keys${show ? " (locked after creation)" : ""}${added ? " — added via the admin panel" : ""}.</span>
        </div>
        <div class="admin-form-row">
          <label class="admin-label" for="showTitleField">Title</label>
          <input class="admin-input" id="showTitleField" name="title" value="${esc(show?.title || "")}" required />
        </div>
        <div class="admin-form-row">
          <label class="admin-label" for="showDescField">Description</label>
          <textarea class="admin-textarea" id="showDescField" name="description">${esc(show?.description || "")}</textarea>
        </div>
        <div class="admin-form-row">
          <label class="admin-label" for="showPrefixField">Storage prefix (B2 object name)</label>
          <input class="admin-input" id="showPrefixField" value="${esc(prefix)}" readonly />
          <span class="admin-field-hint">Episodes upload as <strong>${esc(prefix + "/<episode>.<extension>")}</strong>.</span>
        </div>
        <div class="admin-modal__footer">
          <button class="button button--ghost" type="button" data-admin-action="modal-close">Cancel</button>
          <button class="button button--primary" type="submit">${show ? "Save show" : "Add show"}</button>
        </div>
      </form>
    `);

    $("#showForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveShowForm(event.target);
    });
  }

  function saveShowForm(form) {
    const formData = new FormData(form);
    const id = String(formData.get("showId") || formData.get("id") || "").trim();
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    if (!id || !title) {
      alert("Show ID and title are required.");
      return;
    }
    const patches = getPatches();
    const isLive = Boolean(rawCatalog?.shows.some((s) => s.id === id));
    const isAdded = Boolean(patches.addedShows?.some((s) => s.id === id));

    patches.updatedShows = { ...(patches.updatedShows || {}), [id]: { title, description } };
    if (!isLive && !isAdded) {
      patches.addedShows = [...(patches.addedShows || []), { id, title, description }];
    }
    if (patches.removedShows?.[id]) delete patches.removedShows[id];
    SHARED.saveCatalogPatches(patches);
    B2.logActivity(isLive ? "Show updated" : "Show added", `${id} — ${title}`);
    closeModal();
    renderShows($("#viewShows"));
    refreshNavCounts();
  }

  function removeShow(showId) {
    if (!confirm(`Remove "${showId}" from the catalog? This hides the show everywhere.`)) return;
    const patches = getPatches();
    patches.removedShows = { ...(patches.removedShows || {}), [showId]: true };
    for (const episode of patches.addedEpisodes || []) {
      if (episode.showId === showId) {
        patches.removedEpisodes = { ...(patches.removedEpisodes || {}), [episode.id]: true };
      }
    }
    patches.addedShows = (patches.addedShows || []).filter((s) => s.id !== showId);
    SHARED.saveCatalogPatches(patches);
    B2.logActivity("Show removed", showId);
    renderShows($("#viewShows"));
    refreshNavCounts();
  }

  function restoreShow(showId) {
    const patches = getPatches();
    if (patches.removedShows?.[showId]) delete patches.removedShows[showId];
    SHARED.saveCatalogPatches(patches);
    B2.logActivity("Show restored", showId);
    renderShows($("#viewShows"));
    refreshNavCounts();
  }

  function renderEpisodes(panel) {
    if (!ADMIN.can(session, "episodes.manage")) return;
    const shows = buildCatalogModel();
    const patches = getPatches();

    if (!shows.length) {
      panel.innerHTML = `
        <div class="admin-view__heading">
          <div>
            <h1>Episodes</h1>
            <p>Add, edit, or remove episodes from any show.</p>
          </div>
        </div>
        <div class="admin-card"><p class="admin-field-hint">No shows in the catalog yet. Add one in the Shows view first.</p></div>
      `;
      return;
    }

    if (!episodeViewShowId || !shows.some((s) => s.id === episodeViewShowId)) {
      episodeViewShowId = shows[0].id;
    }
    const show = shows.find((s) => s.id === episodeViewShowId);

    const allEpisodesForShow = [
      ...(rawCatalog?.shows.find((s) => s.id === show.id)?.episodes || []),
      ...(patches.addedEpisodes || []).filter((e) => e.showId === show.id),
    ];
    const removedEps = Object.keys(patches.removedEpisodes || {})
      .map((id) => allEpisodesForShow.find((e) => e.id === id))
      .filter(Boolean);

    let html = `
      <div class="admin-view__heading">
        <div>
          <h1>Episodes</h1>
          <p>Manage episodes for a show.</p>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-form-row">
          <label class="admin-label" for="episodesShowSelect">Show</label>
          <select class="admin-select" id="episodesShowSelect">
            ${shows.map((s) => `<option value="${esc(s.id)}" ${s.id === show.id ? "selected" : ""}>${esc(s.title)}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="admin-view__heading">
        <h2 style="margin:0;font-size:1.3rem;">${esc(show.title)} — ${show.episodes.length} episode${show.episodes.length === 1 ? "" : "s"}</h2>
        <button class="button button--primary" type="button" data-admin-action="episode-add" data-show-id="${esc(show.id)}">+ Add Episode</button>
      </div>

      <div class="admin-card admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Video</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${show.episodes.map((episode) => {
              const isAdded = (patches.addedEpisodes || []).some((e) => e.id === episode.id);
              return `
                <tr>
                  <td><strong>${esc(episode.episodeNumber)}</strong></td>
                  <td>
                    ${esc(episode.title)}
                    ${episode.releaseDate ? `<br><span class="admin-field-hint">📅 ${esc(episode.releaseDate)}</span>` : ""}
                  </td>
                  <td>
                    ${episode.videoUrl
                      ? `<a href="${esc(episode.videoUrl)}" target="_blank" rel="noopener" class="admin-field-hint">stream</a>`
                      : '<span class="admin-field-hint">none</span>'}
                  </td>
                  <td>
                    ${isAdded
                      ? '<span class="badge badge--accent">admin-added</span>'
                      : episode.released === false
                        ? '<span class="badge badge--warn">upcoming</span>'
                        : '<span class="badge badge--ok">live</span>'}
                  </td>
                  <td>
                    <div class="row-actions">
                      <button class="button button--ghost button--small" type="button" data-admin-action="episode-edit" data-show-id="${esc(show.id)}" data-episode-id="${esc(episode.id)}">Edit</button>
                      <button class="button button--ghost button--small" type="button" data-admin-action="episode-remove" data-show-id="${esc(show.id)}" data-episode-id="${esc(episode.id)}">Remove</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("") || '<tr><td colspan="5" class="admin-field-hint">No episodes yet for this show.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    if (removedEps.length) {
      html += `
        <div class="admin-card">
          <div class="admin-card__title">Removed episodes (${removedEps.length})</div>
          ${removedEps.map((episode) => `
            <div class="user-row">
              <div style="flex:1">
                <strong>${esc(episode.title || episode.id)}</strong>
                <div class="admin-field-hint"><code>${esc(episode.id)}</code> — hidden from the catalog</div>
              </div>
              <button class="button button--ghost button--small" type="button" data-admin-action="episode-restore" data-show-id="${esc(show.id)}" data-episode-id="${esc(episode.id)}">Restore</button>
            </div>
          `).join("")}
        </div>
      `;
    }

    panel.innerHTML = html;
  }

  function openEpisodeModal(showId, episodeId) {
    if (!ADMIN.can(session, "episodes.manage")) return;
    const shows = buildCatalogModel();
    const show = shows.find((s) => s.id === showId);
    if (!show) return;
    const episode = episodeId ? show.episodes.find((e) => e.id === episodeId) : null;
    const liveShow = rawCatalog?.shows.find((s) => s.id === showId);
    const seasons = liveShow?.seasons || [];
    const seasonOptions = seasons
      .map((s) => `<option value="${esc(s.id)}">${esc(s.title || s.id)}</option>`)
      .join("") || `<option value="${esc(showId + "~s1")}">Season 1</option>`;

    openModal(
      episode ? `Edit episode — ${esc(show.title)}` : `Add episode — ${esc(show.title)}`,
      `
      <form id="episodeForm" class="admin-form">
        <input type="hidden" name="showId" value="${esc(show.id)}" />
        <input type="hidden" name="episodeId" value="${esc(episode?.id || "")}" />
        <div class="admin-form-row admin-form-row--split">
          <div class="admin-form-row">
            <label class="admin-label" for="episodeNumberField">Episode number</label>
            <input class="admin-input" id="episodeNumberField" name="episodeNumber" value="${esc(episode?.episodeNumber || "")}" required placeholder="e.g. 1a, 23" />
          </div>
          <div class="admin-form-row">
            <label class="admin-label" for="episodeSeasonField">Season</label>
            <select class="admin-select" id="episodeSeasonField" name="seasonId">${seasonOptions}</select>
          </div>
        </div>
        <div class="admin-form-row">
          <label class="admin-label" for="episodeTitleField">Title</label>
          <input class="admin-input" id="episodeTitleField" name="title" value="${esc(episode?.title || "")}" required />
        </div>
        <div class="admin-form-row">
          <label class="admin-label" for="episodeDescField">Description</label>
          <textarea class="admin-textarea" id="episodeDescField" name="description">${esc(episode?.description || "")}</textarea>
        </div>
        <div class="admin-form-row">
          <label class="admin-label" for="episodeUrlField">Video URL</label>
          <input class="admin-input" id="episodeUrlField" name="videoUrl" value="${esc(episode?.videoUrl || "")}" placeholder="${esc(B2.mediaUrlFor(`${B2.showPrefixFor(show.title)}/<episode>.<ext>`))}" />
          <span class="admin-field-hint">Leave blank for a placeholder or upcoming episode.</span>
        </div>
        <div class="admin-modal__footer">
          <button class="button button--ghost" type="button" data-admin-action="modal-close">Cancel</button>
          <button class="button button--primary" type="submit">${episode ? "Save episode" : "Add episode"}</button>
        </div>
      </form>
      `
    );

    const form = $("#episodeForm");
    if (form) {
      if (episode?.seasonId) {
        const seasonField = form.querySelector('[name="seasonId"]');
        if (seasonField) seasonField.value = episode.seasonId;
      }
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        saveEpisodeForm(event.target);
      });
    }
  }

  function saveEpisodeForm(form) {
    const formData = new FormData(form);
    const showId = String(formData.get("showId") || "");
    const episodeId = String(formData.get("episodeId") || "");
    const episodeNumber = String(formData.get("episodeNumber") || "").trim();
    const seasonId = String(formData.get("seasonId") || "").trim() || `${showId}~s1`;
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const videoUrl = String(formData.get("videoUrl") || "").trim();

    if (!episodeNumber || !title) {
      alert("Episode number and title are required.");
      return;
    }

    const patches = getPatches();
    const isAdded = Boolean(patches.addedEpisodes?.some((e) => e.id === episodeId));
    const isLive = episodeId
      ? Boolean(rawCatalog?.shows.find((s) => s.id === showId)?.episodes.some((e) => e.id === episodeId))
      : false;

    if (isAdded) {
      patches.addedEpisodes = (patches.addedEpisodes || []).map((e) =>
        e.id === episodeId ? { ...e, episodeNumber, seasonId, title, description, videoUrl: videoUrl || null } : e
      );
      B2.logActivity("Episode updated", `${showId}/${episodeNumber} — ${title}`);
    } else if (isLive) {
      patches.updatedEpisodes = { ...(patches.updatedEpisodes || {}), [episodeId]: { episodeNumber, seasonId, title, description, videoUrl: videoUrl || null } };
      if (patches.removedEpisodes?.[episodeId]) delete patches.removedEpisodes[episodeId];
      B2.logActivity("Episode updated", `${showId}/${episodeNumber} — ${title}`);
    } else {
      const id =
        episodeId ||
        `ep-${showId}-${String(episodeNumber).toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;
      patches.addedEpisodes = [...(patches.addedEpisodes || [])];
      if (!patches.addedEpisodes.some((e) => e.id === id)) {
        patches.addedEpisodes.push({ id, showId, seasonId, episodeNumber, title, description, videoUrl: videoUrl || null });
      }
      B2.logActivity("Episode added", `${showId}/${episodeNumber} — ${title}`);
    }

    SHARED.saveCatalogPatches(patches);
    closeModal();
    renderEpisodes($("#viewEpisodes"));
    refreshNavCounts();
  }

  function removeEpisode(showId, episodeId) {
    if (!confirm("Remove this episode from the catalog everywhere?")) return;
    const patches = getPatches();
    patches.removedEpisodes = { ...(patches.removedEpisodes || {}), [episodeId]: true };
    if (patches.updatedEpisodes?.[episodeId]) delete patches.updatedEpisodes[episodeId];
    patches.addedEpisodes = (patches.addedEpisodes || []).filter((e) => e.id !== episodeId);
    SHARED.saveCatalogPatches(patches);
    B2.logActivity("Episode removed", `${showId}/${episodeId}`);
    renderEpisodes($("#viewEpisodes"));
    refreshNavCounts();
  }

  function restoreEpisode(showId, episodeId) {
    const patches = getPatches();
    if (patches.removedEpisodes?.[episodeId]) delete patches.removedEpisodes[episodeId];
    SHARED.saveCatalogPatches(patches);
    B2.logActivity("Episode restored", `${showId}/${episodeId}`);
    renderEpisodes($("#viewEpisodes"));
    refreshNavCounts();
  }

  function currentUploadKey() {
    const shows = buildCatalogModel();
    const show = shows.find((s) => s.id === $("#uploadShowSelect")?.value);
    const episodeNumber = $("#uploadEpisodeField")?.value || "";
    const file = $("#uploadFileField")?.files?.[0];
    if (!show || !episodeNumber || !file) return null;
    return B2.objectKeyFor(show.title, episodeNumber, file.name);
  }

  function renderUpload(panel) {
    if (!ADMIN.can(session, "media.upload")) return;
    const shows = buildCatalogModel();
    const buckets = CONFIG.b2.buckets || [];
    const settings = settingsAll();
    const configured = B2.isConfigured();
    const defaultBucket = configuredBucketName(settings.defaultBucket);

    let html = `
      <div class="admin-view__heading">
        <div>
          <h1>Upload</h1>
          <p>Upload episode files to Backblaze B2. Files are named <strong>&lt;show&gt;/&lt;episode&gt;.&lt;ext&gt;</strong>.</p>
        </div>
      </div>
    `;

    if (!configured) {
      html += `
        <div class="b2-banner">
          <span>⚠️</span>
          <div><strong>B2 uploads are not configured.</strong> Set <code>uploadEndpoint</code> in <code>src/config.js → b2</code> and deploy the worker's <code>/api/admin/uploads/sign</code> endpoint to enable real uploads. You can still review the queue and catalog here.</div>
        </div>
      `;
    }

    html += `
      <div class="admin-card">
        <div class="admin-card__title">New episode upload</div>
        <form id="uploadForm" class="admin-form">
          <div class="admin-form-row admin-form-row--split">
            <div class="admin-form-row">
              <label class="admin-label" for="uploadShowSelect">Show</label>
              <select class="admin-select" id="uploadShowSelect" name="showId">
                ${shows.map((s) => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join("")}
              </select>
            </div>
            <div class="admin-form-row">
              <label class="admin-label" for="uploadEpisodeField">Episode number</label>
              <input class="admin-input" id="uploadEpisodeField" name="episodeNumber" placeholder="e.g. 1a, 23" required />
            </div>
          </div>
          <div class="admin-form-row admin-form-row--split">
            <div class="admin-form-row">
              <label class="admin-label" for="uploadTitleField">Episode title <span class="admin-field-hint">(optional)</span></label>
              <input class="admin-input" id="uploadTitleField" name="episodeTitle" placeholder="e.g. TPOT 25: The Grand Return" />
            </div>
            <div class="admin-form-row">
              <label class="admin-label" for="uploadBucketSelect">Bucket</label>
              <select class="admin-select" id="uploadBucketSelect" name="bucket">
                ${buckets.map((b) => `<option value="${esc(b.name)}" ${b.name === defaultBucket ? "selected" : ""}>${esc(b.name)}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="admin-form-row">
            <label class="admin-label" for="uploadFileField">Video file</label>
            <input class="admin-input" id="uploadFileField" name="file" type="file" accept="video/*,.mp4,.mkv,.webm,.mov,.m4v" required />
            <span class="admin-field-hint">MP4 is recommended. Files are streamed straight to B2 — nothing is stored on this page.</span>
          </div>
          <div class="upload-target" id="uploadKeyPreview">object key: <code>…</code></div>
          <label class="admin-checkbox-row">
            <input type="checkbox" name="registerCatalog" checked />
            <span>Register this episode in the catalog when the upload finishes</span>
          </label>
          <div class="admin-modal__footer" style="margin-top:0">
            <button class="button button--ghost" type="button" data-admin-action="upload-check">Check key</button>
            <button class="button button--primary" type="submit">Start upload</button>
          </div>
          <p class="admin-field-hint" id="uploadResult" role="status"></p>
        </form>
      </div>
    `;

    panel.innerHTML = html;

    const form = $("#uploadForm");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void handleUploadStart(event.target);
      });
      const updatePreview = () => {
        const key = currentUploadKey();
        const preview = $("#uploadKeyPreview");
        if (preview) preview.innerHTML = key ? `object key: <code>${esc(key)}</code>` : "object key: <code>…</code>";
      };
      $("#uploadShowSelect")?.addEventListener("change", updatePreview);
      $("#uploadEpisodeField")?.addEventListener("input", updatePreview);
      $("#uploadFileField")?.addEventListener("change", updatePreview);
      updatePreview();
    }
  }

  async function handleUploadCheck() {
    const key = currentUploadKey();
    const result = $("#uploadResult");
    if (!result) return;
    if (!key) {
      result.textContent = "Fill in the show, episode number, and file first.";
      return;
    }
    result.textContent = `Checking "${key}"…`;
    const check = await B2.checkObject(key, $("#uploadBucketSelect")?.value);
    result.textContent = check.exists
      ? `"${key}" already exists in storage.`
      : `"${key}" does not exist yet${check.offline ? " (could not reach the media proxy to confirm)" : ""}.`;
  }

  function registerEpisodeInCatalog(showId, episodeNumber, title, videoUrl) {
    const patches = getPatches();
    const liveShow = rawCatalog?.shows.find((s) => s.id === showId);
    const seasonId = liveShow?.seasons?.[0]?.id || `${showId}~s1`;
    const id = `ep-${showId}-${String(episodeNumber).toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;

    patches.addedEpisodes = [...(patches.addedEpisodes || [])];
    const existing = patches.addedEpisodes.some((e) => e.id === id);
    if (existing) {
      patches.addedEpisodes = patches.addedEpisodes.map((e) => (e.id === id ? { ...e, episodeNumber, seasonId, title, videoUrl } : e));
    } else {
      patches.addedEpisodes.push({ id, showId, seasonId, episodeNumber, title, description: "", videoUrl });
    }
    if (patches.removedEpisodes?.[id]) delete patches.removedEpisodes[id];

    if (!liveShow && !(patches.addedShows || []).some((s) => s.id === showId)) {
      const show = buildCatalogModel().find((s) => s.id === showId);
      patches.addedShows = [...(patches.addedShows || []), { id: showId, title: show?.title || showId, description: show?.description || "" }];
    }
    if (patches.removedShows?.[showId]) delete patches.removedShows[showId];

    SHARED.saveCatalogPatches(patches);
    B2.logActivity("Episode registered in catalog", `${showId}/${episodeNumber} — ${title}`);
  }

  async function handleUploadStart(form) {
    if (!ADMIN.can(session, "media.upload")) return;
    const result = $("#uploadResult");
    const showId = form?.querySelector('[name="showId"]')?.value;
    const episodeNumber = form?.querySelector('[name="episodeNumber"]')?.value.trim();
    const episodeTitle = form?.querySelector('[name="episodeTitle"]')?.value.trim();
    const register = form?.querySelector('[name="registerCatalog"]')?.checked;
    const bucket = form?.querySelector('[name="bucket"]')?.value || settingsGet("defaultBucket");
    const file = form?.querySelector('[name="file"]')?.files?.[0];
    const show = buildCatalogModel().find((s) => s.id === showId);

    if (!show || !episodeNumber || !file) {
      if (result) result.textContent = "Show, episode number, and file are required.";
      return;
    }

    const key = B2.objectKeyFor(show.title, episodeNumber, file.name);
    const submitBtn = form?.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    if (result) result.textContent = `Checking "${key}"…`;

    const check = await B2.checkObject(key, bucket);
    if (check.exists) {
      if (register) {
        registerEpisodeInCatalog(showId, episodeNumber, episodeTitle || `${show.title} ${episodeNumber}`, B2.mediaUrlFor(key));
      }
      if (result) result.textContent = `"${key}" already exists in storage.`;
      if (submitBtn) submitBtn.disabled = false;
      refreshNavCounts();
      return;
    }

    const item = B2.enqueue({
      showId,
      showTitle: show.title,
      episodeNumber,
      fileName: file.name,
      file,
      bucketName: bucket,
      key,
    });
    if (result) result.textContent = "Queued — uploading…";
    const updated = await B2.process(item.id);

    if (updated.status === "complete" || updated.status === "exists") {
      if (register) {
        registerEpisodeInCatalog(showId, episodeNumber, episodeTitle || `${show.title} ${episodeNumber}`, B2.mediaUrlFor(key));
      }
      if (result) result.textContent = `Upload complete for "${key}".`;
    } else if (updated.status === "not-configured") {
      if (result) result.textContent = "Upload queued, but B2 is not configured — no file was transferred.";
    } else {
      if (result) result.textContent = `Upload failed: ${updated.error || "unknown error"}.`;
    }

    if (submitBtn) submitBtn.disabled = false;
    renderQueue($("#viewQueue"));
    refreshNavCounts();
  }

  function renderQueue(panel) {
    if (!ADMIN.can(session, "media.queue")) return;
    const queue = B2.getUploads();
    const hasFinished = queue.some((u) => ["complete", "exists", "failed"].includes(u.status));

    let html = `
      <div class="admin-view__heading">
        <div>
          <h1>Upload Queue</h1>
          <p>${queue.length ? `${queue.length} item${queue.length === 1 ? "" : "s"} tracked.` : "Nothing queued yet."}</p>
        </div>
        <div class="row-actions">
          <button class="button button--ghost button--small" type="button" data-admin-action="queue-clear-completed" ${hasFinished ? "" : "disabled"}>Clear finished</button>
          <button class="button button--ghost button--small" type="button" data-admin-action="queue-clear-all" ${queue.length ? "" : "disabled"}>Clear all</button>
        </div>
      </div>
    `;

    if (!queue.length) {
      html += '<div class="admin-card"><p class="admin-field-hint">No uploads yet. Head to the Upload view to queue an episode.</p></div>';
      panel.innerHTML = html;
      return;
    }

    html += `
      <div class="admin-card admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Object</th>
              <th>Show / Episode</th>
              <th>Size</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${queue.map((item) => `
              <tr>
                <td>
                  <code>${esc(item.key)}</code>
                  <br><span class="admin-field-hint">${fmtDate(item.createdAt)}</span>
                </td>
                <td>${esc(item.showTitle || "")}${item.episodeNumber ? ` <span class="admin-field-hint">· ${esc(item.episodeNumber)}</span>` : ""}</td>
                <td>${formatBytes(item.size)}</td>
                <td>${statusPill(item)}</td>
                <td style="min-width:140px">
                  ${["queued", "checking", "uploading"].includes(item.status)
                    ? `<div class="progress-track"><span style="width:${item.progress}%"></span></div><span class="admin-field-hint">${item.progress}%</span>`
                    : item.error
                      ? `<span class="admin-field-hint">${esc(item.error)}</span>`
                      : ""}
                </td>
                <td>
                  <div class="row-actions">
                    ${["queued", "checking"].includes(item.status) ? `<button class="button button--ghost button--small" type="button" data-admin-action="upload-process" data-id="${esc(item.id)}">Process</button>` : ""}
                    ${["failed", "not-configured"].includes(item.status) ? `<button class="button button--ghost button--small" type="button" data-admin-action="upload-retry" data-id="${esc(item.id)}">Retry</button>` : ""}
                    <button class="button button--ghost button--small" type="button" data-admin-action="upload-remove" data-id="${esc(item.id)}">Remove</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    panel.innerHTML = html;
  }

  function startQueuePolling() {
    if (queuePollTimer) clearInterval(queuePollTimer);
    queuePollTimer = setInterval(() => {
      if (activeView === "queue" && $("#viewQueue")) {
        renderQueue($("#viewQueue"));
      }
    }, 1500);
  }

  async function handleStorageTest() {
    if (!ADMIN.can(session, "storage.manage")) return;
    const result = $("#storageTestResult");
    if (!result) return;
    if (!B2.isConfigured()) {
      result.textContent = "Upload endpoint is not configured. Set uploadEndpoint in src/config.js → b2 to run a live test.";
      result.style.color = "#fbbf24";
      return;
    }
    result.textContent = "Connecting to the Objectflix storage endpoint…";
    result.style.color = "";
    try {
      const buckets = await B2.listBuckets();
      let msg = `Connected. Found <strong>${buckets.length}</strong> bucket${buckets.length === 1 ? "" : "s"}: ${buckets.map((b) => `<code>${esc(b.bucketName || b.bucketId)}</code>`).join(", ") || "<em>none</em>"}`;
      if (B2.lastStorageWarning) {
        msg += `<div class="admin-field-hint" style="color:#fbbf24;margin-top:6px">⚠️ ${esc(B2.lastStorageWarning)}</div>`;
        result.style.color = "";
      } else {
        result.style.color = "#5fe08a";
      }
      result.innerHTML = msg;
    } catch (err) {
      result.textContent = `Connection failed: ${err.message}`;
      result.style.color = "#ff7b83";
    }
  }

  function renderStorage(panel) {
    if (!ADMIN.can(session, "storage.manage")) return;
    const buckets = CONFIG.b2.buckets || [];
    const settings = settingsAll();
    const configured = B2.isConfigured();
    const defaultBucket = configuredBucketName(settings.defaultBucket);

    panel.innerHTML = `
      <div class="admin-view__heading">
        <div>
          <h1>Storage</h1>
          <p>Backblaze B2 media storage used to serve episode files.</p>
        </div>
        <button class="button button--ghost" type="button" data-admin-action="storage-test">${configured ? "Test connection" : "Show config steps"}</button>
      </div>

      <div class="admin-grid">
        <div class="stat-card">
          <div class="stat-card__label">Credentials</div>
          <div class="stat-card__value" style="font-size:1.25rem">${configured ? "Configured" : "Missing"}</div>
          <div class="stat-card__hint">${configured ? "Uploads are routed through the Objectflix API worker" : "Configure the worker proxy endpoint (src/config.js → b2)"}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Media endpoint</div>
          <div class="stat-card__value" style="font-size:1.05rem">API</div>
          <div class="stat-card__hint">${esc(CONFIG.b2.mediaBase)}</div>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card__title">Buckets</div>
        ${buckets.length
          ? `
            <div class="admin-table-wrap">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th>Region</th>
                    <th>Purpose</th>
                    <th>Default</th>
                    <th>Set default</th>
                  </tr>
                </thead>
                <tbody>
                  ${buckets.map((b) => `
                    <tr>
                      <td><code>${esc(b.name)}</code></td>
                      <td><code>${esc(b.region)}</code></td>
                      <td class="admin-field-hint">${esc(b.purpose || "")}</td>
                      <td>${b.name === defaultBucket ? '<span class="badge badge--ok">default</span>' : '<span class="badge badge--muted">—</span>'}</td>
                      <td>${b.name === defaultBucket ? "" : `<button class="button button--ghost button--small" type="button" data-admin-action="storage-set-bucket" data-bucket="${esc(b.name)}">Use</button>`}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
          : '<p class="admin-field-hint">No buckets configured.</p>'}
      </div>

      <div class="admin-card">
        <div class="admin-card__title">Connection test</div>
        <p id="storageTestResult" class="admin-field-hint">${configured ? "Run a live connection test against the worker's storage endpoint." : "Configure the worker proxy endpoint to run a live test."}</p>
      </div>
    `;
  }

  function renderUsers(panel) {
    if (!ADMIN.can(session, "users.manage")) return;
    let localUsers = {};
    try {
      localUsers = JSON.parse(localStorage.getItem("objectflix_users") || "{}");
    } catch {
    }
    const emails = Object.keys(localUsers);

    panel.innerHTML = `
      <div class="admin-view__heading">
        <div>
          <h1>Users</h1>
          <p>Accounts stored in this browser and the current admin session.</p>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card__title">Current session</div>
        <div class="user-row">
          <div class="user-row__avatar">
            ${session.identity.avatarUrl
              ? `<img src="${esc(session.identity.avatarUrl)}" alt="" />`
              : esc((session.user.displayName || session.user.username || "A").charAt(0).toUpperCase())}
          </div>
          <div style="flex:1">
            <strong>${esc(session.user.displayName || session.user.username)}</strong>
            ${session.identity.changed.length ? `<div class="admin-identity__note">Discord ${esc(session.identity.changed.join(" / "))} changed since setup</div>` : ""}
            <div class="admin-field-hint">${esc(session.user.email || "")} · Discord ID <code>${esc(session.user.id)}</code></div>
          </div>
          <span class="badge ${session.isOwner ? "badge--accent" : "badge--ok"}">${esc(session.role)}</span>
          <button class="button button--ghost button--small" type="button" data-admin-action="sign-out">Sign out</button>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card__title">Browser accounts (${emails.length})</div>
        ${emails.length
          ? `
            <div class="admin-table-wrap">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${emails.map((email) => `
                    <tr>
                      <td>${esc(email)}</td>
                      <td><span class="badge badge--muted">local</span></td>
                      <td><button class="button button--ghost button--small" type="button" data-admin-action="user-remove" data-email="${esc(email)}">Remove</button></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
          : '<p class="admin-field-hint">No local accounts in this browser.</p>'}
        <p class="admin-field-hint" style="margin-top:12px">Discord sign-ins are managed by Discord and aren't listed here — only accounts created with email/password in this browser.</p>
      </div>
    `;
  }

  function removeAccount(email) {
    if (!confirm(`Remove the local account "${email}"?`)) return;
    try {
      const users = JSON.parse(localStorage.getItem("objectflix_users") || "{}");
      if (users[email]) {
        delete users[email];
        localStorage.setItem("objectflix_users", JSON.stringify(users));
        localStorage.removeItem(`objectflix_profiles_${email}`);
        B2.logActivity("Account removed", email);
      }
    } catch {
    }
    renderUsers($("#viewUsers"));
  }

  function signOut() {
    if (!confirm("Sign out of Objectflix in this browser?")) return;
    localStorage.removeItem("objectflix_current_user");
    localStorage.removeItem("onboarding_needed");
    window.location.replace("index.html");
  }

  function renderAssistants(panel) {
    if (!ADMIN.can(session, "assistants.configure")) return;
    const settings = settingsAll();
    const ai = CONFIG.ai || {};
    const aiKeys = (() => {
      try {
        const stored = JSON.parse(localStorage.getItem("objectflix_ai_keys") || "[]");
        if (Array.isArray(stored) && stored.length > 0) return stored;
      } catch {}
      const legacy = localStorage.getItem("objectflix_ai_key");
      if (legacy) return [legacy];
      return ai.apiKey ? [ai.apiKey] : [];
    })();

    const assistants = [
      { id: "firey", name: "Firey", emoji: "🔥", desc: "The explosive, passionate host. Energetic and loud.", cardClass: "assistant-card--firey", avatarClass: "assistant-card__avatar--firey" },
      { id: "leafy", name: "Leafy", emoji: "🍃", desc: "The calm, kind mediator. Helpful and thoughtful.", cardClass: "assistant-card--leafy", avatarClass: "assistant-card__avatar--leafy" },
    ];

    panel.innerHTML = `
      <div class="admin-view__heading">
        <div>
          <h1>Assistants</h1>
          <p>Configure the Objectflix AI assistant experience.</p>
        </div>
      </div>

      <div class="admin-grid">
        ${assistants.map((a) => `
          <div class="assistant-card ${a.cardClass}">
            <div class="assistant-card__head">
              <div class="assistant-card__avatar ${a.avatarClass}">${a.emoji}</div>
              <div>
                <div class="assistant-card__name">${a.name}</div>
                <div class="assistant-card__desc">${esc(a.desc)}</div>
              </div>
            </div>
            <div class="kv-list">
              <div class="kv-list__row">
                <span class="kv-list__key">Status</span>
                <span class="kv-list__value">${settings.defaultAssistant === a.id ? '<span class="badge badge--ok">default</span>' : '<span class="badge badge--muted">available</span>'}</span>
              </div>
            </div>
            ${settings.defaultAssistant === a.id ? "" : `<button class="button button--primary button--small" type="button" data-admin-action="assistant-default" data-assistant="${a.id}">Make default</button>`}
          </div>
        `).join("")}
      </div>

      <div class="admin-card">
        <div class="admin-card__title">Conversation settings</div>
        <div class="admin-form">
          <div class="admin-form-row">
            <label class="admin-label" for="assistantContextField">Conversation context (messages)</label>
            <input class="admin-input" id="assistantContextField" type="number" min="1" max="50" value="${esc(settings.conversationContext || 8)}" />
            <span class="admin-field-hint">How many recent messages the assistant keeps in mind. Applies immediately.</span>
          </div>
          <div class="admin-modal__footer" style="margin-top:0">
            <button class="button button--ghost button--small" type="button" data-admin-action="history-clear">Clear all chat history (this browser)</button>
            <button class="button button--primary button--small" type="button" data-admin-action="assistant-settings-save">Save</button>
          </div>
          <p class="admin-field-hint" id="assistantSettingsStatus"></p>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card__title">Gemini model access</div>
        <div class="kv-list">
          <div class="kv-list__row"><span class="kv-list__key">Provider</span><span class="kv-list__value">${esc(ai.provider || "gemini")}</span></div>
          <div class="kv-list__row"><span class="kv-list__key">Keys configured</span><span class="kv-list__value">${aiKeys.length}</span></div>
        </div>
        <div class="admin-form" style="margin-top:12px">
          <div class="admin-form-row">
            <label class="admin-label" for="aiKeyField">Add API key <span class="admin-field-hint">(stored in this browser, round-robin rotation)</span></label>
            <div class="admin-form-row admin-form-row--split" style="gap:10px">
              <input class="admin-input" id="aiKeyField" type="password" placeholder="Paste a Gemini API key" />
              <div class="row-actions">
                <button class="button button--primary button--small" type="button" data-admin-action="ai-key-save">Add key</button>
              </div>
            </div>
          </div>
          <div class="admin-form-row">
            <button class="button button--ghost button--small" type="button" data-admin-action="ai-key-clear">Clear all keys</button>
          </div>
          ${aiKeys.length > 0 ? `
          <div style="margin-top:10px">
            <span class="admin-field-hint" style="margin-bottom:6px;display:block">Configured keys:</span>
            <div class="kv-list" style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
              ${aiKeys.map((k, i) => {
                const masked = k.length > 8 ? `${k.slice(0, 4)}••••${k.slice(-4)}` : '••••';
                return `<div class="kv-list__row" style="justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border)">
                  <span class="kv-list__key" style="font-family:monospace;font-size:0.85rem">${i + 1}. ${esc(masked)}</span>
                  <button class="button button--ghost button--small" type="button" data-admin-action="ai-key-remove" data-key-index="${i}" style="color:var(--danger)">Remove</button>
                </div>`;
              }).join("")}
            </div>
          </div>
          ` : ""}
          <div class="admin-form-row" style="margin-top:12px">
            <button class="button button--ghost button--small" type="button" data-admin-action="assistant-probe">Probe available models</button>
            <span class="admin-field-hint" id="modelProbeResult"></span>
          </div>
          <div class="admin-form-row" id="modelChips"></div>
        </div>
      </div>

      ${(CONFIG.ai?.fallbacks || []).map((fb) => {
        const env = window.__OBJECTFLIX_ENV__ || {};
        const envKeys = (env[fb.envKey] || '').split(',').map((k) => k.trim()).filter(Boolean);
        let storedKeys = [];
        try { storedKeys = JSON.parse(localStorage.getItem(`objectflix_ai_keys_${fb.id}`) || '[]'); } catch {}
        if (!Array.isArray(storedKeys)) storedKeys = [];
        const allKeys = [...new Set([...envKeys, ...storedKeys])];
        const maskedKeys = allKeys.map((k) => k.length > 8 ? `${k.slice(0, 4)}••••${k.slice(-4)}` : '••••');

        return `
        <div class="admin-card">
          <div class="admin-card__title">${esc(fb.name)} (fallback)</div>
          <div class="kv-list">
            <div class="kv-list__row"><span class="kv-list__key">Endpoint</span><span class="kv-list__value" style="font-family:monospace;font-size:0.8rem">${esc(fb.baseUrl)}</span></div>
            <div class="kv-list__row"><span class="kv-list__key">Keys configured</span><span class="kv-list__value">${allKeys.length}</span></div>
            <div class="kv-list__row"><span class="kv-list__key">Models</span><span class="kv-list__value">${fb.models.join(', ')}</span></div>
          </div>
          <div class="admin-form" style="margin-top:12px">
            <div class="admin-form-row">
              <label class="admin-label" for="fbKeyField_${fb.id}">Add API key</label>
              <div class="admin-form-row admin-form-row--split" style="gap:10px">
                <input class="admin-input" id="fbKeyField_${fb.id}" type="password" placeholder="Paste a ${esc(fb.name)} API key" />
                <div class="row-actions">
                  <button class="button button--primary button--small" type="button" data-admin-action="fb-key-save" data-provider="${fb.id}">Add key</button>
                </div>
              </div>
            </div>
            <div class="admin-form-row">
              <button class="button button--ghost button--small" type="button" data-admin-action="fb-key-clear" data-provider="${fb.id}">Clear all keys</button>
            </div>
            ${allKeys.length > 0 ? `
            <div style="margin-top:10px">
              <div class="kv-list" style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
                ${maskedKeys.map((m, i) => `
                <div class="kv-list__row" style="justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border)">
                  <span class="kv-list__key" style="font-family:monospace;font-size:0.85rem">${i + 1}. ${esc(m)}</span>
                  <button class="button button--ghost button--small" type="button" data-admin-action="fb-key-remove" data-provider="${fb.id}" data-key-index="${i}" style="color:var(--danger)">Remove</button>
                </div>`).join("")}
              </div>
            </div>` : ""}
          </div>
        </div>`;
      }).join("")}
    `;
  }

  function saveAssistantContext() {
    const field = $("#assistantContextField");
    if (!field) return;
    const value = Math.max(1, Math.min(50, Number(field.value) || 8));
    settingsSet("conversationContext", value);
    B2.logActivity("Assistant settings updated", `context=${value}`);
    renderAssistants($("#viewAssistants"));
    const status = $("#assistantSettingsStatus");
    if (status) status.textContent = "Saved.";
  }

  function clearHistories() {
    if (!confirm("Clear all assistant chat history for this browser?")) return;
    try {
      sessionStorage.removeItem("objectflix_assistant_histories");
      sessionStorage.removeItem("objectflix_assistant_active");
    } catch {
    }
    renderAssistants($("#viewAssistants"));
    const status = $("#assistantSettingsStatus");
    if (status) status.textContent = "Chat history cleared.";
  }

  function saveAiKey() {
    const field = $("#aiKeyField");
    if (!field) return;
    const key = field.value.trim();
    if (!key) {
      alert("Paste a Gemini API key first.");
      return;
    }
    let keys = [];
    try { keys = JSON.parse(localStorage.getItem("objectflix_ai_keys") || "[]"); } catch {}
    if (!Array.isArray(keys)) keys = [];
    if (keys.includes(key)) {
      const status = $("#assistantSettingsStatus");
      if (status) status.textContent = "This key is already configured.";
      return;
    }
    keys.push(key);
    localStorage.setItem("objectflix_ai_keys", JSON.stringify(keys));
    localStorage.removeItem("objectflix_ai_key");
    B2.logActivity("AI API key added", `key ${keys.length} added in this browser`);
    field.value = "";
    renderAssistants($("#viewAssistants"));
    const status = $("#assistantSettingsStatus");
    if (status) status.textContent = `API key added (${keys.length} total).`;
  }

  function removeAiKey(index) {
    let keys = [];
    try { keys = JSON.parse(localStorage.getItem("objectflix_ai_keys") || "[]"); } catch {}
    if (!Array.isArray(keys) || !keys[index]) return;
    if (!confirm(`Remove API key ${index + 1}?`)) return;
    keys.splice(index, 1);
    if (keys.length > 0) {
      localStorage.setItem("objectflix_ai_keys", JSON.stringify(keys));
    } else {
      localStorage.removeItem("objectflix_ai_keys");
    }
    B2.logActivity("AI API key removed", `key removed, ${keys.length} remaining`);
    renderAssistants($("#viewAssistants"));
    const status = $("#assistantSettingsStatus");
    if (status) status.textContent = "Key removed.";
  }

  function clearAiKey() {
    if (!confirm("Clear all configured API keys?")) return;
    localStorage.removeItem("objectflix_ai_keys");
    localStorage.removeItem("objectflix_ai_key");
    localStorage.removeItem("objectflix_ai_key_index");
    B2.logActivity("AI API keys cleared", "");
    renderAssistants($("#viewAssistants"));
    const status = $("#assistantSettingsStatus");
    if (status) status.textContent = "All API keys cleared.";
  }

  function saveFallbackKey(providerId) {
    const field = $(`#fbKeyField_${providerId}`);
    if (!field) return;
    const key = field.value.trim();
    if (!key) { alert("Paste an API key first."); return; }
    const storeKey = `objectflix_ai_keys_${providerId}`;
    let keys = [];
    try { keys = JSON.parse(localStorage.getItem(storeKey) || "[]"); } catch {}
    if (!Array.isArray(keys)) keys = [];
    if (keys.includes(key)) {
      const status = $("#assistantSettingsStatus");
      if (status) status.textContent = "This key is already configured.";
      return;
    }
    keys.push(key);
    localStorage.setItem(storeKey, JSON.stringify(keys));
    B2.logActivity(`${providerId} API key added`, `key ${keys.length} added`);
    field.value = "";
    renderAssistants($("#viewAssistants"));
    const status = $("#assistantSettingsStatus");
    if (status) status.textContent = `${providerId} key added (${keys.length} total).`;
  }

  function removeFallbackKey(providerId, index) {
    const storeKey = `objectflix_ai_keys_${providerId}`;
    let keys = [];
    try { keys = JSON.parse(localStorage.getItem(storeKey) || "[]"); } catch {}
    if (!Array.isArray(keys) || !keys[index]) return;
    if (!confirm(`Remove ${providerId} key ${index + 1}?`)) return;
    keys.splice(index, 1);
    if (keys.length > 0) {
      localStorage.setItem(storeKey, JSON.stringify(keys));
    } else {
      localStorage.removeItem(storeKey);
    }
    B2.logActivity(`${providerId} API key removed`, `${keys.length} remaining`);
    renderAssistants($("#viewAssistants"));
    const status = $("#assistantSettingsStatus");
    if (status) status.textContent = `${providerId} key removed.`;
  }

  function clearFallbackKeys(providerId) {
    if (!confirm(`Clear all ${providerId} API keys?`)) return;
    localStorage.removeItem(`objectflix_ai_keys_${providerId}`);
    localStorage.removeItem(`objectflix_ai_key_idx_${providerId}`);
    B2.logActivity(`${providerId} API keys cleared`, "");
    renderAssistants($("#viewAssistants"));
    const status = $("#assistantSettingsStatus");
    if (status) status.textContent = `All ${providerId} keys cleared.`;
  }

  async function probeModels() {
    const result = $("#modelProbeResult");
    const chips = $("#modelChips");
    const ai = CONFIG.ai || {};
    let keys = [];
    try { keys = JSON.parse(localStorage.getItem("objectflix_ai_keys") || "[]"); } catch {}
    if (!Array.isArray(keys) || keys.length === 0) {
      const legacy = localStorage.getItem("objectflix_ai_key");
      if (legacy) keys = [legacy];
      else if (ai.apiKey) keys = [ai.apiKey];
    }
    if (keys.length === 0) {
      if (result) result.textContent = "No API keys configured.";
      return;
    }
    if (result) result.textContent = "Querying Gemini…";

    const available = new Set();
    for (const apiKey of keys) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
        if (!res.ok) continue;
        const data = await res.json();
        for (const m of data.models || []) {
          if (m.supportedGenerationMethods?.includes("generateContent")) {
            available.add(m.name.replace(/^models\//, ""));
          }
        }
      } catch {}
    }

    const configured = ai.models || [];
    if (chips) {
      chips.innerHTML = configured
        .map((model) => `<span class="model-chip"><span class="dot ${available.has(model) ? "is-online" : "is-offline"}"></span>${esc(model)}</span>`)
        .join("");
    }
    if (result) result.textContent = `${available.size} generative model${available.size === 1 ? "" : "s"} reachable across ${keys.length} key${keys.length === 1 ? "" : "s"}.`;
  }

  function renderSettings(panel) {
    if (!ADMIN.can(session, "settings.manage")) return;
    const settings = settingsAll();
    const buckets = CONFIG.b2.buckets || [];
    const defaultBucket = configuredBucketName(settings.defaultBucket);

    panel.innerHTML = `
      <div class="admin-view__heading">
        <div>
          <h1>Settings</h1>
          <p>Site-wide settings. These apply to every page in this browser.</p>
        </div>
      </div>

      <form id="settingsForm" class="admin-card admin-form">
        <div class="admin-form-row">
          <label class="admin-label" for="settingsAssistantSelect">Default assistant</label>
          <select class="admin-select" id="settingsAssistantSelect" name="defaultAssistant">
            <option value="firey" ${settings.defaultAssistant === "firey" ? "selected" : ""}>Firey — energetic & loud</option>
            <option value="leafy" ${settings.defaultAssistant === "leafy" ? "selected" : ""}>Leafy — calm & helpful</option>
          </select>
        </div>
        <div class="admin-form-row">
          <label class="admin-label" for="settingsContextField">Conversation context</label>
          <input class="admin-input" id="settingsContextField" name="conversationContext" type="number" min="1" max="50" value="${esc(settings.conversationContext)}" />
          <span class="admin-field-hint">Recent messages the assistant remembers.</span>
        </div>
        <div class="admin-form-row">
          <label class="admin-label" for="settingsBucketSelect">Default upload bucket</label>
          <select class="admin-select" id="settingsBucketSelect" name="defaultBucket">
            ${buckets.map((b) => `<option value="${esc(b.name)}" ${b.name === defaultBucket ? "selected" : ""}>${esc(b.name)}${b.purpose ? ` — ${esc(b.purpose)}` : ""}</option>`).join("")}
          </select>
        </div>
        <label class="admin-checkbox-row">
          <input type="checkbox" name="argEnabled" ${settings.argEnabled ? "checked" : ""} />
          <span>Enable the ARG logo ritual (5 clicks on the logo to unlock hidden episodes)</span>
        </label>
        <div class="admin-modal__footer" style="margin-top:0">
          <button class="button button--ghost" type="button" data-admin-action="settings-reset">Reset to defaults</button>
          <button class="button button--primary" type="submit">Save settings</button>
        </div>
        <p class="admin-field-hint" id="settingsStatus"></p>
      </form>

      <div class="admin-card">
        <div class="admin-card__title">Catalog overrides</div>
        <p class="admin-field-hint">Admin edits to the catalog are stored as overrides in this browser (key <code>${esc(CONFIG.admin.catalogKey)}</code>) and layered on top of the live API catalog.</p>
        <div class="row-actions" style="margin-top:12px">
          <button class="button button--ghost button--small" type="button" data-admin-action="settings-view-catalog">View overrides</button>
          <button class="button button--ghost button--small" type="button" data-admin-action="catalog-clear">Clear all overrides</button>
        </div>
        <pre id="catalogOverridesPreview" class="admin-field-hint" style="margin-top:12px;white-space:pre-wrap"></pre>
      </div>
    `;

    $("#settingsForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveSettings();
    });
    refreshCatalogPreview();
  }

  function saveSettings() {
    const form = $("#settingsForm");
    if (!form) return;
    const formData = new FormData(form);
    const defaultAssistant = formData.get("defaultAssistant") === "leafy" ? "leafy" : "firey";
    const conversationContext = Math.max(1, Math.min(50, Number(formData.get("conversationContext")) || 8));
    const argEnabled = formData.get("argEnabled") === "on";
    const defaultBucket = configuredBucketName(String(formData.get("defaultBucket") || ""));

    settingsSet("defaultAssistant", defaultAssistant);
    settingsSet("conversationContext", conversationContext);
    settingsSet("argEnabled", argEnabled);
    settingsSet("defaultBucket", defaultBucket);
    B2.logActivity("Settings updated", `assistant=${defaultAssistant}, context=${conversationContext}, arg=${argEnabled}, bucket=${defaultBucket}`);
    renderSettings($("#viewSettings"));
    const status = $("#settingsStatus");
    if (status) status.textContent = "Settings saved.";
  }

  function resetSettings() {
    if (!confirm("Reset all site settings to their defaults?")) return;
    settingsSet("defaultAssistant", "firey");
    settingsSet("conversationContext", 8);
    settingsSet("argEnabled", true);
    settingsSet("defaultBucket", configuredBucketName("objectflix-videos"));
    B2.logActivity("Settings reset", "restored defaults");
    renderSettings($("#viewSettings"));
    const status = $("#settingsStatus");
    if (status) status.textContent = "Settings reset to defaults.";
  }

  function refreshCatalogPreview() {
    const el = $("#catalogOverridesPreview");
    if (!el) return;
    const patches = getPatches();
    el.textContent = Object.keys(patches).length ? JSON.stringify(patches, null, 2) : "No overrides yet.";
  }

  function viewCatalogPatches() {
    const patches = getPatches();
    openModal("Catalog overrides", `
      <pre style="max-height:60vh;overflow:auto;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:12px;padding:16px;font-size:0.85rem;white-space:pre-wrap">${esc(JSON.stringify(patches, null, 2))}</pre>
      <div class="admin-modal__footer">
        <button class="button button--ghost" type="button" data-admin-action="modal-close">Close</button>
      </div>
    `);
  }

  function clearCatalogPatches() {
    if (!confirm("Clear all catalog overrides? Shows and episodes will return to the live API state.")) return;
    SHARED.saveCatalogPatches({});
    B2.logActivity("Catalog overrides cleared", "");
    renderSettings($("#viewSettings"));
    refreshNavCounts();
  }

  function init() {
    session = ADMIN.session();
    if (!session) {
      showAccessDenied();
      return;
    }
    document.title = "Admin — Objectflix";
    showShell();
    renderIdentity();
    bindSidebar();
    bindGlobalEvents();
    bindModal();
    seedNavCounts();

    void loadRawCatalog()
      .then(() => {
        showView("dashboard");
        refreshNavCounts();
      })
      .catch((err) => {
        rawCatalog = { shows: [] };
        const panel = $("#viewDashboard");
        renderDashboard(panel);
        const note = document.createElement("div");
        note.className = "b2-banner";
        note.innerHTML = `<span>⚠️</span><div>Could not load the live catalog (${esc(err.message)}). Showing an empty catalog; admin edits will still apply.</div>`;
        panel.prepend(note);
        showView("dashboard");
      });

    startQueuePolling();
  }

  init();
})();
