import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { Episode } from "./schemas";
import { displayEpisodeTitle } from "./episode_titles";
import { getMediaUrl } from "./b2";

// ARG easter egg: the hidden BFDI 26 episodes are only served when the request
// proves the unlock (the logo-click ritual). Without the secret header they
// behave as 404s, exactly like a non-existent episode.
const UNLOCK_HEADER = "x-objectflix-unlock";
const UNLOCK_SECRET = "flower-never-finds-peace";

export class GetEpisode extends OpenAPIRoute {
  schema = {
    tags: ["Episodes"],
    summary: "Get an episode by ID",
    request: {
      params: z.object({
        id: z.uuid(),
      }),
    },
    responses: {
      "200": {
        description: "Successful response with a single episode",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              episode: Episode,
            }),
            example: {
              success: true,
              episode: {
                id: "123e4567-e89b-12d3-a456-426614174002",
                seasonId: "123e4567-e89b-12d3-a456-426614174001",
                showId: "123e4567-e89b-12d3-a456-426614174000",
                title: "Pilot Episode",
                description: "The first episode description",
                image: "https://example.com/pilot.jpg",
              },
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
    // Get validated path parameters
    const data = await this.getValidatedData();
    const { id } = data.params;

    const DB = c.env.DB;

    const episode = await DB.prepare(
      "SELECT id, season_id, show_id, episode_number, title, description, image, video_key, hidden FROM episodes WHERE id = ?"
    ).bind(id).first();

    if (!episode) {
      return c.json({ success: false, error: "Episode not found" }, 404);
    }

    // Hidden (ARG) episodes act as 404s unless the unlock header is present.
    if (episode.hidden === 1 && c.req.header(UNLOCK_HEADER) !== UNLOCK_SECRET) {
      return c.json({ success: false, error: "Episode not found" }, 404);
    }

    return {
      success: true,
      episode: {
        id: episode.id,
        seasonId: episode.season_id,
        showId: episode.show_id,
        episodeNumber: episode.episode_number,
        title: displayEpisodeTitle(episode.title),
        description: episode.description ?? undefined,
        image: episode.image ?? undefined,
        videoUrl: getMediaUrl(new URL(c.req.url).origin, episode.video_key),
      },
    };
  }
}
