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
    const al =
      (Array.isArray(req.headers["accept-language"])
        ? req.headers["accept-language"][0]
        : req.headers["accept-language"]) ?? "";
    const ua =
      (Array.isArray(req.headers["user-agent"])
        ? req.headers["user-agent"][0]
        : req.headers["user-agent"]) ?? "";
    const ref =
      (Array.isArray(req.headers["referer"])
        ? req.headers["referer"][0]
        : req.headers["referer"]) ?? "";
    const log = getLogger().child({
      requestId: reqId,
      method: req.method,
      url: req.url,
      // Normalize to ELS schema limits (language ≤ 20 → first tag,
      // userAgent ≤ 1000, referrer ≤ 2000) to avoid 400 rejections.
      userAgent: ua.slice(0, 1000) || undefined,
      referrer: ref.slice(0, 2000) || undefined,
      language: al.split(",")[0]?.trim().slice(0, 20) || undefined,
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
