import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StoreApiError } from "../core/errors.js";
import {
  assertReviewStars,
  listingHasForbiddenEstimateField,
  type AppListing,
  type ChartEntry,
  type ChartKind,
  type ChartPage,
  type Country,
  type Review,
  type ReviewPage,
  type SearchHit,
  type SearchPage,
  type StoreAdapter,
} from "../types.js";

export const PLAY_HOST = "play.google.com";

export type PlayDetailsPayload = {
  packageName?: string;
  name?: string;
  author?: string | { name?: string };
  url?: string;
  image?: string;
  applicationCategory?: string;
  aggregateRating?: {
    ratingValue?: number | string;
    ratingCount?: number | string;
  };
  offers?: {
    price?: number | string;
    priceCurrency?: string;
  };
  description?: string;
  softwareVersion?: string;
  datePublished?: string;
};

export type PlayReviewEntry = {
  reviewId?: string;
  userName?: string;
  score?: number | string;
  title?: string | null;
  text?: string;
  version?: string;
  at?: string;
};

export type PlayReviewsPayload = {
  reviews?: PlayReviewEntry[];
};

export type PlayFixtureKind = "details" | "reviews" | "charts" | "search";

export type PlayFixtureEntry = {
  kind: PlayFixtureKind;
  id?: string;
  country: Country;
  page?: number;
  file: string;
  status?: number;
  chartKind?: ChartKind;
  category?: string | null;
  q?: string;
};

export type PlayFixtureIndex = {
  apps: PlayFixtureEntry[];
};

export type PlayChartEntry = {
  rank?: number;
  packageName?: string;
  name?: string;
};

export type PlayChartsPayload = {
  apps?: PlayChartEntry[];
};

export type PlaySearchHit = {
  packageName?: string;
  name?: string;
};

export type PlaySearchPayload = {
  results?: PlaySearchHit[];
};

export type PlayAdapter = StoreAdapter;

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../tests/fixtures/play",
);

const PLAY_REVIEWS_PER_PAGE = 40;
const PLAY_CHARTS_PER_PAGE = 20;
const PLAY_SEARCH_PER_PAGE = 20;

export function loadPlayFixtureIndex(): PlayFixtureIndex {
  const raw = readFileSync(join(FIXTURES_DIR, "index.json"), "utf8");
  return JSON.parse(raw) as PlayFixtureIndex;
}

export function playDetailsUrl(id: string, country: Country): string {
  return `https://${PLAY_HOST}/store/apps/details?id=${encodeURIComponent(id)}&hl=en&gl=${country.toLowerCase()}`;
}

const PLAY_CHART_COLLECTIONS: Record<ChartKind, string> = {
  free: "topselling_free",
  paid: "topselling_paid",
  grossing: "topgrossing",
};

export function playChartsUrl(
  country: Country,
  kind: ChartKind,
  category: string | null,
  page: number,
): string {
  const collection = PLAY_CHART_COLLECTIONS[kind];
  const cat = category === null || category === "" ? "APPLICATION" : category;
  return `https://${PLAY_HOST}/store/apps/category/${encodeURIComponent(cat)}/collection/${collection}?gl=${country.toLowerCase()}&hl=en&page=${page}`;
}

export function playSearchUrl(q: string, country: Country, page: number): string {
  return `https://${PLAY_HOST}/store/search?q=${encodeURIComponent(q)}&c=apps&hl=en&gl=${country.toLowerCase()}&page=${page}`;
}

function readFixtureJson(file: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8"));
}

function samePlayId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function findAppFixture(
  index: PlayFixtureIndex,
  kind: "details" | "reviews",
  id: string,
  country: Country,
  page?: number,
): PlayFixtureEntry | undefined {
  return index.apps.find((entry) => {
    if (entry.kind !== kind || entry.country !== country) {
      return false;
    }
    if (kind === "reviews" && (entry.page ?? 1) !== (page ?? 1)) {
      return false;
    }
    return entry.id !== undefined && samePlayId(entry.id, id);
  });
}

function sameCategory(left: string | null | undefined, right: string | null): boolean {
  const normalized = left === undefined || left === "" ? null : left;
  return normalized === right;
}

function findChartFixture(
  index: PlayFixtureIndex,
  country: Country,
  kind: ChartKind,
  category: string | null,
  page: number,
): PlayFixtureEntry | undefined {
  return index.apps.find((entry) => {
    if (entry.kind !== "charts" || entry.country !== country) {
      return false;
    }
    if (entry.chartKind !== kind) {
      return false;
    }
    if ((entry.page ?? 1) !== page) {
      return false;
    }
    return sameCategory(entry.category, category);
  });
}

function findSearchFixture(
  index: PlayFixtureIndex,
  country: Country,
  q: string,
  page: number,
): PlayFixtureEntry | undefined {
  return index.apps.find((entry) => {
    if (entry.kind !== "search" || entry.country !== country) {
      return false;
    }
    if ((entry.page ?? 1) !== page) {
      return false;
    }
    return (entry.q ?? "").toLowerCase() === q.toLowerCase();
  });
}

function textOrNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function asIsoOrNull(value: string | undefined): string | null {
  const raw = textOrNull(value);
  if (raw === null) {
    return null;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function authorName(author: PlayDetailsPayload["author"]): string | null {
  if (typeof author === "string") {
    return textOrNull(author);
  }
  if (author && typeof author === "object") {
    return textOrNull(author.name);
  }
  return null;
}

export function parsePlayDetails(
  payload: PlayDetailsPayload,
  requestedId: string,
  country: Country,
  fetchedAt: string,
): AppListing {
  const packageName = textOrNull(payload.packageName);
  const name = textOrNull(payload.name);
  if (packageName === null || name === null) {
    throw new StoreApiError(
      "upstream_blocked",
      "Play listing is missing required fields.",
    );
  }
  if (!samePlayId(packageName, requestedId)) {
    throw new StoreApiError("app_not_found", "App was not found on Google Play.");
  }
  const priceAmount = asFiniteNumber(payload.offers?.price);
  const currency = textOrNull(payload.offers?.priceCurrency);
  const listing: AppListing = {
    store: "play",
    id: packageName,
    bundleId: packageName,
    name,
    developer: authorName(payload.author),
    url: textOrNull(payload.url) ?? playDetailsUrl(packageName, country),
    iconUrl: textOrNull(payload.image),
    category: textOrNull(payload.applicationCategory),
    rating: {
      average: asFiniteNumber(payload.aggregateRating?.ratingValue),
      count: asFiniteNumber(payload.aggregateRating?.ratingCount),
    },
    price:
      priceAmount !== null && currency !== null
        ? { amount: priceAmount, currency }
        : null,
    description: payload.description ?? "",
    version: textOrNull(payload.softwareVersion),
    updatedAt: asIsoOrNull(payload.datePublished),
    countries: [country],
    fetchedAt,
  };
  if (listingHasForbiddenEstimateField(listing)) {
    throw new StoreApiError("internal", "Listing must not include download estimates.");
  }
  return listing;
}

export function parsePlayCharts(
  payload: PlayChartsPayload,
  country: Country,
  kind: ChartKind,
  category: string | null,
  page: number,
): ChartPage {
  if (!Array.isArray(payload.apps)) {
    throw new StoreApiError("upstream_blocked", "Play charts payload is malformed.");
  }
  const results: ChartEntry[] = [];
  for (const entry of payload.apps) {
    const id = textOrNull(entry.packageName);
    const name = textOrNull(entry.name);
    if (id === null || name === null) {
      throw new StoreApiError("upstream_blocked", "Chart entry is missing id or name.");
    }
    results.push({
      rank: results.length + 1,
      id,
      name,
    });
  }
  const pageData: ChartPage = {
    store: "play",
    country,
    kind,
    category,
    page,
    hasMore: results.length >= PLAY_CHARTS_PER_PAGE,
    results,
  };
  if (listingHasForbiddenEstimateField(pageData)) {
    throw new StoreApiError("internal", "Charts must not include download estimates.");
  }
  return pageData;
}

export function parsePlaySearch(
  payload: PlaySearchPayload,
  country: Country,
  q: string,
  page: number,
): SearchPage {
  if (!Array.isArray(payload.results)) {
    throw new StoreApiError("upstream_blocked", "Play search payload is malformed.");
  }
  const results: SearchHit[] = [];
  for (const hit of payload.results) {
    const id = textOrNull(hit.packageName);
    const name = textOrNull(hit.name);
    if (id === null || name === null) {
      throw new StoreApiError("upstream_blocked", "Search hit is missing id or name.");
    }
    results.push({ id, name });
  }
  const pageData: SearchPage = {
    store: "play",
    country,
    q,
    page,
    hasMore: results.length >= PLAY_SEARCH_PER_PAGE,
    results,
  };
  if (listingHasForbiddenEstimateField(pageData)) {
    throw new StoreApiError("internal", "Search must not include download estimates.");
  }
  return pageData;
}

export function parsePlayReviews(
  payload: PlayReviewsPayload,
  country: Country,
  page: number,
): ReviewPage {
  if (!Array.isArray(payload.reviews)) {
    throw new StoreApiError("upstream_blocked", "Play reviews payload is malformed.");
  }
  const reviews: Review[] = [];
  for (const entry of payload.reviews) {
    const stars = asFiniteNumber(entry.score);
    if (stars === null) {
      throw new StoreApiError(
        "upstream_blocked",
        "Review is missing a valid star rating.",
      );
    }
    try {
      assertReviewStars(stars);
    } catch {
      throw new StoreApiError(
        "upstream_blocked",
        "Review is missing a valid star rating.",
      );
    }
    if (typeof entry.text !== "string") {
      throw new StoreApiError("upstream_blocked", "Review is missing a body.");
    }
    reviews.push({
      id: textOrNull(entry.reviewId),
      stars,
      title: textOrNull(entry.title ?? undefined),
      body: entry.text,
      author: textOrNull(entry.userName),
      version: textOrNull(entry.version),
      createdAt: asIsoOrNull(entry.at),
    });
  }
  const pageData: ReviewPage = {
    page,
    country,
    hasMore: reviews.length >= PLAY_REVIEWS_PER_PAGE,
    reviews,
  };
  if (listingHasForbiddenEstimateField(pageData)) {
    throw new StoreApiError("internal", "Reviews must not include download estimates.");
  }
  return pageData;
}

export function createFixturePlayAdapter(
  index = loadPlayFixtureIndex(),
): PlayAdapter {
  return {
    async getListing(id, country) {
      const match = findAppFixture(index, "details", id, country);
      if (match === undefined) {
        throw new StoreApiError("app_not_found", "App was not found on Google Play.");
      }
      if ((match.status ?? 200) >= 500) {
        throw new StoreApiError(
          "upstream_blocked",
          "Play listing upstream is blocked.",
        );
      }
      if ((match.status ?? 200) === 404) {
        throw new StoreApiError("app_not_found", "App was not found on Google Play.");
      }
      const payload = readFixtureJson(match.file) as PlayDetailsPayload;
      return parsePlayDetails(payload, id, country, new Date().toISOString());
    },
    async getReviews(id, country, page) {
      const match = findAppFixture(index, "reviews", id, country, page);
      if (match === undefined) {
        await this.getListing(id, country);
        return {
          page,
          country,
          hasMore: false,
          reviews: [],
        };
      }
      if ((match.status ?? 200) >= 500) {
        throw new StoreApiError(
          "upstream_blocked",
          "Play reviews upstream is blocked.",
        );
      }
      if ((match.status ?? 200) === 404) {
        throw new StoreApiError("app_not_found", "App was not found on Google Play.");
      }
      const payload = readFixtureJson(match.file) as PlayReviewsPayload;
      return parsePlayReviews(payload, country, page);
    },
    async getCharts(country, kind, category, page) {
      const match = findChartFixture(index, country, kind, category, page);
      if (match === undefined) {
        return {
          store: "play",
          country,
          kind,
          category,
          page,
          hasMore: false,
          results: [],
        };
      }
      if ((match.status ?? 200) >= 500) {
        throw new StoreApiError(
          "upstream_blocked",
          "Play charts upstream is blocked.",
        );
      }
      const payload = readFixtureJson(match.file) as PlayChartsPayload;
      return parsePlayCharts(payload, country, kind, category, page);
    },
    async search(country, q, page) {
      const match = findSearchFixture(index, country, q, page);
      if (match === undefined) {
        return {
          store: "play",
          country,
          q,
          page,
          hasMore: false,
          results: [],
        };
      }
      if ((match.status ?? 200) >= 500) {
        throw new StoreApiError(
          "upstream_blocked",
          "Play search upstream is blocked.",
        );
      }
      const payload = readFixtureJson(match.file) as PlaySearchPayload;
      return parsePlaySearch(payload, country, q, page);
    },
  };
}
