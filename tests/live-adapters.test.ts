import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createLiveHttpGet,
  createLiveIosAdapter,
  createLivePlayAdapter,
  createStoreAdapters,
  type HttpGet,
} from "../src/adapters/index.js";
import {
  parsePlayClusterHtml,
  parsePlayDetailsHtml,
} from "../src/adapters/play.js";
import { liveStoresEnabled } from "../src/config.js";
import { getApp } from "../src/core/apps.js";
import { listCharts } from "../src/core/charts.js";
import { listReviews } from "../src/core/reviews.js";
import { searchApps } from "../src/core/search.js";
import {
  assertReviewStars,
  listingHasForbiddenEstimateField,
} from "../src/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTAGRAM_ID = "389801252";
const INSTAGRAM_BUNDLE = "com.burbn.instagram";
const YOUTUBE_ID = "com.google.android.youtube";

function fixture(rel: string): string {
  return readFileSync(join(ROOT, "tests/fixtures", rel), "utf8");
}

function jsonGet(routes: Record<string, { status?: number; body: string }>): HttpGet {
  return async (url) => {
    const match = routes[url];
    if (match === undefined) {
      throw new Error(`unexpected live url ${url}`);
    }
    return { status: match.status ?? 200, body: match.body };
  };
}

const PLAY_YOUTUBE_HTML = `<!doctype html>
<html>
  <head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "YouTube",
        "url": "https://play.google.com/store/apps/details?id=com.google.android.youtube&hl=en&gl=us",
        "image": "https://play-lh.googleusercontent.com/recorded-fixture-youtube-icon.png",
        "author": { "@type": "Organization", "name": "Google LLC" },
        "applicationCategory": "Video Players & Editors",
        "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.4", "ratingCount": "152000000" },
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
        "description": "Watch and share videos. Recorded Play HTML for the live adapter unit test.",
        "softwareVersion": "19.50.37",
        "datePublished": "2026-01-14T00:00:00Z"
      }
    </script>
  </head>
  <body><h1 itemprop="name">YouTube</h1></body>
</html>`;

const PLAY_YOUTUBE_GB_HTML = PLAY_YOUTUBE_HTML
  .replace("gl=us", "gl=gb")
  .replace('"priceCurrency": "USD"', '"priceCurrency": "GBP"')
  .replace('"ratingValue": "4.4"', '"ratingValue": "4.3"')
  .replace('"ratingCount": "152000000"', '"ratingCount": "18400000"');

const PLAY_CLUSTER_HTML = `<html><body>
["com.google.android.youtube", "YouTube", null]
["com.instagram.android", "Instagram", null]
</body></html>`;

test("liveStoresEnabled is off by default and FIXTURE_ONLY wins", () => {
  assert.equal(liveStoresEnabled({}), false);
  assert.equal(liveStoresEnabled({ STOREAPI_LIVE_STORES: "0" }), false);
  assert.equal(liveStoresEnabled({ STOREAPI_LIVE_STORES: "1" }), true);
  assert.equal(
    liveStoresEnabled({ STOREAPI_LIVE_STORES: "1", STOREAPI_FIXTURE_ONLY: "1" }),
    false,
  );
});

test("createStoreAdapters defaults to fixtures even if LIVE is set when FIXTURE_ONLY is on", async () => {
  const adapters = createStoreAdapters({
    STOREAPI_LIVE_STORES: "1",
    STOREAPI_FIXTURE_ONLY: "1",
  });
  const listing = await adapters.ios.getListing(INSTAGRAM_ID, "US");
  assert.equal(listing.name, "Instagram");
  assert.equal(listingHasForbiddenEstimateField(listing), false);
});

test("createLiveHttpGet refuses to fetch unless live stores are enabled", async () => {
  const get = createLiveHttpGet({ STOREAPI_FIXTURE_ONLY: "1" }, async () => {
    throw new Error("network must not run");
  });
  await assert.rejects(
    () => get("https://itunes.apple.com/lookup?id=389801252&country=us"),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
});

test("createLiveHttpGet rejects non-store hosts even when live is on", async () => {
  const get = createLiveHttpGet({ STOREAPI_LIVE_STORES: "1" }, async () => {
    throw new Error("network must not run");
  });
  await assert.rejects(() => get("https://example.com/"), {
    name: "StoreApiError",
    code: "upstream_blocked",
  });
});

test("live iOS adapter maps documented lookup + RSS JSON through the parsers", async () => {
  const httpGet = jsonGet({
    "https://itunes.apple.com/lookup?id=389801252&country=us": {
      body: fixture("ios/lookup-instagram-us.json"),
    },
    "https://itunes.apple.com/us/rss/customerreviews/page=1/id=389801252/sortby=mostrecent/json":
      { body: fixture("ios/reviews-instagram-us-p1.json") },
    "https://itunes.apple.com/us/rss/topfreeapplications/limit=25/page=1/json": {
      body: fixture("ios/charts-us-free-p1.json"),
    },
    "https://itunes.apple.com/search?term=instagram&country=us&entity=software&limit=25&offset=0":
      { body: fixture("ios/search-instagram-us-p1.json") },
  });
  const ios = createLiveIosAdapter(httpGet);
  const listing = await ios.getListing(INSTAGRAM_ID, "US");
  assert.equal(listing.name, "Instagram");
  assert.equal(listing.bundleId, INSTAGRAM_BUNDLE);
  assert.equal(typeof listing.rating.average, "number");
  assert.equal(listingHasForbiddenEstimateField(listing), false);

  const reviews = await ios.getReviews(INSTAGRAM_ID, "US", 1);
  assert.ok(reviews.reviews.length >= 1);
  for (const review of reviews.reviews) {
    assertReviewStars(review.stars);
    assert.equal(typeof review.body, "string");
  }
  assert.equal(listingHasForbiddenEstimateField(reviews), false);

  const charts = await ios.getCharts("US", "free", null, 1);
  assert.ok(charts.results.length >= 1);
  assert.equal(charts.results[0]?.name, "Instagram");

  const search = await ios.search("US", "instagram", 1);
  assert.equal(search.results[0]?.id, INSTAGRAM_ID);
});

test("live iOS GB lookup uses country=gb and stays on documented JSON", async () => {
  const httpGet = jsonGet({
    "https://itunes.apple.com/lookup?id=389801252&country=gb": {
      body: fixture("ios/lookup-instagram-gb.json"),
    },
    "https://itunes.apple.com/gb/rss/customerreviews/page=1/id=389801252/sortby=mostrecent/json":
      { body: fixture("ios/reviews-instagram-gb-p1.json") },
  });
  const ios = createLiveIosAdapter(httpGet);
  const listing = await ios.getListing(INSTAGRAM_ID, "GB");
  assert.deepEqual(listing.countries, ["GB"]);
  assert.equal(listing.price?.currency, "GBP");
  const reviews = await ios.getReviews(INSTAGRAM_ID, "GB", 1);
  assert.equal(reviews.country, "GB");
  assertReviewStars(reviews.reviews[0]?.stars ?? 0);
});

test("live iOS empty lookup is app_not_found; 503 and bad JSON are upstream_blocked", async () => {
  const ios = createLiveIosAdapter(
    jsonGet({
      "https://itunes.apple.com/lookup?id=389801252&country=us": {
        body: fixture("ios/lookup-missing.json"),
      },
    }),
  );
  await assert.rejects(() => ios.getListing(INSTAGRAM_ID, "US"), {
    name: "StoreApiError",
    code: "app_not_found",
  });

  const blocked = createLiveIosAdapter(
    jsonGet({
      "https://itunes.apple.com/lookup?id=389801252&country=us": {
        status: 503,
        body: "blocked",
      },
    }),
  );
  await assert.rejects(() => blocked.getListing(INSTAGRAM_ID, "US"), {
    name: "StoreApiError",
    code: "upstream_blocked",
  });

  const malformed = createLiveIosAdapter(
    jsonGet({
      "https://itunes.apple.com/lookup?id=389801252&country=us": {
        body: "<html>not json</html>",
      },
    }),
  );
  await assert.rejects(() => malformed.getListing(INSTAGRAM_ID, "US"), {
    name: "StoreApiError",
    code: "upstream_blocked",
  });
});

test("live iOS never invents a review when RSS stars are missing", async () => {
  const ios = createLiveIosAdapter(
    jsonGet({
      "https://itunes.apple.com/lookup?id=389801252&country=us": {
        body: fixture("ios/lookup-instagram-us.json"),
      },
      "https://itunes.apple.com/us/rss/customerreviews/page=1/id=389801252/sortby=mostrecent/json":
        {
          body: JSON.stringify({
            feed: {
              entry: [{ title: { label: "bad" }, content: { label: "no stars" } }],
            },
          }),
        },
    }),
  );
  await assert.rejects(() => ios.getReviews(INSTAGRAM_ID, "US", 1), {
    name: "StoreApiError",
    code: "upstream_blocked",
  });
});

test("parsePlayDetailsHtml reads schema.org JSON-LD and never adds estimate fields", () => {
  const payload = parsePlayDetailsHtml(PLAY_YOUTUBE_HTML, YOUTUBE_ID);
  assert.equal(payload.packageName, YOUTUBE_ID);
  assert.equal(payload.name, "YouTube");
  assert.equal(listingHasForbiddenEstimateField(payload), false);
});

test("live Play adapter maps public HTML listing/search/charts; reviews stay blocked", async () => {
  const httpGet = jsonGet({
    "https://play.google.com/store/apps/details?id=com.google.android.youtube&hl=en&gl=us":
      { body: PLAY_YOUTUBE_HTML },
    "https://play.google.com/store/apps/category/APPLICATION/collection/topselling_free?gl=us&hl=en&page=1":
      { body: PLAY_CLUSTER_HTML },
    "https://play.google.com/store/search?q=youtube&c=apps&hl=en&gl=us&page=1": {
      body: PLAY_CLUSTER_HTML,
    },
  });
  const play = createLivePlayAdapter(httpGet);
  const listing = await play.getListing(YOUTUBE_ID, "US");
  assert.equal(listing.name, "YouTube");
  assert.equal(listing.developer, "Google LLC");
  assert.equal(typeof listing.rating.average, "number");
  assert.equal(listingHasForbiddenEstimateField(listing), false);

  await assert.rejects(() => play.getReviews(YOUTUBE_ID, "US", 1), {
    name: "StoreApiError",
    code: "upstream_blocked",
  });
  await assert.rejects(() => play.getReviews(YOUTUBE_ID, "US", 2), {
    name: "StoreApiError",
    code: "upstream_blocked",
  });

  const charts = await play.getCharts("US", "free", null, 1);
  assert.equal(charts.results[0]?.id, YOUTUBE_ID);
  assert.equal(charts.results[0]?.name, "YouTube");

  const search = await play.search("US", "youtube", 1);
  assert.equal(search.results[0]?.id, YOUTUBE_ID);
});

test("live Play GB listing uses gl=gb", async () => {
  const play = createLivePlayAdapter(
    jsonGet({
      "https://play.google.com/store/apps/details?id=com.google.android.youtube&hl=en&gl=gb":
        { body: PLAY_YOUTUBE_GB_HTML },
    }),
  );
  const listing = await play.getListing(YOUTUBE_ID, "GB");
  assert.deepEqual(listing.countries, ["GB"]);
  assert.equal(listing.price?.currency, "GBP");
});

test("live Play 404 is app_not_found; 503 and empty HTML are upstream_blocked", async () => {
  const missing = createLivePlayAdapter(
    jsonGet({
      "https://play.google.com/store/apps/details?id=com.google.android.youtube&hl=en&gl=us":
        { status: 404, body: "gone" },
    }),
  );
  await assert.rejects(() => missing.getListing(YOUTUBE_ID, "US"), {
    name: "StoreApiError",
    code: "app_not_found",
  });

  const blocked = createLivePlayAdapter(
    jsonGet({
      "https://play.google.com/store/apps/details?id=com.google.android.youtube&hl=en&gl=us":
        { status: 503, body: "no" },
    }),
  );
  await assert.rejects(() => blocked.getListing(YOUTUBE_ID, "US"), {
    name: "StoreApiError",
    code: "upstream_blocked",
  });

  const empty = createLivePlayAdapter(
    jsonGet({
      "https://play.google.com/store/apps/details?id=com.google.android.youtube&hl=en&gl=us":
        { body: "   " },
    }),
  );
  await assert.rejects(() => empty.getListing(YOUTUBE_ID, "US"), {
    name: "StoreApiError",
    code: "upstream_blocked",
  });
});

test("parsePlayClusterHtml skips blank names and never invents ranks", () => {
  const hits = parsePlayClusterHtml(
    `["com.google.android.youtube", "YouTube"]["com.bad.app", ""]`,
  );
  assert.deepEqual(hits, [{ packageName: YOUTUBE_ID, name: "YouTube" }]);
});

test("core still uses fixtures by default; JP is country_unsupported before any store call", async () => {
  const listing = await getApp({ store: "ios", id: INSTAGRAM_ID, country: "US" });
  assert.equal(listing.name, "Instagram");
  const play = await getApp({ store: "play", id: YOUTUBE_ID, country: "US" });
  assert.equal(play.name, "YouTube");
  await assert.rejects(
    () => getApp({ store: "ios", id: INSTAGRAM_ID, country: "JP" }),
    { name: "StoreApiError", code: "country_unsupported" },
  );
  await assert.rejects(
    () => listReviews({ store: "play", id: YOUTUBE_ID, country: "JP" }),
    { name: "StoreApiError", code: "country_unsupported" },
  );
  const charts = await listCharts({ store: "ios", kind: "free", country: "US" });
  assert.ok(charts.results.length >= 1);
  const search = await searchApps({ store: "play", q: "youtube", country: "US" });
  assert.ok(search.results.length >= 1);
});

test("injected live adapters through core still reject JP and omit estimate fields", async () => {
  const adapters = {
    ios: createLiveIosAdapter(
      jsonGet({
        "https://itunes.apple.com/lookup?id=389801252&country=us": {
          body: fixture("ios/lookup-instagram-us.json"),
        },
      }),
    ),
    play: createLivePlayAdapter(
      jsonGet({
        "https://play.google.com/store/apps/details?id=com.google.android.youtube&hl=en&gl=us":
          { body: PLAY_YOUTUBE_HTML },
      }),
    ),
  };
  const listing = await getApp({ store: "ios", id: INSTAGRAM_ID }, adapters);
  assert.equal(listing.name, "Instagram");
  assert.equal(listingHasForbiddenEstimateField(listing), false);
  const play = await getApp({ store: "play", id: YOUTUBE_ID }, adapters);
  assert.equal(play.name, "YouTube");
  await assert.rejects(
    () => getApp({ store: "ios", id: INSTAGRAM_ID, country: "JP" }, adapters),
    { name: "StoreApiError", code: "country_unsupported" },
  );
});
