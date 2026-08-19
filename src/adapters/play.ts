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

export type PlayFixtureKind = "details" | "reviews";

export type PlayFixtureEntry = {
  kind: PlayFixtureKind;
  id: string;
  country: Country;
  page?: number;
  file: string;
  status?: number;
};

export type PlayFixtureIndex = {
  apps: PlayFixtureEntry[];
};

export type PlayAdapter = StoreAdapter;

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../tests/fixtures/play",
);

const PLAY_REVIEWS_PER_PAGE = 40;

export function loadPlayFixtureIndex(): PlayFixtureIndex {
  const raw = readFileSync(join(FIXTURES_DIR, "index.json"), "utf8");
  return JSON.parse(raw) as PlayFixtureIndex;
}

export function playDetailsUrl(id: string, country: Country): string {
  return `https://${PLAY_HOST}/store/apps/details?id=${encodeURIComponent(id)}&hl=en&gl=${country.toLowerCase()}`;
}

function readFixtureJson(file: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8"));
}

function samePlayId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function findFixture(
  index: PlayFixtureIndex,
  kind: PlayFixtureKind,
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
    return samePlayId(entry.id, id);
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
      const match = findFixture(index, "details", id, country);
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
          "Play reviews upstream is blocked.",
        );
      }
      if ((match.status ?? 200) === 404) {
        throw new StoreApiError("app_not_found", "App was not found on Google Play.");
      }
      const payload = readFixtureJson(match.file) as PlayReviewsPayload;
      return parsePlayReviews(payload, country, page);
    },
  };
}
