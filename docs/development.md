# Development

## Prerequisites

| Tool | Version | For |
|------|---------|-----|
| Node.js | 24 LTS | backend and frontend |
| Docker + Compose v2 | recent | full stack |
| JDK | 21 (Temurin) | Android build |
| Android SDK / Android Studio | recent | Android build, emulator |

## Running locally

```bash
cp .env.example .env

# 1. API on :3000 (hot reload), with the SQLite file backend/prisma/dev.db
cp backend/.env.example backend/.env
npm --prefix backend install
npm --prefix backend run db:migrate           # creates or updates dev.db
npm --prefix backend run dev                  # OpenAPI UI: http://localhost:3000/api/docs

# 2. Front on :5173 (hot reload). Vite proxies /api to http://localhost:3000
npm --prefix frontend install
npm --prefix frontend run dev
```

Full stack exactly as in production: `docker compose up -d --build` → http://localhost:9292 (the API alone is also on http://127.0.0.1:9191).

## Backend tests

Integration tests run against a real SQLite file, with nothing to start first:

```bash
npm --prefix backend test           # recreates backend/.test-db/test.db, migrates it, runs all suites
```

CI does the same. `TEST_DATABASE_URL` (`file:/path/to/test.db`) points the tests at another file, which is then migrated but not recreated. Every test empties the tables, so never point the tests at a database you care about.

## End-to-end tests

`e2e/` holds Playwright tests of the web app in Chromium, against the real Docker stack: sign-up and sign-in, text and list notes, search, sharing with a user and through a link, locked notes. Each test creates its own accounts, so run them on a throwaway stack, with the rate limits off:

```bash
RATE_LIMIT=false docker compose up -d --build --wait
npm --prefix e2e ci
npx --prefix e2e playwright install chromium      # once
npm --prefix e2e test                             # E2E_BASE_URL to test another URL (default http://localhost:9292)
```

CI runs them in the "Docker images and end-to-end tests" job. On failure it keeps the Playwright report (traces and screenshots) as an artifact for 7 days.

## Android

```bash
npm --prefix frontend run android:sync          # vite build + cap sync android
npm --prefix frontend run cap -- open android   # opens Android Studio

# Or from the command line (JDK 21 and ANDROID_HOME needed):
frontend/android/gradlew -p frontend/android testDebugUnitTest   # JVM tests of the native session
frontend/android/gradlew -p frontend/android assembleDebug       # app/build/outputs/apk/debug/app-debug.apk
adb install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Re-run `android:sync` after every front change: the APK embeds a copy of `frontend/dist`. To pre-fill the server on the login page, build with `VITE_DEFAULT_SERVER_URL=https://notes.example.com` (CI uses the `DEFAULT_SERVER_URL` repository variable). Without it, the login page asks for a server first.

The app runs at the origin `https://localhost`. To reach a local stack from a device or emulator, forward the port and use `http://localhost:<port>` as the server URL (`3000` for `npm run dev` in `backend/`, `9292` for `docker compose up`):

```bash
adb reverse tcp:3000 tcp:3000
```

`http://localhost` is the only plain-HTTP address the app accepts (`res/xml/network_security_config.xml`); real servers need HTTPS. `localhost` counts as a secure context, so there is no mixed-content block, and `https://localhost` is already in `CORS_ORIGINS`.

**Debugging the WebView:** debug builds can be inspected from `chrome://inspect` on the computer. Logs of the native side: `adb logcat -s Capacitor`.

**WebView version:** the app needs Android System WebView 100 or newer (`minWebViewVersion` in `capacitor.config.ts`). Emulator images without the Play Store often ship an old WebView, and then show the "Self-Notes can't start" page. Use an image with Google Play, or update the WebView on the emulator.

**Deep links**, as the widgets send them:

```bash
adb shell am start -a android.intent.action.VIEW -d "selfnotes://notes/new?type=list" app.selfnotes
adb shell am start -a android.intent.action.VIEW -d "selfnotes://notes/<note id>" app.selfnotes
```

**Widgets** are native Kotlin code (`frontend/android/app/src/main/java/app/selfnotes/widget/`, architecture §6.2). Install the debug build, sign in to the app, then long-press the home screen → Widgets → Self-Notes, and drag one out: its setup screen opens. A widget's refresh button refreshes it at once; otherwise WorkManager does every 15 minutes, and the app asks for a refresh after each change and when it leaves the screen. `testDebugUnitTest` also runs the widget tests (Markdown with the shared task-item fixtures, API calls, state changes).

The widget setup screens use Jetpack Compose. The Compose BOM is pinned in `variables.gradle` to a version that still builds with `compileSdk 36` and the Android Gradle plugin used by Capacitor 8: newer Compose releases need `compileSdk 37` and AGP 9.1.

## Expected npm scripts

CI calls these scripts and skips the ones that are missing:

| Script | backend | frontend |
|--------|:-------:|:--------:|
| `dev` | ✅ | ✅ |
| `build` | ✅ (required) | ✅ (required) |
| `lint` | ✅ | ✅ |
| `typecheck` | ✅ | ✅ |
| `test` | ✅ (Vitest + real SQLite file) | ✅ (Vitest) |
| `db:migrate` | ✅ | |
| `openapi` | ✅ (writes `backend/openapi.json`) | |
| `api:types` | | ✅ (regenerate types from the backend's OpenAPI) |
| `android:sync` | | ✅ (web build, then `cap sync android`) |
| `cap` | | ✅ (Capacitor CLI: `npm --prefix frontend run cap -- <command>`) |

Commit `package-lock.json`: CI uses `npm ci`.

## Conventions

- **Branches:** `main` is always releasable. Work on `feat/…`, `fix/…`, `docs/…` and merge through a PR with green CI.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`…).
- **Code:** TypeScript `strict`, ESLint + Prettier, no `any` in exported APIs.
- **Tests** cite the requirement IDs from [specification.md](specification.md) in their names, e.g. `SHARE-4: editor cannot delete note`.
- **Docs are part of the change:** a PR that changes behavior updates the matching doc (spec, API, data model) and adds an entry under `## [Unreleased]` in `CHANGELOG.md`.
- **Version:** never hard-code it. Read `VERSION` (see [release.md](release.md)).
