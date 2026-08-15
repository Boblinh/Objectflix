


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

    async searchShows(query, { signal } = {}) {
      const data = await request(endpoints.search(query), { signal });
      return data.results || [];
    },
  };
})();
