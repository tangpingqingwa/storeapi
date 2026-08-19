import {
  createFixtureIosAdapter,
  type IosAdapter,
} from "../adapters/ios.js";
import {
  assertReviewStars,
  isIosNumericId,
  listingHasForbiddenEstimateField,
  type ReviewPage,
} from "../types.js";
import { StoreApiError } from "./errors.js";
import { parsePage, resolveStoreRequest } from "./params.js";

const defaultAdapter = createFixtureIosAdapter();

export function assertReviewPageSafe(page: ReviewPage): ReviewPage {
  if (listingHasForbiddenEstimateField(page)) {
    throw new StoreApiError("internal", "Reviews must not include download estimates.");
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
  adapter: IosAdapter = defaultAdapter,
): Promise<ReviewPage> {
  const req = resolveStoreRequest(input);
  const page = parsePage(input.page);
  if (page === null) {
    throw new StoreApiError("invalid_request", "page must be an integer >= 1.");
  }
  let id = req.id;
  if (!isIosNumericId(id)) {
    const listing = await adapter.getListing(id, req.country);
    id = listing.id;
  }
  return assertReviewPageSafe(await adapter.getReviews(id, req.country, page));
}
