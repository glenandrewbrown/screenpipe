# CLAUDE.md

Screenpipe is a desktop application for continuous screen and audio capture with AI-powered search. Built with Rust backend (audio/vision/server) and Tauri + Next.js frontend.

## Package Manager
- Use `bun` for JS/TS (not npm or pnpm)
- Use `cargo` for Rust

## Key Directories
- `screenpipe-app-tauri/` - Desktop app (Tauri + Next.js, **excluded** from Cargo workspace)
- `screenpipe-server/` - Core backend API server (Rust)
- `screenpipe-audio/` - Audio capture/transcription (Rust)
- `screenpipe-vision/` - Screen capture/OCR (Rust)
- `screenpipe-db/` - Database layer (Rust)
- `screenpipe-core/` - Shared core types and utilities (Rust)
- `screenpipe-events/` - Event system (Rust)
- `screenpipe-integrations/` - External integrations incl. MCP server (Rust)
- `screenpipe-js/` - JavaScript/TypeScript SDKs
- `pipes/` - Plugin examples (Next.js)

## Analytics
- PostHog Project ID: 27525, Host: eu.i.posthog.com
- API key: set in `.env.local` (gitignored, create manually if needed)

## What NOT to mention
- Pipe store (removed)
- Pipes marketplace (removed)

## Testing
- `cargo test` for Rust
- `cd screenpipe-app-tauri && bun test` for JS/TS (vitest)
- **Preferred E2E:** `cd screenpipe-app-tauri && bun test:e2e:playwright` (Playwright)
- Legacy E2E: `cd screenpipe-app-tauri && bun test:e2e` (WebdriverIO — avoid for new tests)

### Mandatory App Build Verification Rule
**No test or task may be marked as completed unless the app builds and launches successfully.**
1. Build the full Tauri app: `cd screenpipe-app-tauri && bun tauri build`
2. Launch the built app: `open src-tauri/target/release/bundle/macos/screenpipe.app`
3. Verify no crash by checking process is running: `pgrep -f screenpipe`
4. Unit tests passing alone is NOT sufficient — the .app must build and launch

## macOS Dev Builds
- Dev builds are signed with a developer certificate for consistent permissions
- Config: `screenpipe-app-tauri/src-tauri/tauri.conf.json` → `bundle.macOS.signingIdentity`
- This ensures macOS TCC recognizes the app across rebuilds (permissions persist)
- Other devs without the cert will see permission issues - onboarding has "continue anyway" button after 5s

---

## Project Commands

```bash
# Development
cd screenpipe-app-tauri && bun dev          # Next.js dev server only
cd screenpipe-app-tauri && bun tauri dev    # Full Tauri dev mode (Rust + Next.js)
cargo build --release                       # Build Rust backend
cargo build --profile release-dev           # Fast release build (3-5x faster)

# Testing
cargo test                                              # Rust tests
cd screenpipe-app-tauri && bun test                     # Frontend unit tests (vitest)
cd screenpipe-app-tauri && bun test:e2e:playwright      # E2E tests (Playwright, preferred)
cd screenpipe-app-tauri && bun test:e2e                 # E2E tests (WebdriverIO, legacy)

# Building
cd screenpipe-app-tauri && bun tauri:build  # Full macOS build (runs scripts/build_macos.sh)

# Quality Checks (CI enforced)
cargo clippy --workspace --all-targets -- -W clippy::all   # Rust linting
cargo fmt --all -- --check                                  # Rust formatting
```

---

## Key Files

| File | Purpose |
|------|---------|
| `Cargo.toml` | Workspace root, all Rust crates |
| `screenpipe-app-tauri/package.json` | Frontend deps, scripts |
| `screenpipe-app-tauri/src-tauri/` | Tauri Rust backend |
| `screenpipe-server/src/` | Core API server |
| `screenpipe-audio/src/` | Audio capture, whisper transcription |
| `screenpipe-vision/src/` | Screen capture, OCR |
| `screenpipe-db/src/` | Database layer (SQLite via SQLx, migrations in screenpipe-db/src/migrations/) |
| `scripts/build_macos.sh` | macOS build script (called by `bun tauri:build`) |

---

## Architecture Notes

- **Candle** (HuggingFace Rust ML) for local inference — pinned to a specific git rev, not crates.io
- **Whisper** for audio transcription (whisper-rs)
- **Tauri v2** with plugin system (shell, dialog, store, updater, deep-link)
- **Next.js 15** with App Router for UI
- **SQLite** (via SQLx) for local data storage, schema managed by SQL migrations
- **Sentry** for error tracking (Rust + React)
- **PostHog** for analytics

## Gotchas
- `screenpipe-app-tauri/src-tauri/` is **excluded** from the Cargo workspace — it builds separately
- Candle dependencies use a pinned git revision (`c930ab7e`), not crates.io versions
- `bun tauri:build` delegates to `scripts/build_macos.sh` which may have signing/env prerequisites
- `bun dev` starts only Next.js; use `bun tauri dev` for the full Tauri + Next.js dev experience
- Deprecated features: Pipe Store and Pipes Marketplace have been removed — do not reference them
