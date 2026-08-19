import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APP_LISTING_KEYS,
  assertReviewStars,
  CHART_ENTRY_KEYS,
  CHART_KINDS,
  CHART_PAGE_KEYS,
  chartPageUsesUnifiedSchema,
  collectForbiddenEstimateFields,
  COUNTRIES,
  FORBIDDEN_ESTIMATE_FIELDS,
  isIosBundleId,
  isIosNumericId,
  isPlayPackageId,
  listingHasForbiddenEstimateField,
  listingUsesUnifiedSchema,
  parseChartKind,
  parseCountry,
  parseStore,
  REVIEW_KEYS,
  REVIEW_PAGE_KEYS,
  reviewPageUsesUnifiedSchema,
  SEARCH_HIT_KEYS,
  SEARCH_PAGE_KEYS,
  searchPageUsesUnifiedSchema,
  STORES,
  type AppListing,
  type ChartPage,
  type Review,
  type ReviewPage,
  type SearchPage,
} from "../src/types.js";

test("store enum is ios | play only", () => {
  assert.deepEqual([...STORES], ["ios", "play"]);
  assert.equal(parseStore("ios"), "ios");
  assert.equal(parseStore("PLAY"), "play");
  assert.equal(parseStore("amazon"), null);
  assert.equal(parseStore(""), null);
  assert.equal(parseStore(undefined), null);
});

test("chart kind is free | paid | grossing", () => {
  assert.deepEqual([...CHART_KINDS], ["free", "paid", "grossing"]);
  assert.equal(parseChartKind("free"), "free");
  assert.equal(parseChartKind("PAID"), "paid");
  assert.equal(parseChartKind("grossing"), "grossing");
  assert.equal(parseChartKind("trending"), null);
  assert.equal(parseChartKind(""), null);
  assert.equal(parseChartKind(undefined), null);
});

test("country enum is US | GB; default US; JP is unsupported", () => {
  assert.deepEqual([...COUNTRIES], ["US", "GB"]);
  assert.equal(parseCountry(undefined), "US");
  assert.equal(parseCountry(""), "US");
  assert.equal(parseCountry("us"), "US");
  assert.equal(parseCountry("GB"), "GB");
  assert.equal(parseCountry("gb"), "GB");
  assert.equal(parseCountry("uk"), null);
  assert.equal(parseCountry("UK"), null);
  assert.equal(parseCountry("JP"), null);
  assert.equal(parseCountry("jp"), null);
});

test("iOS ids are numeric or bundle-shaped; Play ids are package names", () => {
  assert.equal(isIosNumericId("389801252"), true);
  assert.equal(isIosNumericId("com.apple.maps"), false);
  assert.equal(isIosBundleId("com.apple.maps"), true);
  assert.equal(isPlayPackageId("com.google.android.youtube"), true);
  assert.equal(isPlayPackageId("youtube"), false);
  assert.equal(isPlayPackageId("389801252"), false);
});

test("review stars must be an integer 1-5", () => {
  for (const stars of [1, 2, 3, 4, 5]) {
    assert.doesNotThrow(() => assertReviewStars(stars));
  }
  for (const stars of [0, 6, 1.5, Number.NaN, -1]) {
    assert.throws(() => assertReviewStars(stars), /stars must be an integer 1-5/);
  }
});

test("listing and review types have no download-estimate fields", () => {
  const listing: AppListing = {
    store: "ios",
    id: "389801252",
    bundleId: "com.burbn.instagram",
    name: "Instagram",
    developer: "Instagram, Inc.",
    url: "https://apps.apple.com/us/app/instagram/id389801252",
    iconUrl: null,
    category: "Photo & Video",
    rating: { average: 4.7, count: 100 },
    price: { amount: 0, currency: "USD" },
    description: "fixture listing",
    version: "1.0",
    updatedAt: "2026-01-01T00:00:00.000Z",
    countries: ["US"],
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
  const reviews: ReviewPage = {
    page: 1,
    country: "US",
    hasMore: false,
    reviews: [
      {
        id: "rev_1",
        stars: 5,
        title: "ok",
        body: "works",
        author: "a",
        version: "1.0",
        createdAt: "2026-01-01T00:00:00.000Z",
      } satisfies Review,
    ],
  };

  assert.equal(listingHasForbiddenEstimateField(listing), false);
  assert.equal(listingHasForbiddenEstimateField(reviews), false);
  assert.ok(FORBIDDEN_ESTIMATE_FIELDS.includes("downloadEstimate"));
  assert.ok(FORBIDDEN_ESTIMATE_FIELDS.includes("revenue"));
  assert.deepEqual(
    collectForbiddenEstimateFields({ name: "x", downloadEstimate: 9 }),
    ["downloadEstimate"],
  );
  const charts: ChartPage = {
    store: "ios",
    country: "US",
    kind: "free",
    category: null,
    page: 1,
    hasMore: false,
    results: [{ rank: 1, id: "389801252", name: "Instagram" }],
  };
  const search: SearchPage = {
    store: "ios",
    country: "US",
    q: "instagram",
    page: 1,
    hasMore: false,
    results: [{ id: "389801252", name: "Instagram" }],
  };

  assert.equal(listingUsesUnifiedSchema(listing), true);
  assert.equal(reviewPageUsesUnifiedSchema(reviews), true);
  assert.equal(chartPageUsesUnifiedSchema(charts), true);
  assert.equal(searchPageUsesUnifiedSchema(search), true);
  assert.equal(listingHasForbiddenEstimateField(charts), false);
  assert.equal(listingHasForbiddenEstimateField(search), false);
});

test("iOS and Play listings share one key set; reviews share one key set", () => {
  const listing: AppListing = {
    store: "play",
    id: "com.google.android.youtube",
    bundleId: "com.google.android.youtube",
    name: "YouTube",
    developer: "Google LLC",
    url: "https://play.google.com/store/apps/details?id=com.google.android.youtube",
    iconUrl: null,
    category: "Video Players & Editors",
    rating: { average: 4.4, count: 100 },
    price: { amount: 0, currency: "USD" },
    description: "fixture listing",
    version: "1.0",
    updatedAt: "2026-01-01T00:00:00.000Z",
    countries: ["US"],
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
  const reviews: ReviewPage = {
    page: 1,
    country: "US",
    hasMore: false,
    reviews: [
      {
        id: "rev_play_1",
        stars: 5,
        title: "ok",
        body: "works",
        author: "a",
        version: "1.0",
        createdAt: "2026-01-01T00:00:00.000Z",
      } satisfies Review,
    ],
  };
  assert.deepEqual([...APP_LISTING_KEYS], [
    "store",
    "id",
    "bundleId",
    "name",
    "developer",
    "url",
    "iconUrl",
    "category",
    "rating",
    "price",
    "description",
    "version",
    "updatedAt",
    "countries",
    "fetchedAt",
  ]);
  assert.deepEqual([...REVIEW_KEYS], [
    "id",
    "stars",
    "title",
    "body",
    "author",
    "version",
    "createdAt",
  ]);
  assert.deepEqual([...REVIEW_PAGE_KEYS], ["page", "country", "hasMore", "reviews"]);
  assert.deepEqual([...CHART_ENTRY_KEYS], ["rank", "id", "name"]);
  assert.deepEqual([...CHART_PAGE_KEYS], [
    "store",
    "country",
    "kind",
    "category",
    "page",
    "hasMore",
    "results",
  ]);
  assert.deepEqual([...SEARCH_HIT_KEYS], ["id", "name"]);
  assert.deepEqual([...SEARCH_PAGE_KEYS], [
    "store",
    "country",
    "q",
    "page",
    "hasMore",
    "results",
  ]);
  assert.equal(APP_LISTING_KEYS.includes("downloadEstimate" as never), false);
  assert.equal(REVIEW_KEYS.includes("downloadEstimate" as never), false);
  assert.equal(CHART_ENTRY_KEYS.includes("downloadEstimate" as never), false);
  assert.equal(SEARCH_HIT_KEYS.includes("downloadEstimate" as never), false);
  assert.equal(listingUsesUnifiedSchema(listing), true);
  assert.equal(reviewPageUsesUnifiedSchema(reviews), true);
  assert.equal(
    listingUsesUnifiedSchema({ ...listing, extra: true } as AppListing),
    false,
  );
});
