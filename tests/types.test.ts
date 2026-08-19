import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertReviewStars,
  collectForbiddenEstimateFields,
  COUNTRIES,
  FORBIDDEN_ESTIMATE_FIELDS,
  isIosBundleId,
  isIosNumericId,
  isPlayPackageId,
  listingHasForbiddenEstimateField,
  parseCountry,
  parseStore,
  STORES,
  type AppListing,
  type Review,
  type ReviewPage,
} from "../src/types.js";

test("store enum is ios | play only", () => {
  assert.deepEqual([...STORES], ["ios", "play"]);
  assert.equal(parseStore("ios"), "ios");
  assert.equal(parseStore("PLAY"), "play");
  assert.equal(parseStore("amazon"), null);
  assert.equal(parseStore(""), null);
  assert.equal(parseStore(undefined), null);
});

test("country enum is US | GB; default US; JP is unsupported", () => {
  assert.deepEqual([...COUNTRIES], ["US", "GB"]);
  assert.equal(parseCountry(undefined), "US");
  assert.equal(parseCountry(""), "US");
  assert.equal(parseCountry("us"), "US");
  assert.equal(parseCountry("GB"), "GB");
  assert.equal(parseCountry("gb"), "GB");
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
});
