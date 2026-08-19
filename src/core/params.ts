import {
  isIosBundleId,
  isIosNumericId,
  isPlayPackageId,
  parseChartKind,
  parseCountry,
  parseStore,
  type ChartKind,
  type Country,
  type Store,
} from "../types.js";
import { StoreApiError } from "./errors.js";

export type ResolvedStoreRequest = {
  store: Store;
  id: string;
  country: Country;
};

export function parsePage(value: string | number | undefined): number | null {
  if (value === undefined || value === "") {
    return 1;
  }
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1 ? value : null;
  }
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : null;
}

export function resolveStoreRequest(input: {
  store?: string;
  id?: string;
  country?: string;
}): ResolvedStoreRequest {
  const store = parseStore(input.store);
  if (store === null) {
    throw new StoreApiError("store_unsupported", "Store must be ios or play.");
  }
  const country = parseCountry(input.country);
  if (country === null) {
    throw new StoreApiError(
      "country_unsupported",
      "Country must be US or GB.",
    );
  }
  const id = input.id?.trim() ?? "";
  if (id === "") {
    throw new StoreApiError("invalid_request", "App id is required.");
  }
  if (store === "ios") {
    if (!isIosNumericId(id) && !isIosBundleId(id)) {
      throw new StoreApiError(
        "invalid_request",
        "iOS id must be a numeric App Store id or a bundle id.",
      );
    }
  } else if (!isPlayPackageId(id)) {
    throw new StoreApiError(
      "invalid_request",
      "Play id must be a package name like com.foo.bar.",
    );
  }
  return { store, id, country };
}

export type ResolvedChartRequest = {
  store: Store;
  country: Country;
  kind: ChartKind;
  category: string | null;
  page: number;
};

export type ResolvedSearchRequest = {
  store: Store;
  country: Country;
  q: string;
  page: number;
};

export function normalizeCategory(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function resolveChartRequest(input: {
  store?: string;
  country?: string;
  kind?: string;
  category?: string;
  page?: string | number;
}): ResolvedChartRequest {
  const store = parseStore(input.store);
  if (store === null) {
    throw new StoreApiError("store_unsupported", "Store must be ios or play.");
  }
  const country = parseCountry(input.country);
  if (country === null) {
    throw new StoreApiError("country_unsupported", "Country must be US or GB.");
  }
  const kind = parseChartKind(input.kind);
  if (kind === null) {
    throw new StoreApiError(
      "invalid_request",
      "kind must be free, paid, or grossing.",
    );
  }
  const page = parsePage(input.page);
  if (page === null) {
    throw new StoreApiError("invalid_request", "page must be an integer >= 1.");
  }
  return {
    store,
    country,
    kind,
    category: normalizeCategory(input.category),
    page,
  };
}

export function resolveSearchRequest(input: {
  store?: string;
  country?: string;
  q?: string;
  page?: string | number;
}): ResolvedSearchRequest {
  const store = parseStore(input.store);
  if (store === null) {
    throw new StoreApiError("store_unsupported", "Store must be ios or play.");
  }
  const country = parseCountry(input.country);
  if (country === null) {
    throw new StoreApiError("country_unsupported", "Country must be US or GB.");
  }
  const q = input.q?.trim() ?? "";
  if (q === "") {
    throw new StoreApiError("invalid_request", "q is required.");
  }
  const page = parsePage(input.page);
  if (page === null) {
    throw new StoreApiError("invalid_request", "page must be an integer >= 1.");
  }
  return { store, country, q, page };
}
