# Deployment (Docker Compose)

The whole server side runs from [`docker-compose.yml`](../docker-compose.yml):

| Service | Image | Role | Exposed |
|---------|-------|------|---------|
| `backend` | built from `backend/Dockerfile` | REST API on `:3000`, with the SQLite database in `/app/db` (the host folder `DB_DIR`, default `./db`). Runs migrations at startup. | `API_PORT` → 3000 (default `127.0.0.1:9191`, host only) |
| `web` | built from `frontend/Dockerfile` | nginx: serves the front and proxies `/api/*` to `backend` | `APP_PORT` → 80 (default `9292`) |

Startup order is enforced by a healthcheck: `backend` healthy (`/api/health`) → `web`.

Compose v2 is required (`docker compose`, from Docker's `docker-compose-plugin` package). The old Python `docker-compose` 1.x cannot read this file.

## First start

```bash
cp .env.example .env
# edit .env: JWT_SECRET (openssl rand -base64 48), PUBLIC_URL
docker compose up -d --build
docker compose ps            # all services should be "healthy"
docker compose logs -f backend
```

Then open `PUBLIC_URL` (default http://localhost:9292) and create the first account. Once all the accounts you want exist, you can set `ALLOW_REGISTRATION=false` and run `docker compose up -d` again.

## Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PUBLIC_URL` | `http://localhost:9292` | Public base URL. Used to build share links (`<PUBLIC_URL>/s/<token>`). Its origin is always allowed by CORS. |
| `APP_PORT` | `9292` | Host port of the `web` service: the app, and the API under `/api`. |
| `API_PORT` | `127.0.0.1:9191` | Host port of the `backend` service. The app does not need it. Loopback only by default, for a reverse proxy or tools on the host. `9191` alone opens it on every interface: only do that behind a proxy you control, because a client that reaches the backend directly can fake its IP in `X-Forwarded-For` and escape the rate limits and the share-link brute-force block. |
| `DB_DIR` | `./db` | Host folder of the SQLite database: `prod.db`, plus `prod.db-wal` and `prod.db-shm` while the API runs. Created on first start. At each start the container gives it to the user `node` (uid 1000), which runs the API. |
| `JWT_SECRET` | **required**, ≥ 32 characters | Secret that signs access tokens (`openssl rand -base64 48`). Changing it makes every current access token invalid; clients get new ones on their next refresh. |
| `ACCESS_TOKEN_TTL` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL` | `30d` | Session idle timeout. A session ends after this long **without use**, and every use restarts the countdown. Android widgets refresh every 15 min, so a phone in use stays signed in. |
| `ALLOW_REGISTRATION` | `true` | `false` closes sign-up: `POST /auth/register` answers `403 REGISTRATION_DISABLED`, `/api/health` reports `registration: false`, and the login page no longer offers to create an account. Existing accounts keep working. |
| `CORS_ORIGINS` | `https://localhost,http://localhost` | Extra allowed origins. The Android WebView origin is `https://localhost`. Also add the origin of any other web front whose users pick this server on their login page. |
| `LOG_LEVEL` | `info` | Backend log level |
| `SHARE_LINK_MAX_FAILURES` | `10` | Unknown share links an IP may request within `SHARE_LINK_BLOCK` before it is blocked for `SHARE_LINK_BLOCK` (NFR-3). `0` disables it. |
| `SHARE_LINK_BLOCK` | `15m` | Counting window and block duration for the above. |
| `RATE_LIMIT` | `true` | The API's rate limits (300 requests per minute per IP, 10 sign-ins or sign-ups). Keep them on; the end-to-end tests turn them off. |
| `TRUST_PROXY` | `1` | Number of reverse proxies in front of the API, used to find the client IP for rate limiting. `1` = the bundled nginx. Set it to `2` when you add your own HTTPS proxy in front. |

## HTTPS and reverse proxy

The Android app and the `Secure` cookie flag need **HTTPS** whenever the server is reached by anything other than `localhost`. Put a TLS reverse proxy in front and set `PUBLIC_URL` to the HTTPS URL.

Keep the app and the API on **one origin**: the web app calls `/api` on its own domain, the refresh cookie only works same-site, and the Android app is configured with that same URL. The proxy can send `/api/` straight to the backend (`API_PORT`, 9191) and everything else to `web` (`APP_PORT`, 9292). Do **not** add CORS headers in the proxy: the backend sends them itself (`CORS_ORIGINS`), and duplicated `Access-Control-Allow-Origin` headers make browsers reject the response.

`.env` for this setup:

```dotenv
PUBLIC_URL=https://notes.example.com
APP_PORT=127.0.0.1:9292     # reachable through the proxy only
API_PORT=127.0.0.1:9191
TRUST_PROXY=1               # /api goes proxy -> backend: one hop
```

`TRUST_PROXY` is the number of proxies between the client and the backend: `1` when the proxy sends `/api` to `API_PORT`, `2` when it sends everything to `APP_PORT` (proxy, then the bundled nginx). A wrong value either lumps all clients under one IP (rate limits and the share-link block then hit everyone) or lets clients fake their IP.

nginx (with certbot certificates):

```nginx
# HTTP -> HTTPS
server {
    listen 80;
    server_name notes.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name notes.example.com;

    ssl_certificate     /etc/letsencrypt/live/notes.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/notes.example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Notes are up to 1 MB; leave room for JSON encoding.
    client_max_body_size 4m;

    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # API -> backend (one hop: TRUST_PROXY=1). CORS is handled by the backend.
    location /api/ {
        proxy_pass http://127.0.0.1:9191;
        proxy_read_timeout 60s;
    }

    # App, share-link pages, security headers -> web
    location / {
        proxy_pass http://127.0.0.1:9292;
    }
}
```

Caddy, sending everything to `web` (then `TRUST_PROXY=2`):

```
notes.example.com {
    reverse_proxy localhost:9292
}
```

If the proxy runs as another container, attach it to the compose network and remove the `ports:` mappings.

## Upgrades

```bash
git pull                      # or check out the tag vX.Y.Z
docker compose up -d --build  # migrations run automatically when the backend starts
```

## Backups

Everything is in one SQLite file, `DB_DIR/prod.db` (default `./db/prod.db`). Never copy `prod.db` alone while the API runs: recent changes may still be in `prod.db-wal`. Either:

- take a consistent copy while it runs, with the `sqlite3` tool on the host (`apt install sqlite3`):

  ```bash
  sqlite3 db/prod.db ".backup 'selfnotes-backup.db'"
  ```

- or stop the API and copy the whole folder:

  ```bash
  docker compose stop backend
  cp -a db db-backup
  docker compose start backend
  ```

To restore, stop the API, put the backup in place as `prod.db`, delete any `prod.db-wal` and `prod.db-shm` left next to it, then start the API again:

```bash
docker compose stop backend
cp selfnotes-backup.db db/prod.db
rm -f db/prod.db-wal db/prod.db-shm
docker compose start backend
```
