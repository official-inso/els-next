import type { Logger } from "@inso_web/els-client";
import { getLogger } from "./createLogger.js";

function genReqId(): string {
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ELSRouteContext {
  log: Logger;
  reqId: string;
}

type AppRouteHandler = (
  req: Request,
  ctx: ELSRouteContext,
) => Promise<Response> | Response;

/**
 * Wrapper для Next.js App Router route handlers (`route.ts`).
 *
 * Передаёт второй аргумент `{ log, reqId }` в handler. После выполнения
 * автоматически логирует с правильным level и проставляет `x-request-id` в response.
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
    const log = getLogger().child({
      requestId: reqId,
      method: req.method,
      url: req.url,
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
