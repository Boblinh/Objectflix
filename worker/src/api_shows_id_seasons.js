import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { Season } from "./schemas";

export class GetShowSeasons extends OpenAPIRoute {
  schema = {
    tags: ["Seasons"],
    summary: "List seasons for a show",
    request: {
      params: z.object({
        id: z.uuid(),
      }),
    },
    responses: {
      "200": {
        description: "Successful response with an array of seasons",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              seasons: z.array(Season),
            }),
            example: {
              success: true,
              seasons: [
                {
                  id: "123e4567-e89b-12d3-a456-426614174001",
                  showId: "123e4567-e89b-12d3-a456-426614174000",
                  title: "Season 1",
                  episodeCount: 10,
                },
              ],
            },
          },
        },
      },
      "404": {
        description: "Show not found",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              error: z.string(),
            }),
            example: {
              success: false,
              error: "Show not found",
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

    // Verify the show exists first
    const show = await DB.prepare("SELECT id FROM shows WHERE id = ?").bind(id).first();
    if (!show) {
      return c.json({ success: false, error: "Show not found" }, 404);
    }

    const { results } = await DB.prepare(
      "SELECT id, show_id, title, episode_count FROM seasons WHERE show_id = ? ORDER BY title"
    ).bind(id).all();

    const seasons = results.map((row) => ({
      id: row.id,
      showId: row.show_id,
      title: row.title,
      episodeCount: row.episode_count,
    }));

    return {
      success: true,
      seasons,
    };
  }
}
