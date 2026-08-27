import { fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ListShows } from "./api_shows_index";
import { GetShow } from "./api_shows_id";
import { GetShowSeasons } from "./api_shows_id_seasons";
import { GetSeasonEpisodes } from "./api_seasons_id_episodes";
import { GetEpisode } from "./api_episodes_id";
import { GetEpisodeSubtitles } from "./api_episodes_id_subtitles";
import { SearchShows } from "./api_search";
import { streamVideo, objectExists } from "./b2";
import { admin } from "./admin_api";
import { publicCommunity } from "./community_api";
import { profiles } from "./profiles_api";

// Media proxy key resolver: extracts the B2 object key from the URL path,
// e.g. /media/bfdi/26.mp4 -> "bfdi/26.mp4"
function resolveMediaKey(c) {
  const wildcard = c.req.path.slice("/media".length).replace(/^\/+/, "");
  return decodeURIComponent(wildcard);
}

 // Start a Hono app
const app = new Hono();

// The frontend is served from a different origin than the API, so cross-origin
// browser requests must be allowed. Registered before the OpenAPI routes so it
// applies to every /api/* handler (and the OPTIONS preflight).
app.use("/api/*", cors({ origin: "*" }));

// The media proxy is also consumed cross-origin by the Objectflix frontend
// (HTML5 <video> seeks fetch /media/* with Range headers). Same permissive
// CORS so playback is not blocked by the browser.
app.use("/media/*", cors({ origin: "*" }));

 // Setup OpenAPI registry
const openapi = fromHono(app, {
  docs_url: "/",
  schema: {
    info: {
      title: "Objectflix API",
      version: "0.1.0",
      description: "REST API for the Objectflix streaming platform.",
    },
  },
});

 // Register OpenAPI endpoints
openapi.get("/api/shows", ListShows);
openapi.get("/api/shows/:id", GetShow);
openapi.get("/api/shows/:id/seasons", GetShowSeasons);
openapi.get("/api/seasons/:id/episodes", GetSeasonEpisodes);
openapi.get("/api/episodes/:id", GetEpisode);
openapi.get("/api/episodes/:id/subtitles", GetEpisodeSubtitles);
openapi.get("/api/search", SearchShows);

// Admin endpoints (plain Hono, not OpenAPI): sign B2 uploads for the admin
// panel and report bucket info. b2_authorize_account can never be called from
// the browser (no CORS headers on account-level endpoints), so the Worker
// signs uploads here and the browser streams directly to the returned URL.
app.route("/api/admin", admin);

// Community submissions (viewer show/episode requests + feedback). Public
// POSTs from the browse page; management lives under /api/admin/community.
app.route("/api/community", publicCommunity);
app.route("/api/profiles", profiles);

 // You may also register routes for non OpenAPI directly on Hono
 // app.get('/test', (c) => c.text('Hono!'))

// ---------------------------------------------------------------------------
// Media streaming proxy (NEW): Browser -> Worker -> caches.default -> B2.
// Registered on plain Hono (not OpenAPI) so the private bucket stays hidden.
// Cache key is the normalized object key; the signed B2 token never appears
// in any URL handed to the browser.
//
// Multi-bucket: episodes.bucket (migration 0019) names the bucket holding the
// file. NULL = the default/legacy bucket, so existing episodes are untouched.
// ---------------------------------------------------------------------------
async function episodeBucket(env, key) {
  try {
    const row = await env.DB.prepare("SELECT bucket FROM episodes WHERE video_key = ?").bind(key).first();
    return row?.bucket || null;
  } catch (err) {
    // Never let a D1 hiccup break playback - fall back to the default bucket.
    console.error("[media] bucket lookup failed:", err);
    return null;
  }
}

const mediaHandler = async (c) => {
  const key = resolveMediaKey(c);
  if (!key) return c.text("Missing media key", 400);
  const bucket = await episodeBucket(c.env, key);
  return streamVideo(c.env, c.executionCtx, key, c.req.raw, bucket);
};

// Production route: /media/<b2 object key>, e.g. /media/bfdi/26.mp4
app.get("/media/*", mediaHandler);

// ---------------------------------------------------------------------------
// Media existence check: lets the watch page detect episodes whose video_key
// is set in D1 but whose file was never uploaded (or was removed) from B2,
// so it can show a friendly notice instead of a broken player.
// The key arrives URL-encoded in the query string; URLSearchParams already
// decoded it once, so use the value as-is.
// ---------------------------------------------------------------------------
app.get("/api/media/status", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ success: false, error: "Missing media key" }, 400);
  let exists = false;
  try {
    const bucket = await episodeBucket(c.env, key);
    exists = await objectExists(c.env, key, bucket);
  } catch (err) {
    console.error("[media-status] check failed:", err);
  }
  return c.json({ success: true, exists });
});

 // Export the Hono app
export default app;
