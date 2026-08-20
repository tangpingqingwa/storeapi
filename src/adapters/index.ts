import { liveStoresEnabled } from "../config.js";
import type { StoreAdapters } from "../types.js";
import { createLiveHttpGet, type HttpGet } from "./http.js";
import { createFixtureIosAdapter, createLiveIosAdapter } from "./ios.js";
import { createFixturePlayAdapter, createLivePlayAdapter } from "./play.js";

export type { HttpGet, HttpResponse } from "./http.js";
export {
  assertAllowedStoreUrl,
  createLiveHttpGet,
  parseJsonBody,
} from "./http.js";
export {
  createFixtureIosAdapter,
  createLiveIosAdapter,
  itunesChartsRssUrl,
  itunesLookupUrl,
  itunesReviewsRssUrl,
  itunesSearchUrl,
} from "./ios.js";
export {
  createFixturePlayAdapter,
  createLivePlayAdapter,
  playChartsUrl,
  playDetailsUrl,
  playSearchUrl,
} from "./play.js";

/** Fixtures unless STOREAPI_LIVE_STORES is on and FIXTURE_ONLY is off. */
export function createStoreAdapters(
  env: NodeJS.ProcessEnv = process.env,
  httpGet?: HttpGet,
): StoreAdapters {
  if (!liveStoresEnabled(env)) {
    return {
      ios: createFixtureIosAdapter(),
      play: createFixturePlayAdapter(),
    };
  }
  const get = httpGet ?? createLiveHttpGet(env);
  return {
    ios: createLiveIosAdapter(get),
    play: createLivePlayAdapter(get),
  };
}
