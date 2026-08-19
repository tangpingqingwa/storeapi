import type { Key } from "../billing/keys.js";
import type { StoreApiDb } from "../db.js";

declare module "fastify" {
  interface FastifyInstance {
    db: StoreApiDb;
  }

  interface FastifyRequest {
    apiKey?: Key;
  }
}

export {};
