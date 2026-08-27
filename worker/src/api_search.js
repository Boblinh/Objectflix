import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { Show } from "./schemas";

export class SearchShows extends OpenAPIRoute {
  schema = {
    tags: ["Search"],
    summary: "Search shows by query string",
    request: {
      query: z.object({
        q: z.string().optional(),
      }),
    },
    responses: {
      "200": {
        description: "Search results",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              results: z.array(Show),
            }),
            example: {
              success: true,
              results: [
                {
                  id: "123e4567-e89b-12d3-a456-426614174000",
                  title: "Sample Show",
                  description: "A sample show description",
                  image: "https://example.com/image.jpg",
                },
              ],
            },
          },
        },
      },
    },
  };

  async handle(c) {
    // Get validated query parameters
    const data = await this.getValidatedData();
    const query = data.query?.q || "";

    const DB = c.env.DB;

    const { results } = await DB.prepare(
      "SELECT id, title, description, image FROM shows WHERE title LIKE ? ORDER BY title"
    ).bind(`%${query}%`).all();

    const shows = results.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      image: row.image ?? undefined,
    }));

    return {
      success: true,
      results: shows,
    };
  }
}
