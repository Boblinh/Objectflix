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
import { DiscordAuthCallback } from "./api_auth_discord";
import { FirebaseAuthCallback } from "./api_auth_firebase";
import { account } from "./membership/identity.js";
import { membership } from "./membership/api.js";
import { movieNights, movieNightAdmin } from "./membership/movie-nights.js";
import { stripeWebhooks, processPendingWebhooks } from "./membership/webhooks.js";
import { azureAI } from "./azure_api.js";
import { subtitleWorkshop } from "./subtitle_workshop.js";

function resolveMediaKey(c) {
  const wildcard = c.req.path.slice("/media".length).replace(/^\/+/, "");
  return decodeURIComponent(wildcard);
}

 
const app = new Hono();

app.use("/api/*", cors({ origin: "*" }));

app.use("/media/*", cors({ origin: "*" }));

 
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

 
openapi.get("/api/shows", ListShows);
openapi.get("/api/shows/:id", GetShow);
openapi.get("/api/shows/:id/seasons", GetShowSeasons);
openapi.get("/api/seasons/:id/episodes", GetSeasonEpisodes);
openapi.get("/api/episodes/:id", GetEpisode);
openapi.get("/api/episodes/:id/subtitles", GetEpisodeSubtitles);
openapi.get("/api/search", SearchShows);

app.route("/api/admin", admin);

app.route("/api/community", publicCommunity);
app.route("/api/subtitle-workshop", subtitleWorkshop);
app.route("/api/profiles", profiles);
openapi.post("/api/auth/discord", DiscordAuthCallback);
openapi.post("/api/auth/firebase", FirebaseAuthCallback);
app.route("/api/account", account);
app.route("/api/membership", membership);
app.route("/api/movie-nights", movieNights);
app.route("/api/movie-night-admin", movieNightAdmin);
app.route("/api/stripe/webhook", stripeWebhooks);
app.route("/api/ai", azureAI);

 
 

async function episodeBucket(env, key) {
  try {
    const row = await env.DB.prepare("SELECT bucket FROM episodes WHERE video_key = ?").bind(key).first();
    if (row?.bucket) return row.bucket;
    const sub = await env.DB.prepare("SELECT bucket FROM subtitles WHERE url = ?").bind("/media/" + key).first();
    return sub?.bucket || null;
  } catch (err) {
    
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

app.get("/media/*", mediaHandler);

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

 
export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(processPendingWebhooks(env));
  },
};
