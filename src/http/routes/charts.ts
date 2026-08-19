import type { FastifyPluginAsync } from "fastify";
import { listCharts } from "../../core/charts.js";
import { requireAuth } from "../auth.js";
import { withChargedResult } from "../charged.js";

export const CHARTS_PATH = "/v1/charts" as const;

type ChartsQuery = {
  store?: string;
  country?: string;
  kind?: string;
  category?: string;
  page?: string;
};

export const chartsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: ChartsQuery }>(
    CHARTS_PATH,
    { preHandler: requireAuth },
    async (request, reply) => {
      return withChargedResult(request, reply, CHARTS_PATH, () =>
        listCharts({
          store: request.query.store,
          country: request.query.country,
          kind: request.query.kind,
          category: request.query.category,
          page: request.query.page,
        }),
      );
    },
  );
};
