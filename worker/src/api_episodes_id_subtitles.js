// Objectflix: this is the api_episodes_id_subtitles part, kept here so the rest of the app knows exactly where to look.
import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { Subtitle } from "./schemas";
import { getMediaUrl } from "./b2";

const UNLOCK_HEADER = "x-objectflix-unlock";
const UNLOCK_SECRET = "flower-never-finds-peace";

export class GetEpisodeSubtitles extends OpenAPIRoute {
  schema = {
    tags: ["Subtitles"],
    summary: "List subtitles for an episode",
    request: {
      params: z.object({
        id: z.uuid(),
      }),
    },
    responses: {
      "200": {
        description: "Successful response with an array of subtitles",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              subtitles: z.array(Subtitle),
            }),
            example: {
              success: true,
              subtitles: [
                {
                  id: "123e4567-e89b-12d3-a456-426614174003",
                  episodeId: "123e4567-e89b-12d3-a456-426614174002",
                  language: "en",
                  url: "https://example.com/subtitles/en.vtt",
                },
              ],
            },
          },
        },
      },
      "404": {
        description: "Episode not found",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              error: z.string(),
            }),
            example: {
              success: false,
              error: "Episode not found",
            },
          },
        },
      },
    },
  };

  async handle(c) {
    
    const data = await this.getValidatedData();
    const { id } = data.params;

    const DB = c.env.DB;

    
    const episode = await DB.prepare("SELECT id, hidden FROM episodes WHERE id = ?").bind(id).first();
    if (!episode) {
      return c.json({ success: false, error: "Episode not found" }, 404);
    }

    
    if (episode.hidden === 1 && c.req.header(UNLOCK_HEADER) !== UNLOCK_SECRET) {
      return c.json({ success: false, error: "Episode not found" }, 404);
    }

    const { results } = await DB.prepare(
      "SELECT id, episode_id, language, url, attribution FROM subtitles WHERE episode_id = ? ORDER BY language"
    ).bind(id).all();

    
    
    
    const origin = new URL(c.req.url).origin;
    const subtitles = results.map((row) => ({
      id: row.id,
      episodeId: row.episode_id,
      language: row.language,
      url: resolveSubtitleUrl(origin, row.url),
      attribution: row.attribution ?? undefined,
    }));

    return {
      success: true,
      subtitles,
    };
  }
}

function resolveSubtitleUrl(origin, url) {
  if (!url) return undefined;
  if (/^https?:\/\//.test(url)) return url;
  if (url.startsWith("/api/")) return `${origin}${url}`;
  const key = url.replace(/^\/media\//, "");
  return getMediaUrl(origin, key);
}
