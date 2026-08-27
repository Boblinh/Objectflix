import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { Episode } from "./schemas";
import { displayEpisodeTitle } from "./episode_titles";
import { getMediaUrl } from "./b2";

export class GetSeasonEpisodes extends OpenAPIRoute {
  schema = {
    tags: ["Episodes"],
    summary: "List episodes for a season",
    request: {
      params: z.object({
        id: z.uuid(),
      }),
    },
    responses: {
      "200": {
        description: "Successful response with an array of episodes",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              episodes: z.array(Episode),
            }),
            example: {
              success: true,
              episodes: [
                {
                  id: "123e4567-e89b-12d3-a456-426614174002",
                  seasonId: "123e4567-e89b-12d3-a456-426614174001",
                  showId: "123e4567-e89b-12d3-a456-426614174000",
                  title: "Episode 1",
                  description: "Pilot episode",
                  image: "https://example.com/episode1.jpg",
                },
              ],
            },
          },
        },
      },
      "404": {
        description: "Season not found",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              error: z.string(),
            }),
            example: {
              success: false,
              error: "Season not found",
            },
          },
        },
      },
    },
  };

  async handle(c) {
    // Get validated path parameters
    const data = await this.getValidatedData();
    const { id } = data.params;

    const DB = c.env.DB;

    // Verify the season exists first
    const season = await DB.prepare("SELECT id FROM seasons WHERE id = ?").bind(id).first();
    if (!season) {
      return c.json({ success: false, error: "Season not found" }, 404);
    }

    const { results } = await DB.prepare(
      "SELECT id, season_id, show_id, episode_number, title, description, image, video_key FROM episodes WHERE season_id = ? AND hidden = 0 ORDER BY CAST(episode_number AS INTEGER), episode_number"
    ).bind(id).all();

    // The media proxy URL is origin-relative to this Worker, so it is cheaper
    // than the previous per-key B2 token dance and never exposes B2 credentials.
    const origin = new URL(c.req.url).origin;
    const episodes = results.map((row) => ({
      id: row.id,
      seasonId: row.season_id,
      showId: row.show_id,
      episodeNumber: row.episode_number,
      title: displayEpisodeTitle(row.title),
      description: row.description ?? undefined,
      image: row.image ?? undefined,
      videoUrl: getMediaUrl(origin, row.video_key),
    }));

    return {
      success: true,
      episodes,
    };
  }
}
