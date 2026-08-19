import type { FastifyPluginAsync } from "fastify";
import { searchApps } from "../../core/search.js";
import { requireAuth } from "../auth.js";
import { withChargedResult } from "../charged.js";

export const SEARCH_PATH = "/v1/search" as const;

type SearchQuery = {
  store?: string;
  country?: string;
  q?: string;
  page?: string;
};

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: SearchQuery }>(
    SEARCH_PATH,
    { preHandler: requireAuth },
    async (request, reply) => {
      return withChargedResult(request, reply, SEARCH_PATH, () =>
        searchApps({
          store: request.query.store,
          country: request.query.country,
          q: request.query.q,
          page: request.query.page,
        }),
      );
    },
  );
};
