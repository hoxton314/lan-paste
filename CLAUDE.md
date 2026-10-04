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
| `@lan-paste/shared` | `packages/shared/` | Types, constants, hash utility; `@lan-paste/shared/crypto` (E2E, browser-safe) |
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

## Build & Test

```bash
yarn build       # shared → web → server → cli (shared must build first)
yarn typecheck
yarn test        # vitest: shared (crypto), server (API/WS/migrations via supertest), cli
docker compose up -d   # server in Docker, data in a volume
```

CI: `.github/workflows/ci.yml` (typecheck, test, build, docker build).

## Environment

Server configured via `.env` file (copy `.env.example`). All vars have sane defaults.
Key vars: `LAN_PASTE_PORT`, `LAN_PASTE_HOST`, `LAN_PASTE_DB_PATH`, `LAN_PASTE_API_KEY`.

CLI configured via `~/.config/lan-paste/config.toml` or `LAN_PASTE_SERVER_URL` env var.

## Database

SQLite (better-sqlite3, WAL mode). Tables: `clips`, `devices`, `clips_fts` (FTS5, keyed by clip id, kept in sync by triggers).
Schema managed by ordered migrations in `packages/server/src/db.ts` (`PRAGMA user_version`); never edit a released migration, append a new one.
DB file at `LAN_PASTE_DB_PATH` (default: `./data/lan-paste.db`).

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/clips` | Push text (JSON) or image/file (multipart `file`); options `expires_in`, `burn_after_read`, `encrypted`, `target_device_id`, `platform` |
| GET | `/api/clips/latest` | Latest clip (`?device_id=` = requester: excludes own/targeted-elsewhere/one-time) |
| GET | `/api/clips` | History: `limit`, `offset`, `before`, `type`, `device_id`, `q` (FTS), `pinned` |
| GET/PATCH/DELETE | `/api/clips/:id` | Get / `{pinned}` / delete |
| POST | `/api/clips/:id/reveal` | Read + delete one-time text clip |
| GET | `/api/clips/:id/image` | Inline image (not one-time/encrypted) |
| GET | `/api/clips/:id/file` | Attachment download (one-time files deleted after) |
| GET | `/api/devices` | Devices + online status |
| GET | `/api/health` | Version, schema version, stats |
| WS | `/ws` | `new_clip`, `clip_updated`, `clip_deleted`, `devices_changed` |

## Key Patterns

- Text stored inline in SQLite, images/files on disk (`data/storage/{images,files}/YYYY/MM/`)
- Every read filters expired clips (`NOT_EXPIRED` in db.ts); cleanup (every minute) only reclaims space
- One-time clips: `content`/`image_url` withheld in responses; `/reveal` or `/file` consumes them
- E2E: clients encrypt with `@lan-paste/shared/crypto` (pure-JS @noble, works over plain HTTP); server only sees `encrypted=1` + ciphertext
- Uploaded blobs served with sandbox CSP + nosniff (SVG/HTML XSS)
- WebSocket broadcasts `new_clip` to all connected clients except originator
- 3-layer loop prevention in clipboard daemon: server device filtering, client cooldown, hash dedup
- Server serves web UI build as static files in production
- Optional API key auth (Tailscale is primary security boundary)
- Retention cleanup skips pinned clips; `LAN_PASTE_RETENTION_DAYS=0` disables it
- `createApp()` in `server/src/app.ts` is the testable app; `index.ts` only boots it
