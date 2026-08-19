# StoreAPI

Build contract: [SPEC.md](./SPEC.md).
How we work: [CONTRIBUTING.md](./CONTRIBUTING.md). `main` stays buildable and testable.
How we build: [BUILD.md](./BUILD.md) — stack, modules, tests, PR sequence.

App Store and Google Play: app details, reviews, charts, keyword search.

App Store Connect and Play Console show you your app. They do not show you a competitor’s review firehose. Sensor Tower and data.ai charge enterprise rents for that.

## Why this, and why overseas

ASO and mobile growth are dollar markets. Indie iOS/Android teams already pay for review monitoring and keyword spies. Official APIs are owner-scoped. The public store pages are the data.

Queries: `app store review api`, `google play reviews api`, `aso api`, `sensor tower alternative`.

## Exact demand

- Who: indie developers, mobile growth, store-aware agents
- Acceptance: `GET /v1/apps/{store}/{id}/reviews` → stars, version, country, body, time; 1 credit / page

## Exact connector

| Endpoint | Job |
|---|---|
| `/v1/apps/by-url` | Listing (rating, category, description) |
| `/v1/apps/{store}/{id}/reviews` | Reviews |
| `/v1/charts` | Free / paid / grossing |
| `/v1/search` | Keyword results |
| `/v1/apps/{id}/versions` | Version history if stable |

One schema for both stores. MCP: `get_app`, `list_reviews`, `keyword_search`.

US + UK first. CN storefronts are out of scope.

## Exact combination

- SEO vs. Sensor Tower pricing pages
- Free 100 calls; paid start $19 / mo / 3,000 (this buyer accepts more than $5)
- Every app we might ship later monitors reviews here — dogfood
- Agent: “what are the new 1-star themes this week”

## Cost control

- Reviews cached as `(app, country, page, day)`
- Charts 15–60 min TTL
- No screenshot file store
- Few egress IPs, not a world proxy mesh
- Store markup changes fail CI

## Business model

Credits. v1 is competitor-read, not “download estimates.” Independents first; CSV export later at a higher plan.

Success: 20 paying app teams; our own listings, if any, alert only through StoreAPI.

## Will not do

- No metadata write, no developer-account login
- No invented download numbers
- No 150-country coverage claim
- No full “growth OS”

## First two weeks

1. iOS US details + reviews
2. Play US details + reviews
3. Unified fields
4. MCP `list_reviews`

## Dogfood

If we ship any store listing, review watch comes from here. Reading reviews in a browser is a defect.

## Risk

Store ToS. Read-only public pages. Rate-limit ourselves. A block is an error, never a fabricated review.
