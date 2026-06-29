# Nestiku - Personal Startpage

Personal startpage for private self-hosting setups.

Nestiku is a small, secure startpage with search, weather, bookmarks, first-run setup and a focused settings area. The interface follows the Pixel Soft Utility design direction: calm, consistent, touch-friendly and clear on desktop.

## Features

- protected personal startpage with clock, greeting, weather and search
- bookmarks with accent colors, text icons or cached favicons
- inline bookmark editing directly on the startpage
- switchable bookmark view: icons or list
- settings for location, weather, search engine and account data
- appearance controls in the profile menu
- first-run setup for the first admin account
- local JSON storage under `/data`
- Docker image for amd64 and arm64

## Quick Start

```bash
cp .env.example .env
```

Set at least `ISHIKU_SETUP_SECRET` in `.env`. A custom `SESSION_SECRET` is recommended; if it is empty, Nestiku creates a persistent secret at `/data/session_secret` on first start.

```bash
docker compose up -d
```

Open:

```text
http://localhost:8503
```

The container listens on port `8080` internally and publishes port `8503` on the host.

## Docker Compose

The Compose file is designed for self-hosting and appliance setups:

- image: `ghcr.io/maroishiku/nestiku:latest`
- long-syntax port mapping `8503 -> 8080`
- persistent bind mount `/DATA/AppData/ish_nestiku/data -> /data`
- installer-compatible `SESSION_SECRET` and `ISHIKU_SETUP_SECRET` environment variables
- automatic persistent session secret at `/data/session_secret` if `SESSION_SECRET` is empty
- read-only container with `tmpfs` for `/tmp`
- `cap_drop: ALL`, `no-new-privileges`, `privileged: false`
- `cap_add: CHOWN, SETGID, SETUID` for the entrypoint permission handoff
- healthcheck against `/readyz`
- CasaOS/ZimaOS-style `x-casaos` metadata

## GHCR

If an installer cannot pull the image, check that GitHub Packages exposes `ghcr.io/maroishiku/nestiku` publicly. The workflow under `.github/workflows/publish-image.yml` publishes `latest`, branch, tag and SHA tags.

## First Setup

The setup screen appears automatically on first open. You need:

- setup secret from `ISHIKU_SETUP_SECRET`
- display name
- admin username
- admin password

The admin password must be at least 12 characters long and must not match the setup secret. Public registration is closed after the first admin account is created.

## Security Notes

- no default credentials
- setup secret is checked server-side
- setup secret is supplied through `ISHIKU_SETUP_SECRET`
- session secret is loaded from `SESSION_SECRET` or persisted under `/data/session_secret`
- favicon requests block local and private target addresses
- Docker Compose runs the container read-only, without Linux capabilities and with `no-new-privileges`
- container runs as fixed UID/GID `10001` and only writes to `/data`
- CPU, memory and PID limits are set
- passwords are hashed with `scrypt`
- session cookies are `HttpOnly`, `SameSite=Strict` and secure when served behind HTTPS
- Content Security Policy blocks third-party scripts and frames

## Health Endpoints

```text
/healthz
/readyz
```

## Data Files

Nestiku stores all mutable data below `/data`:

```text
/data/auth.json
/data/settings.json
/data/links.json
/data/icons/
/data/session_secret
```

On Linux hosts, you may need to grant write access to the runtime user:

```bash
sudo mkdir -p /DATA/AppData/ish_nestiku/data
sudo chown -R 10001:10001 /DATA/AppData/ish_nestiku/data
```

## Local Development

```bash
npm install
npm run dev
```

Environment variables:

```text
PORT=8080
HOST=0.0.0.0
NESTIKU_DATA_DIR=./data
SESSION_SECRET=change-me
ISHIKU_SETUP_SECRET=change-me-too
```

## Build

```bash
docker build -t nestiku:local .
```

## License

MIT

## AI Notice

This project was created and refined with help from ChatGPT Codex. Operation, review, security and publication remain the responsibility of the repository owner.
