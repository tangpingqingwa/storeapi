export const DEFAULT_PORT = 3000;
export const DEFAULT_DATABASE_PATH = "./data/storeapi.sqlite";
export const DEFAULT_FREE_CREDITS = 100;
export const DEFAULT_FREE_RPM = 30;

export type AppConfig = {
  port: number;
  databasePath: string;
  bootstrapKey: string | undefined;
  nodeEnv: string;
};

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
  };
}
