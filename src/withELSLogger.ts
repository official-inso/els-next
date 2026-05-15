import type { NextApiRequest, NextApiResponse, NextApiHandler } from "next";
import type { Logger } from "@inso_web/els-client";
import { getLogger } from "./createLogger.js";

export interface NextApiRequestWithLogger extends NextApiRequest {
  log: Logger;
  id: string;
}

function genReqId(): string {
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  // Fallback для старых runtime
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * HOC для Next.js Pages Router API routes.
 *
 * Оборачивает handler — добавляет `req.log` (child logger с requestId, method, url)
 * и `req.id`. После завершения handler'а автоматически логирует с правильным level
 * (info для 2xx/3xx, warn для 4xx, error для 5xx).
 *
 * @example
 * // pages/api/users/[id].ts
 * import { withELSLogger, type NextApiRequestWithLogger } from '@inso_web/els-next';
 * import type { NextApiResponse } from 'next';
 *
 * export default withELSLogger(async (req: NextApiRequestWithLogger, res: NextApiResponse) => {
 *   req.log.info({ id: req.query.id }, 'Fetching user');
 *   res.json({ ok: true });
 * });
 */
export function withELSLogger(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const incoming = req.headers["x-request-id"];
    const reqId =
      (typeof incoming === "string" && incoming) || genReqId();
    const log = getLogger().child({
      requestId: reqId,
      method: req.method,
      url: req.url,
    });
    (req as NextApiRequestWithLogger).log = log;
    (req as NextApiRequestWithLogger).id = reqId;
    res.setHeader("x-request-id", reqId);

    const start = Date.now();
    try {
      await handler(req, res);
      const duration = Date.now() - start;
      const status = res.statusCode;
      const level: "error" | "warn" | "info" =
        status >= 500 ? "error" : status >= 400 ? "warn" : "info";
      const fn = log[level].bind(log);
      fn({ status, duration }, `${req.method} ${req.url} → ${status} (${duration}ms)`);
    } catch (err) {
      log.error(err as Error, `Unhandled error in ${req.method} ${req.url}`);
      throw err;
    }
  };
}
