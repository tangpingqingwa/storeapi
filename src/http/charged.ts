import type { FastifyReply, FastifyRequest } from "fastify";
import { tryChargeOrPaymentRequired } from "../billing/charge.js";
import { StoreApiError } from "../core/errors.js";
import { sendErr, sendOk } from "./envelope.js";

export async function withChargedResult<T>(
  request: FastifyRequest,
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
