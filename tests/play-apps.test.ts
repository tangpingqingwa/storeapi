import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  createFixturePlayAdapter,
  parsePlayDetails,
  parsePlayReviews,
  playDetailsUrl,
  type PlayDetailsPayload,
} from "../src/adapters/play.js";
import { createKey } from "../src/billing/keys.js";
import { getApp } from "../src/core/apps.js";
import { listReviews } from "../src/core/reviews.js";
import { openDatabase } from "../src/db.js";
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

const TEST_KEY = "st_test_play_us";
const YOUTUBE_ID = "com.google.android.youtube";
const EMPTY_REVIEWS_ID = "com.storeapi.emptyreviews";
const MISSING_ID = "com.storeapi.missing";
const BLOCKED_ID = "com.storeapi.blocked";
const INSTAGRAM_ID = "389801252";

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

function assertListingShape(listing: AppListing): void {
  assert.equal(listing.store, "play");
  assert.ok(listing.id.length > 0);
  assert.ok(listing.name.length > 0);
  assert.ok(listing.url.startsWith("http"));
  assert.ok(Array.isArray(listing.countries));
  assert.ok(listing.countries.includes("US"));
  assert.match(listing.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(listingHasForbiddenEstimateField(listing), false);
  assert.equal("downloadEstimate" in listing, false);
  assert.equal("revenue" in listing, false);
  assert.deepEqual(objectKeys(listing), [...APP_LISTING_KEYS].sort());
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

test("Play URL helper stays on the public Play details host", () => {
  assert.equal(
    playDetailsUrl(YOUTUBE_ID, "US"),
    "https://play.google.com/store/apps/details?id=com.google.android.youtube&hl=en&gl=us",
  );
});

test("SPEC 2: Play US listing from fixture has the same schema as iOS", async () => {
  const listing = await getApp({ store: "play", id: YOUTUBE_ID, country: "US" });
  const ios = await getApp({ store: "ios", id: INSTAGRAM_ID, country: "US" });
  assertListingShape(listing);
  assert.equal(listing.id, YOUTUBE_ID);
  assert.equal(listing.bundleId, YOUTUBE_ID);
  assert.equal(listing.name, "YouTube");
  assert.equal(listing.developer, "Google LLC");
  assert.equal(typeof listing.rating.average, "number");
  assert.ok((listing.rating.average ?? 0) > 0);
  assert.equal(typeof listing.rating.count, "number");
  assert.ok((listing.rating.count ?? 0) > 0);
  assert.deepEqual(listing.price, { amount: 0, currency: "USD" });
  assert.deepEqual(objectKeys(listing), objectKeys(ios));
  assert.deepEqual(objectKeys(listing.rating), objectKeys(ios.rating));
  assert.deepEqual(objectKeys(listing.price ?? {}), objectKeys(ios.price ?? {}));
});

test("SPEC 4: Play US reviews page 1 has integer stars + body", async () => {
  const page = await listReviews({
    store: "play",
    id: YOUTUBE_ID,
    country: "US",
    page: 1,
  });
  const ios = await listReviews({
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
  assert.deepEqual(objectKeys(page), [...REVIEW_PAGE_KEYS].sort());
  assert.deepEqual(objectKeys(page), objectKeys(ios));
  for (const review of page.reviews) {
    assertReviewStars(review.stars);
    assert.equal(typeof review.body, "string");
    assert.ok(review.body.length > 0);
    assert.notEqual(review.id, null);
    assert.deepEqual(objectKeys(review), [...REVIEW_KEYS].sort());
  }
  assert.deepEqual(objectKeys(page.reviews[0] ?? {}), objectKeys(ios.reviews[0] ?? {}));
  assert.equal(page.reviews[0]?.stars, 5);
  assert.match(page.reviews[0]?.body ?? "", /recorded Play public-page fixture/);
});

test("empty reviews Play app is 200 with reviews: [] and never synthesizes ids", async () => {
  const page = await listReviews({ store: "play", id: EMPTY_REVIEWS_ID });
  assert.deepEqual(page.reviews, []);
  assert.equal(page.hasMore, false);
  assert.equal(page.page, 1);
});

test("unknown Play app is app_not_found; blocked fixture is upstream_blocked", async () => {
  await assert.rejects(() => getApp({ store: "play", id: MISSING_ID }), {
    name: "StoreApiError",
    code: "app_not_found",
  });
  await assert.rejects(() => getApp({ store: "play", id: "com.storeapi.not.in.fixtures" }), {
    name: "StoreApiError",
    code: "app_not_found",
  });
  await assert.rejects(() => getApp({ store: "play", id: BLOCKED_ID }), {
    name: "StoreApiError",
    code: "upstream_blocked",
  });
  await assert.rejects(
    () => listReviews({ store: "play", id: BLOCKED_ID }),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
});

test("SPEC 5: Play country=JP is country_unsupported", async () => {
  await assert.rejects(
    () => getApp({ store: "play", id: YOUTUBE_ID, country: "JP" }),
    { name: "StoreApiError", code: "country_unsupported" },
  );
});

test("Play id that is not a package name is invalid_request", async () => {
  await assert.rejects(() => getApp({ store: "play", id: "youtube" }), {
    name: "StoreApiError",
    code: "invalid_request",
  });
});

test("SPEC 7: fixture adapter never invents a review when score is missing", () => {
  assert.throws(
    () =>
      parsePlayReviews(
        {
          reviews: [
            {
              reviewId: "bad",
              userName: "x",
              title: "bad",
              text: "no stars",
            },
          ],
        },
        "US",
        1,
      ),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
});

test("parsePlayDetails missing required fields is upstream_blocked, not a synthetic listing", () => {
  const empty: PlayDetailsPayload = {};
  assert.throws(
    () => parsePlayDetails(empty, YOUTUBE_ID, "US", "2026-01-01T00:00:00.000Z"),
    { name: "StoreApiError", code: "upstream_blocked" },
  );
});

test("GET /v1/apps/play/{id} fixture → 200 listing, 1 credit, name + rating", async () => {
  const { app, response } = await injectApp(`/v1/apps/play/${YOUTUBE_ID}`);
  assert.equal(response.statusCode, 200);
  const body = response.json() as Envelope<AppListing>;
  assert.equal(body.data.name, "YouTube");
  assert.ok(body.data.rating.average !== null);
  assert.ok(body.data.rating.count !== null);
  assert.equal(body.meta.creditsCharged, 1);
  assert.equal(body.meta.cached, false);
  assert.match(body.meta.requestId, /^req_/);
  assert.equal(listingHasForbiddenEstimateField(body.data), false);
  assert.deepEqual(objectKeys(body.data), [...APP_LISTING_KEYS].sort());
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

test("GET /v1/apps/play/{id}/reviews page 1 → stars + body, 1 credit", async () => {
  const { response } = await injectApp(
    `/v1/apps/play/${YOUTUBE_ID}/reviews?country=US&page=1`,
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

test("GET Play listing without bearer is 401 with 0 credits", async () => {
  const { response } = await injectApp(`/v1/apps/play/${YOUTUBE_ID}`, {});
  assert.equal(response.statusCode, 401);
  const body = response.json() as ErrBody;
  assert.equal(body.error.code, "unauthorized");
  assert.equal(body.meta.creditsCharged, 0);
});

test("GET Play country=JP is 422 country_unsupported and 0 credits", async () => {
  const { response } = await injectApp(`/v1/apps/play/${YOUTUBE_ID}?country=JP`);
  assert.equal(response.statusCode, 422);
  const body = response.json() as ErrBody;
  assert.equal(body.error.code, "country_unsupported");
  assert.equal(body.meta.creditsCharged, 0);
});

test("GET Play country=GB is 200 with the UK listing (not 501)", async () => {
  const { response } = await injectApp(`/v1/apps/play/${YOUTUBE_ID}?country=GB`);
  assert.equal(response.statusCode, 200);
  const body = response.json() as Envelope<AppListing>;
  assert.equal(body.data.name, "YouTube");
  assert.deepEqual(body.data.countries, ["GB"]);
  assert.equal(body.meta.creditsCharged, 1);
});

test("GET missing Play app is 404; blocked fixture is 503; both charge 0", async () => {
  const app = await buildApp({ bootstrapKey: TEST_KEY });
  after(() => app.close());

  const missing = await app.inject({
    method: "GET",
    url: `/v1/apps/play/${MISSING_ID}`,
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  assert.equal(missing.statusCode, 404);
  assert.equal((missing.json() as ErrBody).error.code, "app_not_found");
  assert.equal((missing.json() as ErrBody).meta.creditsCharged, 0);

  const blocked = await app.inject({
    method: "GET",
    url: `/v1/apps/play/${BLOCKED_ID}/reviews`,
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  assert.equal(blocked.statusCode, 503);
  assert.equal((blocked.json() as ErrBody).error.code, "upstream_blocked");
  assert.equal((blocked.json() as ErrBody).meta.creditsCharged, 0);
  assert.equal((blocked.json() as ErrBody).error.retryable, true);
});

test("zero-credit key is 402 and does not invent a Play listing", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  createKey(db, { secret: "st_test_broke_play", credits: 0 });
  const app = await buildApp({ db });
  after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/v1/apps/play/${YOUTUBE_ID}`,
    headers: { authorization: "Bearer st_test_broke_play" },
  });
  assert.equal(response.statusCode, 402);
  assert.equal((response.json() as ErrBody).error.code, "payment_required");
  assert.equal((response.json() as ErrBody).meta.creditsCharged, 0);
});

test("GET empty-reviews Play app returns [] and still charges 1 on success", async () => {
  const { response } = await injectApp(`/v1/apps/play/${EMPTY_REVIEWS_ID}/reviews`);
  assert.equal(response.statusCode, 200);
  const body = response.json() as Envelope<ReviewPage>;
  assert.deepEqual(body.data.reviews, []);
  assert.equal(body.meta.creditsCharged, 1);
});

test("createFixturePlayAdapter is the only Play transport used by core", () => {
  const adapter = createFixturePlayAdapter();
  assert.equal(typeof adapter.getListing, "function");
  assert.equal(typeof adapter.getReviews, "function");
  assert.equal(typeof adapter.getCharts, "function");
  assert.equal(typeof adapter.search, "function");
});
