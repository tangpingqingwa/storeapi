# StoreAPI — Product Development Spec

**Version:** 1.0  
**Status:** Ready to build  
**Repo:** https://github.com/tangpingqingwa/storeapi  
**Stores:** Apple App Store + Google Play  
**Countries v1:** US + UK  
**Out of scope:** CN storefronts, download estimates

Competitor-read API. App Store Connect is owner-scoped. Sensor Tower is enterprise rent.

---

## 1. Product statement

App URL or store id → listing, reviews, charts, keyword search. One schema for both stores.

One-line pitch: **Competitor App Store / Play reviews as JSON. $19/mo.**

---

## 2. Goals and non-goals

### Goals

- `GET /v1/apps/{store}/{id}/reviews` → stars, version, country, body, time; 1 credit / page.
- Unified fields across iOS and Play.
- US + UK only.
- A fabricated review is a Sev-0.

### Non-goals

- Metadata write / developer login.
- Invented download numbers or revenue.
- 150-country coverage.
- Full growth OS / ASO automation writes.

---

## 3. Auth and envelope

Bearer `st_live_...`.

| code | HTTP | meaning |
|---|---|---|
| `store_unsupported` | 422 | not ios/play |
| `country_unsupported` | 422 | not us/uk |
| `app_not_found` | 404 | |
| `upstream_blocked` | 503 | |

---

## 4. Endpoints

Store enum: `ios` | `play`.

### 4.1 `GET /v1/apps/by-url`

**Credits:** 1. Accepts `apps.apple.com/.../id123` and `play.google.com/store/apps/details?id=`.

### 4.2 `GET /v1/apps/{store}/{id}`

**Credits:** 1. iOS numeric id or bundle; Play package name.

`data`:

```ts
{
  store: "ios" | "play"
  id: string
  bundleId: string | null
  name: string
  developer: string | null
  url: string
  iconUrl: string | null
  category: string | null
  rating: { average: number | null, count: number | null }
  price: { amount: number, currency: string } | null  // 0 = free
  description: string
  version: string | null
  updatedAt: string | null
  countries: string[]        // which listing we fetched, e.g. ["US"]
  fetchedAt: string
}
```

### 4.3 `GET /v1/apps/{store}/{id}/reviews`

**Credits:** 1 / page. Query: `country` (`US` default, `GB` allowed), `page`.

```ts
{
  page: number
  country: "US" | "GB"
  hasMore: boolean
  reviews: Array<{
    id: string | null
    stars: number
    title: string | null
    body: string
    author: string | null
    version: string | null
    createdAt: string | null
  }>
}
```

### 4.4 `GET /v1/charts`

**Credits:** 1 / page. Query: `store`, `country`, `kind` (`free` \| `paid` \| `grossing`), `category` optional.

Results: rank, app id, name.

### 4.5 `GET /v1/search`

**Credits:** 1 / page. Query: `store`, `country`, `q`.

### 4.6 `GET /v1/apps/{store}/{id}/versions`

**Credits:** 1. Only if public version history is reliably available (iOS often yes via third-party public pages; Play often no). If not stable, return `501 not_implemented`, 0 credits, hide from homepage.

### 4.7 Control plane

`/v1/me`, `/v1/usage`, `/healthz`.

---

## 5. Billing

| Plan | Price | Credits |
|---|---|---|
| Free | $0 | 100 once |
| Monthly | $19 | 3,000 |
| Annual | $190 | 3,000 / mo |

CSV export of reviews = later Pro $49, not v1.

---

## 6. Caching

| Resource | Key | TTL |
|---|---|---|
| Listing | store, id, country | 12h |
| Reviews | store, id, country, page | 1 day |
| Charts | store, country, kind, category | 15–60 min |
| Search | store, country, q, page | 6h |

Few egress IPs. Store markup change fails CI.

---

## 7. MCP

Streamable HTTP at `POST /mcp`. Same Bearer keys as REST. Tools wrap `core/*` 1:1:

| tool | REST | credits |
|---|---|---|
| `get_app` | `GET /v1/apps/{store}/{id}` | 1 |
| `list_reviews` | `GET /v1/apps/{store}/{id}/reviews` | 1 / page |
| `keyword_search` | `GET /v1/search` | 1 / page |

Skill: US/UK; no download estimates; do not write metadata.

SEO vs Sensor Tower pricing pages.

Public `GET /llms.txt` and `GET /.well-known/mcp/server-card.json`. Tool failures stay JSON-RPC HTTP 200 with `isError` and the REST error envelope in `structuredContent`. Auth failures stay the REST 401 envelope.

---

## 8. Acceptance

| # | Case | Expected |
|---|---|---|
| 1 | iOS US listing (e.g. a top free app) | name + rating |
| 2 | Play US listing | same schema |
| 3 | iOS US reviews page 1 | stars + body |
| 4 | Play US reviews page 1 | same |
| 5 | country=`JP` | 422 country_unsupported |
| 6 | Charts iOS US free | ranked list |
| 7 | Block / empty upstream | error, never synthetic reviews |

Dogfood: any app we ship later alerts only through StoreAPI.

---

## 9. Milestones

**M1:** iOS US details + reviews.  
**M2:** Play US details + reviews + unified schema.  
**M3:** UK; keys; $19.  
**M4:** charts + search.  
**M5:** MCP.

Launch = M3.

---

## 10. Legal

Read-only public store pages. Rate-limit ourselves. A block is an error. Independent, not Apple/Google. No implied Sensor Tower replacement of their estimates.

## 11. Git collaboration (normative)

Development is GitHub trunk-based. **`main` is always cloneable, buildable, and testable.**

| Rule | Requirement |
|---|---|
| Integration branch | `main` only. No long-lived `develop`. |
| How code lands | Pull request into `main`. No direct push. |
| Required check | GitHub Actions workflow `ci` (job id `ci`) must be green. |
| Local / CI test | `bash scripts/test.sh` — offline, no production secrets. |
| Branch names | `feat/` `fix/` `docs/` `chore/` `test/` + short slug. |
| Merge | Squash. Delete the head branch. |
| Broken `main` | Treat as an incident. Fix on `fix/…` via PR. |

Full process: [CONTRIBUTING.md](./CONTRIBUTING.md).

Implementation plan (stack, modules, PR DAG): [BUILD.md](./BUILD.md).

Until there is an application binary, `scripts/test.sh` still has to pass: contract files exist, SPEC/CONTRIBUTING agree, no tracked secrets. Adding a server or CLI means **extending** that script with unit/contract tests. Live iTunes / Play adapters are env-gated (`STOREAPI_LIVE_STORES=1`) and off by default. `STOREAPI_FIXTURE_ONLY=1` forces fixtures. CI and `scripts/test.sh` stay offline.
