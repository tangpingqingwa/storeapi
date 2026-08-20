# Live smoke — iOS iTunes JSON + Play public pages

Manual. Not part of `scripts/test.sh` or GitHub Actions `ci`.
`100%` here means a local process with `STOREAPI_LIVE_STORES=1` and
`STOREAPI_FIXTURE_ONLY` **unset** walked the required flows against real
public store pages.

A fabricated review is Sev-0. Empty upstream or a block is an error or an
empty list — never invented stars, bodies, or download estimates.

## Command

```bash
bash scripts/live-smoke.sh
```

The script starts `npx tsx src/server.ts` on a free localhost port with:

| Env | Value |
|---|---|
| `STOREAPI_LIVE_STORES` | `1` |
| `STOREAPI_FIXTURE_ONLY` | unset |
| `STOREAPI_BOOTSTRAP_KEY` | `st_live_smoke_local` (temp sqlite only) |
| `STOREAPI_DATABASE` | temp file, deleted on exit |
| `NODE_ENV` | `development` |

Override with `STOREAPI_LIVE_BASE_URL` to hit an already-running live process,
or `STOREAPI_LIVE_IOS_ID` / `STOREAPI_LIVE_PLAY_ID` / `STOREAPI_LIVE_PORT`.

## Required walks

| # | Request | Pass when |
|---|---|---|
| 1 | `GET /v1/apps/ios/{id}?country=US` | `200` listing from documented iTunes Lookup JSON (`itunes.apple.com/lookup`). Name + rating. 1 credit. |
| 2 | `GET /v1/apps/ios/{id}/reviews?country=US&page=1` | `200` review page parsed from documented iTunes customerreviews RSS JSON. Each review (if any) has integer stars 1–5 and a string body. Empty feed is allowed. Never invent a review. 1 credit. |
| 3 | `GET /v1/apps/play/{id}?country=US` | `200` listing from the public Play HTML page, **or** `503 upstream_blocked` / 0 credits if the page is blocked or unparseable. |
| 4 | `GET /v1/apps/play/{id}/reviews?country=US&page=1` | Play has no public reviews JSON. Live adapter returns `503 upstream_blocked` / 0 credits. A `200` is only allowed if every review is real (stars + body). Never invent. |
| 5 | `GET /v1/apps/{ios\|play}/{id}?country=JP` | `422 country_unsupported`, 0 credits. |

Legend: **PASS** = got the expected live payload. **PASS-ERROR** = SPEC error from real upstream (block / no public JSON). **FAIL** = invented data, wrong code, or estimates.

## This session (2026-08-20)

Ran `bash scripts/live-smoke.sh` on this machine against a process the script started (`http://127.0.0.1:58135`). Live flags on. Offline fixtures not used.

Default ids: iOS `389801252` (Instagram), Play `com.google.android.youtube`.

| Flow | Result | Notes |
|---|---|---|
| `/healthz` | **PASS** | `200 {"ok":true}` |
| iOS US listing | **PASS** | `name=Instagram` `rating.average=4.69058` via `https://itunes.apple.com/lookup?id=389801252&country=us` |
| iOS US reviews | **PASS** | Documented RSS JSON `https://itunes.apple.com/us/rss/customerreviews/page=1/id=389801252/sortby=mostrecent/json` returned a valid empty `feed` (no `entry`). API `200`, `reviews=[]`. None invented. |
| Play US listing | **PASS** | `name=YouTube` from `https://play.google.com/store/apps/details?id=com.google.android.youtube&hl=en&gl=us` |
| Play US reviews | **PASS-ERROR** | `503 upstream_blocked`, 0 credits. Live Play adapter does not scrape unofficial review JSON. |
| `country=JP` iOS | **PASS** | `422 country_unsupported`, 0 credits |
| `country=JP` Play | **PASS** | `422 country_unsupported`, 0 credits |

No download / revenue estimate fields appeared on any body.

Apple’s customerreviews **JSON** feed is currently an empty envelope for every
US id probed in this session (Instagram, WhatsApp, TikTok, YouTube, Spotify,
Facebook, …). The same path as **XML** (`…/xml`) still returns Atom entries.
The live adapter only parses the documented JSON URL; it does not fall back to
HTML or invent reviews from the XML feed. Empty JSON → empty `reviews` is the
honest result.

## What this is not

- Not a CI job. `.github/workflows/ci.yml` must stay offline.
- Not called from `scripts/test.sh` (`STOREAPI_FIXTURE_ONLY=1` there).
- Not a scrape of unofficial Play review hosts.
- Not a download-estimate product.
