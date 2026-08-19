import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  itunesLookupUrl,
  itunesReviewsRssUrl,
} from "../src/adapters/ios.js";
import { playDetailsUrl } from "../src/adapters/play.js";
import { getApp } from "../src/core/apps.js";
import { listReviews } from "../src/core/reviews.js";
import { buildApp } from "../src/app.js";
import {
  APP_LISTING_KEYS,
  REVIEW_KEYS,
  REVIEW_PAGE_KEYS,
  assertReviewStars,
  listingHasForbiddenEstimateField,
  type AppListing,
  type ErrorCode,
  type ReviewPage,
} from "../src/types.js";

const TEST_KEY = "st_test_uk_country";
const INSTAGRAM_ID = "389801252";
const INSTAGRAM_BUNDLE = "com.burbn.instagram";
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

function assertGbListing(listing: AppListing, store: "ios" | "play"): void {
  assert.equal(listing.store, store);
  assert.ok(listing.name.length > 0);
  assert.deepEqual(listing.countries, ["GB"]);
  assert.equal(listing.price?.currency, "GBP");
  assert.equal(typeof listing.rating.average, "number");
  assert.ok((listing.rating.average ?? 0) > 0);
  assert.equal(typeof listing.rating.count, "number");
  assert.ok((listing.rating.count ?? 0) > 0);
  assert.equal(listingHasForbiddenEstimateField(listing), false);
  assert.deepEqual(objectKeys(listing), [...APP_LISTING_KEYS].sort());
}

test("iTunes and Play URL helpers encode GB as the storefront", () => {
  assert.equal(
    itunesLookupUrl(INSTAGRAM_ID, "GB"),
    "https://itunes.apple.com/lookup?id=389801252&country=gb",
  );
  assert.equal(
    itunesReviewsRssUrl(INSTAGRAM_ID, "GB", 1),
    "https://itunes.apple.com/gb/rss/customerreviews/page=1/id=389801252/sortby=mostrecent/json",
  );
  assert.equal(
    playDetailsUrl(YOUTUBE_ID, "GB"),
    "https://play.google.com/store/apps/details?id=com.google.android.youtube&hl=en&gl=gb",
  );
});

test("iOS GB listing from fixture has name + rating and countries: [GB]", async () => {
  const listing = await getApp({ store: "ios", id: INSTAGRAM_ID, country: "GB" });
  const us = await getApp({ store: "ios", id: INSTAGRAM_ID, country: "US" });
  assertGbListing(listing, "ios");
  assert.equal(listing.id, INSTAGRAM_ID);
  assert.equal(listing.bundleId, INSTAGRAM_BUNDLE);
  assert.equal(listing.name, "Instagram");
  assert.match(listing.url, /\/gb\//);
  assert.deepEqual(listing.price, { amount: 0, currency: "GBP" });
  assert.deepEqual(objectKeys(listing), objectKeys(us));
  assert.notDeepEqual(listing.countries, us.countries);
});

test("iOS GB listing accepts lowercase country and bundleId", async () => {
  const listing = await getApp({
    store: "ios",
    id: INSTAGRAM_BUNDLE,
    country: "gb",
  });
  assert.equal(listing.id, INSTAGRAM_ID);
  assert.deepEqual(listing.countries, ["GB"]);
  assert.equal(listing.name, "Instagram");
});

test("iOS GB reviews page 1 has integer stars + body and country GB", async () => {
  const page = await listReviews({
    store: "ios",
    id: INSTAGRAM_ID,
    country: "GB",
    page: 1,
  });
  const us = await listReviews({
    store: "ios",
    id: INSTAGRAM_ID,
    country: "US",
    page: 1,
  });
  assert.equal(page.page, 1);
  assert.equal(page.country, "GB");
  assert.equal(page.hasMore, false);
  assert.ok(page.reviews.length >= 1);
  assert.equal(listingHasForbiddenEstimateField(page), false);
  assert.deepEqual(objectKeys(page), [...REVIEW_PAGE_KEYS].sort());
  assert.deepEqual(objectKeys(page), objectKeys(us));
  for (const review of page.reviews) {
    assertReviewStars(review.stars);
    assert.equal(typeof review.body, "string");
    assert.ok(review.body.length > 0);
    assert.notEqual(review.id, null);
    assert.deepEqual(objectKeys(review), [...REVIEW_KEYS].sort());
  }
  assert.equal(page.reviews[0]?.stars, 5);
  assert.match(page.reviews[0]?.body ?? "", /recorded GB RSS fixture/);
  assert.notEqual(page.reviews[0]?.id, us.reviews[0]?.id);
});

test("Play GB listing from fixture shares the unified schema", async () => {
  const listing = await getApp({ store: "play", id: YOUTUBE_ID, country: "GB" });
  const ios = await getApp({ store: "ios", id: INSTAGRAM_ID, country: "GB" });
  assertGbListing(listing, "play");
  assert.equal(listing.id, YOUTUBE_ID);
  assert.equal(listing.bundleId, YOUTUBE_ID);
  assert.equal(listing.name, "YouTube");
  assert.equal(listing.developer, "Google LLC");
  assert.match(listing.url, /[?&]gl=gb/);
  assert.deepEqual(listing.price, { amount: 0, currency: "GBP" });
  assert.deepEqual(objectKeys(listing), objectKeys(ios));
  assert.deepEqual(objectKeys(listing.rating), objectKeys(ios.rating));
  assert.deepEqual(objectKeys(listing.price ?? {}), objectKeys(ios.price ?? {}));
});

test("Play GB reviews page 1 has integer stars + body and country GB", async () => {
  const page = await listReviews({
    store: "play",
    id: YOUTUBE_ID,
    country: "GB",
    page: 1,
  });
  const ios = await listReviews({
    store: "ios",
    id: INSTAGRAM_ID,
    country: "GB",
    page: 1,
  });
  assert.equal(page.page, 1);
  assert.equal(page.country, "GB");
  assert.equal(page.hasMore, false);
  assert.ok(page.reviews.length >= 1);
  assert.equal(listingHasForbiddenEstimateField(page), false);
  assert.deepEqual(objectKeys(page), objectKeys(ios));
  for (const review of page.reviews) {
    assertReviewStars(review.stars);
    assert.equal(typeof review.body, "string");
    assert.ok(review.body.length > 0);
    assert.notEqual(review.id, null);
    assert.deepEqual(objectKeys(review), [...REVIEW_KEYS].sort());
  }
  assert.equal(page.reviews[0]?.stars, 5);
  assert.match(page.reviews[0]?.body ?? "", /recorded Play GB public-page fixture/);
});

test("omitted country still defaults to US after UK lands", async () => {
  const listing = await getApp({ store: "ios", id: INSTAGRAM_ID });
  const reviews = await listReviews({ store: "play", id: YOUTUBE_ID });
  assert.deepEqual(listing.countries, ["US"]);
  assert.equal(reviews.country, "US");
});

test("GET iOS country=GB listing is 200, 1 credit, countries [GB]", async () => {
  const { app, response } = await injectApp(
    `/v1/apps/ios/${INSTAGRAM_ID}?country=GB`,
  );
  assert.equal(response.statusCode, 200);
  const body = response.json() as Envelope<AppListing>;
  assert.equal(body.data.name, "Instagram");
  assert.deepEqual(body.data.countries, ["GB"]);
  assert.deepEqual(body.data.price, { amount: 0, currency: "GBP" });
  assert.ok(body.data.rating.average !== null);
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

test("GET iOS country=GB reviews page 1 is 200 with stars + body", async () => {
  const { response } = await injectApp(
    `/v1/apps/ios/${INSTAGRAM_ID}/reviews?country=GB&page=1`,
  );
  assert.equal(response.statusCode, 200);
  const body = response.json() as Envelope<ReviewPage>;
  assert.equal(body.data.country, "GB");
  assert.equal(body.data.page, 1);
  assert.ok(body.data.reviews.length >= 1);
  for (const review of body.data.reviews) {
    assertReviewStars(review.stars);
    assert.ok(review.body.length > 0);
  }
  assert.equal(body.meta.creditsCharged, 1);
});

test("GET Play country=gb listing and reviews are 200", async () => {
  const { response: listing } = await injectApp(
    `/v1/apps/play/${YOUTUBE_ID}?country=gb`,
  );
  assert.equal(listing.statusCode, 200);
  const listingBody = listing.json() as Envelope<AppListing>;
  assert.equal(listingBody.data.name, "YouTube");
  assert.deepEqual(listingBody.data.countries, ["GB"]);
  assert.equal(listingBody.meta.creditsCharged, 1);

  const { response: reviews } = await injectApp(
    `/v1/apps/play/${YOUTUBE_ID}/reviews?country=gb&page=1`,
  );
  assert.equal(reviews.statusCode, 200);
  const reviewsBody = reviews.json() as Envelope<ReviewPage>;
  assert.equal(reviewsBody.data.country, "GB");
  assert.ok(reviewsBody.data.reviews.length >= 1);
  assertReviewStars(reviewsBody.data.reviews[0]?.stars ?? 0);
  assert.equal(reviewsBody.meta.creditsCharged, 1);
});

test("GET country=JP stays 422 country_unsupported with 0 credits", async () => {
  const { response: ios } = await injectApp(
    `/v1/apps/ios/${INSTAGRAM_ID}?country=JP`,
  );
  const { response: play } = await injectApp(
    `/v1/apps/play/${YOUTUBE_ID}/reviews?country=JP`,
  );
  for (const response of [ios, play]) {
    assert.equal(response.statusCode, 422);
    const body = response.json() as ErrBody;
    assert.equal(body.error.code, "country_unsupported");
    assert.equal(body.meta.creditsCharged, 0);
  }
});
