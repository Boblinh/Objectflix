# Objectflix API

A Cloudflare Worker REST API built with OpenAPI 3.1 using [chanfana](https://github.com/cloudflare/chanfana) and [Hono](https://github.com/honojs/hono).

This project generates the `openapi.json` schema automatically from code and validates incoming requests against the defined parameters and request bodies.

## Project structure

1. Your main router is defined in `src/index.js`.
2. Shared schemas/models live in `src/schemas.js`.
3. Each endpoint has its own file in `src/` (e.g. `src/api_shows_index.js`).
4. For more information read the [chanfana documentation](https://chanfana.pages.dev/) and [Hono documentation](https://hono.dev/docs).

## Development

1. Run `npm install` to install dependencies.
2. Run `npm run dev` to start a local instance of the API.
3. Open `http://localhost:8787/` in your browser to see the Swagger interface where you can try the endpoints.
4. Changes made in the `src/` folder will automatically trigger the server to reload, you only need to refresh the Swagger interface.

## Endpoints

- `GET /api/shows` - list shows
- `GET /api/shows/{id}` - get a show by ID
- `GET /api/shows/{id}/seasons` - list seasons for a show
- `GET /api/seasons/{id}/episodes` - list episodes for a season
- `GET /api/episodes/{id}` - get an episode by ID
- `GET /api/episodes/{id}/subtitles` - list subtitles for an episode
- `GET /api/search?q=` - search shows

Endpoints currently return placeholder data until a database (e.g. Cloudflare D1) is connected.

## Deployment

1. Sign up for [Cloudflare Workers](https://workers.dev). The free tier is more than enough for most use cases.
2. Run `wrangler login` to login to your Cloudflare account in wrangler.
3. Run `npm run deploy` to publish the API to Cloudflare Workers.
