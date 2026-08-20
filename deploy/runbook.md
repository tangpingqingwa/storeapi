# StoreAPI — one-VPS runbook

Single Docker process, SQLite on a host volume. Default adapters are recorded fixtures. Live iTunes / Play are opt-in.

## Box

- Any Docker host (Ubuntu 22.04+ is fine)
- One public egress IP (document it internally; a store block is an outage)
- Map host `80`/`443` (or `$PORT`) to the container

## Env

```bash
git clone https://github.com/tangpingqingwa/storeapi.git
cd storeapi
cp .env.example .env
```

Set at least:

| Variable | Purpose |
|---|---|
| `PORT` | Listen port inside the container (default `3000`) |
| `NODE_ENV` | `production` (requires `STOREAPI_DATABASE`) |
| `STOREAPI_DATABASE` | SQLite file. Use `/app/data/storeapi.sqlite` with the volume below |
| `STOREAPI_BOOTSTRAP_KEY` | Optional first `st_live_…` / `st_test_…` when `keys` is empty |

Leave `STOREAPI_LIVE_STORES` unset or `0` until you are ready. Never commit `.env`.

## Run

```bash
docker build -t storeapi:latest .
mkdir -p /var/lib/storeapi
docker run -d --name storeapi --restart unless-stopped \
  --env-file .env \
  -e PORT=3000 \
  -e STOREAPI_DATABASE=/app/data/storeapi.sqlite \
  -p 3000:3000 \
  -v /var/lib/storeapi:/app/data \
  storeapi:latest
```

The process binds `0.0.0.0:$PORT` as the non-root `node` user. Put Caddy or nginx in front for TLS.

## Health

```bash
curl -fsS "http://127.0.0.1:${PORT:-3000}/healthz"
# {"ok":true}
```

`GET /healthz` is unauthenticated — use it for Docker / systemd / load-balancer checks. `GET /v1/me` still needs `Authorization: Bearer st_…`.

After bootstrap:

```bash
curl -fsS -H "Authorization: Bearer $STOREAPI_BOOTSTRAP_KEY" \
  "http://127.0.0.1:${PORT:-3000}/v1/me"
```

## Enable live stores

1. Confirm `/healthz` is green with live off.
2. Set `STOREAPI_LIVE_STORES=1` in `.env` (also `true` / `yes`). Unset / `0` stay on fixtures.
3. Recreate or `docker restart storeapi`. Documented iTunes JSON and public Play pages only.
4. Failures are `upstream_blocked` (0 credits). Never invent a review. JP stays `country_unsupported`.
5. `STOREAPI_FIXTURE_ONLY=1` wins and keeps fixtures. Do not set `STOREAPI_LIVE_STORES=1` in CI.

Roll back: set `STOREAPI_LIVE_STORES=0` (or unset) and restart.

## Data

Back up the SQLite file on the volume. The bootstrap key is inserted only when the `keys` table is empty.
