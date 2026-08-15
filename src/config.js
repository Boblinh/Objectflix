


window.OBJECTFLIX_CONFIG = Object.freeze({
  
  apiBaseUrl: "https://objectflix-api.boblinh.workers.dev",

  
  

  
  requestTimeoutMs: 10000,

  endpoints: Object.freeze({
    shows: "/api/shows",
    show: (id) => `/api/shows/${id}`,
    showSeasons: (id) => `/api/shows/${id}/seasons`,
    seasonEpisodes: (id) => `/api/seasons/${id}/episodes`,
    episode: (id) => `/api/episodes/${id}`,
    episodeSubtitles: (id) => `/api/episodes/${id}/subtitles`,
    search: (query) => `/api/search?q=${encodeURIComponent(query)}`,
  }),

  
  
  
  
  arg: Object.freeze({
    logoClicksRequired: 5,
    clickWindowMs: 4000,
    headerName: "x-objectflix-unlock",
    secret: (window.__OBJECTFLIX_ENV__ && window.__OBJECTFLIX_ENV__.ARG_SECRET) || "flower-never-finds-peace",
    storageKey: "objectflix.argUnlocked",
    hiddenEpisodes: Object.freeze([
      Object.freeze({
        id: "f855fc40-5d4b-4d9f-ab37-722a8c82bca5",
        title: "BFDI 26: Flower's Revenge",
      }),
      Object.freeze({
        id: "c7506d25-b99c-4e7b-abd8-c1158ae124c7",
        title: "BFDI 26: Flower's Revenge (Story Accurate)",
        fakeDuration: "1:53:10:02",
      }),
    ]),
  }),

  upcoming: Object.freeze({
    episodes: Object.freeze([
      Object.freeze({
        id: "tpot-24-upcoming",
        showAcronym: "TPOT",
        episodeNumber: 24,
        title: "TPOT 24: Revelations of a Broken Past",
        description: "The highly anticipated 24th episode of Battle for Dream Island: The Power of Two.",
        releaseDate: "August 16, 2026 (Tomorrow)",
        released: false,
      }),
    ]),
  }),

  ai: Object.freeze({
    provider: "gemini",
    apiKey: (window.__OBJECTFLIX_ENV__ && window.__OBJECTFLIX_ENV__.GEMINI_API_KEY) || "",
    models: Object.freeze([
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemma-4-26b-a4b-it",
      "gemma-4-12b-it",
      "gemma-4-e4b-it",
      "gemma-4-e2b-it"
    ]),
  }),

  // B2 object-name prefixes used for the public catalog. These map the show
  // names in the Objectflix catalog to the folder used inside the B2 bucket.
  // An episode is always stored as:  <show>/<episode>.<extension>
  catalog: Object.freeze({
    showPrefixes: Object.freeze({
      BFDI: "bfdi",
      BFDIA: "bfdia",
      BFB: "bfb",
      TPOT: "tpot",
      BFDIE: "bfdie",
    }),
  }),

  // localStorage keys used by the admin panel.
  admin: Object.freeze({
    catalogKey: "objectflix_admin_catalog",
    queueKey: "objectflix_admin_upload_queue",
    activityKey: "objectflix_admin_activity",
    settingsKey: "objectflix_admin_settings",
  }),

  // Backblaze B2 media storage. Episode uploads go to a configured bucket and
  // are named <show>/<episode>.<extension> (e.g. bfdi/1a.mp4). The media files
  // are served to the site through `mediaBase` (the Objectflix API worker).
  //
  // Uploads are signed by the Objectflix API worker (see worker/). The browser
  // asks the worker for an upload URL + token, then streams the file straight
  // to B2. The B2 credentials live as Cloudflare env vars on the worker and are
  // never exposed to the browser — calling b2_authorize_account from a page
  // origin is blocked by B2's CORS rules. Admin uploads use a separate
  // write-capable key on the worker (B2_ADMIN_KEY_ID / B2_ADMIN_KEY) so the
  // read key that streams episodes is never granted write access.
  b2: Object.freeze({
    uploadEndpoint: "https://objectflix-api.boblinh.workers.dev/api/admin/uploads/sign",
    storageEndpoint: "https://objectflix-api.boblinh.workers.dev/api/admin/storage",
    // Legacy direct-to-B2 path (kept only as a fallback when no proxy endpoint
    // is configured). Browsers generally cannot call b2_authorize_account.
    accountId: "", // Backblaze B2 Key ID (applicationKeyId)
    applicationKey: "", // Backblaze B2 Application Key — keep private.
    mediaBase: "https://objectflix-api.boblinh.workers.dev/media",
    maxRetries: 2,
    buckets: Object.freeze([
      Object.freeze({
        name: "objectflix-videos",
        region: "us-west-004",
        purpose: "Episode video files served through the Objectflix API",
        default: true,
      }),
    ]),
  }),
});
