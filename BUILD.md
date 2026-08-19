# StoreAPI — Detailed Specification and Build Plan

**Contract:** [SPEC.md](./SPEC.md)  
**Git:** [CONTRIBUTING.md](./CONTRIBUTING.md)

iOS + Play, US + UK. Keys `st_live_`. A fabricated review is Sev-0.

---

## 1. Stack

Node 22, Fastify, SQLite. Official **iTunes Lookup / RSS** and Play public page fixtures. Prefer documented iTunes JSON for iOS listings/reviews before HTML.

---

## 2. Store enum

`ios` | `play`. Country `US` | `GB` only; else `country_unsupported`.

iOS id: numeric App Store id. Also accept bundleId on lookup if iTunes returns it.  
Play id: package name `com.foo.bar`.

---

## 3. Versions endpoint

v1: **501 `not_implemented`**, 0 credits, hidden from homepage, until a later PR proves a stable public source. Do not scrape unofficial history sites in the first four PRs.

---

## 4. Tests

Fixtures: one top free iOS US app, one Play US app, review page 1 each, empty reviews app, iOS/Play GB listing + reviews page 1, JP country → 422.  
Assert review `stars` is integer 1–5. Fail if generator would invent ids.

---

## 5. PR plan

### PR 1: Skeleton + keys + types
- **Dependencies:** None

### PR 2: iOS US listing + reviews
- **Files:** adapters/ios, core/apps.ts, core/reviews.ts, fixtures, tests
- **Dependencies:** PR 1
- **Acceptance:** SPEC 1, 3

### PR 3: Play US listing + reviews + unified schema
- **Files:** adapters/play, same core
- **Dependencies:** PR 2
- **Acceptance:** SPEC 2, 4, 5, 7

### PR 4: UK country param
- **Files:** adapters fixture indexes, tests/fixtures/*-gb*, core/params.ts, tests
- **Dependencies:** PR 3
- **Acceptance:** `country=GB` listings + reviews (US still default); JP still 422

### PR 5: charts + search
- **Files:** core/charts.ts, core/search.ts
- **Dependencies:** PR 3
- **Acceptance:** SPEC 6

### PR 6: MCP
- **Tools:** get_app, list_reviews, keyword_search
- **Dependencies:** PR 5

No download-estimate fields in types. Ever.
