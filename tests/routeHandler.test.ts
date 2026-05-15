import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createELSLogger,
  withELSRouteLogger,
  _resetLoggerForTests,
} from "../src/index";

function mkResponse(status = 201) {
  return {
    ok: status < 400,
    status,
    headers: { get: () => null } as any,
    json: async () => ({ id: "mock" }),
    text: async () => "{}",
  };
}

describe("withELSRouteLogger", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetLoggerForTests();
    fetchMock = vi.fn().mockResolvedValue(mkResponse());
    vi.stubGlobal("fetch", fetchMock);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createELSLogger({
      endpoint: "https://example.test",
      apiKey: "test-key",
      appSlug: "test-app",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
    _resetLoggerForTests();
  });

  function mkRequest(url: string, headers: Record<string, string> = {}) {
    return new Request(url, { headers, method: "GET" });
  }

  it("calls handler with log and reqId, sets x-request-id", async () => {
    const handler = withELSRouteLogger(async (_req, ctx) => {
      expect(typeof ctx.log.info).toBe("function");
      expect(ctx.reqId).toBeTruthy();
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const res = await handler(mkRequest("https://test.local/api/x"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("uses incoming x-request-id header", async () => {
    const handler = withELSRouteLogger(async (_req, ctx) => {
      expect(ctx.reqId).toBe("from-client");
      return new Response("ok", { status: 200 });
    });
    const res = await handler(
      mkRequest("https://test.local/api/x", { "x-request-id": "from-client" }),
    );
    expect(res.headers.get("x-request-id")).toBe("from-client");
  });

  it("logs success with info level", async () => {
    const handler = withELSRouteLogger(async () =>
      new Response("ok", { status: 200 }),
    );
    await handler(mkRequest("https://test.local/api/users"));
    await new Promise((r) => setTimeout(r, 30));
    const calls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith("/errors"),
    );
    expect(calls.length).toBeGreaterThan(0);
    const body = JSON.parse((calls[0][1] as any).body);
    expect(body.level).toBe("info");
    expect(body.status).toBe(200);
  });

  it("catches throw and returns 500 with requestId", async () => {
    const handler = withELSRouteLogger(async () => {
      throw new Error("kaboom");
    });
    const res = await handler(mkRequest("https://test.local/api/bad"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal Server Error");
    expect(body.requestId).toBeTruthy();
    await new Promise((r) => setTimeout(r, 30));
    const calls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith("/errors"),
    );
    const errorCall = calls.find((c) => {
      const b = JSON.parse((c[1] as any).body);
      return b.level === "error";
    });
    expect(errorCall).toBeDefined();
  });
});
