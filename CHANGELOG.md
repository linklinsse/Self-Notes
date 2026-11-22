# Changelog

All notable changes to Self-Notes are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).
The release pipeline copies the section matching [`VERSION`](VERSION) into the GitHub Release notes.

## [Unreleased]

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

### Removed
- The "Follow device" theme option (THEME-3) and its light/dark theme choices. A saved "system" choice shows the default theme.
- The "Move checked items to the bottom" setting.
