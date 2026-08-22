# Objectflix

A web-based streaming platform for animated shows and object shows.

Objectflix is a personal streaming-platform project focused on providing a clean viewing experience with browsing, video playback, subtitles, TV support, and AI-powered features.

## Features

- Browse shows and episodes
- Watch videos directly in the browser
- Subtitle support
- Responsive interface
- Dedicated TV Edition
- AI-powered assistants
- Browser-based audio processing
- Player diagnostics
- Cloudflare Worker backend
- Environment-based configuration

## Architecture

Objectflix uses a client/server architecture:
```
Objectflix
├── Frontend
│   ├── Browse
│   ├── Watch
│   ├── TV Edition
│   └── Admin
│
├── Player
│   ├── Video playback
│   ├── Subtitles
│   ├── Audio processing
│   └── Playback diagnostics
│
├── Backend
│   └── Cloudflare Worker
│
├── Data
│   ├── Shows
│   ├── Episodes
│   └── Metadata
│
├── Assets
│   ├── Posters
│   ├── Backdrops
│   ├── Logos
│   ├── Fonts
│   └── Subtitles
│
└── Deployment
    ├── GitHub Pages
    └── GitHub Actions
```
## Technologies

- HTML
- CSS
- JavaScript
- Cloudflare Workers
- Web Audio API
- GitHub Pages
- GitHub Actions

## Development

Clone the repository:

```bash
git clone https://github.com/Boblinh/Objectflix.git
cd Objectflix
