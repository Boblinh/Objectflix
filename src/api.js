


window.OBJECTFLIX_API = (() => {
  const { apiBaseUrl, endpoints, requestTimeoutMs, arg } = window.OBJECTFLIX_CONFIG;

  
  
  let unlocked = false;

  class ApiError extends Error {
    // Carries the HTTP status alongside a message for callers to branch on.
    constructor(message, status = 0) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }

  // Makes a timed GET request, optionally forwards cancellation, and parses API errors.
  async function request(path, { signal } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    // Forwards a caller's abort signal to the request's own controller.
    const onExternalAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    const headers = { Accept: "application/json" };
    if (unlocked) headers[arg.headerName] = arg.secret;

    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      let body = null;
      try {
        body = await res.json();
      } catch {

      }

      if (!res.ok) {
        const message = body?.error || body?.message || `Request failed (${res.status})`;
        throw new ApiError(message, res.status);
      }
      return body;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new ApiError("The request timed out. Check your connection and try again.", 0);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onExternalAbort);
    }
  }

  // Sends a timed JSON request and returns its parsed response or a status-bearing ApiError.
  async function send(path, { method = "POST", body, signal } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    if (signal?.aborted) controller.abort();

    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      let data = null;
      try {
        data = await res.json();
      } catch {

      }

      if (!res.ok) {
        const message = data?.error || data?.message || `Request failed (${res.status})`;
        throw new ApiError(message, res.status);
      }
      return data;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new ApiError("The request timed out. Check your connection and try again.", 0);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ApiError,

    
    
    // Enables or disables the configured ARG secret header on subsequent GET requests.
    setUnlocked(value) {
      unlocked = Boolean(value);
    },

    // Reports whether the ARG secret header is currently enabled.
    isUnlocked() {
      return unlocked;
    },

    // Returns the show array from the catalog endpoint, defaulting to an empty list.
    async listShows() {
      const data = await request(endpoints.shows);
      return data.shows || [];
    },

    // Fetches one show by its catalog ID and returns the show record.
    async getShow(id) {
      const data = await request(endpoints.show(id));
      return data.show;
    },

    // Returns a show's seasons, defaulting to an empty list when the response omits them.
    async getShowSeasons(showId) {
      const data = await request(endpoints.showSeasons(showId));
      return data.seasons || [];
    },

    // Returns a season's episodes, defaulting to an empty list when none are returned.
    async getSeasonEpisodes(seasonId) {
      const data = await request(endpoints.seasonEpisodes(seasonId));
      return data.episodes || [];
    },

    // Fetches one episode by its catalog ID and returns the episode record.
    async getEpisode(id) {
      const data = await request(endpoints.episode(id));
      return data.episode;
    },

    // Returns the subtitle tracks attached to an episode, or an empty list.
    async getEpisodeSubtitles(episodeId) {
      const data = await request(endpoints.episodeSubtitles(episodeId));
      return data.subtitles || [];
    },

    // Checks a media object by key and converts the API's exists value to a boolean.
    async mediaExists(key) {
      const data = await request(endpoints.mediaStatus(key));
      return Boolean(data.exists);
    },

    // Searches the catalog with optional cancellation and returns its result list.
    async searchShows(query, { signal } = {}) {
      const data = await request(endpoints.search(query), { signal });
      return data.results || [];
    },

    // Submits a normalized community request payload and returns the created request.
    async submitCommunityRequest(payload) {
      const data = await send(endpoints.communityRequests, { body: payload });
      return data.request;
    },

  // Submits feedback and returns the created feedback record.
  async submitCommunityFeedback(payload) {
    const data = await send(endpoints.communityFeedback, { body: payload });
    return data.feedback;
  },

  // Returns an episode's reviews together with the API's average and count.
  async listEpisodeReviews(episodeId) {
    const data = await request(endpoints.communityReviews(episodeId));
    return { reviews: data.reviews || [], average: data.average, count: data.count || 0 };
  },

  // Creates an episode review and returns the saved review record.
  async submitEpisodeReview(payload) {
    const data = await send(endpoints.communityReviewCreate, { body: payload });
    return data.review;
  },

  // Sends a public subtitle issue report through the membership request client.
  async submitSubtitleReport(payload) {
    const data = await window.OBJECTFLIX_MEMBERSHIP.request(endpoints.subtitleReports, { method: "POST", body: payload, public: true });
    return data.report;
  },

  // Sends a signed-in subtitle track submission through the membership request client.
  async submitSubtitleFile(payload) {
    const data = await window.OBJECTFLIX_MEMBERSHIP.request(endpoints.subtitleSubmissions, { method: "POST", body: payload });
    return data.submission;
  },

  // Returns the signed-in user's subtitle reports and submissions, defaulting missing lists.
  async listMySubtitleWorkshopItems() {
    const data = await window.OBJECTFLIX_MEMBERSHIP.request(endpoints.subtitleMine);
    return { reports: data.reports || [], submissions: data.submissions || [] };
  },

    // Returns the current account's profile records, or an empty list.
    async listProfiles() {
      const data = await window.OBJECTFLIX_MEMBERSHIP.request(endpoints.profiles);
      return data.profiles || [];
    },

    // Creates a profile for the signed-in account and returns the saved record.
    async createProfile(payload) {
      const data = await window.OBJECTFLIX_MEMBERSHIP.request(endpoints.profiles, { method: "POST", body: payload });
      return data.profile;
    },

    // Updates one encoded profile ID and returns its saved record.
    async updateProfile(id, payload) {
      const data = await window.OBJECTFLIX_MEMBERSHIP.request(endpoints.profile(encodeURIComponent(id)), { method: "PATCH", body: payload });
      return data.profile;
    },

    // Deletes one encoded profile ID for the signed-in account.
    async deleteProfile(id) {
      return window.OBJECTFLIX_MEMBERSHIP.request(endpoints.profile(encodeURIComponent(id)), { method: "DELETE" });
    },

    // Fetches the selected admin inbox and returns its feedback or request records.
    async listAdminCommunity(kind) {
      const endpoint = kind === "feedback" ? endpoints.adminCommunityFeedback : endpoints.adminCommunityRequests;
      const data = await request(endpoint);
      return kind === "feedback" ? data.feedback || [] : data.requests || [];
    },

    // Applies a partial update to one request or feedback record by encoded ID.
    async updateAdminCommunity(kind, id, patch) {
      const endpoint = (kind === "feedback" ? endpoints.adminCommunityFeedback : endpoints.adminCommunityRequests) + `/${encodeURIComponent(id)}`;
      return send(endpoint, { method: "PATCH", body: patch });
    },

    // Deletes one request or feedback record by encoded ID.
    async deleteAdminCommunity(kind, id) {
      const endpoint = (kind === "feedback" ? endpoints.adminCommunityFeedback : endpoints.adminCommunityRequests) + `/${encodeURIComponent(id)}`;
      return send(endpoint, { method: "DELETE" });
    },
  };
})();
