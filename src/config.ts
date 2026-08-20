export const DEFAULT_PORT = 3000;
export const DEFAULT_DATABASE_PATH = "./data/storeapi.sqlite";
export const DEFAULT_FREE_CREDITS = 100;
export const DEFAULT_FREE_RPM = 30;

export type AppConfig = {
  port: number;
  databasePath: string;
  bootstrapKey: string | undefined;
  nodeEnv: string;
  liveStores: boolean;
};

function truthyFlag(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/** Live iTunes / Play. Off by default. STOREAPI_FIXTURE_ONLY wins. */
export function liveStoresEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (truthyFlag(env.STOREAPI_FIXTURE_ONLY)) {
    return false;
  }
  return truthyFlag(env.STOREAPI_LIVE_STORES);
}

export function parseListenPort(value = process.env.PORT): number {
  if (value === undefined || value === "") {
    return DEFAULT_PORT;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer 1-65535, got ${JSON.stringify(value)}`);
  }
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const databasePath = env.STOREAPI_DATABASE;
  if ((databasePath === undefined || databasePath === "") && nodeEnv === "production") {
    throw new Error("STOREAPI_DATABASE is required in production");
  }
  const bootstrapKey = env.STOREAPI_BOOTSTRAP_KEY;
  return {
    port: parseListenPort(env.PORT),
    databasePath:
      databasePath !== undefined && databasePath !== ""
        ? databasePath
        : DEFAULT_DATABASE_PATH,
    bootstrapKey:
      bootstrapKey !== undefined && bootstrapKey !== "" ? bootstrapKey : undefined,
    nodeEnv,
    liveStores: liveStoresEnabled(env),
  };
}
