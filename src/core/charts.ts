import { createFixtureIosAdapter } from "../adapters/ios.js";
import { createFixturePlayAdapter } from "../adapters/play.js";
import {
  chartPageUsesUnifiedSchema,
  listingHasForbiddenEstimateField,
  type ChartPage,
  type StoreAdapters,
} from "../types.js";
import { StoreApiError } from "./errors.js";
import { resolveChartRequest } from "./params.js";

const defaultAdapters: StoreAdapters = {
  ios: createFixtureIosAdapter(),
  play: createFixturePlayAdapter(),
};

export function assertChartPageSafe(page: ChartPage): ChartPage {
  if (listingHasForbiddenEstimateField(page)) {
    throw new StoreApiError("internal", "Charts must not include download estimates.");
  }
  if (!chartPageUsesUnifiedSchema(page)) {
    throw new StoreApiError("internal", "Charts do not match the unified schema.");
  }
  for (const [index, entry] of page.results.entries()) {
    if (entry.rank !== index + 1) {
      throw new StoreApiError("upstream_blocked", "Chart ranks must be consecutive from 1.");
    }
    if (entry.id.trim() === "" || entry.name.trim() === "") {
      throw new StoreApiError("upstream_blocked", "Chart entry is missing id or name.");
    }
  }
  return page;
}

export async function listCharts(
  input: {
    store?: string;
    country?: string;
    kind?: string;
    category?: string;
    page?: string | number;
  },
  adapters: StoreAdapters = defaultAdapters,
): Promise<ChartPage> {
  const req = resolveChartRequest(input);
  const page = assertChartPageSafe(
    await adapters[req.store].getCharts(req.country, req.kind, req.category, req.page),
  );
  if (
    page.store !== req.store ||
    page.country !== req.country ||
    page.kind !== req.kind ||
    page.category !== req.category ||
    page.page !== req.page
  ) {
    throw new StoreApiError("internal", "Chart page does not match the request.");
  }
  return page;
}
