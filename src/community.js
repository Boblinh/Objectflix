(() => {
  const CONFIG = window.OBJECTFLIX_CONFIG;
  const API = window.OBJECTFLIX_API;
  const REQUESTS_KEY = (CONFIG?.admin?.requestKey) || "objectflix_community_requests";
  const FEEDBACK_KEY = (CONFIG?.admin?.feedbackKey) || "objectflix_community_feedback";
  const OUTBOX_KEY = (CONFIG?.admin?.communityOutboxKey) || "objectflix_community_outbox";
  const CATEGORIES = ["General", "Bug Report", "Feature Idea", "Content Suggestion", "Compliment", "Other"];

  // Reads a JSON list from localStorage, falling back to an empty list when parsing fails.
  function readStore(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  // Saves JSON under the given storage key and reports whether localStorage accepted it.
  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  // Returns the signed-in user's best available display name, or an empty string.
  function currentUserName() {
    let user = null;
    try {
      user = JSON.parse(localStorage.getItem("objectflix_current_user") || "null");
    } catch {
      
    }
    return user?.displayName || user?.username || user?.email || "";
  }

  

  // Returns the locally cached community requests.
  const listRequests = () => readStore(REQUESTS_KEY);
  // Returns the locally cached viewer feedback records.
  const listFeedback = () => readStore(FEEDBACK_KEY);

  // Trims request fields and fills the request type and submitter from safe defaults.
  function normalizeRequestPayload(payload) {
    return {
      type: payload.type === "episode" ? "episode" : "show",
      title: String(payload.title || "").trim(),
      episodeNumber: String(payload.episodeNumber || "").trim(),
      link: String(payload.link || "").trim(),
      notes: String(payload.notes || "").trim(),
      requestedBy: String(payload.requestedBy || currentUserName()).trim(),
    };
  }

  // Clamps the rating and normalizes feedback fields to supported categories and strings.
  function normalizeFeedbackPayload(payload) {
    return {
      rating: Math.max(1, Math.min(5, Number(payload.rating) || 0)),
      category: CATEGORIES.includes(payload.category) ? payload.category : "General",
      discord: String(payload.discord || "").trim(),
      message: String(payload.message || "").trim(),
      sentBy: String(payload.sentBy || currentUserName()).trim(),
    };
  }

  // Loads community submissions queued locally while the server was unreachable.
  function readOutbox() {
    return readStore(OUTBOX_KEY);
  }

  // Sends a normalized show/episode request, queueing it locally if the API call fails.
  async function addRequest(payload) {
    try {
      const entry = await API.submitCommunityRequest(normalizeRequestPayload(payload));
      return { ok: true, entry };
    } catch (error) {
      const outbox = readOutbox();
      outbox.push({ kind: "request", payload: normalizeRequestPayload(payload), queuedAt: Date.now(), error: error.message });
      writeStore(OUTBOX_KEY, outbox);
      return { ok: false, error };
    }
  }

  // Sends normalized feedback, queueing it locally if the API call fails.
  async function addFeedback(payload) {
    try {
      const entry = await API.submitCommunityFeedback(normalizeFeedbackPayload(payload));
      return { ok: true, entry };
    } catch (error) {
      const outbox = readOutbox();
      outbox.push({ kind: "feedback", payload: normalizeFeedbackPayload(payload), queuedAt: Date.now(), error: error.message });
      writeStore(OUTBOX_KEY, outbox);
      return { ok: false, error };
    }
  }

  // Retries queued submissions and returns how many were delivered, retaining failures.
  async function syncOutbox() {
    const outbox = readOutbox();
    if (!outbox.length) return 0;
    const remaining = [];
    for (const item of outbox) {
      try {
        if (item.kind === "request") await API.submitCommunityRequest(item.payload);
        else if (item.kind === "feedback") await API.submitCommunityFeedback(item.payload);
        else continue;
      } catch {
        remaining.push(item);
      }
    }
    writeStore(OUTBOX_KEY, remaining);
    return outbox.length - remaining.length;
  }

  // Counts submissions still waiting in the local outbox.
  function pendingOutboxCount() {
    return readOutbox().length;
  }

  

  // Fetches the admin request inbox, caches it locally, and returns the server records.
  async function fetchRequests() {
    const items = await API.listAdminCommunity("requests");
    writeStore(REQUESTS_KEY, items);
    return items;
  }

  // Fetches the admin feedback inbox, caches it locally, and returns the server records.
  async function fetchFeedback() {
    const items = await API.listAdminCommunity("feedback");
    writeStore(FEEDBACK_KEY, items);
    return items;
  }

  // Updates a request on the server and mirrors its new status in the local cache.
  async function setRequestStatus(id, status) {
    const result = await API.updateAdminCommunity("requests", id, { status });
    writeStore(REQUESTS_KEY, listRequests().map((item) => (item.id === id ? { ...item, status } : item)));
    return result;
  }

  // Updates feedback on the server and mirrors its new status in the local cache.
  async function setFeedbackStatus(id, status) {
    const result = await API.updateAdminCommunity("feedback", id, { status });
    writeStore(FEEDBACK_KEY, listFeedback().map((item) => (item.id === id ? { ...item, status } : item)));
    return result;
  }

  // Deletes one server request and removes it from the local cache.
  async function deleteRequest(id) {
    const result = await API.deleteAdminCommunity("requests", id);
    writeStore(REQUESTS_KEY, listRequests().filter((item) => item.id !== id));
    return result;
  }

  // Deletes one server feedback record and removes it from the local cache.
  async function deleteFeedback(id) {
    const result = await API.deleteAdminCommunity("feedback", id);
    writeStore(FEEDBACK_KEY, listFeedback().filter((item) => item.id !== id));
    return result;
  }

  // Attempts to delete all requests or just resolved ones, then removes targets locally.
  async function clearRequests(onlyResolved) {
    const items = listRequests();
    const targets = onlyResolved
      ? items.filter((item) => item.status !== "pending").map((item) => item.id)
      : items.map((item) => item.id);
    await Promise.allSettled(targets.map((id) => API.deleteAdminCommunity("requests", id)));
    const removed = new Set(targets);
    writeStore(REQUESTS_KEY, items.filter((item) => !removed.has(item.id)));
    return targets.length;
  }

  // Attempts to delete all feedback or just read entries, then removes targets locally.
  async function clearFeedback(onlyRead) {
    const items = listFeedback();
    const targets = onlyRead
      ? items.filter((item) => item.status !== "new").map((item) => item.id)
      : items.map((item) => item.id);
    await Promise.allSettled(targets.map((id) => API.deleteAdminCommunity("feedback", id)));
    const removed = new Set(targets);
    writeStore(FEEDBACK_KEY, items.filter((item) => !removed.has(item.id)));
    return targets.length;
  }

  

  let lastFocusedElement = null;

  // Returns the shared community dialog, creating and attaching it if necessary.
  function ensureModal() {
    let modal = document.getElementById("communityModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "communityModal";
      modal.className = "modal is-hidden community-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.innerHTML = `
        <div class="modal__backdrop" data-community-close="true"></div>
        <div class="modal__panel" role="document">
          <button class="modal__close" type="button" aria-label="Close" data-community-close="true">×</button>
          <div class="community-modal__header">
            <p class="eyebrow" data-community-eyebrow></p>
            <h2 data-community-title></h2>
          </div>
          <div class="community-modal__body" data-community-body></div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    return modal;
  }

  // Populates and opens the community dialog, focusing its first form control.
  function openCommunityModal({ eyebrow, title, bodyHTML }) {
    const modal = ensureModal();
    if (!modal.classList.contains("is-hidden") && !lastFocusedElement) {
      lastFocusedElement = document.activeElement;
    }
    modal.querySelector("[data-community-eyebrow]").textContent = eyebrow;
    modal.querySelector("[data-community-title]").textContent = title;
    modal.querySelector("[data-community-body]").innerHTML = bodyHTML;
    modal.classList.remove("is-hidden");
    modal.querySelector("[data-community-body] input, [data-community-body] textarea, [data-community-body] select")?.focus?.();
  }

  // Closes the dialog, clears its form markup, and restores the previous focus target.
  function closeCommunityModal() {
    const modal = document.getElementById("communityModal");
    if (!modal || modal.classList.contains("is-hidden")) return;
    modal.classList.add("is-hidden");
    modal.querySelector("[data-community-body]").innerHTML = "";
    if (lastFocusedElement instanceof HTMLElement && lastFocusedElement.isConnected) {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }

  // Replaces the form with a thank-you dialog using the supplied title and message.
  function showSuccess(title, message) {
    openCommunityModal({
      eyebrow: "THANK YOU",
      title,
      bodyHTML: `
        <div class="community-success">
          <div class="community-success__icon">🎉</div>
          <p style="color:var(--muted);margin-bottom:22px;">${message}</p>
          <div class="community-footer" style="justify-content:center">
            <button class="button button--primary" type="button" data-community-close="true">Done</button>
          </div>
        </div>
      `,
    });
  }

  // Escapes user-provided values before inserting them into generated HTML.
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[ch]);
  }

  

  // Returns the HTML form used to submit a show suggestion.
  function requestShowForm() {
    return `
      <form id="communityForm" class="community-form" data-form-type="show">
        <label class="community-label">Show title
          <input class="community-input" name="title" required maxlength="120" placeholder="e.g. Inanimate Insanity" />
        </label>
        <label class="community-label">Link to trailer / info <span class="community-hint">(optional)</span>
          <input class="community-input" name="link" type="url" placeholder="https://…" />
        </label>
        <label class="community-label">Why should we add it? <span class="community-hint">(optional)</span>
          <textarea class="community-textarea" name="notes" maxlength="1000" placeholder="Tell us what makes this show special…"></textarea>
        </label>
        <label class="community-label">Your name
          <input class="community-input" name="requestedBy" maxlength="80" value="${escapeHtml(currentUserName())}" />
        </label>
        <div class="community-footer">
          <button class="button button--ghost" type="button" data-community-close="true">Cancel</button>
          <button class="button button--primary" type="submit">Send Request</button>
        </div>
      </form>
    `;
  }

  // Returns an episode-request form with catalog suggestions and optional prefilled details.
  function requestEpisodeForm(prefill = {}) {
    const library = Array.isArray(window.OBJECTFLIX_LIBRARY) ? window.OBJECTFLIX_LIBRARY : [];
    const options = library.map((item) => `<option value="${escapeHtml(item.title)}"></option>`).join("");
    const episodeValue = [prefill.episodeNumber, prefill.episodeTitle]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(": ");
    return `
      <form id="communityForm" class="community-form" data-form-type="episode">
        <datalist id="communityShowOptions">${options}</datalist>
        <label class="community-label">Show
          <input class="community-input" name="title" required maxlength="120" list="communityShowOptions" placeholder="e.g. Battle for BFDI" value="${escapeHtml(prefill.title || "")}" />
        </label>
        <label class="community-label">Episode number or title
          <input class="community-input" name="episodeNumber" required maxlength="120" placeholder="e.g. 6 or &quot;The Big Finale&quot;" value="${escapeHtml(episodeValue)}" />
        </label>
        <label class="community-label">Anything else? <span class="community-hint">(optional)</span>
          <textarea class="community-textarea" name="notes" maxlength="1000" placeholder="Extra details that could help us find it…"></textarea>
        </label>
        <label class="community-label">Your name
          <input class="community-input" name="requestedBy" maxlength="80" value="${escapeHtml(currentUserName())}" />
        </label>
        <div class="community-footer">
          <button class="button button--ghost" type="button" data-community-close="true">Cancel</button>
          <button class="button button--primary" type="submit">Send Request</button>
        </div>
      </form>
    `;
  }

  let selectedRating = 0;

  // Renders five rating buttons, highlighting the stars up to the supplied rating.
  function starButtons(rating) {
    let html = '<div class="star-rating" role="radiogroup" aria-label="Rating">';
    for (let i = 1; i <= 5; i++) {
      html += `<button type="button" data-star="${i}" class="${i <= rating ? "is-lit" : ""}" aria-label="${i} star${i === 1 ? "" : "s"}">★</button>`;
    }
    return html + "</div>";
  }

  // Sets the initial rating and returns the feedback form markup.
  function feedbackForm(rating) {
    selectedRating = rating || 0;
    return `
      <form id="communityForm" class="community-form" data-form-type="feedback">
        <div class="community-label">How would you rate Objectflix?
          ${starButtons(selectedRating)}
          <span class="community-hint" data-rating-hint>${selectedRating ? `${selectedRating}/5` : "Tap a star to rate"}</span>
        </div>
        <label class="community-label">Category
          <select class="community-select" name="category">
            ${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("")}
          </select>
        </label>
        <label class="community-label">Discord username <span class="community-hint">(optional — so we can reach you)</span>
          <input class="community-input" name="discord" maxlength="60" placeholder="e.g. boblinh" />
        </label>
        <label class="community-label">Your feedback
          <textarea class="community-textarea" name="message" required maxlength="2000" placeholder="What did you love? What should we improve?"></textarea>
        </label>
        <label class="community-label">Your name
          <input class="community-input" name="sentBy" maxlength="80" value="${escapeHtml(currentUserName())}" />
        </label>
        <div class="community-footer">
          <button class="button button--ghost" type="button" data-community-close="true">Cancel</button>
          <button class="button button--primary" type="submit">Send Feedback</button>
        </div>
      </form>
    `;
  }

  // Opens the community dialog with the show-request form.
  function openRequestShow() {
    openCommunityModal({
      eyebrow: "COMMUNITY REQUEST",
      title: "Request a Show",
      bodyHTML: requestShowForm(),
    });
  }

  // Opens the community dialog with an episode-request form and optional prefill values.
  function openRequestEpisode(prefill) {
    openCommunityModal({
      eyebrow: "COMMUNITY REQUEST",
      title: "Request an Episode",
      bodyHTML: requestEpisodeForm(prefill || {}),
    });
  }

  // Opens the feedback dialog with no rating selected initially.
  function openFeedback() {
    openCommunityModal({
      eyebrow: "WE'D LOVE TO HEAR FROM YOU",
      title: "Send Feedback",
      bodyHTML: feedbackForm(0),
    });
  }

  // Updates star-button styling and the visible rating hint within a form container.
  function updateStars(container, rating) {
    container.querySelectorAll("[data-star]").forEach((btn) => {
      btn.classList.toggle("is-lit", Number(btn.dataset.star) <= rating);
    });
    const hint = container.querySelector("[data-rating-hint]");
    if (hint) hint.textContent = rating ? `${rating}/5` : "Tap a star to rate";
  }

  // Validates and sends a request or feedback form, showing success or offline-queue status.
  async function handleFormSubmit(form) {
    const formData = new FormData(form);
    const type = form.dataset.formType;
    const submitButton = form.querySelector('button[type="submit"]');
    // Disables the submit button while sending and restores its original label afterward.
    const setSending = (sending) => {
      if (submitButton) {
        submitButton.disabled = sending;
        submitButton.textContent = sending ? "Sending…" : submitButton.dataset.originalLabel;
      }
    };
    if (submitButton) {
      if (!submitButton.dataset.originalLabel) submitButton.dataset.originalLabel = submitButton.textContent;
      setSending(true);
    }

    try {
      if (type === "feedback") {
        if (!selectedRating) {
          const hint = form.querySelector("[data-rating-hint]");
          if (hint) hint.textContent = "Please pick a star rating first!";
          setSending(false);
          return;
        }
        const result = await addFeedback({
          rating: selectedRating,
          category: formData.get("category"),
          discord: formData.get("discord"),
          message: formData.get("message"),
          sentBy: formData.get("sentBy"),
        });
        if (result.ok) {
          showSuccess("Feedback sent!", "Thanks for helping Objectflix get better. Your feedback is now in the admin inbox.");
        } else {
          showSuccess("Saved for later", "We couldn't reach the server just now, so your feedback was stored on this device and will be delivered automatically.");
        }
        return;
      }

      const result = await addRequest({
        type,
        title: formData.get("title"),
        episodeNumber: formData.get("episodeNumber"),
        link: formData.get("link"),
        notes: formData.get("notes"),
        requestedBy: formData.get("requestedBy"),
      });
      if (result.ok) {
        showSuccess(
          "Request received!",
          type === "show"
            ? "Your show suggestion was delivered to the admins. Keep an eye on the catalog!"
            : "Your episode request was delivered to the admins. Keep an eye on the catalog!"
        );
      } else {
        showSuccess("Saved for later", "We couldn't reach the server just now, so your request was stored on this device and will be delivered automatically.");
      }
    } finally {
      if (submitButton && document.body.contains(submitButton)) setSending(false);
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    const closer = target.closest("[data-community-close]");
    if (closer) {
      event.preventDefault();
      closeCommunityModal();
      return;
    }

    const star = target.closest("[data-star]");
    if (star) {
      selectedRating = Number(star.dataset.star);
      updateStars(star.closest(".star-rating").parentElement, selectedRating);
      return;
    }

    const trigger = target.closest("[data-community-action]");
    if (trigger) {
      event.preventDefault();
      const action = trigger.dataset.communityAction;
      if (action === "request-show") openRequestShow();
      if (action === "request-episode") openRequestEpisode();
      if (action === "feedback") openFeedback();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCommunityModal();
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (form instanceof HTMLFormElement && form.id === "communityForm") {
      event.preventDefault();
      handleFormSubmit(form);
    }
  });

  void syncOutbox();

  window.OBJECTFLIX_COMMUNITY = {
    categories: CATEGORIES,
    listRequests,
    listFeedback,
    fetchRequests,
    fetchFeedback,
    addRequest,
    addFeedback,
    openEpisodeRequest: openRequestEpisode,
    syncOutbox,
    pendingOutboxCount,
    setRequestStatus,
    deleteRequest,
    clearRequests,
    setFeedbackStatus,
    deleteFeedback,
    clearFeedback,
  };
})();
