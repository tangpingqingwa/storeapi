import {
  isIosBundleId,
  isIosNumericId,
  isPlayPackageId,
  parseCountry,
  parseStore,
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
