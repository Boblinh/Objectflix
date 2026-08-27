import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { Show } from "./schemas";

export class ListShows extends OpenAPIRoute {
  schema = {
    tags: ["Shows"],
    summary: "List all shows",
    responses: {
      "200": {
        description: "Successful response with an array of shows",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              shows: z.array(Show),
            }),
            example: {
              success: true,
              shows: [],
            },
          },
        },
      },
    },
  };

  async handle(c) {
    const DB = c.env.DB;

    const { results } = await DB.prepare(
      "SELECT id, title, description, image FROM shows ORDER BY title"
    ).all();

    const shows = results.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      image: row.image ?? undefined,
    }));

    return {
      success: true,
      shows,
    };
  }
}
