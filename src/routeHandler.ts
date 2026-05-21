import type { Logger } from "@inso_web/els-client";
import { getLogger } from "./createLogger.js";

function genReqId(): string {
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Second argument passed to a handler wrapped by {@link withELSRouteLogger}. */
export interface ELSRouteContext {
  /** Request-scoped child logger (bound with requestId/method/url + UA/referrer/language). */
  log: Logger;
  /** The resolved request id (incoming `x-request-id` or generated). */
  reqId: string;
}

type AppRouteHandler = (
  req: Request,
  ctx: ELSRouteContext,
) => Promise<Response> | Response;

/**
 * Wraps a Next.js App Router route handler (`route.ts`). Passes a second
 * argument `{ log, reqId }`, auto-logs the finished request at the right level,
 * sets `x-request-id` on the response, and reports unhandled errors.
 *
 * @example
 * // app/api/users/[id]/route.ts
 * import { withELSRouteLogger } from '@inso_web/els-next';
 * import { NextResponse } from 'next/server';
 *
 * export const GET = withELSRouteLogger(async (req, { log }) => {
 *   log.info('Fetching user');
 *   return NextResponse.json({ ok: true });
 * });
 */
export function withELSRouteLogger(
  handler: AppRouteHandler,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const reqId = req.headers.get("x-request-id") || genReqId();
    const al = req.headers.get("accept-language") ?? "";
    const log = getLogger().child({
      requestId: reqId,
      method: req.method,
      url: req.url,
      // Auto-extract request context — these keys map to ErrorEntry fields.
      // Normalize to the ELS schema limits (language ≤ 20 → first tag,
      // userAgent ≤ 1000, referrer ≤ 2000) so a raw header never gets the
      // whole entry rejected with a 400.
      userAgent: (req.headers.get("user-agent") ?? "").slice(0, 1000) || undefined,
      referrer: (req.headers.get("referer") ?? "").slice(0, 2000) || undefined,
      language: al.split(",")[0]?.trim().slice(0, 20) || undefined,
    });
    const start = Date.now();
    try {
      const res = await handler(req, { log, reqId });
      try {
        res.headers.set("x-request-id", reqId);
      } catch {
        /* immutable headers in some Response types */
      }
      const status = res.status;
      const level: "error" | "warn" | "info" =
        status >= 500 ? "error" : status >= 400 ? "warn" : "info";
      const fn = log[level].bind(log);
      fn(
        { status, duration: Date.now() - start },
        `${req.method} ${req.url} → ${status}`,
      );
      return res;
    } catch (err) {
      log.error(err as Error, `Unhandled error in ${req.method} ${req.url}`);
      return new Response(
        JSON.stringify({ error: "Internal Server Error", requestId: reqId }),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "x-request-id": reqId,
          },
        },
      );
    }
  };
}
