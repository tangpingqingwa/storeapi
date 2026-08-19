import type { FastifyPluginAsync } from "fastify";
import { getApp } from "../../core/apps.js";
import { listReviews } from "../../core/reviews.js";
import { requireAuth } from "../auth.js";
import { withChargedResult } from "../charged.js";

export const APP_PATH = "/v1/apps/:store/:id" as const;
export const APP_REVIEWS_PATH = "/v1/apps/:store/:id/reviews" as const;

type AppParams = { store: string; id: string };
type AppQuery = { country?: string; page?: string };

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
