# Self-Notes: notes for Claude Code

Self-hosted notes app: Fastify/Prisma/SQLite backend, React/Vite frontend, Android APK through Capacitor, all run with Docker Compose.

- **Read the docs before coding:** `docs/specification.md` (requirement IDs), `docs/architecture.md` (stack, layout, auth), `docs/data-model.md`, `docs/api.md`.
- **Version:** `VERSION` is the only source. Never hard-code a version anywhere else. Rules are in `docs/release.md`.
- **Docs are part of every change:** update the matching doc and `CHANGELOG.md` (`## [Unreleased]`) when behavior, the API or the schema changes.
- **Tests** name the requirement they cover (`SHARE-4: …`). Permission checks live only in `backend/src/modules/notes/access.ts`.
- **Notes are Markdown:** list notes are GFM task items (`- [ ]` / `- [x]`). Never render raw HTML.
- **Themes:** no hard-coded colors in components. Use `--sn-*` CSS variables (`docs/theming.md`).
- **Android native code** (Kotlin) lives in `frontend/android/app/src/main/java/app/selfnotes/`: `session/` (SessionStore, the only owner of tokens on Android; all refreshes go through its mutex) and `widget/` (Glance widgets). The front reaches it only through `src/platform/` (architecture §6).
- **CI** (`.github/workflows/ci.yml`) expects the npm scripts listed in `docs/development.md`.
- **Backend tests:** `npm --prefix backend test` (it recreates the SQLite file `backend/.test-db/test.db`). Every response has a zod schema, and unknown fields are stripped.
- **Database:** SQLite. CHECKs and the one-owner index exist only in raw SQL (see the header of `backend/prisma/schema.prisma`): SQLite migrations rebuild tables, so add them back in any migration that rebuilds one. Case/accent-insensitive search and sort go through the folded keys of `backend/src/lib/fold.ts`, written on every title/content change.
- **Frontend:** API types come from the backend: after an API change, run `npm --prefix frontend run api:types` and commit `src/api/schema.d.ts`. Autosave and conflict logic live in `features/notes/draft.ts` (unit-tested), not in components. Checks: `npm --prefix frontend run lint`, `typecheck`, `test`.
- **End-to-end tests:** `e2e/` (Playwright) against `RATE_LIMIT=false docker compose up -d --build --wait`, then `npm --prefix e2e test` (docs/development.md).
- **TypeScript stays on 5.9.x** in every package (openapi-typescript and typescript-eslint do not support TS 7 yet).
