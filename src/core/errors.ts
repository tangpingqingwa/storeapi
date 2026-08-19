import type { ErrorCode } from "../types.js";

/** Domain error with a SPEC error code. HTTP maps this via the envelope. */
export class StoreApiError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "StoreApiError";
    this.code = code;
  }
}
