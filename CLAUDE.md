# LAN Paste

Cross-platform clipboard sharing over Tailscale/LAN. Copy on any device, paste on any other.

## Architecture

```
Web UI (React PWA)  ──┐
CLI (push/pull)     ──┤──▶  Server (Express + SQLite + WebSocket)  ◀── iOS Shortcuts
Daemon (watch)      ──┘     Hosted on homelab, binds 0.0.0.0:3456
```

Hub-and-spoke: central Express server on homelab, clients push/pull via REST + WebSocket real-time.

## Project Structure

Yarn workspaces monorepo with 4 packages:

| Package | Path | Purpose |
|---------|------|---------|
| `@lan-paste/shared` | `packages/shared/` | Types, constants, hash utility |
| `@lan-paste/server` | `packages/server/` | Express + SQLite + WebSocket server |
| `@lan-paste/cli` | `packages/cli/` | CLI tool + clipboard daemon |
| `@lan-paste/web` | `packages/web/` | React PWA (Vite + Tailwind v4) |

## Tech Stack

- **Runtime**: Node.js 22+
- **Language**: TypeScript (strict, ESM)
- **Package manager**: Yarn (v1 workspaces)
- **Server**: Express 4, express-ws, better-sqlite3, nanoid, zod
- **Frontend**: React 19, Vite 6, Tailwind CSS v4
- **CLI**: commander, chalk, ora, smol-toml
- **Clipboard**: wl-clipboard (Wayland), xclip (X11), PowerShell (Windows)
- **Build**: tsup (server/cli/shared), Vite (web)

## Quick Start

```bash
# Install dependencies
yarn

# Build shared package (required before server/cli)
yarn workspace @lan-paste/shared build

# Dev mode — server (port 3456)
yarn dev

# Dev mode — web UI (port 5173, proxies to server)
yarn dev:web

# CLI (via tsx during dev)
yarn workspace @lan-paste/cli dev push "hello"
yarn workspace @lan-paste/cli dev pull
yarn workspace @lan-paste/cli dev history
yarn workspace @lan-paste/cli dev watch --verbose
yarn workspace @lan-paste/cli dev config show
```

## Build

```bash
yarn workspace @lan-paste/shared build   # Must build first
yarn workspace @lan-paste/server build
yarn workspace @lan-paste/web build      # Server serves this in production
yarn workspace @lan-paste/cli build
```

## Environment

Server configured via `.env` file (copy `.env.example`). All vars have sane defaults.
Key vars: `LAN_PASTE_PORT`, `LAN_PASTE_HOST`, `LAN_PASTE_DB_PATH`, `LAN_PASTE_API_KEY`.

CLI configured via `~/.config/lan-paste/config.toml` or `LAN_PASTE_SERVER_URL` env var.

## Database

SQLite (better-sqlite3, WAL mode). Two tables: `clips` and `devices`.
Schema auto-created on first run. DB file at `LAN_PASTE_DB_PATH` (default: `./data/lan-paste.db`).

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/clips` | Push text (JSON) or image (multipart) |
| GET | `/api/clips/latest` | Latest clip |
| GET | `/api/clips` | History (paginated, filterable) |
| GET | `/api/clips/:id/image` | Image binary |
| DELETE | `/api/clips/:id` | Delete clip |
| GET | `/api/health` | Health + stats |
| WS | `/ws` | Real-time clip events |

## Key Patterns

- Text stored inline in SQLite, images as files on disk (`data/storage/images/YYYY/MM/`)
- WebSocket broadcasts `new_clip` to all connected clients except originator
- 3-layer loop prevention in clipboard daemon: server device filtering, client cooldown, hash dedup
- Server serves web UI build as static files in production
- Optional API key auth (Tailscale is primary security boundary)
- Hourly cleanup of expired clips (configurable retention days)
