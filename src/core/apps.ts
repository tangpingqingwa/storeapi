import { createStoreAdapters } from "../adapters/index.js";
import {
  listingHasForbiddenEstimateField,
  listingUsesUnifiedSchema,
  type AppListing,
  type StoreAdapters,
} from "../types.js";
import { StoreApiError } from "./errors.js";
import { resolveStoreRequest } from "./params.js";

const defaultAdapters: StoreAdapters = createStoreAdapters();

export function assertListingSafe(listing: AppListing): AppListing {
  if (listingHasForbiddenEstimateField(listing)) {
    throw new StoreApiError("internal", "Listing must not include download estimates.");
  }
  if (!listingUsesUnifiedSchema(listing)) {
    throw new StoreApiError("internal", "Listing does not match the unified schema.");
  }
  if (listing.name.trim() === "") {
    throw new StoreApiError("upstream_blocked", "Listing is missing a name.");
  }
  return listing;
}

export async function getApp(
  input: { store?: string; id?: string; country?: string },
  adapters: StoreAdapters = defaultAdapters,
): Promise<AppListing> {
  const req = resolveStoreRequest(input);
  return assertListingSafe(await adapters[req.store].getListing(req.id, req.country));
}
