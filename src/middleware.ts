/**
 * Helper для Next.js middleware.ts — генерирует request id и
 * прокидывает его в `x-request-id` заголовок.
 *
 * Не зависит от `next/server` (для совместимости с edge runtime).
 *
 * @example
 * // middleware.ts
 * import { withELSMiddleware } from '@inso_web/els-next/middleware';
 *
 * export const middleware = withELSMiddleware();
 *
 * // или с кастомной логикой:
 * export const middleware = withELSMiddleware(async (req) => {
 *   if (req.nextUrl.pathname.startsWith('/admin')) {
 *     return NextResponse.redirect(new URL('/login', req.url));
 *   }
 * });
 */

function genReqId(): string {
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type ResponseLike = { headers: { set: (name: string, value: string) => void } };

export function withELSMiddleware<TReq extends { headers: Headers }>(
  next?: (req: TReq) => Promise<ResponseLike | undefined> | ResponseLike | undefined,
) {
  return async (req: TReq): Promise<any> => {
    const reqId = req.headers.get("x-request-id") || genReqId();
    let res: any;
    if (next) {
      res = await next(req);
    }
    if (!res) {
      // Динамически импортируем чтобы не падать в edge runtime если next не доступен
      const mod = await import("next/server").catch(() => null);
      if (mod && mod.NextResponse) {
        res = mod.NextResponse.next();
      }
    }
    if (res && res.headers && typeof res.headers.set === "function") {
      res.headers.set("x-request-id", reqId);
    }
    return res;
  };
}
