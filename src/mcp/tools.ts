import { tryChargeOrPaymentRequired } from "../billing/charge.js";
import type { Key } from "../billing/keys.js";
import { getApp } from "../core/apps.js";
import { StoreApiError } from "../core/errors.js";
import { listReviews } from "../core/reviews.js";
import { searchApps } from "../core/search.js";
import type { StoreApiDb } from "../db.js";
import { isRetryable, newRequestId } from "../http/envelope.js";
import { APP_PATH, APP_REVIEWS_PATH } from "../http/routes/apps.js";
import { SEARCH_PATH } from "../http/routes/search.js";
import type { Err, ErrorCode, Ok } from "../types.js";

export const GET_APP_TOOL = "get_app" as const;
export const LIST_REVIEWS_TOOL = "list_reviews" as const;
export const KEYWORD_SEARCH_TOOL = "keyword_search" as const;

export const MCP_TOOL_NAMES = [
  GET_APP_TOOL,
  LIST_REVIEWS_TOOL,
  KEYWORD_SEARCH_TOOL,
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export type McpToolDefinition = {
  name: McpToolName;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpToolOutcome = Ok<unknown> | Err;

export type CallMcpToolInput = {
  name: string;
  args: Record<string, unknown>;
  db: StoreApiDb;
  key: Key;
  requestId?: string;
};

export const MCP_SKILL =
  "US and UK App Store and Google Play listings only. " +
  "Never invent download estimates or reviews. " +
  "Do not write metadata. Independent, not Apple or Google.";

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: GET_APP_TOOL,
    description:
      "Public App Store or Google Play listing. Maps to GET /v1/apps/{store}/{id}. " +
      "1 credit on success. Failures charge 0. US and UK only. " +
      "Never invent download estimates. Do not write metadata. " +
      MCP_SKILL,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["store", "id"],
      properties: {
        store: {
          type: "string",
          enum: ["ios", "play"],
          description: "ios (App Store) or play (Google Play)",
        },
        id: {
          type: "string",
          description:
            "iOS numeric App Store id or bundle id; Play package name",
        },
        country: {
          type: "string",
          enum: ["US", "GB"],
          description: "US (default) or GB",
        },
      },
    },
  },
  {
    name: LIST_REVIEWS_TOOL,
    description:
      "One page of public App Store or Google Play reviews. Maps to " +
      "GET /v1/apps/{store}/{id}/reviews. 1 credit per page, including empty pages. " +
      "Never invent a review. page is 1-based. " +
      MCP_SKILL,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["store", "id"],
      properties: {
        store: {
          type: "string",
          enum: ["ios", "play"],
          description: "ios (App Store) or play (Google Play)",
        },
        id: {
          type: "string",
          description:
            "iOS numeric App Store id or bundle id; Play package name",
        },
        country: {
          type: "string",
          enum: ["US", "GB"],
          description: "US (default) or GB",
        },
        page: {
          type: "integer",
          minimum: 1,
          description: "1-based review page (default 1)",
        },
      },
    },
  },
  {
    name: KEYWORD_SEARCH_TOOL,
    description:
      "Keyword search of public store listings. Maps to GET /v1/search. " +
      "1 credit per page, including empty pages. " +
      "Returns id + name hits only. Never invent download estimates. " +
      MCP_SKILL,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["store", "q"],
      properties: {
        store: {
          type: "string",
          enum: ["ios", "play"],
          description: "ios (App Store) or play (Google Play)",
        },
        q: {
          type: "string",
          description: "Keyword query",
        },
        country: {
          type: "string",
          enum: ["US", "GB"],
          description: "US (default) or GB",
        },
        page: {
          type: "integer",
          minimum: 1,
          description: "1-based search page (default 1)",
        },
      },
    },
  },
];

export function isMcpToolName(name: string): name is McpToolName {
  return (MCP_TOOL_NAMES as readonly string[]).includes(name);
}

/** Dispatch an MCP tool to core/* only. */
export async function callMcpTool(
  input: CallMcpToolInput,
): Promise<McpToolOutcome> {
  const requestId = input.requestId ?? newRequestId();
  if (!isMcpToolName(input.name)) {
    return fail(
      "invalid_request",
      requestId,
      `Unknown MCP tool '${input.name}'.`,
    );
  }
  switch (input.name) {
    case GET_APP_TOOL:
      return withChargedTool(input, requestId, APP_PATH, () =>
        getApp({
          store: readStringArg(input.args, "store"),
          id: readStringArg(input.args, "id"),
          country: readStringArg(input.args, "country"),
        }),
      );
    case LIST_REVIEWS_TOOL:
      return withChargedTool(input, requestId, APP_REVIEWS_PATH, () =>
        listReviews({
          store: readStringArg(input.args, "store"),
          id: readStringArg(input.args, "id"),
          country: readStringArg(input.args, "country"),
          page: readPageArg(input.args, "page"),
        }),
      );
    case KEYWORD_SEARCH_TOOL:
      return withChargedTool(input, requestId, SEARCH_PATH, () =>
        searchApps({
          store: readStringArg(input.args, "store"),
          country: readStringArg(input.args, "country"),
          q: readStringArg(input.args, "q"),
          page: readPageArg(input.args, "page"),
        }),
      );
  }
}

async function withChargedTool<T>(
  input: CallMcpToolInput,
  requestId: string,
  route: string,
  load: () => Promise<T>,
): Promise<McpToolOutcome> {
  if (input.key.credits < 1) {
    return fail("payment_required", requestId, "Not enough credits.");
  }
  const started = Date.now();
  try {
    const data = await load();
    const charged = tryChargeOrPaymentRequired(input.db, input.key, 1, route);
    if (!charged.ok) {
      return fail("payment_required", requestId, "Not enough credits.");
    }
    return {
      data,
      meta: {
        cached: false,
        creditsCharged: 1,
        requestId,
        upstreamMs: Date.now() - started,
      },
    };
  } catch (err) {
    if (err instanceof StoreApiError) {
      return fail(err.code, requestId, err.message);
    }
    throw err;
  }
}

function fail(code: ErrorCode, requestId: string, message: string): Err {
  return {
    error: { code, message, retryable: isRetryable(code) },
    meta: { creditsCharged: 0, requestId },
  };
}

function readStringArg(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function readPageArg(
  args: Record<string, unknown>,
  key: string,
): string | number | undefined {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}
