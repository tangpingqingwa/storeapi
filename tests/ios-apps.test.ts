import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  createFixtureIosAdapter,
  itunesLookupUrl,
  itunesReviewsRssUrl,
  parseIosLookup,
  parseIosReviews,
  type IosLookupResult,
} from "../src/adapters/ios.js";
import { createKey, DEFAULT_FREE_CREDITS } from "../src/billing/keys.js";
import { getApp } from "../src/core/apps.js";
import { listReviews } from "../src/core/reviews.js";
import { openDatabase } from "../src/db.js";
import { buildApp } from "../src/app.js";
import {
  assertReviewStars,
  listingHasForbiddenEstimateField,
  type AppListing,
  type ErrorCode,
  type ReviewPage,
} from "../src/types.js";

const TEST_KEY = "st_test_ios_us";
const INSTAGRAM_ID = "389801252";
const INSTAGRAM_BUNDLE = "com.burbn.instagram";
const EMPTY_REVIEWS_ID = "999000001";
const MISSING_ID = "999000404";
const BLOCKED_ID = "999000503";

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

function assertListingShape(listing: AppListing): void {
  assert.equal(listing.store, "ios");
  assert.ok(listing.id.length > 0);
  assert.ok(listing.name.length > 0);
  assert.ok(listing.url.startsWith("http"));
  assert.ok(Array.isArray(listing.countries));
  assert.ok(listing.countries.includes("US"));
  assert.match(listing.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(listingHasForbiddenEstimateField(listing), false);
  assert.equal("downloadEstimate" in listing, false);
  assert.equal("revenue" in listing, false);
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

test("iTunes URL helpers stay on documented lookup/RSS hosts", () => {
  assert.equal(
    itunesLookupUrl(INSTAGRAM_ID, "US"),
    "https://itunes.apple.com/lookup?id=389801252&country=us",
  );
  assert.equal(
    itunesLookupUrl(INSTAGRAM_BUNDLE, "US"),
    "https://itunes.apple.com/lookup?bundleId=com.burbn.instagram&country=us",
  );
  assert.equal(
    itunesReviewsRssUrl(INSTAGRAM_ID, "US", 1),
    "https://itunes.apple.com/us/rss/customerreviews/page=1/id=389801252/sortby=mostrecent/json",
  );
});

test("SPEC 1: iOS US listing from fixture has name + rating", async () => {
  const listing = await getApp({ store: "ios", id: INSTAGRAM_ID, country: "US" });
  assertListingShape(listing);
  assert.equal(listing.id, INSTAGRAM_ID);
  assert.equal(listing.bundleId, INSTAGRAM_BUNDLE);
  assert.equal(listing.name, "Instagram");
  assert.equal(listing.developer, "Instagram, Inc.");
  assert.equal(typeof listing.rating.average, "number");
  assert.ok((listing.rating.average ?? 0) > 0);
  assert.equal(typeof listing.rating.count, "number");
  assert.ok((listing.rating.count ?? 0) > 0);
  assert.deepEqual(listing.price, { amount: 0, currency: "USD" });
});

test("iOS listing accepts bundleId when the lookup fixture has it", async () => {
  const listing = await getApp({ store: "ios", id: INSTAGRAM_BUNDLE });
  assert.equal(listing.id, INSTAGRAM_ID);
  assert.equal(listing.bundleId, INSTAGRAM_BUNDLE);
  assert.equal(listing.name, "Instagram");
});

test("SPEC 3: iOS US reviews page 1 has integer stars + body", async () => {
  const page = await listReviews({
    store: "ios",
    id: INSTAGRAM_ID,
    country: "US",
    page: 1,
  });
  assert.equal(page.page, 1);
  assert.equal(page.country, "US");
  assert.equal(page.hasMore, false);
  assert.ok(page.reviews.length >= 1);
  assert.equal(listingHasForbiddenEstimateField(page), false);
  for (const review of page.reviews) {
    assertReviewStars(review.stars);
    assert.equal(typeof review.body, "string");
    assert.ok(review.body.length > 0);
    assert.notEqual(review.id, null);
  }
  assert.equal(page.reviews[0]?.stars, 5);
  assert.match(page.reviews[0]?.body ?? "", /recorded RSS fixture/);
});

test("reviews by bundleId resolve through lookup then RSS", async () => {
  const page = await listReviews({ store: "ios", id: INSTAGRAM_BUNDLE });
  assert.equal(page.reviews.length, 5);
  assert.equal(page.reviews[1]?.stars, 4);
});

test("empty reviews app is 200 with reviews: [] and never synthesizes ids", async () => {
  const page = await listReviews({ store: "ios", id: EMPTY_REVIEWS_ID });
  assert.deepEqual(page.reviews, []);
  assert.equal(page.hasMore, false);
  assert.equal(page.page, 1);
});

test("unknown iOS app is app_not_found; blocked fixture is upstream_blocked", async () => {
  await assert.rejects(() => getApp({ store: "ios", id: MISSING_ID }), {
    name: "StoreApiError",
    code: "app_not_found",
  });
  await assert.rejects(() => getApp({ store: "ios", id: "424242424" }), {
    name: "StoreApiError",
    code: "app_not_found",
  });
  await assert.rejects(() => getApp({ store: "ios", id: BLOCKED_ID }), {
    name: "StoreApiError",
    code: "upstream_blocked",
  });
  await assert.rejects(
    () => listReviews({ store: "ios", id: BLOCKED_ID }),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
});

test("Play and UK are 501 this PR; JP is country_unsupported; amazon is store_unsupported", async () => {
  await assert.rejects(() => getApp({ store: "play", id: "com.google.android.youtube" }), {
    name: "StoreApiError",
    code: "not_implemented",
  });
  await assert.rejects(
    () => getApp({ store: "ios", id: INSTAGRAM_ID, country: "GB" }),
    { name: "StoreApiError", code: "not_implemented" },
  );
  await assert.rejects(
    () => getApp({ store: "ios", id: INSTAGRAM_ID, country: "JP" }),
    { name: "StoreApiError", code: "country_unsupported" },
  );
  await assert.rejects(() => getApp({ store: "amazon", id: INSTAGRAM_ID }), {
    name: "StoreApiError",
    code: "store_unsupported",
  });
});

test("fixture adapter never invents a review when stars are missing", () => {
  assert.throws(
    () =>
      parseIosReviews(
        {
          feed: {
            entry: [
              {
                title: { label: "bad" },
                content: { label: "no stars" },
              },
            ],
          },
        },
        "US",
        1,
      ),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
});

test("parseIosLookup empty resultCount is app_not_found, not a synthetic listing", () => {
  const empty: IosLookupResult = { resultCount: 0, results: [] };
  assert.throws(
    () => parseIosLookup(empty, INSTAGRAM_ID, "US", "2026-01-01T00:00:00.000Z"),
    { name: "StoreApiError", code: "app_not_found" },
  );
});

test("GET /v1/apps/ios/{id} fixture → 200 listing, 1 credit, name + rating", async () => {
  const { response } = await injectApp(`/v1/apps/ios/${INSTAGRAM_ID}`);
  assert.equal(response.statusCode, 200);
  const body = response.json() as Envelope<AppListing>;
  assert.equal(body.data.name, "Instagram");
  assert.ok(body.data.rating.average !== null);
  assert.ok(body.data.rating.count !== null);
  assert.equal(body.meta.creditsCharged, 1);
  assert.equal(body.meta.cached, false);
  assert.match(body.meta.requestId, /^req_/);
  assert.equal(listingHasForbiddenEstimateField(body.data), false);
});

test("GET /v1/apps/ios/{id}/reviews page 1 → stars + body, 1 credit", async () => {
  const { response } = await injectApp(
    `/v1/apps/ios/${INSTAGRAM_ID}/reviews?country=US&page=1`,
  );
  assert.equal(response.statusCode, 200);
  const body = response.json() as Envelope<ReviewPage>;
  assert.equal(body.data.country, "US");
  assert.equal(body.data.page, 1);
  assert.ok(body.data.reviews.length >= 1);
  for (const review of body.data.reviews) {
    assertReviewStars(review.stars);
    assert.ok(review.body.length > 0);
  }
  assert.equal(body.meta.creditsCharged, 1);
});

test("GET listing without bearer is 401 with 0 credits", async () => {
  const { response } = await injectApp(`/v1/apps/ios/${INSTAGRAM_ID}`, {});
  assert.equal(response.statusCode, 401);
  const body = response.json() as ErrBody;
  assert.equal(body.error.code, "unauthorized");
  assert.equal(body.meta.creditsCharged, 0);
});

test("GET Play US listing is 501 not_implemented and 0 credits", async () => {
  const { app, response } = await injectApp("/v1/apps/play/com.google.android.youtube");
  assert.equal(response.statusCode, 501);
  const body = response.json() as ErrBody;
  assert.equal(body.error.code, "not_implemented");
  assert.equal(body.meta.creditsCharged, 0);
  const me = await app.inject({
    method: "GET",
    url: "/v1/me",
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  assert.equal(
    (me.json() as { data: { creditsRemaining: number } }).data.creditsRemaining,
    DEFAULT_FREE_CREDITS,
  );
});

test("GET country=JP is 422 country_unsupported and 0 credits", async () => {
  const { response } = await injectApp(`/v1/apps/ios/${INSTAGRAM_ID}?country=JP`);
  assert.equal(response.statusCode, 422);
  const body = response.json() as ErrBody;
  assert.equal(body.error.code, "country_unsupported");
  assert.equal(body.meta.creditsCharged, 0);
});

test("GET country=GB is 501 this PR (UK is PR 4)", async () => {
  const { response } = await injectApp(`/v1/apps/ios/${INSTAGRAM_ID}?country=GB`);
  assert.equal(response.statusCode, 501);
  assert.equal((response.json() as ErrBody).error.code, "not_implemented");
  assert.equal((response.json() as ErrBody).meta.creditsCharged, 0);
});

test("GET unknown store is 422 store_unsupported", async () => {
  const { response } = await injectApp(`/v1/apps/amazon/${INSTAGRAM_ID}`);
  assert.equal(response.statusCode, 422);
  assert.equal((response.json() as ErrBody).error.code, "store_unsupported");
});

test("GET missing iOS app is 404; blocked fixture is 503; both charge 0", async () => {
  const app = await buildApp({ bootstrapKey: TEST_KEY });
  after(() => app.close());

  const missing = await app.inject({
    method: "GET",
    url: `/v1/apps/ios/${MISSING_ID}`,
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  assert.equal(missing.statusCode, 404);
  assert.equal((missing.json() as ErrBody).error.code, "app_not_found");
  assert.equal((missing.json() as ErrBody).meta.creditsCharged, 0);

  const blocked = await app.inject({
    method: "GET",
    url: `/v1/apps/ios/${BLOCKED_ID}/reviews`,
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  assert.equal(blocked.statusCode, 503);
  assert.equal((blocked.json() as ErrBody).error.code, "upstream_blocked");
  assert.equal((blocked.json() as ErrBody).meta.creditsCharged, 0);
  assert.equal((blocked.json() as ErrBody).error.retryable, true);
});

test("zero-credit key is 402 and does not invent a listing", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  createKey(db, { secret: "st_test_broke", credits: 0 });
  const app = await buildApp({ db });
  after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/v1/apps/ios/${INSTAGRAM_ID}`,
    headers: { authorization: "Bearer st_test_broke" },
  });
  assert.equal(response.statusCode, 402);
  assert.equal((response.json() as ErrBody).error.code, "payment_required");
  assert.equal((response.json() as ErrBody).meta.creditsCharged, 0);
});

test("GET empty-reviews app returns [] and still charges 1 on success", async () => {
  const { response } = await injectApp(`/v1/apps/ios/${EMPTY_REVIEWS_ID}/reviews`);
  assert.equal(response.statusCode, 200);
  const body = response.json() as Envelope<ReviewPage>;
  assert.deepEqual(body.data.reviews, []);
  assert.equal(body.meta.creditsCharged, 1);
});

test("createFixtureIosAdapter is the only iOS transport used by core", () => {
  const adapter = createFixtureIosAdapter();
  assert.equal(typeof adapter.getListing, "function");
  assert.equal(typeof adapter.getReviews, "function");
});
