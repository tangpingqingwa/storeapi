import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StoreApiError } from "../core/errors.js";
import {
  assertReviewStars,
  listingHasForbiddenEstimateField,
  type AppListing,
  type Country,
  type Review,
  type ReviewPage,
  type StoreAdapter,
} from "../types.js";

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
  "im:rating"?: { label?: string };
  "im:version"?: { label?: string };
  updated?: { label?: string };
};

export type IosFixtureKind = "lookup" | "reviews";

export type IosFixtureEntry = {
  kind: IosFixtureKind;
  id: string;
  country: Country;
  page?: number;
  file: string;
  status?: number;
};

export type IosFixtureIndex = {
  apps: IosFixtureEntry[];
};

export type IosAdapter = StoreAdapter;

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../tests/fixtures/ios",
);

const ITUNES_REVIEWS_PER_PAGE = 50;

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

function findFixture(
  index: IosFixtureIndex,
  kind: IosFixtureKind,
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
    return sameIosId(entry.id, id);
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
      const match = findFixture(index, "lookup", id, country);
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
      const match = findFixture(index, "reviews", id, country, page);
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
  };
}
