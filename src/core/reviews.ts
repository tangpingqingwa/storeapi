import { createFixtureIosAdapter } from "../adapters/ios.js";
import { createFixturePlayAdapter } from "../adapters/play.js";
import {
  assertReviewStars,
  isIosNumericId,
  listingHasForbiddenEstimateField,
  reviewPageUsesUnifiedSchema,
  type ReviewPage,
  type StoreAdapters,
} from "../types.js";
import { StoreApiError } from "./errors.js";
import { parsePage, resolveStoreRequest } from "./params.js";

const defaultAdapters: StoreAdapters = {
  ios: createFixtureIosAdapter(),
  play: createFixturePlayAdapter(),
};

export function assertReviewPageSafe(page: ReviewPage): ReviewPage {
  if (listingHasForbiddenEstimateField(page)) {
    throw new StoreApiError("internal", "Reviews must not include download estimates.");
  }
  if (!reviewPageUsesUnifiedSchema(page)) {
    throw new StoreApiError("internal", "Reviews do not match the unified schema.");
  }
  for (const review of page.reviews) {
    try {
      assertReviewStars(review.stars);
    } catch {
      throw new StoreApiError(
        "upstream_blocked",
        "Review is missing a valid star rating.",
      );
    }
    if (typeof review.body !== "string") {
      throw new StoreApiError("upstream_blocked", "Review is missing a body.");
    }
  }
  return page;
}

export async function listReviews(
  input: {
    store?: string;
    id?: string;
    country?: string;
    page?: string | number;
  },
  adapters: StoreAdapters = defaultAdapters,
): Promise<ReviewPage> {
  const req = resolveStoreRequest(input);
  const page = parsePage(input.page);
  if (page === null) {
    throw new StoreApiError("invalid_request", "page must be an integer >= 1.");
  }
  let id = req.id;
  if (req.store === "ios" && !isIosNumericId(id)) {
    const listing = await adapters.ios.getListing(id, req.country);
    id = listing.id;
  }
  return assertReviewPageSafe(
    await adapters[req.store].getReviews(id, req.country, page),
  );
}
