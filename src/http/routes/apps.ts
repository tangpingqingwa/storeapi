import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { tryChargeOrPaymentRequired } from "../../billing/charge.js";
import { getApp } from "../../core/apps.js";
import { StoreApiError } from "../../core/errors.js";
import { listReviews } from "../../core/reviews.js";
import { requireAuth } from "../auth.js";
import { sendErr, sendOk } from "../envelope.js";

export const APP_PATH = "/v1/apps/:store/:id" as const;
export const APP_REVIEWS_PATH = "/v1/apps/:store/:id/reviews" as const;

type AppParams = { store: string; id: string };
type AppQuery = { country?: string; page?: string };

async function withChargedResult<T>(
  request: FastifyRequest<{ Params: AppParams; Querystring: AppQuery }>,
  reply: FastifyReply,
  route: string,
  load: () => Promise<T>,
): Promise<FastifyReply> {
  const key = request.apiKey;
  if (key === undefined) {
    return sendErr(reply, "internal", "Authenticated route missing key.");
  }
  if (key.credits < 1) {
    return sendErr(reply, "payment_required", "Not enough credits.");
  }
  const started = Date.now();
  try {
    const data = await load();
    const charged = tryChargeOrPaymentRequired(request.server.db, key, 1, route);
    if (!charged.ok) {
      return sendErr(reply, "payment_required", "Not enough credits.");
    }
    request.apiKey = charged.key;
    return sendOk(reply, data, {
      cached: false,
      creditsCharged: 1,
      upstreamMs: Date.now() - started,
    });
  } catch (err) {
    if (err instanceof StoreApiError) {
      return sendErr(reply, err.code, err.message);
    }
    throw err;
  }
}

export const appsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: AppParams; Querystring: AppQuery }>(
    APP_REVIEWS_PATH,
    { preHandler: requireAuth },
    async (request, reply) => {
      return withChargedResult(request, reply, APP_REVIEWS_PATH, () =>
        listReviews({
          store: request.params.store,
          id: request.params.id,
          country: request.query.country,
          page: request.query.page,
        }),
      );
    },
  );

  app.get<{ Params: AppParams; Querystring: AppQuery }>(
    APP_PATH,
    { preHandler: requireAuth },
    async (request, reply) => {
      return withChargedResult(request, reply, APP_PATH, () =>
        getApp({
          store: request.params.store,
          id: request.params.id,
          country: request.query.country,
        }),
      );
    },
  );
};
