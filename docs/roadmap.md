# Roadmap

## Milestones

### M0: Foundation ✅
- [x] Git repository, `.gitignore`, `.gitattributes`, `.editorconfig`
- [x] Documentation: specification, architecture, data model, API, theming, deployment, release
- [x] `VERSION` file and versioning rules
- [x] `docker-compose.yml` (db + backend + web) and `.env.example`
- [x] GitHub Actions: `ci.yml`, `release-apk.yml`

### M1: Backend core ✅
- [x] Fastify + TypeScript skeleton, config, logging, error format, `/api/health`
- [x] Prisma schema and first migration (including the raw SQL: one-owner index, CHECKs)
- [x] Auth: register, login, refresh (rotation, 30-day sliding expiry, reuse detection with a 2-minute grace period), cookie or body token transport, logout, `/me`, password change
- [x] Notes: CRUD, `version` conflict check, `NoteSummary` previews, item toggle endpoint, search and filters, pin
- [x] Categories: CRUD, tagging notes
- [x] `backend/Dockerfile`, OpenAPI document
- [x] Integration tests (auth, permissions, conflicts)
- [x] Sharing API, brought forward from M3: members, links, public `/shared/{token}`, with permission matrix tests

### M2: Web front ✅
- [x] Vite + React + TypeScript skeleton, routing, API client with token refresh (single-flight, cross-tab lock, never logs out on network errors)
- [x] Theme engine and the 6 themes ([theming.md](theming.md)), with contrast tests
- [x] Login and register screens, with the server URL field and its health check (AUTH-6, AUTH-7)
- [x] Notes grid (My notes / Shared with me, search, type and category filters, favorites first)
- [x] Text note editor (Edit/Preview, autosave, conflict handling)
- [x] List note editor (checklist UI ↔ GFM task items, drag to reorder, checked items at the bottom)
- [x] Categories management and tagging
- [x] Settings: profile, password, theme, checklist option, categories, about, sign out
- [x] `frontend/Dockerfile` + nginx config (SPA, `/api` proxy, security headers), full `docker compose up` working

### M3: Sharing UI and end-to-end tests ✅
- [x] Share dialog: members by username, change role, remove; "Leave note" for members
- [x] Share links: create (role, expiry), list, copy, revoke
- [x] Public page `/s/:token` (read and edit, no account)
- [x] Permission matrix tests (spec §5.3), in the backend
- [x] End-to-end browser tests in CI (Playwright, `e2e/`), against the Docker stack

### M4: Android APK and first release (0.1.0) ✅
- [x] Capacitor 8 setup, `appId`, icon and splash
- [x] Native `SessionStore` + `SelfNotesNative` plugin (server URL, Keystore-encrypted tokens, refresh under one mutex), with JVM unit tests
- [x] Deep links `selfnotes://notes/…`, status bar and navigation bar theming
- [x] `build.gradle` reads `VERSION`
- [x] Keystore and GitHub secrets set up, first **Release APK** run → `v0.1.0` (2026-11-22)

### M5: Android widgets ✅ (0.2.0)
- [x] Glance + WorkManager setup, per-widget state, 30-min refresh worker
- [x] **Notes** widget with its configuration (scope, category)
- [x] **Notes by type** widget (type, scope, category)
- [x] **Note** widget: note picker, simplified Markdown, checkbox toggle (every Android version), "Note unavailable" state
- [x] Signed-out state, theme colors, refresh triggered by the app (`refreshWidgets`)
- [x] Locked notes (NOTE-17) show their title and a lock, never their content
- [x] JVM tests (Markdown with the shared fixtures, API calls, state changes); checked on an Android 11 emulator

### Later
- Offline mode with sync (APK)
- Real-time collaborative editing (WebSocket / CRDT)
- Archive and trash
- Images and attachments
- Android App Links (open `/s/…` links directly in the app), share-to-Self-Notes intent
- Reminders
- Export/import (Markdown zip)
- Account deletion from the UI
- Docker images published to GHCR on each release
- Play Store (AAB), iOS

## Open questions

| # | Question | Current assumption |
|---|----------|--------------------|
| Q1 | **Themes** to ship | ✅ Six themes ported from the reference ([theming.md](theming.md)). Default: Blush Noir. |
| Q2 | Should **edit links** require the visitor to log in? | No: anyone holding the link can edit (SHARE-8). The link can be revoked or set to expire. |
| Q3 | Who can create an account? | Open sign-up, which can be closed with `ALLOW_REGISTRATION=false` |
| Q4 | Android **application id** (permanent once released) | `app.selfnotes` |
| Q5 | Tech stack | React + Capacitor / Fastify + Prisma + SQLite (see [architecture.md](architecture.md)). PostgreSQL until 2026-11-23: replaced by SQLite, a single file, simpler to host and back up. |
| Q6 | Session length | Ends after 30 days **without use**, with no absolute maximum. Widgets keep phones signed in (AUTH-4). |
| Q7 | Widgets in the first APK? | ✅ No: 0.1.0 shipped without them; they come with 0.2.0, together with the switch to SQLite. |
