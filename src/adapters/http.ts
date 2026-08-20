import { liveStoresEnabled } from "../config.js";
import { StoreApiError } from "../core/errors.js";

export type HttpResponse = {
  status: number;
  body: string;
};

export type HttpGet = (url: string) => Promise<HttpResponse>;

const ALLOWED_LIVE_HOSTS = new Set(["itunes.apple.com", "play.google.com"]);

const LIVE_HEADERS = {
  accept: "application/json, text/javascript, text/html;q=0.9, */*;q=0.8",
  "user-agent":
    "StoreAPI/0.1 (+https://github.com/tangpingqingwa/storeapi; read-only public pages)",
};

export function assertAllowedStoreUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new StoreApiError("upstream_blocked", "Store upstream URL is invalid.");
  }
  if (parsed.protocol !== "https:") {
    throw new StoreApiError("upstream_blocked", "Store upstream URL is invalid.");
  }
  if (!ALLOWED_LIVE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new StoreApiError("upstream_blocked", "Store upstream host is not allowed.");
  }
  return parsed;
}

export function parseJsonBody(body: string, message: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new StoreApiError("upstream_blocked", message);
  }
}

export function createLiveHttpGet(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): HttpGet {
  return async (url) => {
    if (!liveStoresEnabled(env)) {
      throw new StoreApiError("upstream_blocked", "Live store fetch is disabled.");
    }
    assertAllowedStoreUrl(url);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: LIVE_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new StoreApiError("upstream_blocked", "Store upstream is blocked.");
    }
    try {
      return { status: response.status, body: await response.text() };
    } catch {
      throw new StoreApiError("upstream_blocked", "Store upstream is blocked.");
    }
  };
}
