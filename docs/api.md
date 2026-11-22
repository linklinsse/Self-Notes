# REST API

Base path: **`/api/v1`**. JSON everywhere. In development (`NODE_ENV=development`), the backend serves the generated OpenAPI document at `/api/docs`. That document is the reference. This page is the overview used to design it.

## Conventions

- **Auth:** `Authorization: Bearer <accessToken>` on every endpoint, except those marked 🌐 (public).
- **Server URL:** clients call `<serverUrl>/api/...`, where `serverUrl` is chosen on the login page and checked with `GET /api/health` (AUTH-6).
- **Token transport:** clients that send `X-Token-Transport: body` (Android, and web clients using a server on another origin) exchange the refresh token in the JSON body. Other clients get an `httpOnly` cookie (see [architecture.md §3](architecture.md#3-authentication)).
- **IDs** are UUIDs. **Dates** are ISO 8601 strings in UTC.
- **Optimistic concurrency:** a request that changes note content must include the `version` it is based on. If it does not match → `409 NOTE_VERSION_CONFLICT`, and the response body contains the current note.
- **Access:** a note the caller cannot access returns **404**, never 403. A note the caller can read but not change returns **403**.

### Error format

```json
{
  "error": {
    "code": "NOTE_VERSION_CONFLICT",
    "message": "The note was modified by someone else.",
    "details": { "current": { "...": "note object" } }
  }
}
```

| HTTP | Typical `code` |
|------|----------------|
| 400 | `VALIDATION_ERROR` (`details.issues` lists the problems), `BAD_REQUEST`, `INVALID_ENCRYPTED_CONTENT` (a locked note must hold an encrypted envelope) |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED` (refresh, then retry), `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN` (sign in again) |
| 403 | `FORBIDDEN`, `REGISTRATION_DISABLED`, `INVALID_CREDENTIALS` (wrong current password) |
| 404 | `NOT_FOUND` |
| 409 | `NOTE_VERSION_CONFLICT`, `ITEM_NOT_FOUND`, `NOTE_LOCKED` (no server-side toggle on an encrypted note), `USERNAME_TAKEN`, `ALREADY_MEMBER`, `CATEGORY_NAME_TAKEN` |
| 413 | `CONTENT_TOO_LARGE` |
| 429 | `RATE_LIMITED`, `TOO_MANY_ATTEMPTS` (too many unknown share links from this IP; `Retry-After` header and `details.retryAfterSec`) |

## Resources

### Note object

```json
{
  "id": "6f1c…",
  "title": "Groceries",
  "type": "list",
  "content": "- [ ] Milk\n- [x] Bread",
  "version": 7,
  "role": "owner",
  "pinned": true,
  "categories": [{ "id": "…", "name": "Home", "color": "#E57373" }],
  "owner": { "id": "…", "username": "alice" },
  "shared": true,
  "createdAt": "2026-11-21T10:00:00Z",
  "updatedAt": "2026-11-21T10:05:00Z",
  "updatedBy": { "id": "…", "username": "bob" }
}
```

`role`, `pinned` and `categories` are **from the caller's point of view**. `shared` is true when the note has other members or active links. `updatedBy` is `null` when the last edit came through a share link.

### NoteSummary object (lists)

`GET /notes` returns summaries instead of full notes, which keeps the home grid and the widgets light. A summary is the Note object **without `content`**, plus:

```json
{
  "preview": "Milk · Bread · Eggs",
  "items": { "checked": 1, "total": 3 }
}
```

`preview` is plain text without Markdown, at most 200 characters. `items` is the checklist progress shown on cards and widgets (WIDGET-4). It is `null` for `text` notes.

## Endpoints

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET 🌐 | `/api/health` | `{ "status": "ok", "name": "Self-Notes", "version": "0.1.0", "registration": true }`. Used by the Docker healthcheck, the server URL check on the login page (`name` must be `Self-Notes`; `registration: false` hides sign-up, AUTH-1) and Settings → About. |

### Auth

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST 🌐 | `/auth/register` | `{ username, password }` | `201 { user, accessToken, refreshToken? }`. The username is lowercased. `409 USERNAME_TAKEN`, `403 REGISTRATION_DISABLED` when sign-up is off. |
| POST 🌐 | `/auth/login` | `{ username, password }` | `200 { user, accessToken, refreshToken? }`. The username is case-insensitive. |
| POST 🌐 | `/auth/refresh` | `{ refreshToken }` (body transport) or the cookie | `200 { accessToken, refreshToken? }`. The refresh token is replaced and its 30-day expiry restarts. |
| POST 🌐 | `/auth/logout` | `{ refreshToken }` (body transport) or the cookie | `204`. The session is revoked. The refresh token identifies it, so this works even when the access token has expired. |

`refreshToken?` is in the body only with `X-Token-Transport: body`. Otherwise it is sent as a cookie.

### Current user

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/me` | | `{ id, username, preferences }` |
| PATCH | `/me` | `{ username?, preferences? }` | Updated user. `409 USERNAME_TAKEN`. `preferences` is merged key by key. |
| PUT | `/me/password` | `{ currentPassword, newPassword }` | `204`. All other sessions are revoked. `403 INVALID_CREDENTIALS` if `currentPassword` is wrong. |

### Notes

| Method | Path | Min. role | Body / query | Response |
|--------|------|-----------|--------------|----------|
| GET | `/notes` | | `?scope=mine\|shared\|all` (default `mine`), `q`, `category` (id, repeatable, matches any), `type`, `sort=favorites\|updated\|title` (default `favorites`), `cursor`, `limit` (default 50, ≤ 100) | `{ items: NoteSummary[], nextCursor }`. `favorites`: pinned first, then `updatedAt` desc. `updated`: `updatedAt` desc. `title`: A to Z with an ICU collation (accents and case ignored), untitled last (NOTE-9). |
| POST | `/notes` | | `{ title?, type, content?, categoryIds?, pinned? }` | `201 Note` (the caller is the owner) |
| GET | `/notes/{id}` | viewer | | `Note` |
| PATCH | `/notes/{id}` | editor | `{ version, title?, type?, content? }` | `Note` with `version + 1`, or `409` |
| POST | `/notes/{id}/items/toggle` | editor | `{ index, text, checked }` | `Note`. `index` is the item's position among task items, and `text` is its text when the client read it. The server finds the item (same index and text, or else the only item with that text), so no `version` is needed. Returns `409 ITEM_NOT_FOUND` if the item is gone. Used by the app and the widgets. |
| DELETE | `/notes/{id}` | owner | | `204`. Removes the note for everyone and invalidates its links. |
| PUT | `/notes/{id}/pinned` | viewer | `{ pinned }` | `204` (per user). Shown as **Favorites** in the app (NOTE-11). |
| PUT | `/notes/{id}/categories` | viewer | `{ categoryIds: [] }` | `204`. Replaces the caller's own categories on this note. |

**Locked notes (NOTE-17).** `Note`, `NoteSummary` and `/shared/{token}` carry `locked`. When it is `true`, `content` is an encrypted envelope ([data-model.md](data-model.md#encrypted-content-locked-notes-note-17)), `preview` is empty and `items` is `null`; search matches the title only.
- `POST /notes` with `locked: true` needs an envelope as `content`.
- `PATCH` with `locked: true` (lock) or `locked: false` (remove the password) needs the new `content` (envelope, or plain text), and only the **owner** may do it (`403` otherwise, always `403` through a share link). Editors and editor links save new envelopes; plain content is refused with `400 INVALID_ENCRYPTED_CONTENT`.
- The server cannot convert or toggle encrypted content: a type change needs the content, and `POST …/items/toggle` answers `409 NOTE_LOCKED`. The app does both itself.

### Sharing with users

| Method | Path | Min. role | Body | Response |
|--------|------|-----------|------|----------|
| GET | `/notes/{id}/members` | viewer | | `[{ user: { id, username }, role }]` |
| POST | `/notes/{id}/members` | owner | `{ username, role: "editor"\|"viewer" }` | `201 Member`. `404` if no account has that username (case-insensitive), `409 ALREADY_MEMBER` if already a member. |
| PATCH | `/notes/{id}/members/{userId}` | owner | `{ role }` | `Member` |
| DELETE | `/notes/{id}/members/{userId}` | owner, or the member themselves | | `204`. `userId` may be `me` to leave (SHARE-3); the member's own categories on the note are removed. The owner cannot leave (`400`). |

### Share links

| Method | Path | Min. role | Body | Response |
|--------|------|-----------|------|----------|
| GET | `/notes/{id}/links` | owner | | `[{ id, url, role, expiresAt, createdAt, lastUsedAt }]` (active links only) |
| POST | `/notes/{id}/links` | owner | `{ role: "editor"\|"viewer", expiresAt? }` | `201 { id, url, token, role, expiresAt }` |
| DELETE | `/notes/{id}/links/{linkId}` | owner | | `204` (revoked) |

`url` is `<PUBLIC_URL>/s/<token>`.

### Public access through a link 🌐

These endpoints are rate-limited per IP, and their responses set `Cache-Control: no-store`, `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.

| Method | Path | Link role | Body | Response |
|--------|------|-----------|------|----------|
| GET 🌐 | `/shared/{token}` | viewer | | `{ note: { id, title, type, content, version, updatedAt }, role, owner: { username } }` |
| PATCH 🌐 | `/shared/{token}` | editor | `{ version, title?, type?, content? }` | Same shape, or `409` |
| POST 🌐 | `/shared/{token}/items/toggle` | editor | `{ index, text, checked }` | Same shape, or `409 ITEM_NOT_FOUND` |

An unknown, revoked or expired token returns `404 NOT_FOUND`. The response never says which of the three it is.

### Categories

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/categories` | | `[{ id, name, color, position, noteCount }]` |
| POST | `/categories` | `{ name, color }` | `201 Category` |
| PATCH | `/categories/{id}` | `{ name?, color?, position? }` | `Category` |
| DELETE | `/categories/{id}` | | `204`. Removes the category from all notes; the notes are kept. |

## Rate limits (defaults)

| Scope | Limit |
|-------|-------|
| `/auth/login`, `/auth/register` | 10 / min / IP |
| `/auth/refresh` | 30 / min / IP |
| `/me/password` | 10 / min / IP |
| `/shared/*` | 60 / min / IP |
| Everything else | 300 / min / IP |

**Guessing share links.** Tokens have 256 random bits. On top of that, an IP that asks `/shared/*` for `SHARE_LINK_MAX_FAILURES` unknown tokens (default 10) within `SHARE_LINK_BLOCK` (default 15 min) gets `429 TOO_MANY_ATTEMPTS` on every `/shared/*` request, valid links included, for `SHARE_LINK_BLOCK`. This protection stays on when `RATE_LIMIT=false`.

The client IP comes from the reverse proxy (`TRUST_PROXY`, see [deployment.md](deployment.md)).
