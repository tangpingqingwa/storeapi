import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  createFixtureIosAdapter,
  itunesChartsRssUrl,
  itunesSearchUrl,
  parseIosCharts,
  parseIosSearch,
} from "../src/adapters/ios.js";
import {
  createFixturePlayAdapter,
  parsePlayCharts,
  parsePlaySearch,
  playChartsUrl,
  playSearchUrl,
} from "../src/adapters/play.js";
import { createKey } from "../src/billing/keys.js";
import { listCharts } from "../src/core/charts.js";
import { searchApps } from "../src/core/search.js";
import { openDatabase } from "../src/db.js";
import { buildApp } from "../src/app.js";
import {
  CHART_ENTRY_KEYS,
  CHART_PAGE_KEYS,
  SEARCH_HIT_KEYS,
  SEARCH_PAGE_KEYS,
  listingHasForbiddenEstimateField,
  type ChartPage,
  type ErrorCode,
  type SearchPage,
} from "../src/types.js";

const TEST_KEY = "st_test_charts_search";
const INSTAGRAM_ID = "389801252";
const YOUTUBE_ID = "com.google.android.youtube";

type Envelope<T> = {
  data: T;
  meta: {
    cached: boolean;
    creditsCharged: number;
    requestId: string;
    upstreamMs: number;
  };
};

type ErrBody = {
  error: { code: ErrorCode; message: string; retryable: boolean };
  meta: { creditsCharged: number; requestId: string };
};

function objectKeys(value: object): string[] {
  return Object.keys(value).sort();
}

function assertRankedList(page: ChartPage): void {
  assert.ok(page.results.length >= 1);
  assert.equal(listingHasForbiddenEstimateField(page), false);
  assert.deepEqual(objectKeys(page), [...CHART_PAGE_KEYS].sort());
  for (const [index, entry] of page.results.entries()) {
    assert.equal(entry.rank, index + 1);
    assert.ok(entry.id.length > 0);
    assert.ok(entry.name.length > 0);
    assert.deepEqual(objectKeys(entry), [...CHART_ENTRY_KEYS].sort());
    assert.equal("downloadEstimate" in entry, false);
    assert.equal("revenue" in entry, false);
  }
}

function assertSearchHits(page: SearchPage): void {
  assert.ok(page.results.length >= 1);
  assert.equal(listingHasForbiddenEstimateField(page), false);
  assert.deepEqual(objectKeys(page), [...SEARCH_PAGE_KEYS].sort());
  for (const hit of page.results) {
    assert.ok(hit.id.length > 0);
    assert.ok(hit.name.length > 0);
    assert.deepEqual(objectKeys(hit), [...SEARCH_HIT_KEYS].sort());
    assert.equal("downloadEstimate" in hit, false);
  }
}

async function injectApp(
  url: string,
  headers: Record<string, string> = { authorization: `Bearer ${TEST_KEY}` },
) {
  const app = await buildApp({ bootstrapKey: TEST_KEY });
  after(() => app.close());
  return {
    app,
    response: await app.inject({ method: "GET", url, headers }),
  };
}

test("iTunes and Play URL helpers stay on documented chart/search hosts", () => {
  assert.equal(
    itunesChartsRssUrl("US", "free", null, 1),
    "https://itunes.apple.com/us/rss/topfreeapplications/limit=25/page=1/json",
  );
  assert.equal(
    itunesChartsRssUrl("US", "free", "6008", 1),
    "https://itunes.apple.com/us/rss/topfreeapplications/limit=25/genre=6008/page=1/json",
  );
  assert.equal(
    itunesSearchUrl("instagram", "US", 1),
    "https://itunes.apple.com/search?term=instagram&country=us&entity=software&limit=25&offset=0",
  );
  assert.equal(
    playChartsUrl("US", "free", null, 1),
    "https://play.google.com/store/apps/category/APPLICATION/collection/topselling_free?gl=us&hl=en&page=1",
  );
  assert.equal(
    playSearchUrl("youtube", "US", 1),
    "https://play.google.com/store/search?q=youtube&c=apps&hl=en&gl=us&page=1",
  );
});

test("SPEC 6: iOS US free charts are a ranked list of id + name", async () => {
  const page = await listCharts({
    store: "ios",
    country: "US",
    kind: "free",
  });
  assert.equal(page.store, "ios");
  assert.equal(page.country, "US");
  assert.equal(page.kind, "free");
  assert.equal(page.category, null);
  assert.equal(page.page, 1);
  assert.equal(page.hasMore, false);
  assertRankedList(page);
  assert.equal(page.results[0]?.id, INSTAGRAM_ID);
  assert.equal(page.results[0]?.name, "Instagram");
  assert.equal(page.results[0]?.rank, 1);
  assert.equal(page.results[1]?.rank, 2);
});

test("iOS paid and grossing charts are ranked lists from fixtures", async () => {
  const paid = await listCharts({ store: "ios", kind: "paid" });
  const grossing = await listCharts({ store: "ios", kind: "GROSSING" });
  assert.equal(paid.kind, "paid");
  assert.equal(paid.results[0]?.name, "Shadowrocket");
  assertRankedList(paid);
  assert.equal(grossing.kind, "grossing");
  assert.equal(grossing.results[0]?.id, "544007664");
  assertRankedList(grossing);
});

test("iOS category filter and GB free chart stay fixture-backed", async () => {
  const photo = await listCharts({
    store: "ios",
    kind: "free",
    category: "6008",
  });
  const gb = await listCharts({
    store: "ios",
    country: "GB",
    kind: "free",
  });
  assert.equal(photo.category, "6008");
  assert.equal(photo.results[0]?.name, "Instagram");
  assert.equal(photo.results[1]?.name, "VSCO");
  assert.equal(gb.country, "GB");
  assert.equal(gb.results[0]?.name, "WhatsApp Messenger");
  assert.notEqual(gb.results[0]?.id, photo.results[0]?.id);
});

test("Play US free charts share the same ranked schema as iOS", async () => {
  const play = await listCharts({ store: "play", country: "US", kind: "free" });
  const ios = await listCharts({ store: "ios", country: "US", kind: "free" });
  assert.equal(play.store, "play");
  assert.equal(play.results[0]?.id, YOUTUBE_ID);
  assert.equal(play.results[0]?.name, "YouTube");
  assertRankedList(play);
  assert.deepEqual(objectKeys(play), objectKeys(ios));
  assert.deepEqual(objectKeys(play.results[0] ?? {}), objectKeys(ios.results[0] ?? {}));
});

test("iOS search q=instagram returns id + name hits", async () => {
  const page = await searchApps({ store: "ios", q: "instagram" });
  assert.equal(page.store, "ios");
  assert.equal(page.country, "US");
  assert.equal(page.q, "instagram");
  assert.equal(page.page, 1);
  assertSearchHits(page);
  assert.equal(page.results[0]?.id, INSTAGRAM_ID);
  assert.equal(page.results[0]?.name, "Instagram");
});

test("Play search q=youtube shares the same hit schema as iOS", async () => {
  const play = await searchApps({ store: "play", q: "youtube" });
  const ios = await searchApps({ store: "ios", q: "instagram" });
  assert.equal(play.store, "play");
  assert.equal(play.results[0]?.id, YOUTUBE_ID);
  assert.equal(play.results[0]?.name, "YouTube");
  assertSearchHits(play);
  assert.deepEqual(objectKeys(play), objectKeys(ios));
  assert.deepEqual(objectKeys(play.results[0] ?? {}), objectKeys(ios.results[0] ?? {}));
});

test("search is case-insensitive on q and GB uses its own fixture", async () => {
  const us = await searchApps({ store: "ios", q: "Instagram" });
  const gb = await searchApps({ store: "ios", country: "GB", q: "instagram" });
  const playGb = await searchApps({ store: "play", country: "gb", q: "youtube" });
  assert.equal(us.results[0]?.name, "Instagram");
  assert.equal(gb.country, "GB");
  assert.equal(gb.results.length, 1);
  assert.equal(playGb.country, "GB");
  assert.equal(playGb.results[0]?.id, YOUTUBE_ID);
});

test("unknown chart/search query is an empty page, never invented ranks", async () => {
  const charts = await listCharts({ store: "ios", kind: "free", page: 9 });
  const search = await searchApps({ store: "play", q: "no-such-app-in-fixtures" });
  assert.deepEqual(charts.results, []);
  assert.equal(charts.hasMore, false);
  assert.deepEqual(search.results, []);
  assert.equal(search.hasMore, false);
});

test("blocked chart/search fixtures are upstream_blocked, not synthetic rows", async () => {
  await assert.rejects(
    () => listCharts({ store: "ios", kind: "free", category: "blocked" }),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
  await assert.rejects(
    () => listCharts({ store: "play", kind: "free", category: "blocked" }),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
  await assert.rejects(
    () => searchApps({ store: "ios", q: "blocked" }),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
  await assert.rejects(
    () => searchApps({ store: "play", q: "blocked" }),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
});

test("JP is country_unsupported; missing store/kind/q are typed errors", async () => {
  await assert.rejects(
    () => listCharts({ store: "ios", country: "JP", kind: "free" }),
    { name: "StoreApiError", code: "country_unsupported" },
  );
  await assert.rejects(
    () => searchApps({ store: "play", country: "JP", q: "youtube" }),
    { name: "StoreApiError", code: "country_unsupported" },
  );
  await assert.rejects(() => listCharts({ kind: "free" }), {
    name: "StoreApiError",
    code: "store_unsupported",
  });
  await assert.rejects(() => listCharts({ store: "ios", kind: "trending" }), {
    name: "StoreApiError",
    code: "invalid_request",
  });
  await assert.rejects(() => searchApps({ store: "ios", q: "   " }), {
    name: "StoreApiError",
    code: "invalid_request",
  });
});

test("parser refuses a chart/search row without id or name", () => {
  assert.throws(
    () =>
      parseIosCharts(
        { feed: { entry: [{ title: { label: "no id" } }] } },
        "US",
        "free",
        null,
        1,
      ),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
  assert.throws(
    () =>
      parsePlayCharts(
        { apps: [{ name: "no package" }] },
        "US",
        "free",
        null,
        1,
      ),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
  assert.throws(
    () => parseIosSearch({ resultCount: 1, results: [{ trackName: "x" }] }, "US", "x", 1),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
  assert.throws(
    () => parsePlaySearch({ results: [{ name: "x" }] }, "US", "x", 1),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
});

test("GET /v1/charts iOS US free is 200 ranked list, 1 credit", async () => {
  const { app, response } = await injectApp(
    "/v1/charts?store=ios&country=US&kind=free",
  );
  assert.equal(response.statusCode, 200);
  const body = response.json() as Envelope<ChartPage>;
  assert.equal(body.data.store, "ios");
  assert.equal(body.data.kind, "free");
  assert.equal(body.data.results[0]?.name, "Instagram");
  assert.equal(body.data.results[0]?.rank, 1);
  assert.ok(body.data.results.length >= 1);
  assert.equal(body.meta.creditsCharged, 1);
  assert.equal(listingHasForbiddenEstimateField(body.data), false);
  const me = await app.inject({
    method: "GET",
    url: "/v1/me",
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  assert.equal(
    (me.json() as { data: { creditsRemaining: number } }).data.creditsRemaining,
    99,
  );
});

test("GET /v1/search Play youtube is 200 hits, 1 credit", async () => {
  const { response } = await injectApp("/v1/search?store=play&q=youtube");
  assert.equal(response.statusCode, 200);
  const body = response.json() as Envelope<SearchPage>;
  assert.equal(body.data.store, "play");
  assert.equal(body.data.q, "youtube");
  assert.equal(body.data.results[0]?.id, YOUTUBE_ID);
  assert.equal(body.data.results[0]?.name, "YouTube");
  assert.equal(body.meta.creditsCharged, 1);
});

test("GET charts/search without bearer is 401 with 0 credits", async () => {
  const { response: charts } = await injectApp(
    "/v1/charts?store=ios&kind=free",
    {},
  );
  const { response: search } = await injectApp("/v1/search?store=ios&q=instagram", {});
  for (const response of [charts, search]) {
    assert.equal(response.statusCode, 401);
    const body = response.json() as ErrBody;
    assert.equal(body.error.code, "unauthorized");
    assert.equal(body.meta.creditsCharged, 0);
  }
});

test("GET charts country=JP is 422; missing kind is 400; both charge 0", async () => {
  const { response: jp } = await injectApp("/v1/charts?store=ios&country=JP&kind=free");
  const { response: kind } = await injectApp("/v1/charts?store=ios");
  const { response: q } = await injectApp("/v1/search?store=ios");
  assert.equal(jp.statusCode, 422);
  assert.equal((jp.json() as ErrBody).error.code, "country_unsupported");
  assert.equal((jp.json() as ErrBody).meta.creditsCharged, 0);
  assert.equal(kind.statusCode, 400);
  assert.equal((kind.json() as ErrBody).error.code, "invalid_request");
  assert.equal(q.statusCode, 400);
  assert.equal((q.json() as ErrBody).error.code, "invalid_request");
});

test("GET blocked chart/search is 503 with 0 credits", async () => {
  const app = await buildApp({ bootstrapKey: TEST_KEY });
  after(() => app.close());

  const charts = await app.inject({
    method: "GET",
    url: "/v1/charts?store=ios&kind=free&category=blocked",
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  assert.equal(charts.statusCode, 503);
  assert.equal((charts.json() as ErrBody).error.code, "upstream_blocked");
  assert.equal((charts.json() as ErrBody).meta.creditsCharged, 0);

  const search = await app.inject({
    method: "GET",
    url: "/v1/search?store=play&q=blocked",
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  assert.equal(search.statusCode, 503);
  assert.equal((search.json() as ErrBody).error.code, "upstream_blocked");
  assert.equal((search.json() as ErrBody).meta.creditsCharged, 0);
});

test("zero-credit key is 402 and does not invent a chart", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  createKey(db, { secret: "st_test_broke_charts", credits: 0 });
  const app = await buildApp({ db });
  after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/charts?store=ios&kind=free",
    headers: { authorization: "Bearer st_test_broke_charts" },
  });
  assert.equal(response.statusCode, 402);
  assert.equal((response.json() as ErrBody).error.code, "payment_required");
  assert.equal((response.json() as ErrBody).meta.creditsCharged, 0);
});

test("GET empty chart page still charges 1 on success", async () => {
  const { response } = await injectApp("/v1/charts?store=ios&kind=free&page=9");
  assert.equal(response.statusCode, 200);
  const body = response.json() as Envelope<ChartPage>;
  assert.deepEqual(body.data.results, []);
  assert.equal(body.meta.creditsCharged, 1);
});

test("fixture adapters expose charts and search without live fetch", () => {
  const ios = createFixtureIosAdapter();
  const play = createFixturePlayAdapter();
  assert.equal(typeof ios.getCharts, "function");
  assert.equal(typeof ios.search, "function");
  assert.equal(typeof play.getCharts, "function");
  assert.equal(typeof play.search, "function");
});
