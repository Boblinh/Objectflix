// src/alpha-warning.js — first-visit alpha welcome + storage notice
(() => {
  const STORAGE_KEY = "objectflix_alpha_acknowledged";
  const B2_KEY = "objectflix_b2_notice_seen";

  function alreadySeen() {
    return localStorage.getItem(STORAGE_KEY) === "1";
  }

  function b2AlreadySeen() {
    return localStorage.getItem(B2_KEY) === "1";
  }

  function dismissAlpha() {
    localStorage.setItem(STORAGE_KEY, "1");
    const modal = document.getElementById("alphaWarningModal");
    if (modal) modal.classList.add("is-hidden");
    if (!b2AlreadySeen()) createB2Modal();
  }

  function dismissB2() {
    localStorage.setItem(B2_KEY, "1");
    const modal = document.getElementById("b2NoticeModal");
    if (modal) modal.classList.add("is-hidden");
  }

  // ── AV1 helper ──────────────────────────────────────────────────
  function browserSupportsAV1() {
    if (browserSupportsAV1._cached !== undefined) return browserSupportsAV1._cached;
    const probe = document.createElement("video");
    browserSupportsAV1._cached = [
      'video/mp4; codecs="av01.0.05M.08"',
      'video/mp4; codecs="av01.0.08M.08"',
    ].some((t) => {
      try { return !!probe.canPlayType(t); } catch { return false; }
    });
    return browserSupportsAV1._cached;
  }

  async function runAV1Check() {
    const container = document.getElementById("alphaAV1Results");
    if (!container) return;

    const library = window.OBJECTFLIX_LIBRARY;
    if (!library?.length) {
      container.innerHTML = '<p class="alpha-av1__empty">Catalog is still loading \u2014 close this and try the button again in a moment.</p>';
      return;
    }

    container.innerHTML = '<p class="alpha-av1__loading">Scanning catalog\u2026</p>';

    try {
      const safe = [];
      const av1Only = [];

      for (const item of library) {
        for (const ep of (item.episodes || [])) {
          if (!ep.videoUrl) continue;
          const label =
            `${item.title} \u2014 S${ep.seasonId ?? "?"}E${ep.episodeNumber ?? "?"} ${ep.title || ""}`.trim();
          try {
            const u = new URL(ep.videoUrl, location.href);
            const stem = u.pathname.match(/^(.*)\.[a-z0-9]+$/i);
            if (stem && !u.pathname.endsWith(".avc.mp4")) {
              u.pathname = `${stem[1]}.avc.mp4`;
              const r = await fetch(u.toString(), { method: "HEAD" });
              if (r.ok) { safe.push(label); continue; }
            }
          } catch { /* probe failed \u2192 treat as AV1-only */ }
          av1Only.push(label);
        }
      }

      if (safe.length === 0 && av1Only.length === 0) {
        container.innerHTML = '<p class="alpha-av1__empty">No episodes in the catalog yet.</p>';
        return;
      }

      let html = '<div class="alpha-av1__grid">';
      if (safe.length) {
        html += `<div class="alpha-av1__col">
          <h3 class="alpha-av1__heading">\u2705 Works on all devices (${safe.length})</h3>
          <ul class="alpha-av1__list">${safe.map((l) => `<li>${l}</li>`).join("")}</ul>
        </div>`;
      }
      if (av1Only.length) {
        html += `<div class="alpha-av1__col alpha-av1__col--warn">
          <h3 class="alpha-av1__heading">\u26a0\ufe0f AV1 only (${av1Only.length})</h3>
          <ul class="alpha-av1__list">${av1Only.map((l) => `<li>${l}</li>`).join("")}</ul>
        </div>`;
      }
      html += "</div>";
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<p class="alpha-av1__error">Scan failed: ${err.message}</p>`;
    }
  }

  // ── Template ────────────────────────────────────────────────────
  function createModal() {
    if (document.getElementById("alphaWarningModal")) return;

    const modal = document.createElement("div");
    modal.id = "alphaWarningModal";
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="modal__backdrop" data-alpha-close="true"></div>
      <div class="modal__panel" role="document" style="max-width:580px;text-align:left;padding:40px 36px 32px;">
        <button class="modal__close" id="alphaCloseBtn" type="button"
                aria-label="Close" data-alpha-close="true">\u00d7</button>

        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:3rem;">\ud83d\udea7</div>
          <p class="eyebrow">OBJECTFLIX \u2014 ALPHA BUILD</p>
          <h2 style="font-size:1.6rem;margin:8px 0 0;">Welcome!</h2>
        </div>

        <div class="alpha-section" style="margin-bottom:20px;">
          <p style="font-weight:700;color:#f0ad4e;margin-bottom:4px;">
            \u26a0 This project is still in ALPHA.
          </p>
          <p style="color:var(--muted);font-size:.95rem;">
            Things <em>will</em> change \u2014 UI tweaks, new features, maybe a few bumps
            along the way. Thanks for being an early explorer!
          </p>
        </div>

        <div class="alpha-section" style="margin-bottom:20px;">
          <p style="font-weight:700;margin-bottom:4px;">\ud83d\udcfa AV1 Video Notice</p>
          <p style="color:var(--muted);font-size:.95rem;">
            Some episodes are encoded in AV1 instead of the usual H.264 (AVC),
            so they may not play on older devices or browsers.
            We\u2019re still working on providing H.264 alternatives for everything.
          </p>
          <div style="margin-top:12px;">
            <button class="button button--ghost" type="button"
                    id="alphaAV1CheckBtn" style="font-size:.9rem;">
              ${browserSupportsAV1()
                ? "\u2705 Your device supports AV1"
                : "\ud83d\udd0d Check which episodes need AV1"}
            </button>
          </div>
          <div id="alphaAV1Results" class="alpha-av1__results"></div>
        </div>

        <div class="alpha-section" style="margin-bottom:24px;">
          <p style="font-weight:700;margin-bottom:4px;">\ud83d\udcac Got feedback? Want more shows?</p>
          <p style="color:var(--muted);font-size:.95rem;">
            Use the <strong>Send Feedback</strong> or <strong>Request Shows / Episodes</strong>
            buttons \u2014 we read every submission and it really helps shape the catalog.
          </p>
        </div>

        <div style="text-align:center;">
          <button class="button button--primary" type="button" id="alphaGotBtn">
            Got It \u2014 Let Me Watch!
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector("#alphaCloseBtn")?.addEventListener("click", dismissAlpha);
    modal.querySelector("#alphaGotBtn")?.addEventListener("click", dismissAlpha);
    modal.querySelectorAll("[data-alpha-close]").forEach((el) => {
      el.addEventListener("click", (e) => { if (e.target.dataset.alphaClose) dismissAlpha(); });
    });
    modal.querySelector("#alphaAV1CheckBtn")?.addEventListener("click", () => runAV1Check());

    modal.classList.remove("is-hidden");
  }

  // ── B2 storage notice modal ────────────────────────────────────
  function createB2Modal() {
    if (document.getElementById("b2NoticeModal")) return;

    const modal = document.createElement("div");
    modal.id = "b2NoticeModal";
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="modal__backdrop" data-b2-close="true"></div>
      <div class="modal__panel" role="document" style="max-width:520px;text-align:center;padding:40px 36px 32px;">
        <button class="modal__close" id="b2CloseBtn" type="button"
                aria-label="Close" data-b2-close="true">\u00d7</button>

        <div style="font-size:3rem;margin-bottom:16px;">\u26a0\ufe0f</div>
        <p class="eyebrow">STORAGE NOTICE</p>
        <h2 style="font-size:1.5rem;margin:8px 0 16px;">Heads up!</h2>

        <p style="color:var(--muted);font-size:.95rem;line-height:1.6;margin-bottom:20px;">
          Objectflix currently runs on <strong>Backblaze B2's free plan</strong>.
          Playback may stop working if the daily download limit is reached.
          We\u2019re working on a more permanent solution behind the scenes.
        </p>

        <p style="color:var(--muted);font-size:.9rem;margin-bottom:28px;">
          If videos stop loading, try again later \u2014 the limit resets every day.
        </p>

        <button class="button button--primary" type="button" id="b2GotBtn">
          Got It
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector("#b2CloseBtn")?.addEventListener("click", dismissB2);
    modal.querySelector("#b2GotBtn")?.addEventListener("click", dismissB2);
    modal.querySelectorAll("[data-b2-close]").forEach((el) => {
      el.addEventListener("click", (e) => { if (e.target.dataset.b2Close) dismissB2(); });
    });

    modal.classList.remove("is-hidden");
  }

  // ── Bootstrap ───────────────────────────────────────────────────
  function init() {
    if (!alreadySeen()) createModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
