# LAN Paste — Full Implementation Plan

## Completed

### Phase 1: Core Server + CLI (Text) ✅

- [x] Yarn workspaces monorepo scaffold (shared, server, cli, web)
- [x] `@lan-paste/shared`: types, constants, SHA-256 hash utility
- [x] `@lan-paste/server`: Express + SQLite + nanoid
  - [x] `POST /api/clips` — push text with dedup (same hash + device within 5s)
  - [x] `GET /api/clips/latest` — latest clip (optionally exclude own device)
  - [x] `GET /api/clips` — paginated history with type/device filters
  - [x] `GET /api/clips/:id` — get specific clip
  - [x] `DELETE /api/clips/:id` — delete clip
  - [x] `GET /api/health` — health + stats
  - [x] Zod env validation, `.env` support via dotenv
  - [x] Optional API key auth middleware
  - [x] Hourly cleanup of expired clips (configurable retention days)
  - [x] Binds to `0.0.0.0` (Tailscale + LAN)
- [x] `@lan-paste/cli`: commander + chalk + ora
  - [x] `lan-paste push "text"` / `echo text | push` / `push -c` (clipboard)
  - [x] `lan-paste pull` (stdout) / `pull -c` (clipboard)
  - [x] `lan-paste history -n 20 --type text --json`
  - [x] Config from `~/.config/lan-paste/config.toml` or env vars
  - [x] Cross-platform clipboard: wl-clipboard (Wayland), xclip (X11), pbcopy/pbpaste (macOS), PowerShell (Windows)

### Phase 2: WebSocket Real-Time + Web UI ✅

- [x] `express-ws` WebSocket handler
  - [x] Client identify with device_id/name
  - [x] Broadcast `new_clip` to all except originator (loop prevention layer 1)
  - [x] Broadcast `clip_deleted` on delete
  - [x] 30s ping/pong keepalive, auto-reconnect with exponential backoff
- [x] `@lan-paste/web`: React 19 + Vite 6 + Tailwind CSS v4
  - [x] Dark theme (zinc), mobile-first responsive layout
  - [x] `PushForm`: textarea + Push button, "Push from Clipboard" button
  - [x] `ClipList`: reverse-chronological, tabs (All/Text/Images), real-time via WebSocket
  - [x] `ClipCard`: content preview, device badge, size, age, tap-to-copy, delete with confirm
  - [x] `Header`: app name + connection status dot + device name
  - [x] WebSocket hook with auto-reconnect and connection state
  - [x] Device ID/name auto-generated, stored in localStorage
  - [x] PWA manifest for iOS home screen install
- [x] Server serves web UI build as static files in production

### Phase 3: Image Support ✅

- [x] Server: multer multipart upload, images stored on disk (`data/storage/images/YYYY/MM/<id>.ext`)
- [x] Server: `GET /api/clips/:id/image` serves binary with correct Content-Type
- [x] Server: cleanup job deletes image files when clips expire
- [x] Server: dedup works for images (SHA-256 of buffer)
- [x] Server: MIME type validation (png, jpeg, gif, webp, svg)
- [x] CLI: `push -f screenshot.png` — push image file
- [x] CLI: `push -ci` — push clipboard image via wl-paste
- [x] CLI: `push -c` auto-detects text vs image in clipboard
- [x] CLI: `pull -o file.png` — save image to file
- [x] CLI: `pull -c` — copy image to clipboard via wl-copy
- [x] Web UI: "Upload Image" button with file picker
- [x] Web UI: drag-and-drop images onto PushForm
- [x] Web UI: paste images (Ctrl+V) in textarea
- [x] Web UI: "Push from Clipboard" auto-detects images
- [x] Web UI: image thumbnails in ClipCard with filename
- [x] Web UI: `ImagePreview` lightbox on image click
- [x] Web UI: tap image card to copy image to clipboard (ClipboardItem API)

### Phase 4: Clipboard Daemon ✅

- [x] `lan-paste watch` — bidirectional clipboard sync
- [x] Push direction: `wl-paste --watch` detects changes → read content → hash dedup → POST
- [x] Pull direction: WebSocket `new_clip` → `wl-copy` / `wl-copy -t <mime>`
- [x] 3-layer loop prevention:
  1. Server excludes originating device_id from WebSocket broadcast
  2. Client 2s cooldown after pull (ignores clipboard events)
  3. Hash dedup — skip push if content matches last pushed/pulled hash
- [x] Options: `--push-only`, `--pull-only`, `--no-images`, `--verbose`
- [x] Auto-reconnect WebSocket with exponential backoff (1s → 30s)
- [x] Wayland native via wl-clipboard, polling fallback for X11
- [x] Graceful shutdown on SIGINT/SIGTERM
- [x] systemd service files:
  - [x] `deploy/lan-paste-server.service` — system service (dedicated user, security hardened)
  - [x] `deploy/lan-paste-server-user.service` — user service (simpler)
  - [x] `deploy/lan-paste-watch.service` — user service for clipboard watcher

### Phase 5: Polish + iOS + Docs ✅

- [x] `lan-paste config init` — interactive first-run setup
- [x] `lan-paste config show` — print current config
- [x] `lan-paste config set <key> <value>` — update config
- [x] iOS Shortcuts documentation (`docs/ios-shortcuts.md`)
  - [x] Push to LAN Paste (Share Sheet, text + images)
  - [x] Pull from LAN Paste (widget/Siri, text + images)
  - [x] LAN Paste History (browse + pick)
- [x] PWA: SVG icon, favicon, apple-touch-icon
- [x] Web UI: green/gray connection status dot in header
- [x] `CLAUDE.md` — project instructions for AI assistants
- [x] `README.md` — quick start, architecture, configuration, usage
- [x] `.env.example` — all server env vars documented
- [x] `.gitignore` — covers node_modules, dist, .env, db, data, storage

---

## Remaining — Phase 6: Nice-to-haves

### Windows Support
- [ ] PowerShell clipboard watcher script (poll `Get-Clipboard` every 1s, POST on change)
- [ ] Tauri tray app (system tray icon, clipboard watching via Windows API, status indicator)
- [ ] Windows setup documentation (`docs/windows-setup.md`)

### Search & Organization
- [ ] `GET /api/clips?q=search+term` — full-text search on clip content
- [ ] Pin/star important clips (add `pinned` boolean to schema, pinned clips exempt from cleanup)
- [ ] Tags or labels for clips

### Performance & Media
- [ ] Thumbnail generation with `sharp` (generate on upload, serve smaller previews in list)
- [ ] Lazy loading / virtual scrolling for large clip history
- [ ] Clipboard image paste preview in PushForm before pushing

### Deployment
- [ ] Dockerfile + docker-compose.yml for server
- [ ] `lan-paste serve` command that bundles server + web in one process
- [ ] Automatic Tailscale IP detection for config init

### Security
- [ ] Per-device API keys (instead of one shared key)

### UX Polish
- [ ] Browser notifications on new clip (Notification API)
- [ ] Keyboard shortcuts in web UI (Ctrl+V to push, Ctrl+Shift+V to pull)
- [ ] Toast notifications with slide-in animation (replace current animate-pulse)
- [ ] Editable device name in web UI settings panel
- [ ] "Clear all clips" button with confirmation
- [ ] Responsive mobile bottom bar with push/pull quick actions
- [ ] macOS clipboard support in daemon (`pbcopy`/`pbpaste` with polling)

### CLI Improvements
- [ ] `lan-paste push --ttl 1h` — per-clip expiration
- [ ] `lan-paste delete <id>` — delete specific clip
- [ ] `lan-paste devices` — list connected devices
- [ ] Build standalone binary with `pkg` or Node SEA for easier install
- [ ] Shell completions (bash, zsh, fish)
