


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
    mediaStatus: (key) => `/api/media/status?key=${encodeURIComponent(key)}`,
    search: (query) => `/api/search?q=${encodeURIComponent(query)}`,
    communityRequests: "/api/community/requests",
    communityFeedback: "/api/community/feedback",
    adminCommunityRequests: "/api/admin/community/requests",
    adminCommunityFeedback: "/api/admin/community/feedback",
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
    episodes: Object.freeze([]),
  }),

  ai: Object.freeze({
    provider: "gemini",
    apiKey: (window.__OBJECTFLIX_ENV__ && window.__OBJECTFLIX_ENV__.GEMINI_API_KEY) || "",
    apiKeys: Object.freeze(
      ((window.__OBJECTFLIX_ENV__ && window.__OBJECTFLIX_ENV__.GEMINI_API_KEY) || "")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    ),
    models: Object.freeze([
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite"
    ]),
    
    
    
    fallbacks: Object.freeze([
      Object.freeze({
        id: "groq",
        name: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        envKey: "GROQ_API_KEY",
        models: Object.freeze([
          "groq/compound",
          "groq/compound-mini",
          "openai/gpt-oss-120b",
          "llama-3.3-70b-versatile",
          "llama-3.1-8b-instant",
        ]),
      }),
      Object.freeze({
        id: "cerebras",
        name: "Cerebras",
        baseUrl: "https://api.cerebras.ai/v1",
        envKey: "CEREBRAS_API_KEY",
        models: Object.freeze([
          "llama-3.3-70b",
          "llama-3.1-8b",
        ]),
      }),
      Object.freeze({
        id: "mistral",
        name: "Mistral",
        baseUrl: "https://api.mistral.ai/v1",
        envKey: "MISTRAL_API_KEY",
        models: Object.freeze([
          "mistral-small-latest",
          "open-mistral-nemo",
        ]),
      }),
    ]),
  }),

  
  
  
  catalog: Object.freeze({
    showPrefixes: Object.freeze({
      BFDI: "bfdi",
      BFDIA: "bfdia",
      BFB: "bfb",
      TPOT: "tpot",
      BFDIE: "bfdie",
      "Inanimate Insanity": "ii",
    }),
  }),

  
  admin: Object.freeze({
    catalogKey: "objectflix_admin_catalog",
    queueKey: "objectflix_admin_upload_queue",
    activityKey: "objectflix_admin_activity",
    settingsKey: "objectflix_admin_settings",
    requestKey: "objectflix_community_requests",
    feedbackKey: "objectflix_community_feedback",
  }),

  
  
  
  
  
  
  
  
  
  
  
  b2: Object.freeze({
    uploadEndpoint: "https://objectflix-api.boblinh.workers.dev/api/admin/uploads/sign",
    storageEndpoint: "https://objectflix-api.boblinh.workers.dev/api/admin/storage",
    
    
    accountId: "", 
    applicationKey: "", 
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
