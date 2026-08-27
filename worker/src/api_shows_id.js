import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { Show } from "./schemas";

export class GetShow extends OpenAPIRoute {
  schema = {
    tags: ["Shows"],
    summary: "Get a show by ID",
    request: {
      params: z.object({
        id: z.uuid(),
      }),
    },
    responses: {
      "200": {
        description: "Successful response with a single show",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              show: Show,
            }),
            example: {
              success: true,
              show: {
                id: "123e4567-e89b-12d3-a456-426614174000",
                title: "Sample Show",
                description: "A sample show description",
                image: "https://example.com/image.jpg",
              },
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

    const show = await DB.prepare(
      "SELECT id, title, description, image FROM shows WHERE id = ?"
    ).bind(id).first();

    if (!show) {
      return c.json({ success: false, error: "Show not found" }, 404);
    }

    return {
      success: true,
      show: {
        id: show.id,
        title: show.title,
        description: show.description ?? undefined,
        image: show.image ?? undefined,
      },
    };
  }
}
