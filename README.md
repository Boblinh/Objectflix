# Objectflix

**A community-focused streaming platform for animated series and object shows.**

Objectflix is a fan-made streaming platform built around discovering, watching, and keeping track of animated shows, with a particular focus on object-show communities. It combines a browser-based catalogue and video player with a separate API, subtitle tooling, account features, and community-oriented functionality.

The project is designed as a modular web application rather than a collection of static episode pages. The frontend handles the viewing experience, while a Cloudflare Worker provides API routes and connects the application to its data and storage services.

> **Project status:** Objectflix is actively developed. Some features depend on external services, deployment configuration, provider credentials, and ongoing security or compatibility work. A feature appearing in the codebase does not necessarily mean every production integration is fully configured or verified.

## About

Objectflix aims to make animated web series easier to browse and watch in one place. The platform brings together show and episode discovery, browser playback, subtitle support, a TV-oriented interface, user-facing account features, and community tools.

It is an independent fan project. Objectflix is not affiliated with, endorsed by, or an official service of the creators or rights holders of the shows represented in its catalogue.

## Features

### Catalogue and discovery
- Browse a catalogue of shows and their seasons.
- View episode information and navigate between episodes.
- Search the catalogue.
- Display show artwork and other catalogue metadata.

### Video player and subtitles
- Browser-based episode playback.
- Subtitle tracks associated with individual episodes.
- Support for styled subtitle presentation through the browser playback stack.
- Playback controls and player diagnostics.
- Dedicated watch pages and a separate TV-oriented viewing experience.

### TV Edition
- A dedicated interface for TV and larger-screen use.
- TV-specific browsing and playback pages.
- Navigation and layout tailored to remote-control or keyboard-style interaction.

### Accounts and community
- Account and authentication flows, including integrations for supported identity providers.
- User profile functionality and profile-related API routes.
- Community-facing features.
- Watch-history and membership-related interface components.

### Administration and operations
- Admin-facing pages and API functionality.
- Subtitle workshop/admin interface.
- Movie Night pages and administration tools.
- Environment-based configuration for local development and deployment.

### AI-assisted features
- Optional AI assistant functionality.
- Provider configuration for supported AI services.
- A Worker-hosted Azure Responses integration path.
- AI providers are configurable; availability depends on valid credentials and deployment settings.

### Audio and diagnostics
- Browser-based audio processing using the Web Audio API.
- Playback diagnostics to help investigate player and media issues.

## Architecture

Objectflix uses a **static frontend + serverless API** architecture.

```text
Objectflix
│
├── Frontend
│   ├── HTML pages
│   ├── CSS styles and responsive layouts
│   └── JavaScript application modules
│       ├── Catalogue and search
│       ├── Watch experience and player
│       ├── Subtitle handling
│       ├── TV Edition
│       ├── Accounts and profiles
│       ├── Community and Movie Nights
│       ├── Membership
│       └── AI assistant
│
├── API (Cloudflare Worker)
│   ├── Hono application/router
│   ├── Chanfana + OpenAPI 3.1 documentation
│   ├── Request schemas and validation
│   ├── Catalogue, episode and subtitle routes
│   ├── Authentication and profile routes
│   ├── Community and administration routes
│   ├── Membership-related services
│   └── External service integrations
│
├── Data and storage
│   ├── Cloudflare D1 (SQL database)
│   ├── D1 schema migrations
│   └── Backblaze B2 (media/object storage integration)
│
└── Delivery and tooling
    ├── GitHub Pages (frontend hosting)
    ├── Cloudflare Workers (API hosting)
    ├── Wrangler (Worker development and deployment)
    └── Node.js scripts and tests
```

### Request flow

1. A visitor loads the frontend hosted separately from the API.
2. Frontend JavaScript reads the configured API base URL and requests catalogue, account, community, or other application data.
3. The Cloudflare Worker receives the request and routes it through the Hono application.
4. Endpoint handlers validate request data and use the configured bindings or integrations, such as D1 or media storage.
5. The Worker returns a response for the frontend to render.
6. For playback, the browser loads the selected media and subtitle resources and handles presentation locally.

The frontend and API are deployed independently. This keeps the user interface separate from server-side operations and avoids putting private service credentials in public frontend files.

## Technology stack

| Area | Technologies |
| --- | --- |
| Frontend | HTML5, CSS, JavaScript (ES modules) |
| Backend runtime | Cloudflare Workers |
| API framework | Hono |
| API schema and documentation | Chanfana, OpenAPI 3.1 |
| Request validation | Zod |
| Relational data | Cloudflare D1 (SQLite-compatible SQL) |
| Media storage integration | Backblaze B2 |
| Browser audio | Web Audio API |
| Development runtime | Node.js |
| Worker tooling | Wrangler |
| Frontend hosting | GitHub Pages |
| Source control and automation | Git, GitHub, GitHub Actions |

Additional integrations are optional and depend on configuration. These include Firebase-related client functionality, Google and Discord authentication, configurable AI providers, and Stripe-related membership/payment functionality. Credentials and production availability must be configured separately.

## Repository layout

The repository is organized around the frontend application and the Worker backend.

```text
Objectflix/
├── .github/             # GitHub configuration and workflows
├── assets/              # Frontend artwork and static assets
├── scripts/             # Local development and environment scripts
├── src/                 # Frontend JavaScript modules
├── worker/
│   ├── migrations/      # D1 database migrations
│   ├── src/             # Worker router, routes and services
│   ├── test/            # Worker tests
│   ├── package.json     # Worker dependencies and scripts
│   └── wrangler.jsonc   # Cloudflare Worker configuration
├── index.html           # Main entry page
├── browse.html          # Catalogue browsing
├── watch.html           # Episode watching
├── tv.html              # TV Edition
├── tv-watch.html        # TV playback page
├── admin.html           # Administration interface
├── package.json         # Root scripts and project metadata
├── .env.example         # Frontend/build-time environment template
├── TASKS.md             # Development task board
└── LICENSE              # Project software license
```

The repository may gain or change files as development continues. Consult the actual directory tree when working on a particular module.

## API

The API lives in `worker/` and is built with Hono, Chanfana, and Zod.

The API includes catalogue routes for shows, seasons, episodes, subtitles, and search, alongside additional route groups for authentication, profiles, community features, administration, and other application services.

The Worker exposes OpenAPI documentation generated from the API definitions. During local development, the Swagger UI is available from the Worker development server's root route.

### Example catalogue routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/shows` | List shows |
| `GET` | `/api/shows/{id}` | Retrieve a show |
| `GET` | `/api/shows/{id}/seasons` | List a show's seasons |
| `GET` | `/api/seasons/{id}/episodes` | List episodes in a season |
| `GET` | `/api/episodes/{id}` | Retrieve an episode |
| `GET` | `/api/episodes/{id}/subtitles` | List an episode's subtitle tracks |
| `GET` | `/api/search?q=` | Search catalogue entries |

These are the catalogue route patterns; other API routes are defined in `worker/src/`. Check the generated OpenAPI document for the current complete API contract.

## Getting started

### Requirements

- Git
- Node.js and npm
- A Cloudflare account for running or deploying the Worker
- Service credentials only for the integrations you intend to run

### 1. Clone the repository

```bash
git clone https://github.com/Boblinh/Objectflix.git
cd Objectflix
```

### 2. Configure the frontend environment

Copy `.env.example` to `.env` and provide the values needed for your local setup.

The root project includes an environment-generation script:

```bash
npm install
npm run gen-env
```

Do not put private API keys, payment secrets, or OAuth client secrets in frontend-exposed configuration. Values generated into frontend files must be treated as public.

### 3. Configure the Worker

```bash
cd worker
npm install
```

Create a local `worker/.dev.vars` file using `worker/.dev.vars.example` as a reference. Put private Worker secrets there, not in the frontend `.env` file.

Review `worker/wrangler.jsonc` and make sure the D1 database and any required bindings match your own Cloudflare environment before running migrations or deploying.

### 4. Run the Worker locally

From the `worker/` directory:

```bash
npm run dev
```

Wrangler starts the local Worker development server. The API and its OpenAPI/Swagger interface are served from the local Worker origin, normally `http://localhost:8787`.

### 5. Run the frontend

The root project provides a development script:

```bash
cd ..
npm run dev
```

Use the local frontend URL printed by the script and configure the API base URL to point to the local Worker.

### Useful scripts

| Location | Command | Description |
| --- | --- | --- |
| Root | `npm run gen-env` | Generate frontend environment configuration |
| Root | `npm run dev` | Start the frontend development workflow |
| Root | `npm test` | Run the Worker test suite |
| `worker/` | `npm run dev` | Start the local Cloudflare Worker |
| `worker/` | `npm test` | Run Worker tests |
| `worker/` | `npm run check` | Run Wrangler's deployment dry-run check |
| `worker/` | `npm run deploy` | Deploy the Worker |

## Configuration and security

- Keep private credentials in Worker secrets or local ignored secret files.
- Never commit real API keys, OAuth client secrets, payment secrets, or storage credentials.
- Frontend environment variables are not secret. Anything bundled into browser-delivered JavaScript can be inspected by visitors.
- Configure OAuth callback URLs and allowed application origins for your own deployment.
- Review D1 bindings, database IDs, storage settings, and scheduled triggers before deploying.
- Do not assume that a successful local run proves production authentication, payment, storage permissions, or media delivery are correctly configured.

See `.env.example` and `worker/.dev.vars.example` for configuration names and guidance.

## Development status

Objectflix is an evolving project. The task board in [`TASKS.md`](./TASKS.md) tracks active work, blockers, and verification requirements.

Some areas still require additional security review, end-to-end testing, provider configuration, and real-world compatibility checks. In particular, authentication and profile ownership, playback across devices, production storage access, and catalogue content permissions must be verified independently.

Contributions and bug reports should include clear reproduction steps and relevant environment details. Never include secrets, private tokens, or personal account data in an issue.

## Licensing

The Objectflix software in this repository is licensed under the **GNU Affero General Public License v3.0 only (AGPL-3.0-only)**.

See [`LICENSE`](./LICENSE) for the complete license text.

In practical terms, the license permits use, modification, and redistribution under its terms. If you modify the covered software and make that modified version available for users to interact with over a network, AGPL-3.0's network-use requirements apply, including providing the corresponding source code as required by the license.

### Branding and third-party content

The software license does **not** automatically grant rights to the Objectflix name, logo, visual identity, or other branding. Do not present an independent fork or service as an official Objectflix project or imply endorsement or affiliation.

Videos, characters, artwork, music, subtitles, fonts, and other third-party materials are not automatically relicensed under AGPL-3.0. They remain subject to their respective copyright holders' terms and permissions. Check the rights for each asset before redistributing or using it.

## Credits

Created and maintained by **Boblinh**.

Objectflix is an independent fan-made project built with open web technologies and services from the providers listed above. All third-party names and marks belong to their respective owners.

---

Copyright © 2026 Boblinh. See [`LICENSE`](./LICENSE) for licensing terms.
