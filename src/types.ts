export type Store = "ios" | "play";

export type Country = "US" | "GB";

export type KeyPrefix = "st_live" | "st_test";

export type ErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "payment_required"
  | "app_not_found"
  | "store_unsupported"
  | "country_unsupported"
  | "not_implemented"
  | "rate_limited"
  | "upstream_blocked"
  | "internal";

export const STORES: readonly Store[] = ["ios", "play"];

export const COUNTRIES: readonly Country[] = ["US", "GB"];

export const ERROR_CODES: readonly ErrorCode[] = [
  "invalid_request",
  "unauthorized",
  "payment_required",
  "app_not_found",
  "store_unsupported",
  "country_unsupported",
  "not_implemented",
  "rate_limited",
  "upstream_blocked",
  "internal",
];

export const FORBIDDEN_ESTIMATE_FIELDS: readonly string[] = [
  "downloads",
  "downloadCount",
  "downloadEstimate",
  "downloadsEstimate",
  "revenue",
  "revenueEstimate",
  "estimatedDownloads",
  "estimatedRevenue",
];

export type Ok<T> = {
  data: T;
  meta: {
    cached: boolean;
    creditsCharged: number;
    requestId: string;
    upstreamMs: number;
  };
};

export type Err = {
  error: { code: ErrorCode; message: string; retryable: boolean };
  meta: { creditsCharged: 0; requestId: string };
};

export type AppListing = {
  store: Store;
  id: string;
  bundleId: string | null;
  name: string;
  developer: string | null;
  url: string;
  iconUrl: string | null;
  category: string | null;
  rating: { average: number | null; count: number | null };
  price: { amount: number; currency: string } | null;
  description: string;
  version: string | null;
  updatedAt: string | null;
  countries: string[];
  fetchedAt: string;
};

export const APP_LISTING_KEYS = [
  "store",
  "id",
  "bundleId",
  "name",
  "developer",
  "url",
  "iconUrl",
  "category",
  "rating",
  "price",
  "description",
  "version",
  "updatedAt",
  "countries",
  "fetchedAt",
] as const satisfies readonly (keyof AppListing)[];

export type Review = {
  id: string | null;
  stars: number;
  title: string | null;
  body: string;
  author: string | null;
  version: string | null;
  createdAt: string | null;
};

export const REVIEW_KEYS = [
  "id",
  "stars",
  "title",
  "body",
  "author",
  "version",
  "createdAt",
] as const satisfies readonly (keyof Review)[];

export type ReviewPage = {
  page: number;
  country: Country;
  hasMore: boolean;
  reviews: Review[];
};

export type ChartKind = "free" | "paid" | "grossing";

export const CHART_KINDS: readonly ChartKind[] = ["free", "paid", "grossing"];

export type ChartEntry = {
  rank: number;
  id: string;
  name: string;
};

export const CHART_ENTRY_KEYS = [
  "rank",
  "id",
  "name",
] as const satisfies readonly (keyof ChartEntry)[];

export type ChartPage = {
  store: Store;
  country: Country;
  kind: ChartKind;
  category: string | null;
  page: number;
  hasMore: boolean;
  results: ChartEntry[];
};

export const CHART_PAGE_KEYS = [
  "store",
  "country",
  "kind",
  "category",
  "page",
  "hasMore",
  "results",
] as const satisfies readonly (keyof ChartPage)[];

export type SearchHit = {
  id: string;
  name: string;
};

export const SEARCH_HIT_KEYS = [
  "id",
  "name",
] as const satisfies readonly (keyof SearchHit)[];

export type SearchPage = {
  store: Store;
  country: Country;
  q: string;
  page: number;
  hasMore: boolean;
  results: SearchHit[];
};

export const SEARCH_PAGE_KEYS = [
  "store",
  "country",
  "q",
  "page",
  "hasMore",
  "results",
] as const satisfies readonly (keyof SearchPage)[];

export type StoreAdapter = {
  getListing(id: string, country: Country): Promise<AppListing>;
  getReviews(id: string, country: Country, page: number): Promise<ReviewPage>;
  getCharts(
    country: Country,
    kind: ChartKind,
    category: string | null,
    page: number,
  ): Promise<ChartPage>;
  search(country: Country, q: string, page: number): Promise<SearchPage>;
};

export type StoreAdapters = {
  ios: StoreAdapter;
  play: StoreAdapter;
};

export const REVIEW_PAGE_KEYS = [
  "page",
  "country",
  "hasMore",
  "reviews",
] as const satisfies readonly (keyof ReviewPage)[];

function sameKeySet(actual: string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  const wanted = new Set(expected);
  return actual.every((key) => wanted.has(key));
}

export function listingUsesUnifiedSchema(listing: AppListing): boolean {
  return (
    sameKeySet(Object.keys(listing), APP_LISTING_KEYS) &&
    sameKeySet(Object.keys(listing.rating), ["average", "count"]) &&
    (listing.price === null ||
      sameKeySet(Object.keys(listing.price), ["amount", "currency"]))
  );
}

export function reviewPageUsesUnifiedSchema(page: ReviewPage): boolean {
  if (!sameKeySet(Object.keys(page), REVIEW_PAGE_KEYS)) {
    return false;
  }
  return page.reviews.every((review) => sameKeySet(Object.keys(review), REVIEW_KEYS));
}

export function chartPageUsesUnifiedSchema(page: ChartPage): boolean {
  if (!sameKeySet(Object.keys(page), CHART_PAGE_KEYS)) {
    return false;
  }
  return page.results.every((entry) => sameKeySet(Object.keys(entry), CHART_ENTRY_KEYS));
}

export function searchPageUsesUnifiedSchema(page: SearchPage): boolean {
  if (!sameKeySet(Object.keys(page), SEARCH_PAGE_KEYS)) {
    return false;
  }
  return page.results.every((hit) => sameKeySet(Object.keys(hit), SEARCH_HIT_KEYS));
}

export function isStore(value: string): value is Store {
  return value === "ios" || value === "play";
}

export function isCountry(value: string): value is Country {
  return value === "US" || value === "GB";
}

export function parseStore(value: string | undefined): Store | null {
  if (value === undefined || value === "") {
    return null;
  }
  const normalized = value.toLowerCase();
  return isStore(normalized) ? normalized : null;
}

export function parseCountry(value: string | undefined): Country | null {
  if (value === undefined || value === "") {
    return "US";
  }
  const normalized = value.toUpperCase();
  return isCountry(normalized) ? normalized : null;
}

export function isChartKind(value: string): value is ChartKind {
  return value === "free" || value === "paid" || value === "grossing";
}

export function parseChartKind(value: string | undefined): ChartKind | null {
  if (value === undefined || value === "") {
    return null;
  }
  const normalized = value.toLowerCase();
  return isChartKind(normalized) ? normalized : null;
}

export function isIosNumericId(id: string): boolean {
  return /^\d+$/.test(id);
}

export function isPlayPackageId(id: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(id);
}

export function isIosBundleId(id: string): boolean {
  return isPlayPackageId(id);
}

export function assertReviewStars(stars: number): void {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new Error("review stars must be an integer 1-5");
  }
}

export function listingHasForbiddenEstimateField(value: unknown): boolean {
  return collectForbiddenEstimateFields(value).length > 0;
}

export function collectForbiddenEstimateFields(
  value: unknown,
  path = "",
): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectForbiddenEstimateFields(item, `${path}[${index}]`),
    );
  }
  const record = value as Record<string, unknown>;
  const found: string[] = [];
  for (const key of Object.keys(record)) {
    const next = path === "" ? key : `${path}.${key}`;
    if (FORBIDDEN_ESTIMATE_FIELDS.includes(key)) {
      found.push(next);
    }
    found.push(...collectForbiddenEstimateFields(record[key], next));
  }
  return found;
}
