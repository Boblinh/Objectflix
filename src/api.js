


window.OBJECTFLIX_API = (() => {
  const { apiBaseUrl, endpoints, requestTimeoutMs, arg } = window.OBJECTFLIX_CONFIG;

  
  
  let unlocked = false;

  class ApiError extends Error {
    constructor(message, status = 0) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }

  async function request(path, { signal } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
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

    
    
    setUnlocked(value) {
      unlocked = Boolean(value);
    },

    isUnlocked() {
      return unlocked;
    },

    async listShows() {
      const data = await request(endpoints.shows);
      return data.shows || [];
    },

    async getShow(id) {
      const data = await request(endpoints.show(id));
      return data.show;
    },

    async getShowSeasons(showId) {
      const data = await request(endpoints.showSeasons(showId));
      return data.seasons || [];
    },

    async getSeasonEpisodes(seasonId) {
      const data = await request(endpoints.seasonEpisodes(seasonId));
      return data.episodes || [];
    },

    async getEpisode(id) {
      const data = await request(endpoints.episode(id));
      return data.episode;
    },

    async getEpisodeSubtitles(episodeId) {
      const data = await request(endpoints.episodeSubtitles(episodeId));
      return data.subtitles || [];
    },

    async mediaExists(key) {
      const data = await request(endpoints.mediaStatus(key));
      return Boolean(data.exists);
    },

    async searchShows(query, { signal } = {}) {
      const data = await request(endpoints.search(query), { signal });
      return data.results || [];
    },

    async submitCommunityRequest(payload) {
      const data = await send(endpoints.communityRequests, { body: payload });
      return data.request;
    },

    async submitCommunityFeedback(payload) {
      const data = await send(endpoints.communityFeedback, { body: payload });
      return data.feedback;
    },

    async listAdminCommunity(kind) {
      const endpoint = kind === "feedback" ? endpoints.adminCommunityFeedback : endpoints.adminCommunityRequests;
      const data = await request(endpoint);
      return kind === "feedback" ? data.feedback || [] : data.requests || [];
    },

    async updateAdminCommunity(kind, id, patch) {
      const endpoint = (kind === "feedback" ? endpoints.adminCommunityFeedback : endpoints.adminCommunityRequests) + `/${encodeURIComponent(id)}`;
      return send(endpoint, { method: "PATCH", body: patch });
    },

    async deleteAdminCommunity(kind, id) {
      const endpoint = (kind === "feedback" ? endpoints.adminCommunityFeedback : endpoints.adminCommunityRequests) + `/${encodeURIComponent(id)}`;
      return send(endpoint, { method: "DELETE" });
    },
  };
})();
