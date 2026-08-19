import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { createKey } from "../src/billing/keys.js";
import { openDatabase } from "../src/db.js";
import { MCP_PATH, MCP_PROTOCOL_VERSION } from "../src/mcp/server.js";
import {
  GET_APP_TOOL,
  KEYWORD_SEARCH_TOOL,
  LIST_REVIEWS_TOOL,
  MCP_SKILL,
} from "../src/mcp/tools.js";
import {
  listingHasForbiddenEstimateField,
  type AppListing,
  type ErrorCode,
  type ReviewPage,
  type SearchPage,
} from "../src/types.js";

const KEY = "st_test_mcp_fixture";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTAGRAM_ID = "389801252";
const INSTAGRAM_BUNDLE = "com.burbn.instagram";
const YOUTUBE_ID = "com.google.android.youtube";
const EMPTY_REVIEWS_ID = "999000001";
const MISSING_ID = "999000404";
const BLOCKED_ID = "999000503";

type OkBody<T> = {
  data: T;
  meta: {
    cached: boolean;
    creditsCharged: number;
    requestId: string;
    upstreamMs: number;
  };
};

type ErrBody = {
  error: { code: ErrorCode; message: string; retryable: boolean };
  meta: { creditsCharged: number; requestId: string };
};

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  structuredContent: OkBody<unknown> | ErrBody;
  isError: boolean;
};

type JsonRpcOk = {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
};

async function appWithKey(credits = 100) {
  const db = openDatabase(":memory:");
  createKey(db, { secret: KEY, credits });
  const app = await buildApp({ db });
  after(async () => {
    await app.close();
    db.close();
  });
  return { app, db };
}

function auth() {
  return { authorization: `Bearer ${KEY}` };
}

async function rpc(
  app: Awaited<ReturnType<typeof buildApp>>,
  method: string,
  params?: unknown,
  headers: Record<string, string> = auth(),
) {
  return app.inject({
    method: "POST",
    url: MCP_PATH,
    headers,
    payload: { jsonrpc: "2.0", id: 1, method, params },
  });
}

async function callTool(
  app: Awaited<ReturnType<typeof buildApp>>,
  name: string,
  args: Record<string, unknown> = {},
) {
  const response = await rpc(app, "tools/call", { name, arguments: args });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json() as JsonRpcOk;
  const result = body.result as ToolResult;
  assert.ok(result);
  assert.equal(typeof result.isError, "boolean");
  return result;
}

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) {
      out.push(...walkTs(path));
    } else if (name.name.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

function publicListing(listing: AppListing): Omit<AppListing, "fetchedAt"> {
  const { fetchedAt: _fetchedAt, ...rest } = listing;
  return rest;
}

test("GET /llms.txt is public and matches the checked-in file", async () => {
  const { app } = await appWithKey();
  const response = await app.inject({ method: "GET", url: "/llms.txt" });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/plain/);
  const onDisk = readFileSync(join(ROOT, "llms.txt"), "utf8");
  assert.equal(response.body, onDisk);
  assert.match(onDisk, /get_app/);
  assert.match(onDisk, /list_reviews/);
  assert.match(onDisk, /keyword_search/);
  assert.match(onDisk, /When not to call/i);
  assert.match(onDisk, /download estimate/i);
  assert.match(onDisk, /do not write metadata/i);
  assert.match(onDisk, /st_live_/);
});

test("GET /.well-known/mcp/server-card.json lists shipped tools only", async () => {
  const { app } = await appWithKey();
  const response = await app.inject({
    method: "GET",
    url: "/.well-known/mcp/server-card.json",
  });
  assert.equal(response.statusCode, 200);
  const card = response.json() as { tools: string[]; transport: string };
  assert.equal(card.transport, "streamable-http");
  assert.deepEqual(card.tools, [
    GET_APP_TOOL,
    LIST_REVIEWS_TOOL,
    KEYWORD_SEARCH_TOOL,
  ]);
});

test("POST /mcp without bearer is 401 with 0 credits", async () => {
  const { app } = await appWithKey();
  const response = await rpc(app, "initialize", undefined, {});
  assert.equal(response.statusCode, 401);
  const body = response.json() as ErrBody;
  assert.equal(body.error.code, "unauthorized");
  assert.equal(body.meta.creditsCharged, 0);
});

test("initialize and tools/list describe get_app, list_reviews, and keyword_search", async () => {
  const { app } = await appWithKey();

  const init = await rpc(app, "initialize");
  assert.equal(init.statusCode, 200);
  const initResult = (init.json() as JsonRpcOk).result as {
    protocolVersion: string;
    capabilities: { tools: unknown };
    serverInfo: { name: string };
    instructions: string;
  };
  assert.equal(initResult.protocolVersion, MCP_PROTOCOL_VERSION);
  assert.equal(initResult.serverInfo.name, "storeapi");
  assert.ok(initResult.capabilities.tools);
  assert.equal(initResult.instructions, MCP_SKILL);
  assert.match(initResult.instructions, /US and UK/i);
  assert.match(initResult.instructions, /download estimates/i);
  assert.match(initResult.instructions, /write metadata/i);

  const listed = await rpc(app, "tools/list");
  assert.equal(listed.statusCode, 200);
  const tools = (
    (listed.json() as JsonRpcOk).result as { tools: Array<{ name: string }> }
  ).tools.map((tool) => tool.name);
  assert.deepEqual(tools, [GET_APP_TOOL, LIST_REVIEWS_TOOL, KEYWORD_SEARCH_TOOL]);
});

test("MCP get_app matches REST listing and charges 1", async () => {
  const { app } = await appWithKey();

  const rest = await app.inject({
    method: "GET",
    url: `/v1/apps/ios/${INSTAGRAM_ID}`,
    headers: auth(),
  });
  assert.equal(rest.statusCode, 200);
  const restBody = rest.json() as OkBody<AppListing>;
  assert.equal(restBody.data.name, "Instagram");
  assert.ok(restBody.data.rating.average !== null);
  assert.equal(restBody.meta.creditsCharged, 1);

  const mcp = await callTool(app, GET_APP_TOOL, {
    store: "ios",
    id: INSTAGRAM_ID,
  });
  assert.equal(mcp.isError, false);
  const mcpBody = mcp.structuredContent as OkBody<AppListing>;
  assert.deepEqual(publicListing(mcpBody.data), publicListing(restBody.data));
  assert.equal(mcpBody.meta.creditsCharged, 1);
  assert.equal(mcpBody.meta.cached, false);
  assert.match(mcpBody.meta.requestId, /^req_/);
  assert.equal(listingHasForbiddenEstimateField(mcpBody.data), false);
  assert.equal("downloadEstimate" in mcpBody.data, false);
  assert.equal("revenue" in mcpBody.data, false);

  const parsedText = JSON.parse(mcp.content[0]?.text ?? "null") as OkBody<AppListing>;
  assert.equal(parsedText.data.id, restBody.data.id);

  const me = await app.inject({ method: "GET", url: "/v1/me", headers: auth() });
  assert.equal(
    (me.json() as { data: { creditsRemaining: number } }).data.creditsRemaining,
    98,
  );
});

test("MCP get_app accepts iOS bundle id and Play package name", async () => {
  const { app } = await appWithKey();

  const ios = await callTool(app, GET_APP_TOOL, {
    store: "ios",
    id: INSTAGRAM_BUNDLE,
  });
  assert.equal(ios.isError, false);
  const iosBody = ios.structuredContent as OkBody<AppListing>;
  assert.equal(iosBody.data.id, INSTAGRAM_ID);
  assert.equal(iosBody.data.bundleId, INSTAGRAM_BUNDLE);
  assert.equal(iosBody.meta.creditsCharged, 1);

  const play = await callTool(app, GET_APP_TOOL, {
    store: "play",
    id: YOUTUBE_ID,
  });
  assert.equal(play.isError, false);
  const playBody = play.structuredContent as OkBody<AppListing>;
  assert.equal(playBody.data.store, "play");
  assert.equal(playBody.data.id, YOUTUBE_ID);
  assert.equal(playBody.data.name, "YouTube");
  assert.equal(listingHasForbiddenEstimateField(playBody.data), false);
});

test("MCP get_app GB listing matches REST country=GB", async () => {
  const { app } = await appWithKey();
  const rest = await app.inject({
    method: "GET",
    url: `/v1/apps/ios/${INSTAGRAM_ID}?country=GB`,
    headers: auth(),
  });
  const restBody = rest.json() as OkBody<AppListing>;
  const mcp = await callTool(app, GET_APP_TOOL, {
    store: "ios",
    id: INSTAGRAM_ID,
    country: "GB",
  });
  assert.equal(mcp.isError, false);
  const mcpBody = mcp.structuredContent as OkBody<AppListing>;
  assert.deepEqual(mcpBody.data.countries, ["GB"]);
  assert.deepEqual(publicListing(mcpBody.data), publicListing(restBody.data));
});

test("MCP get_app errors match REST and charge 0", async () => {
  const { app } = await appWithKey();

  const missingArgs = await callTool(app, GET_APP_TOOL, {});
  assert.equal(missingArgs.isError, true);
  assert.equal(
    (missingArgs.structuredContent as ErrBody).error.code,
    "store_unsupported",
  );
  assert.equal((missingArgs.structuredContent as ErrBody).meta.creditsCharged, 0);

  const jp = await callTool(app, GET_APP_TOOL, {
    store: "ios",
    id: INSTAGRAM_ID,
    country: "JP",
  });
  assert.equal((jp.structuredContent as ErrBody).error.code, "country_unsupported");
  assert.equal((jp.structuredContent as ErrBody).meta.creditsCharged, 0);

  const missing = await callTool(app, GET_APP_TOOL, {
    store: "ios",
    id: MISSING_ID,
  });
  assert.equal((missing.structuredContent as ErrBody).error.code, "app_not_found");
  assert.equal((missing.structuredContent as ErrBody).meta.creditsCharged, 0);

  const blocked = await callTool(app, GET_APP_TOOL, {
    store: "ios",
    id: BLOCKED_ID,
  });
  assert.equal((blocked.structuredContent as ErrBody).error.code, "upstream_blocked");
  assert.equal((blocked.structuredContent as ErrBody).meta.creditsCharged, 0);
  assert.equal((blocked.structuredContent as ErrBody).error.retryable, true);

  const broke = await appWithKey(0);
  const unpaid = await callTool(broke.app, GET_APP_TOOL, {
    store: "ios",
    id: INSTAGRAM_ID,
  });
  assert.equal((unpaid.structuredContent as ErrBody).error.code, "payment_required");
  assert.equal((unpaid.structuredContent as ErrBody).meta.creditsCharged, 0);

  const me = await app.inject({ method: "GET", url: "/v1/me", headers: auth() });
  assert.equal(
    (me.json() as { data: { creditsRemaining: number } }).data.creditsRemaining,
    100,
  );
});

test("MCP list_reviews matches REST page 1 and never invents", async () => {
  const { app } = await appWithKey();

  const rest = await app.inject({
    method: "GET",
    url: `/v1/apps/ios/${INSTAGRAM_ID}/reviews?country=US&page=1`,
    headers: auth(),
  });
  assert.equal(rest.statusCode, 200);
  const restBody = rest.json() as OkBody<ReviewPage>;
  assert.ok(restBody.data.reviews.length >= 1);
  assert.equal(restBody.meta.creditsCharged, 1);

  const mcp = await callTool(app, LIST_REVIEWS_TOOL, {
    store: "ios",
    id: INSTAGRAM_ID,
    country: "US",
    page: 1,
  });
  assert.equal(mcp.isError, false);
  const mcpBody = mcp.structuredContent as OkBody<ReviewPage>;
  assert.deepEqual(mcpBody.data, restBody.data);
  assert.equal(mcpBody.meta.creditsCharged, 1);
  assert.equal(listingHasForbiddenEstimateField(mcpBody.data), false);
  for (const review of mcpBody.data.reviews) {
    assert.ok(Number.isInteger(review.stars));
    assert.ok(review.stars >= 1 && review.stars <= 5);
    assert.equal(typeof review.body, "string");
    assert.ok(review.body.length > 0);
  }
});

test("MCP list_reviews empty page is empty, still 1 credit", async () => {
  const { app } = await appWithKey();
  const empty = await callTool(app, LIST_REVIEWS_TOOL, {
    store: "ios",
    id: EMPTY_REVIEWS_ID,
  });
  assert.equal(empty.isError, false);
  const emptyBody = empty.structuredContent as OkBody<ReviewPage>;
  assert.deepEqual(emptyBody.data.reviews, []);
  assert.equal(emptyBody.data.hasMore, false);
  assert.equal(emptyBody.meta.creditsCharged, 1);
});

test("MCP list_reviews Play US and iOS GB stay on fixtures", async () => {
  const { app } = await appWithKey();

  const play = await callTool(app, LIST_REVIEWS_TOOL, {
    store: "play",
    id: YOUTUBE_ID,
  });
  assert.equal(play.isError, false);
  const playBody = play.structuredContent as OkBody<ReviewPage>;
  assert.ok(playBody.data.reviews.length >= 1);
  assert.equal(playBody.data.country, "US");
  assert.equal(listingHasForbiddenEstimateField(playBody.data), false);

  const gb = await callTool(app, LIST_REVIEWS_TOOL, {
    store: "ios",
    id: INSTAGRAM_ID,
    country: "GB",
  });
  assert.equal(gb.isError, false);
  const gbBody = gb.structuredContent as OkBody<ReviewPage>;
  assert.equal(gbBody.data.country, "GB");
  assert.ok(gbBody.data.reviews.length >= 1);
});

test("MCP list_reviews errors charge 0", async () => {
  const { app } = await appWithKey();
  const badPage = await callTool(app, LIST_REVIEWS_TOOL, {
    store: "ios",
    id: INSTAGRAM_ID,
    page: 0,
  });
  assert.equal((badPage.structuredContent as ErrBody).error.code, "invalid_request");
  assert.equal((badPage.structuredContent as ErrBody).meta.creditsCharged, 0);

  const blocked = await callTool(app, LIST_REVIEWS_TOOL, {
    store: "ios",
    id: BLOCKED_ID,
  });
  assert.equal((blocked.structuredContent as ErrBody).error.code, "upstream_blocked");
  assert.equal((blocked.structuredContent as ErrBody).meta.creditsCharged, 0);

  const jp = await callTool(app, LIST_REVIEWS_TOOL, {
    store: "play",
    id: YOUTUBE_ID,
    country: "JP",
  });
  assert.equal((jp.structuredContent as ErrBody).error.code, "country_unsupported");
});

test("MCP keyword_search matches REST search and charges 1", async () => {
  const { app } = await appWithKey();

  const rest = await app.inject({
    method: "GET",
    url: "/v1/search?store=play&q=youtube",
    headers: auth(),
  });
  assert.equal(rest.statusCode, 200);
  const restBody = rest.json() as OkBody<SearchPage>;
  assert.equal(restBody.data.results[0]?.id, YOUTUBE_ID);

  const mcp = await callTool(app, KEYWORD_SEARCH_TOOL, {
    store: "play",
    q: "youtube",
  });
  assert.equal(mcp.isError, false);
  const mcpBody = mcp.structuredContent as OkBody<SearchPage>;
  assert.deepEqual(mcpBody.data, restBody.data);
  assert.equal(mcpBody.meta.creditsCharged, 1);
  assert.equal(listingHasForbiddenEstimateField(mcpBody.data), false);
  for (const hit of mcpBody.data.results) {
    assert.ok(hit.id.length > 0);
    assert.ok(hit.name.length > 0);
    assert.equal("downloadEstimate" in hit, false);
  }
});

test("MCP keyword_search empty query is empty page, still 1 credit", async () => {
  const { app } = await appWithKey();
  const empty = await callTool(app, KEYWORD_SEARCH_TOOL, {
    store: "play",
    q: "no-such-app-in-fixtures",
  });
  assert.equal(empty.isError, false);
  const emptyBody = empty.structuredContent as OkBody<SearchPage>;
  assert.deepEqual(emptyBody.data.results, []);
  assert.equal(emptyBody.data.hasMore, false);
  assert.equal(emptyBody.meta.creditsCharged, 1);
});

test("MCP keyword_search errors charge 0", async () => {
  const { app } = await appWithKey();
  const missingQ = await callTool(app, KEYWORD_SEARCH_TOOL, { store: "ios" });
  assert.equal((missingQ.structuredContent as ErrBody).error.code, "invalid_request");
  assert.equal((missingQ.structuredContent as ErrBody).meta.creditsCharged, 0);

  const blocked = await callTool(app, KEYWORD_SEARCH_TOOL, {
    store: "ios",
    q: "blocked",
  });
  assert.equal((blocked.structuredContent as ErrBody).error.code, "upstream_blocked");
  assert.equal((blocked.structuredContent as ErrBody).meta.creditsCharged, 0);

  const jp = await callTool(app, KEYWORD_SEARCH_TOOL, {
    store: "play",
    q: "youtube",
    country: "JP",
  });
  assert.equal((jp.structuredContent as ErrBody).error.code, "country_unsupported");
});

test("unknown MCP tool is invalid_request with 0 credits", async () => {
  const { app } = await appWithKey();
  const result = await callTool(app, "get_downloads", {
    store: "ios",
    id: INSTAGRAM_ID,
  });
  assert.equal(result.isError, true);
  const body = result.structuredContent as ErrBody;
  assert.equal(body.error.code, "invalid_request");
  assert.equal(body.meta.creditsCharged, 0);
});

test("HTTP and MCP call core only and never import adapters", () => {
  const files = [...walkTs(join(ROOT, "src/http")), ...walkTs(join(ROOT, "src/mcp"))];
  assert.ok(files.length > 0);
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /from ["'][^"']*adapters\//, file);
    assert.doesNotMatch(src, /\bfetch\s*\(/, file);
  }
  const tools = readFileSync(join(ROOT, "src/mcp/tools.ts"), "utf8");
  assert.match(tools, /getApp/);
  assert.match(tools, /listReviews/);
  assert.match(tools, /searchApps/);
  assert.match(tools, /get_app/);
  assert.match(tools, /list_reviews/);
  assert.match(tools, /keyword_search/);
});

test("no live App Store or Play hosts are fetched from MCP sources", () => {
  for (const file of walkTs(join(ROOT, "src/mcp"))) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /\bfetch\s*\(/, file);
    assert.doesNotMatch(
      src,
      /itunes\.apple\.com|apps\.apple\.com|play\.google\.com|android\.clients\.google\.com/,
      file,
    );
  }
});
