import { createStoreAdapters } from "../adapters/index.js";
import {
  listingHasForbiddenEstimateField,
  searchPageUsesUnifiedSchema,
  type SearchPage,
  type StoreAdapters,
} from "../types.js";
import { StoreApiError } from "./errors.js";
import { resolveSearchRequest } from "./params.js";

const defaultAdapters: StoreAdapters = createStoreAdapters();

export function assertSearchPageSafe(page: SearchPage): SearchPage {
  if (listingHasForbiddenEstimateField(page)) {
    throw new StoreApiError("internal", "Search must not include download estimates.");
  }
  if (!searchPageUsesUnifiedSchema(page)) {
    throw new StoreApiError("internal", "Search does not match the unified schema.");
  }
  for (const hit of page.results) {
    if (hit.id.trim() === "" || hit.name.trim() === "") {
      throw new StoreApiError("upstream_blocked", "Search hit is missing id or name.");
    }
  }
  return page;
}

export async function searchApps(
  input: {
    store?: string;
    country?: string;
    q?: string;
    page?: string | number;
  },
  adapters: StoreAdapters = defaultAdapters,
): Promise<SearchPage> {
  const req = resolveSearchRequest(input);
  const page = assertSearchPageSafe(
    await adapters[req.store].search(req.country, req.q, req.page),
  );
  if (
    page.store !== req.store ||
    page.country !== req.country ||
    page.q !== req.q ||
    page.page !== req.page
  ) {
    throw new StoreApiError("internal", "Search page does not match the request.");
  }
  return page;
}
