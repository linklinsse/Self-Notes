# Functional specification

This document defines **what** Self-Notes does. Requirement IDs (`NOTE-3`, `SHARE-5`…) are referenced by issues, PRs and tests.

## 1. Glossary

| Term | Meaning |
|------|---------|
| **Note** | A titled Markdown document of type `text` or `list`. |
| **Owner** | The user who created the note. A note has exactly one owner. |
| **Member** | A user with access to a note: the owner, or a user the note is shared with (`editor` or `viewer`). |
| **Share link** | A secret URL that gives anyone holding it `viewer` or `editor` access to one note, without an account. |
| **Category** | A colored label owned by a user, used to tag and filter notes. |
| **Theme** | A named set of colors and typography for the user interface. |

## 2. Accounts and authentication

| ID | Requirement |
|----|-------------|
| AUTH-1 | A visitor can create an account with a **username** and a **password** (minimum 8 characters). No email is asked. A username has 3 to 32 characters: letters, digits, dot, dash or underscore, starting with a letter or a digit. It is the only name the app shows. Sign-up can be disabled server-wide (`ALLOW_REGISTRATION=false`); the login page then no longer offers to create an account, and the sign-up page says that sign-up is closed. |
| AUTH-2 | Usernames are unique and case-insensitive (stored lowercase). |
| AUTH-3 | A user logs in with username and password. Error messages never reveal whether the username exists. |
| AUTH-4 | **Stay signed in.** A session uses a short-lived access token (15 min) and a refresh token that is replaced on every use. The refresh token expires after **30 days without use**, and every use (opening the app, a widget refresh) restarts that 30-day period. A device used at least once a month therefore never asks to sign in again. A session ends only on logout, password change, 30 days of inactivity, or detected token theft. |
| AUTH-5 | A user can change their username (if it is free), password and theme. Changing the password revokes all their other sessions. |
| AUTH-6 | The **login and register pages show the server (backend) URL and let the user change it**, on web and on Android. A new URL is checked with `GET /api/health` before it is saved. The page then shows "Self-Notes vX.Y.Z" or a clear error (unreachable, not a Self-Notes server, CORS refused). |
| AUTH-7 | Default server URL: on web, the origin that served the app; on Android, the build's `DEFAULT_SERVER_URL` (empty if none). The chosen URL is stored on the device. Switching servers signs the user out of the previous one. Settings → About shows the current server. |

## 3. Notes

| ID | Requirement |
|----|-------------|
| NOTE-1 | A user can create a note with a **title** (optional, up to 200 characters) and a **type**: `text` or `list`. |
| NOTE-2 | Note content is **Markdown** in GitHub Flavored Markdown (GFM): headings, emphasis, links, code, tables, strikethrough and task items. Raw HTML is **not** rendered. Content is limited to 1 MB. |
| NOTE-3 | A **text** note has a Markdown editor with **Edit** and **Preview** modes. |
| NOTE-4 | A **list** note is shown as a checklist: add, edit, reorder, delete and **check/uncheck** items. Each item's text may contain inline Markdown. A **progress bar** with "checked/total" shows how much is done, on the note's card and at the top of the note itself (editing, read-only and share links, NOTE-20). |
| NOTE-5 | A list note is stored as Markdown task items (`- [ ] item` / `- [x] item`), one per line. Lines that are not task items are kept as they are. |
| NOTE-6 | Checking or unchecking an item never moves it. Items are reordered by **drag and drop** (a handle on every item, checked or not, mouse and touch). |
| NOTE-7 | The type can be changed. **Text → list**: each non-empty line that is not already an item becomes an unchecked item. **List → text**: the Markdown is kept as is. |
| NOTE-8 | Notes are saved automatically about 1 second after typing stops, and immediately when the editor is left. |
| NOTE-9 | The home screen shows the user's notes as cards (title, preview, categories, sharing indicator) in an aligned grid. It has two tabs: **My notes** and **Shared with me**. The user picks the order: **favorites first** then last updated (default), **last updated**, **A to Z** (accents and case ignored, untitled notes last), or **by category** (one section per category, in the user's category order, then "No category"). The choice is saved on the account. |
| NOTE-10 | Search matches text in titles and content, ignoring case and accents ("ete" finds "Été"). Notes can be filtered by category and by type. |
| NOTE-11 | **Favorites** (a star on the note) are per user. Marking a shared note as a favorite only affects the user who does it. The API calls it `pinned`. |
| NOTE-12 | Only the owner can delete a note. Deleting it removes it for every member and invalidates all its share links. |
| NOTE-13 | **Concurrent edits:** every note has a `version` number. An update made from an outdated version is rejected (HTTP 409). The client then shows the latest content and lets the user reapply their change. |
| NOTE-14 | **Cancel:** while editing, the user can cancel. The note goes back to how it was when the editor was opened, including the changes autosave already sent, and the app returns to the notes list. Cancelling a note created just now deletes it. A confirmation is asked first. |
| NOTE-15 | **Links, addresses and phone numbers are clickable** when a note is shown (text note preview, checklist items, share links). Web addresses (`https://…`, `www.…`) open in the browser, email addresses in the mail app. Postal addresses ("12 rue de la Paix, 75002 Paris", "221B Baker Street") open with a maps app: no provider is imposed, and on Android the user chooses among the installed maps apps. Phone numbers ("06 12 34 56 78", "+33 6 12 34 56 78") open the dialer. |
| NOTE-16 | **Checkboxes in text notes** (Markdown task items `- [ ]`) can be checked and unchecked directly in the note's preview, without switching to editing, by anyone who may edit the note (owner, editor, editor link). For viewers they are read-only. |
| NOTE-17 | **Notes locked with a password.** The owner can lock a note with a password, change it or remove it. The content is **encrypted on the device** (the server and its backups only hold unreadable data); the title stays visible, and the grid shows the title only. Opening the note asks for the password, and so does opening it as a member or through a share link: the same password for everyone. The note stays open until the user leaves it, reloads the app or taps "Lock now". A forgotten password cannot be recovered. Search does not look inside locked notes. |
| NOTE-18 | **Table of contents**, as in GitLab Flavored Markdown: `[[_TOC_]]` or `[TOC]` alone on a line is replaced by a nested list of links to the note's headings. Headings get GitLab-style anchors (lowercase, punctuation removed, spaces as hyphens, `-1`, `-2`… for repeats), so `[link](#my-heading)` works too. Following such a link scrolls within the note. |
| NOTE-19 | **Mermaid diagrams**: a fenced code block with the `mermaid` language is drawn as a diagram (flowchart, sequence, pie, Gantt…), in the theme's colors. A diagram with a syntax error shows the error and its source. |
| NOTE-20 | In a note, the **title, the categories and the checklist progress bar stay at the top** while the content scrolls, and the title gets smaller once the page has scrolled. Categories are shown under the title. On phones, the note's top bar shows icons only. |

## 4. Categories

| ID | Requirement |
|----|-------------|
| CAT-1 | A user can create, rename, recolor and delete **their own** categories. Each has a name (1–40 characters, unique per user) and a color (`#RRGGBB`). |
| CAT-2 | The color picker offers a preset palette and a custom color. Chip text automatically switches between dark and light to stay readable. |
| CAT-3 | A note can have any number of categories. |
| CAT-4 | Categories are **personal**. Each member of a shared note tags it with their own categories, and nobody else sees them. People using a share link see no categories. |
| CAT-5 | Deleting a category removes it from every note. The notes themselves are kept. |

## 5. Sharing

### 5.1 With users

| ID | Requirement |
|----|-------------|
| SHARE-1 | The owner can share a note with another registered user by **username**, with role **viewer** (read-only) or **editor** (read and write). |
| SHARE-2 | The owner can change a member's role or remove them at any time. |
| SHARE-3 | A member can **leave** a shared note. It then disappears from their list. |
| SHARE-4 | Editors can change the title, content and type, and check items. They **cannot** delete the note or manage sharing. |
| SHARE-5 | Viewers see the content but cannot change it, not even checkboxes. They can still mark it as a favorite and tag it with their own categories (personal data). |

### 5.2 With links (anyone holding the link)

| ID | Requirement |
|----|-------------|
| SHARE-6 | The owner can create one or more **share links** for a note, each with role **viewer** or **editor** and an optional **expiry date**. |
| SHARE-7 | A link looks like `<PUBLIC_URL>/s/<token>`. The token is random (256 bits) and cannot be guessed. |
| SHARE-8 | Opening a link shows the note **without logging in**. Editor links allow the same changes as an editor member. |
| SHARE-9 | The owner can list the note's links, copy them again, and **revoke** them. A revoked or expired link returns "not found". |
| SHARE-10 | Shared-link pages are not indexed by search engines (`noindex`) and do not leak the token through the HTTP referrer (`Referrer-Policy: no-referrer`). |

### 5.3 Permission matrix

| Action | Owner | Editor (member or link) | Viewer (member or link) |
|--------|:-----:|:-----------------------:|:-----------------------:|
| Read note | ✅ | ✅ | ✅ |
| Edit title / content / type, check items | ✅ | ✅ | ❌ |
| Favorite, tag with own categories | ✅ | ✅ (members only) | ✅ (members only) |
| Manage members and links | ✅ | ❌ | ❌ |
| Lock with a password, change or remove it (NOTE-17) | ✅ | ❌ | ❌ |
| Delete note | ✅ | ❌ | ❌ |
| Leave note | — | ✅ (members only) | ✅ (members only) |

## 6. Themes

| ID | Requirement |
|----|-------------|
| THEME-1 | The app ships several themes. Each one has a set of colors, light or dark, and optional fonts. The format is in [theming.md](theming.md). |
| THEME-2 | The user picks a theme in Settings. The choice is saved on their account and applied on every device. |
| THEME-3 | *Removed:* no option follows the device's light/dark setting. A previously saved `"system"` choice shows the default theme. |
| THEME-4 | The theme also sets the Android status bar and navigation bar colors. |
| THEME-5 | Pages opened from share links use the viewer's last local theme, or the default theme. |

> Six themes, ported from the project owner's reference palettes ([theming.md](theming.md)): **Blush Noir** (default), **Sunflower**, **Midnight Ink**, **Ocean Breeze** and **Sage Dusk** are dark, and **Unicorn** is light.

## 7. Android widgets

Home-screen widgets in the APK. They are native Android code (not the WebView) and **use the app's session**, so they never need their own login.

| ID | Requirement |
|----|-------------|
| WIDGET-1 | **Notes** widget: a scrollable list of notes. It is configured when placed: scope (**My notes**, **Shared with me** or **All**) and an optional category. |
| WIDGET-2 | **Notes by type** widget: the same list, limited to one type (**text** or **list**) chosen when placed. It has the same optional scope and category. |
| WIDGET-3 | **Note** widget: the content of one note, chosen when placed from a searchable list of the user's notes. |
| WIDGET-4 | Each list row shows the title (or the first line if there is no title), a short preview, category colors and a type icon. List notes also show progress (`3/7`). Pinned notes come first, then the most recently updated, up to 50 notes. |
| WIDGET-5 | The Note widget shows the title, then the content as **simplified Markdown**. Block structure is kept: headings, paragraphs, bullet and numbered lists, task items, and code in monospace. Inline formatting (bold, italics, links) is shown as plain text. Long content scrolls. |
| WIDGET-6 | When the Note widget shows a **list** note, the user can **check and uncheck items** directly in the widget, on every supported Android version. This needs the `owner` or `editor` role; viewers see the checkboxes as read-only. |
| WIDGET-7 | Tapping a note opens it in the app. A **+** button creates a new note, using the widget's type for Notes by type. A refresh button reloads the data. |
| WIDGET-8 | Widgets refresh **every 30 minutes** when the device is online. They also refresh immediately when the app saves a note, when the session or theme changes, and when the refresh button is tapped. When offline they keep showing the last data, with the time it was received ("Offline · updated 14:05"). |
| WIDGET-9 | **No daily login:** widgets use the app's session, and their periodic refresh keeps that session alive (AUTH-4). If the user logs out or the session ends, widgets show "Sign in to Self-Notes" and open the app when tapped. |
| WIDGET-10 | Widgets use the colors of the user's current theme. |
| WIDGET-11 | If the note behind a Note widget is deleted or no longer shared with the user, the widget shows "Note unavailable" with a button to pick another note. |
| WIDGET-12 | Widgets can be resized. Minimum size is 2×2 cells for Note and 3×2 for the list widgets. |

> Widget content is visible to anyone who can see the home screen. That is the user's choice when they place a widget.

## 8. Platforms

| ID | Requirement |
|----|-------------|
| APP-1 | **Web**: recent desktop and mobile browsers. Responsive layout from 360 px wide. |
| APP-2 | **Android**: APK installed from the GitHub Releases page (outside the Play Store). Minimum Android version: the Capacitor default (Android 7.0, API 24), with Android System WebView 100 or newer. An older WebView gets a page asking to update it, not a blank screen. |
| APP-3 | Web and Android share the same codebase (Capacitor). Android-only parts are native Kotlin code in the Android project: the session store and the widgets. The front reaches them through one `platform` module. |
| APP-4 | Settings → About shows the app version (from `VERSION`), the server URL and the server's version. |

## 9. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | The whole server side runs with `docker compose up` (database, API, web). The web port (default 9292) serves the app and the API; the API's own port (default 9191) is bound to the host's loopback only, unless configured otherwise. |
| NFR-2 | Passwords are hashed with argon2id. Refresh tokens are stored only as hashes. Secrets come from environment variables. |
| NFR-3 | Login, registration and share-link endpoints are rate-limited. Share links cannot be guessed: their token has 256 random bits, and an IP address that asks for too many unknown links (10 in 15 minutes by default) is blocked for 15 minutes, even for valid links. |
| NFR-4 | All API inputs are validated (zod schemas). All errors use one JSON error format (see [api.md](api.md)). |
| NFR-5 | Rendered Markdown is safe: raw HTML is not rendered, links open with `rel="noopener noreferrer"`, and `javascript:` URLs are blocked. The only markup a note produces is the SVG of Mermaid diagrams (NOTE-19): drawn with Mermaid's `strict` security level and SVG text labels, then sanitized with DOMPurify. |
| NFR-6 | The API has automated tests for authentication, permissions (every cell of §5.3) and versioning conflicts. |
| NFR-7 | One version for everything: the [`VERSION`](../VERSION) file. |

## 10. Out of scope for v1

These are tracked in the [roadmap](roadmap.md): offline mode, real-time collaborative editing, attachments and images, archive and trash, reminders, Android App Links (opening `/s/…` links in the app), Play Store publishing, iOS, export/import, and account deletion from the UI.
