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
import { parseJsonBody, type HttpGet } from "./http.js";

export const IOS_LOOKUP_HOST = "itunes.apple.com";
export const IOS_RSS_HOST = "itunes.apple.com";

export type IosLookupResult = {
  resultCount: number;
  results: IosLookupApp[];
};

export type IosLookupApp = {
  trackId?: number;
  trackName?: string;
  bundleId?: string;
  artistName?: string;
  trackViewUrl?: string;
  artworkUrl100?: string;
  artworkUrl512?: string;
  primaryGenreName?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  formattedPrice?: string;
  price?: number;
  currency?: string;
  description?: string;
  version?: string;
  currentVersionReleaseDate?: string;
  releaseDate?: string;
};

export type IosRssFeed = {
  feed?: {
    entry?: IosRssEntry | IosRssEntry[];
  };
};

export type IosRssEntry = {
  id?: { label?: string; attributes?: { "im:id"?: string } };
  title?: { label?: string };
  content?: { label?: string };
  author?: { name?: { label?: string } };
  "im:name"?: { label?: string };
  "im:rating"?: { label?: string };
  "im:version"?: { label?: string };
  updated?: { label?: string };
};

export type IosFixtureKind = "lookup" | "reviews" | "charts" | "search";

export type IosFixtureEntry = {
  kind: IosFixtureKind;
  id?: string;
  country: Country;
  page?: number;
  file: string;
  status?: number;
  chartKind?: ChartKind;
  category?: string | null;
  q?: string;
};

export type IosFixtureIndex = {
  apps: IosFixtureEntry[];
};

export type IosRssChartFeed = {
  feed?: {
    entry?: IosRssEntry | IosRssEntry[];
  };
};

export type IosSearchResult = {
  resultCount: number;
  results: IosLookupApp[];
};

export type IosAdapter = StoreAdapter;

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../tests/fixtures/ios",
);

const ITUNES_REVIEWS_PER_PAGE = 50;
const ITUNES_CHARTS_PER_PAGE = 25;
const ITUNES_SEARCH_PER_PAGE = 25;

export function loadIosFixtureIndex(): IosFixtureIndex {
  const raw = readFileSync(join(FIXTURES_DIR, "index.json"), "utf8");
  return JSON.parse(raw) as IosFixtureIndex;
}

export function itunesLookupUrl(id: string, country: Country): string {
  const countryCode = country.toLowerCase();
  if (/^\d+$/.test(id)) {
    return `https://${IOS_LOOKUP_HOST}/lookup?id=${encodeURIComponent(id)}&country=${countryCode}`;
  }
  return `https://${IOS_LOOKUP_HOST}/lookup?bundleId=${encodeURIComponent(id)}&country=${countryCode}`;
}

export function itunesReviewsRssUrl(
  id: string,
  country: Country,
  page: number,
): string {
  const countryCode = country.toLowerCase();
  return `https://${IOS_RSS_HOST}/${countryCode}/rss/customerreviews/page=${page}/id=${encodeURIComponent(id)}/sortby=mostrecent/json`;
}

const IOS_CHART_FEEDS: Record<ChartKind, string> = {
  free: "topfreeapplications",
  paid: "toppaidapplications",
  grossing: "topgrossingapplications",
};

export function itunesChartsRssUrl(
  country: Country,
  kind: ChartKind,
  category: string | null,
  page: number,
): string {
  const countryCode = country.toLowerCase();
  const feed = IOS_CHART_FEEDS[kind];
  const genre = category === null || category === "" ? "" : `/genre=${encodeURIComponent(category)}`;
  return `https://${IOS_RSS_HOST}/${countryCode}/rss/${feed}/limit=25${genre}/page=${page}/json`;
}

export function itunesSearchUrl(q: string, country: Country, page: number): string {
  const offset = (page - 1) * ITUNES_SEARCH_PER_PAGE;
  return `https://${IOS_LOOKUP_HOST}/search?term=${encodeURIComponent(q)}&country=${country.toLowerCase()}&entity=software&limit=${ITUNES_SEARCH_PER_PAGE}&offset=${offset}`;
}

function readFixtureJson(file: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8"));
}

function sameIosId(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    return left.replace(/^0+/, "") === right.replace(/^0+/, "");
  }
  return left.toLowerCase() === right.toLowerCase();
}

function findAppFixture(
  index: IosFixtureIndex,
  kind: "lookup" | "reviews",
  id: string,
  country: Country,
  page?: number,
): IosFixtureEntry | undefined {
  return index.apps.find((entry) => {
    if (entry.kind !== kind || entry.country !== country) {
      return false;
    }
    if (kind === "reviews" && (entry.page ?? 1) !== (page ?? 1)) {
      return false;
    }
    return entry.id !== undefined && sameIosId(entry.id, id);
  });
}

function sameCategory(left: string | null | undefined, right: string | null): boolean {
  const normalized = left === undefined || left === "" ? null : left;
  return normalized === right;
}

function findChartFixture(
  index: IosFixtureIndex,
  country: Country,
  kind: ChartKind,
  category: string | null,
  page: number,
): IosFixtureEntry | undefined {
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
  index: IosFixtureIndex,
  country: Country,
  q: string,
  page: number,
): IosFixtureEntry | undefined {
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

function rssEntries(feed: IosRssFeed): IosRssEntry[] {
  const entry = feed.feed?.entry;
  if (entry === undefined) {
    return [];
  }
  return Array.isArray(entry) ? entry : [entry];
}

function isAppMetadataEntry(entry: IosRssEntry): boolean {
  return entry["im:rating"] === undefined && entry.content === undefined;
}

export function parseIosLookup(
  payload: IosLookupResult,
  requestedId: string,
  country: Country,
  fetchedAt: string,
): AppListing {
  if (!Number.isInteger(payload.resultCount) || payload.resultCount < 0) {
    throw new StoreApiError("upstream_blocked", "iTunes lookup payload is malformed.");
  }
  if (payload.resultCount === 0 || payload.results.length === 0) {
    throw new StoreApiError("app_not_found", "App was not found on the App Store.");
  }
  const app = payload.results[0];
  if (app === undefined || app.trackId === undefined || app.trackName === undefined) {
    throw new StoreApiError("upstream_blocked", "iTunes lookup is missing required fields.");
  }
  const id = String(app.trackId);
  const listing: AppListing = {
    store: "ios",
    id,
    bundleId: textOrNull(app.bundleId),
    name: app.trackName,
    developer: textOrNull(app.artistName),
    url:
      textOrNull(app.trackViewUrl) ??
      `https://apps.apple.com/${country.toLowerCase()}/app/id${id}`,
    iconUrl: textOrNull(app.artworkUrl512) ?? textOrNull(app.artworkUrl100),
    category: textOrNull(app.primaryGenreName),
    rating: {
      average:
        typeof app.averageUserRating === "number" ? app.averageUserRating : null,
      count: typeof app.userRatingCount === "number" ? app.userRatingCount : null,
    },
    price:
      typeof app.price === "number" && textOrNull(app.currency) !== null
        ? { amount: app.price, currency: app.currency as string }
        : app.formattedPrice === "Free"
          ? { amount: 0, currency: country === "US" ? "USD" : "GBP" }
          : null,
    description: app.description ?? "",
    version: textOrNull(app.version),
    updatedAt: asIsoOrNull(app.currentVersionReleaseDate) ?? asIsoOrNull(app.releaseDate),
    countries: [country],
    fetchedAt,
  };
  if (listingHasForbiddenEstimateField(listing)) {
    throw new StoreApiError("internal", "Listing must not include download estimates.");
  }
  if (/^\d+$/.test(requestedId) && !sameIosId(requestedId, listing.id)) {
    throw new StoreApiError("app_not_found", "App was not found on the App Store.");
  }
  if (
    !/^\d+$/.test(requestedId) &&
    listing.bundleId !== null &&
    !sameIosId(requestedId, listing.bundleId)
  ) {
    throw new StoreApiError("app_not_found", "App was not found on the App Store.");
  }
  return listing;
}

export function parseIosCharts(
  payload: IosRssChartFeed,
  country: Country,
  kind: ChartKind,
  category: string | null,
  page: number,
): ChartPage {
  const results: ChartEntry[] = [];
  for (const entry of rssEntries(payload)) {
    const id =
      textOrNull(entry.id?.attributes?.["im:id"]) ??
      textOrNull(entry.id?.label)?.match(/id(\d+)/)?.[1] ??
      null;
    const name = textOrNull(entry["im:name"]?.label) ?? textOrNull(entry.title?.label);
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
    store: "ios",
    country,
    kind,
    category,
    page,
    hasMore: results.length >= ITUNES_CHARTS_PER_PAGE,
    results,
  };
  if (listingHasForbiddenEstimateField(pageData)) {
    throw new StoreApiError("internal", "Charts must not include download estimates.");
  }
  return pageData;
}

export function parseIosSearch(
  payload: IosSearchResult,
  country: Country,
  q: string,
  page: number,
): SearchPage {
  if (!Number.isInteger(payload.resultCount) || payload.resultCount < 0) {
    throw new StoreApiError("upstream_blocked", "iTunes search payload is malformed.");
  }
  if (!Array.isArray(payload.results)) {
    throw new StoreApiError("upstream_blocked", "iTunes search payload is malformed.");
  }
  const results: SearchHit[] = [];
  for (const app of payload.results) {
    if (app.trackId === undefined || app.trackName === undefined) {
      throw new StoreApiError("upstream_blocked", "Search hit is missing id or name.");
    }
    results.push({
      id: String(app.trackId),
      name: app.trackName,
    });
  }
  const pageData: SearchPage = {
    store: "ios",
    country,
    q,
    page,
    hasMore: results.length >= ITUNES_SEARCH_PER_PAGE,
    results,
  };
  if (listingHasForbiddenEstimateField(pageData)) {
    throw new StoreApiError("internal", "Search must not include download estimates.");
  }
  return pageData;
}

export function parseIosReviews(
  payload: IosRssFeed,
  country: Country,
  page: number,
): ReviewPage {
  const reviews: Review[] = [];
  for (const entry of rssEntries(payload)) {
    if (isAppMetadataEntry(entry)) {
      continue;
    }
    const starsRaw = entry["im:rating"]?.label;
    const stars = starsRaw === undefined ? Number.NaN : Number(starsRaw);
    try {
      assertReviewStars(stars);
    } catch {
      throw new StoreApiError(
        "upstream_blocked",
        "Review is missing a valid star rating.",
      );
    }
    const body = entry.content?.label ?? "";
    const id = textOrNull(entry.id?.label) ?? textOrNull(entry.id?.attributes?.["im:id"]);
    reviews.push({
      id,
      stars,
      title: textOrNull(entry.title?.label),
      body,
      author: textOrNull(entry.author?.name?.label),
      version: textOrNull(entry["im:version"]?.label),
      createdAt: asIsoOrNull(entry.updated?.label),
    });
  }
  const pageData: ReviewPage = {
    page,
    country,
    hasMore: reviews.length >= ITUNES_REVIEWS_PER_PAGE,
    reviews,
  };
  if (listingHasForbiddenEstimateField(pageData)) {
    throw new StoreApiError("internal", "Reviews must not include download estimates.");
  }
  return pageData;
}

export function createFixtureIosAdapter(
  index = loadIosFixtureIndex(),
): IosAdapter {
  return {
    async getListing(id, country) {
      const match = findAppFixture(index, "lookup", id, country);
      if (match === undefined) {
        throw new StoreApiError("app_not_found", "App was not found on the App Store.");
      }
      if ((match.status ?? 200) >= 500) {
        throw new StoreApiError(
          "upstream_blocked",
          "App Store listing upstream is blocked.",
        );
      }
      if ((match.status ?? 200) === 404) {
        throw new StoreApiError("app_not_found", "App was not found on the App Store.");
      }
      const payload = readFixtureJson(match.file) as IosLookupResult;
      return parseIosLookup(payload, id, country, new Date().toISOString());
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
          "App Store reviews upstream is blocked.",
        );
      }
      if ((match.status ?? 200) === 404) {
        throw new StoreApiError("app_not_found", "App was not found on the App Store.");
      }
      const payload = readFixtureJson(match.file) as IosRssFeed;
      return parseIosReviews(payload, country, page);
    },
    async getCharts(country, kind, category, page) {
      const match = findChartFixture(index, country, kind, category, page);
      if (match === undefined) {
        return {
          store: "ios",
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
          "App Store charts upstream is blocked.",
        );
      }
      const payload = readFixtureJson(match.file) as IosRssChartFeed;
      return parseIosCharts(payload, country, kind, category, page);
    },
    async search(country, q, page) {
      const match = findSearchFixture(index, country, q, page);
      if (match === undefined) {
        return {
          store: "ios",
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
          "App Store search upstream is blocked.",
        );
      }
      const payload = readFixtureJson(match.file) as IosSearchResult;
      return parseIosSearch(payload, country, q, page);
    },
  };
}

function mapIosHttpStatus(status: number, notFoundMessage: string): void {
  if (status === 404) {
    throw new StoreApiError("app_not_found", notFoundMessage);
  }
  if (status === 429 || status >= 500 || status < 200 || status >= 300) {
    throw new StoreApiError("upstream_blocked", "App Store upstream is blocked.");
  }
}

async function getIosJson(
  httpGet: HttpGet,
  url: string,
  malformed: string,
): Promise<unknown> {
  const response = await httpGet(url);
  mapIosHttpStatus(response.status, "App was not found on the App Store.");
  return parseJsonBody(response.body, malformed);
}

/** Documented iTunes Lookup / RSS / Search JSON. Never invents a review. */
export function createLiveIosAdapter(httpGet: HttpGet): IosAdapter {
  return {
    async getListing(id, country) {
      const payload = (await getIosJson(
        httpGet,
        itunesLookupUrl(id, country),
        "iTunes lookup payload is malformed.",
      )) as IosLookupResult;
      return parseIosLookup(payload, id, country, new Date().toISOString());
    },
    async getReviews(id, country, page) {
      await this.getListing(id, country);
      const payload = (await getIosJson(
        httpGet,
        itunesReviewsRssUrl(id, country, page),
        "iTunes reviews payload is malformed.",
      )) as IosRssFeed;
      return parseIosReviews(payload, country, page);
    },
    async getCharts(country, kind, category, page) {
      const payload = (await getIosJson(
        httpGet,
        itunesChartsRssUrl(country, kind, category, page),
        "iTunes charts payload is malformed.",
      )) as IosRssChartFeed;
      return parseIosCharts(payload, country, kind, category, page);
    },
    async search(country, q, page) {
      const payload = (await getIosJson(
        httpGet,
        itunesSearchUrl(q, country, page),
        "iTunes search payload is malformed.",
      )) as IosSearchResult;
      return parseIosSearch(payload, country, q, page);
    },
  };
}
