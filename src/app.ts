import Fastify, { type FastifyInstance } from "fastify";
import { bootstrapKeyIfEmpty } from "./billing/keys.js";
import { openDatabase, type StoreApiDb } from "./db.js";
import { appsRoutes } from "./http/routes/apps.js";
import { chartsRoutes } from "./http/routes/charts.js";
import { healthRoutes } from "./http/routes/health.js";
import { meRoutes } from "./http/routes/me.js";
import { searchRoutes } from "./http/routes/search.js";

export type BuildAppOptions = {
  logger?: boolean;
  db?: StoreApiDb;
  databasePath?: string;
  bootstrapKey?: string;
};

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const ownsDb = options.db === undefined;
  const db = options.db ?? openDatabase(options.databasePath ?? ":memory:");
  if (options.bootstrapKey !== undefined) {
    bootstrapKeyIfEmpty(db, options.bootstrapKey);
  }
  app.decorate("db", db);
  app.decorateRequest("apiKey", undefined);
  if (ownsDb) {
    app.addHook("onClose", async (instance) => {
      instance.db.close();
    });
  }
  await app.register(healthRoutes);
  await app.register(meRoutes);
  await app.register(appsRoutes);
  await app.register(chartsRoutes);
  await app.register(searchRoutes);
  return app;
}
