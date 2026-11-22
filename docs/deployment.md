# Deployment (Docker Compose)

The whole server side runs from [`docker-compose.yml`](../docker-compose.yml):

| Service | Image | Role | Exposed |
|---------|-------|------|---------|
| `db` | `postgres:17-alpine` | Database, volume `db-data` | no |
| `backend` | built from `backend/Dockerfile` | REST API on `:3000`. Runs migrations at startup. | no |
| `web` | built from `frontend/Dockerfile` | nginx: serves the front and proxies `/api/*` to `backend` | `APP_PORT` → 80 |

Startup order is enforced by healthchecks: `db` healthy → `backend` healthy (`/api/health`) → `web`.

## First start

```bash
cp .env.example .env
# edit .env: POSTGRES_PASSWORD, JWT_SECRET (openssl rand -base64 48), PUBLIC_URL
docker compose up -d --build
docker compose ps            # all services should be "healthy"
docker compose logs -f backend
```

Then open `PUBLIC_URL` (default http://localhost:8080) and create the first account. Once all the accounts you want exist, you can set `ALLOW_REGISTRATION=false` and run `docker compose up -d` again.

## Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PUBLIC_URL` | `http://localhost:8080` | Public base URL. Used to build share links (`<PUBLIC_URL>/s/<token>`). Its origin is always allowed by CORS. |
| `APP_PORT` | `8080` | Host port of the `web` service |
| `POSTGRES_DB` / `POSTGRES_USER` | `selfnotes` | Database name and user |
| `POSTGRES_PASSWORD` | **required** | Database password. Use URL-safe characters only, because it is embedded in `DATABASE_URL`. |
| `JWT_SECRET` | **required**, ≥ 32 characters | Secret that signs access tokens (`openssl rand -base64 48`). Changing it makes every current access token invalid; clients get new ones on their next refresh. |
| `ACCESS_TOKEN_TTL` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL` | `30d` | Session idle timeout. A session ends after this long **without use**, and every use restarts the countdown. Android widgets refresh every 30 min, so a phone in use stays signed in. |
| `ALLOW_REGISTRATION` | `true` | Open or close sign-up |
| `CORS_ORIGINS` | `https://localhost,http://localhost` | Extra allowed origins. The Android WebView origin is `https://localhost`. Also add the origin of any other web front whose users pick this server on their login page. |
| `LOG_LEVEL` | `info` | Backend log level |
| `SHARE_LINK_MAX_FAILURES` | `10` | Unknown share links an IP may request within `SHARE_LINK_BLOCK` before it is blocked for `SHARE_LINK_BLOCK` (NFR-3). `0` disables it. |
| `SHARE_LINK_BLOCK` | `15m` | Counting window and block duration for the above. |
| `TRUST_PROXY` | `1` | Number of reverse proxies in front of the API, used to find the client IP for rate limiting. `1` = the bundled nginx. Set it to `2` when you add your own HTTPS proxy in front. |

## HTTPS and reverse proxy

The Android app and the `Secure` cookie flag need **HTTPS** whenever the server is reached by anything other than `localhost`. Put a TLS reverse proxy (Caddy, Traefik, nginx…) in front of `web` and set `PUBLIC_URL` to the HTTPS URL.

Minimal Caddy example:

```
notes.example.com {
    reverse_proxy localhost:8080
}
```

If the proxy runs as another container, attach it to the compose network and remove the `ports:` mapping of `web`.

## Upgrades

```bash
git pull                      # or check out the tag vX.Y.Z
docker compose up -d --build  # migrations run automatically when the backend starts
```

## Backups

Everything is in PostgreSQL. Back up with:

```bash
docker compose exec -T db pg_dump -U selfnotes -d selfnotes -Fc > selfnotes.dump
```

Restore into an empty database:

```bash
docker compose exec -T db pg_restore -U selfnotes -d selfnotes --clean --if-exists < selfnotes.dump
```
