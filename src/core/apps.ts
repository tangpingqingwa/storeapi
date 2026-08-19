import {
  createFixtureIosAdapter,
  type IosAdapter,
} from "../adapters/ios.js";
import {
  listingHasForbiddenEstimateField,
  type AppListing,
} from "../types.js";
import { StoreApiError } from "./errors.js";
import { resolveStoreRequest } from "./params.js";

const defaultAdapter = createFixtureIosAdapter();

export function assertListingSafe(listing: AppListing): AppListing {
  if (listingHasForbiddenEstimateField(listing)) {
    throw new StoreApiError("internal", "Listing must not include download estimates.");
  }
  if (listing.name.trim() === "") {
    throw new StoreApiError("upstream_blocked", "Listing is missing a name.");
  }
  return listing;
}

export async function getApp(
  input: { store?: string; id?: string; country?: string },
  adapter: IosAdapter = defaultAdapter,
): Promise<AppListing> {
  const req = resolveStoreRequest(input);
  return assertListingSafe(await adapter.getListing(req.id, req.country));
}
