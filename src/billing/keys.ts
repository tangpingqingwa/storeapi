import { createHash, randomUUID } from "node:crypto";
import { DEFAULT_FREE_CREDITS, DEFAULT_FREE_RPM } from "../config.js";
import type { StoreApiDb } from "../db.js";
import type { KeyPrefix } from "../types.js";

export { DEFAULT_FREE_CREDITS, DEFAULT_FREE_RPM };

export type Key = {
  id: string;
  prefix: KeyPrefix;
  plan: string;
  credits: number;
  rpm: number;
  createdAt: string;
};

type KeyRow = {
  id: string;
  prefix: KeyPrefix;
  plan: string;
  credits: number;
  rpm: number;
  created_at: string;
};

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function prefixFromSecret(secret: string): KeyPrefix | null {
  if (secret.startsWith("st_test_") && secret.length > "st_test_".length) {
    return "st_test";
  }
  if (secret.startsWith("st_live_") && secret.length > "st_live_".length) {
    return "st_live";
  }
  return null;
}

export function createKey(
  db: StoreApiDb,
  input: {
    secret: string;
    plan?: string;
    credits?: number;
    rpm?: number;
    id?: string;
  },
): Key {
  const prefix = prefixFromSecret(input.secret);
  if (prefix === null) {
    throw new Error("API key must start with st_live_ or st_test_");
  }
  const key: Key = {
    id: input.id ?? `key_${randomUUID()}`,
    prefix,
    plan: input.plan ?? "free",
    credits: input.credits ?? DEFAULT_FREE_CREDITS,
    rpm: input.rpm ?? DEFAULT_FREE_RPM,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO keys (id, prefix, hash, plan, credits, rpm, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    key.id,
    key.prefix,
    hashSecret(input.secret),
    key.plan,
    key.credits,
    key.rpm,
    key.createdAt,
  );
  return key;
}

export function lookupKey(db: StoreApiDb, secret: string): Key | null {
  if (prefixFromSecret(secret) === null) {
    return null;
  }
  const row = db
    .prepare<[string], KeyRow>(
      `SELECT id, prefix, plan, credits, rpm, created_at
       FROM keys WHERE hash = ?`,
    )
    .get(hashSecret(secret));
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    prefix: row.prefix,
    plan: row.plan,
    credits: row.credits,
    rpm: row.rpm,
    createdAt: row.created_at,
  };
}

export function bootstrapKeyIfEmpty(db: StoreApiDb, secret: string): Key | null {
  const count = db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM keys").get();
  if (count === undefined) {
    throw new Error("failed to count API keys");
  }
  if (count.n > 0) {
    return lookupKey(db, secret);
  }
  return createKey(db, { secret });
}
