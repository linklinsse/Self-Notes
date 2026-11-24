# Changelog

All notable changes to Self-Notes are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).
The release pipeline copies the section matching [`VERSION`](VERSION) into the GitHub Release notes.

## [Unreleased]

### Added
- The Note widget shows the note's categories and takes the color of the first one (tint, outline and left bar, like the cards of the app) (WIDGET-5).
- Widgets refresh when the app leaves the screen, even when it is closed right after a change (WIDGET-8).

### Changed
- Widgets refresh every 15 minutes instead of 30 (WIDGET-8).
- Checklists in the Note widget: items can no longer be checked from the widget, and tapping anywhere in the note opens it. Items take one compact line each (WIDGET-6).
- The header of the widgets is a single smaller line.
- A single line break in a note is now a line break on screen, in the app, on share links and in the Note widget (NOTE-2). Until now, plain Markdown joined the lines.

### Fixed
- List widgets: a note with 5 categories did not show its progress.
- Android 11 and older: after switching a widget to another note, its header changed but its rows stayed those of the old note until the next refresh.

## [0.2.0] - 2026-11-24

**Upgrading from 0.1.0:** the database is now SQLite, and the PostgreSQL data of 0.1.0 is not carried over: the server starts with an empty database. Remove the `POSTGRES_*` lines from `.env` (see `.env.example` and docs/deployment.md).

### Added
- **Android home-screen widgets** (WIDGET-1 to WIDGET-12):
  - **Notes**: a list of notes (my notes, shared with me, or all; optionally one category), favorites first;
  - **Notes by type**: the same, only lists or only text notes;
  - **Note**: one note as simplified Markdown; list items can be checked right from the widget (owners and editors);
  - each widget is set up when placed (a searchable note picker for the Note widget); tapping a note opens it, **+** creates one, and a refresh button reloads;
  - they use the app's session and theme, refresh every 30 minutes and after each change made in the app, and keep their last data offline ("Offline · updated 14:05");
  - after sign-out they show "Sign in to Self-Notes" and forget the data; a deleted or unshared note shows "Note unavailable" with "Pick another note"; locked notes show their title only.
- End-to-end browser tests (Playwright, `e2e/`) run in CI against the Docker stack: accounts, notes, search, sharing, share links, locked notes.
- `RATE_LIMIT` in `docker-compose.yml` (default `true`), so that test stacks can turn the API's rate limits off.

### Changed
- **The database is SQLite** instead of PostgreSQL: one file, `./db/prod.db` by default (`DB_DIR`), in WAL mode. There is no `db` service any more, the `POSTGRES_*` variables are gone, and a backup is a copy of that file (docs/deployment.md). The backend container starts as root only to give the database folder to the `node` user, then runs as `node`.
- Search ignores accents too ("ete" finds "Été"), and `%` or `_` in a search are matched literally (NOTE-10).
- After signing out, the next sign-in opens the notes grid instead of the page left before signing out (which could belong to another account). An expired session still comes back to the same page.

### Removed
- `docker-compose.dev.yml` and `docker-compose.test.yml`: the backend tests and `npm run dev` use SQLite files, with nothing to start first.

### Fixed
- Cancelling a note created just now no longer shows it again in the grid for a moment.

## [0.1.0] - 2026-11-22

### Added
- Project foundation: repository, documentation, Docker Compose stack, CI and APK release workflows, `VERSION` file.
- Backend API (`/api/v1`):
  - accounts with 30-day sliding sessions;
  - text and list notes with version conflict detection, a checkbox toggle endpoint, search and filters;
  - personal categories;
  - sharing with users and through links;
  - OpenAPI document, Docker image, integration tests.
- Web app:
  - login and register with an editable server URL;
  - notes grid with search and filters;
  - Markdown text editor and checklist editor, with autosave and conflict handling;
  - categories, sharing dialog, public share-link page, settings;
  - the 6 themes (Blush Noir by default);
  - served by nginx in Docker Compose.
- Android app (Capacitor 8, `app.selfnotes`, Android 7.0+):
  - the session is kept by native code: refresh token encrypted with an Android Keystore key, every refresh under one mutex (ready for the widgets), and the token never enters the WebView;
  - stays signed in across restarts, and logout revokes the session on the server;
  - the login page asks for the server first when the APK has no default server;
  - `selfnotes://notes/{id}` and `selfnotes://notes/new?type=list|text` links;
  - status bar and navigation bar follow the theme (THEME-4);
  - app icon and splash screen; a clear message instead of a blank screen when Android System WebView is too old (below 100);
  - versionName and versionCode read from `VERSION`; CI runs the native unit tests.
- Postal addresses in notes are clickable and open a maps app chosen by the user (`geo:` links, Android app chooser), and phone numbers open the dialer (`tel:` links) (NOTE-15).
- Cancel button in the note editor (NOTE-14): the note goes back to how it was when it was opened, even the changes already autosaved. Cancelling a note created just now deletes it.
- Checkboxes in text (Markdown) notes can be checked from the preview, without editing, by anyone who may edit the note (NOTE-16).
- Brute-force protection for share links: an IP that asks for too many unknown links is blocked for a while (`SHARE_LINK_MAX_FAILURES`, `SHARE_LINK_BLOCK`, NFR-3).
- Table of contents in notes with `[[_TOC_]]` or `[TOC]`, GitLab style, and heading anchors (NOTE-18).
- Mermaid diagrams in notes (```` ```mermaid ```` blocks: flowcharts, sequences, pies, Gantt charts…), in the theme's colors (NOTE-19).
- In a note, the title, the categories (now under the title) and the progress bar stay at the top while scrolling; the title shrinks (NOTE-20).
- **Notes locked with a password** (NOTE-17): the owner locks a note, changes or removes its password. The content is encrypted on the device (PBKDF2-SHA256 + AES-256-GCM) and the server only stores ciphertext; the grid shows the title only. Members and share links unlock it with the same password. API: `locked` on notes, `INVALID_ENCRYPTED_CONTENT`, `NOTE_LOCKED`.
- Sort menu on the notes grid (NOTE-9): favorites first (default), last updated, A to Z, or by category. The choice is saved on the account (`preferences.noteSort`). API: `GET /notes?sort=`.

### Changed
- Accounts use a **username** only (AUTH-1, AUTH-2): no email and no display name. Sign in, sign up and sharing use the username, which can be changed in Settings. Existing accounts get a username made from their former email (migration `20261121120000_usernames`). API: `email`/`displayName` fields replaced by `username`, error `EMAIL_TAKEN` replaced by `USERNAME_TAKEN`.
- Checklists: checking an item no longer moves it (NOTE-6). Every item, checked or not, can be reordered by drag and drop.
- Checklists show their progress bar ("checked/total") inside the note too, not only on its card: while editing, read-only and on share links (NOTE-4). The bar uses a gradient of the theme's accent.
- "Pinned" notes are now **Favorites**, marked with a star (NOTE-11). The API keeps the name `pinned`.
- The notes grid is aligned in rows, read left to right (it was a column layout).
- Category colors stand out: vivid preset colors, note cards tinted and outlined with their first category's color, colored category filters.
- With `ALLOW_REGISTRATION=false`, the login page no longer offers to create an account and the sign-up page says that sign-up is closed; `/api/health` reports `registration` (AUTH-1).
- Default ports: the web app on **9292** (`APP_PORT`, was 8080), and the API published on **9191** (`API_PORT`, loopback only by default; it was not published).

### Removed
- The "Follow device" theme option (THEME-3) and its light/dark theme choices. A saved "system" choice shows the default theme.
- The "Move checked items to the bottom" setting.
