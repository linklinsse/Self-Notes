# Self-Notes

Self-hosted notes app with a web front, a REST API, and an Android app (APK).

- **Two note types**, both written in **Markdown**:
  - **Text**: free Markdown (GFM).
  - **List**: a checklist whose items you can tick (stored as Markdown task items `- [ ]` / `- [x]`).
- **Categories**: tag notes with your own colored categories, then filter by them.
- **Sharing**:
  - with **another user**, as **read-only** or **edit**;
  - with **anyone holding a link**, as **read-only** or **edit** (links can be revoked or given an expiry date).
- **Accounts**: username and password (no email), with the **server URL editable on the login page**. You stay signed in: a session only ends after 30 days without use. Your chosen **theme** follows you on every device.
- **Android widgets**: a list of notes, a list of notes of one type, and the content of one note (list items can be checked from the widget).
- **One command to run it**: `docker compose up` starts the database, the API and the web app.
- **Android APK** built and published by GitHub Actions. The app's version comes from the [`VERSION`](VERSION) file.

> **Status:** the web app and the API work end to end with `docker compose up` (milestones M1–M3). The Android app builds (M4): its first signed release needs the keystore secrets ([release.md](docs/release.md)). The widgets (M5) are next. See the [roadmap](docs/roadmap.md).

## Tech stack

| Part       | Technology |
|------------|------------|
| Backend    | Node.js 24 LTS, TypeScript, Fastify, Prisma, PostgreSQL 17 |
| Frontend   | React, TypeScript, Vite, react-markdown with remark-gfm |
| Android    | Capacitor (wraps the same frontend into an APK). Native Kotlin for the session store and the widgets (Jetpack Glance + WorkManager). |
| Deployment | Docker Compose (`db` + `backend` + `web` nginx) |
| CI/CD      | GitHub Actions: CI on every PR, signed APK release when `VERSION` changes |

The reasons for these choices are in [docs/architecture.md](docs/architecture.md).

## Repository layout

```
Self-Notes/
├── VERSION                  # Application version (single source of truth)
├── CHANGELOG.md             # Release notes (used for GitHub releases)
├── docker-compose.yml       # Full stack: db + backend + web
├── docker-compose.dev.yml   # Dev overlay (publishes PostgreSQL on localhost)
├── .env.example             # Runtime configuration template
├── docker-compose.test.yml  # Throwaway PostgreSQL for backend tests
├── backend/                 # REST API (Fastify + Prisma)
├── frontend/                # Web app (React + Vite), served by nginx
│   └── android/             # Capacitor Android project: native session store (M4), widgets (M5)
├── docs/                    # Documentation (see the table below)
└── .github/workflows/       # ci.yml, release-apk.yml
```

## Quick start (Docker)

```bash
cp .env.example .env        # then edit POSTGRES_PASSWORD, JWT_SECRET, PUBLIC_URL
docker compose up -d --build
# open http://localhost:8080
```

More detail, including the reverse proxy, HTTPS and backups, is in [docs/deployment.md](docs/deployment.md).

## Versioning and releases

- [`VERSION`](VERSION) holds the app version in `MAJOR.MINOR.PATCH` form. The backend, the web app and the APK all read it.
- To release: bump `VERSION`, add a section to [`CHANGELOG.md`](CHANGELOG.md), and merge to `main`. GitHub Actions then builds a signed APK, tags the commit `vX.Y.Z` and publishes a GitHub Release with the APK attached.

The full process, including signing secrets, is in [docs/release.md](docs/release.md).

## Documentation

| Doc | Content |
|-----|---------|
| [Specification](docs/specification.md) | Features and business rules |
| [Architecture](docs/architecture.md) | Components, tech choices, auth flow, code layout |
| [Data model](docs/data-model.md) | Database schema |
| [API](docs/api.md) | REST endpoints |
| [Theming](docs/theming.md) | Theme format and how to add a theme |
| [Development](docs/development.md) | Local setup and conventions |
| [Deployment](docs/deployment.md) | Docker Compose, configuration, backups |
| [Release](docs/release.md) | VERSION, CI/CD, APK signing |
| [Roadmap](docs/roadmap.md) | Milestones and open questions |
