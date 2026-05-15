# @inso_web/els-next

[![npm version](https://img.shields.io/npm/v/@inso_web/els-next.svg)](https://www.npmjs.com/package/@inso_web/els-next)
[![npm downloads](https://img.shields.io/npm/dm/@inso_web/els-next.svg)](https://www.npmjs.com/package/@inso_web/els-next)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![license MIT](https://img.shields.io/npm/l/@inso_web/els-next.svg)](./LICENSE)

Next.js helpers for the **Inso Error Logs Service (ELS)** — a managed SaaS for centralised error and event logging with AI-assisted triage. Works in API Routes (App + Pages Router), `middleware.ts`, edge runtime, server actions, and the client bundle.

> 🇷🇺 [Русская версия → README_RU.md](README_RU.md) &nbsp;•&nbsp; 📚 [SDKs overview → ../README.md](../README.md)

---

## Table of contents

- [What you get](#what-you-get)
- [Install](#install)
- [Quick Start](#quick-start)
  - [App Router](#1-app-router-recommended)
  - [Pages Router](#2-pages-router)
  - [Client components](#3-client-components)
  - [Edge runtime](#4-edge-runtime)
- [When to use what](#when-to-use-what)
- [Core concepts](#core-concepts)
- [Configuration](#configuration)
- [Migration](#migration)
  - [From console.log + global error boundary](#from-consolelog--global-error-boundary)
  - [From @sentry/nextjs](#from-sentrynextjs)
- [Versioning](#versioning)
- [Quick reference](#quick-reference)
- [Why ELS](#why-els)
- [API](#api)
- [FAQ](#faq)
- [Other ELS SDKs](#other-els-sdks)
- [Pricing](#pricing)
- [License](#license)

---

## What you get

A built-in dashboard with full-text search, faceted filtering, AI-assisted diagnosis, and a regressions-by-version widget — for both server (API routes, middleware, RSC) and client events.

![ELS dashboard preview](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/01-error-logs-list.png)

→ **[Full UI tour with all 4 screenshots](../README.md#what-you-get)**

---

## Install

```bash
npm install @inso_web/els-client @inso_web/els-next
```

`@inso_web/els-client` is a peer dependency.

**Requirements:** Next.js 13+ (App Router) or Next.js 12+ (Pages Router), Node.js 18+.

---

## Quick Start

### 0. Create the logger

`lib/logger.ts` — one module to import from everywhere:

```ts
import { createELSLogger } from '@inso_web/els-next';

export const log = createELSLogger({
  endpoint: process.env.NEXT_PUBLIC_ELS_URL!,
  apiKey: process.env.NEXT_PUBLIC_ELS_API_KEY ?? '',
  appSlug: 'my-nextjs-app',
  serviceName: 'web',
  deploymentEnv: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEV',
  appVersion: process.env.NEXT_PUBLIC_BUILD_VERSION,
  minLevel: 'info',
});
```

Don't have an API key yet? **[Sign up at lk.insoweb.ru](https://lk.insoweb.ru)** — takes under a minute.

### 1. App Router (recommended)

`app/api/users/[id]/route.ts`:

```ts
import { log } from '@/lib/logger';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  log.info({ userId: params.id }, 'Fetching user');
  try {
    const user = await db.user.findUnique({ where: { id: params.id } });
    return Response.json(user);
  } catch (err) {
    log.error(err as Error, 'User fetch failed');
    return new Response('Internal error', { status: 500 });
  }
}
```

Global error boundary — `app/global-error.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import { log } from '@/lib/logger';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { log.error(error, 'global-error boundary'); }, [error]);
  return (
    <html><body>
      <p>Something went wrong</p>
      <button onClick={() => reset()}>Try again</button>
    </body></html>
  );
}
```

### 2. Pages Router

`pages/api/users/[id].ts`:

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { log } from '@/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await db.user.findUnique({ where: { id: String(req.query.id) } });
    res.json(user);
  } catch (err) {
    log.error(err as Error, 'User fetch failed');
    res.status(500).end('Internal error');
  }
}
```

Custom error page — `pages/_error.tsx`:

```tsx
import { log } from '@/lib/logger';

function ErrorPage({ statusCode, err }: { statusCode: number; err?: Error }) {
  if (err) log.error(err, `_error ${statusCode}`);
  return <p>Status: {statusCode}</p>;
}
ErrorPage.getInitialProps = ({ res, err }: any) => ({
  statusCode: res?.statusCode ?? err?.statusCode ?? 404,
  err,
});
export default ErrorPage;
```

### 3. Client components

```tsx
'use client';
import { log } from '@/lib/logger';

export function CheckoutButton() {
  const onClick = async () => {
    try {
      await fetch('/api/checkout', { method: 'POST' });
    } catch (err) {
      log.error(err as Error, 'Checkout failed');
    }
  };
  return <button onClick={onClick}>Pay</button>;
}
```

Global browser handlers — drop into `app/layout.tsx` or a small `ErrorReporter` component:

```tsx
'use client';
import { useEffect } from 'react';
import { log } from '@/lib/logger';

export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => log.error(e.error ?? e.message);
    const onReject = (e: PromiseRejectionEvent) => log.error(e.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onReject);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onReject);
    };
  }, []);
  return null;
}
```

### 4. Edge runtime

```ts
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { log } from '@/lib/logger';

export const config = { matcher: '/api/:path*' };

export function middleware(req: NextRequest) {
  log.info({ url: req.nextUrl.pathname }, 'Edge request');
  return NextResponse.next();
}
```

The logger uses only the global `fetch` — fully edge-compatible.

---

## When to use what

| Scenario | Use |
|---|---|
| API route in App Router | `import { log }` + `log.info(...)`, `log.error(...)` |
| Server Component fetch failure | `log.error(err, 'rsc-fetch')` in `try/catch` |
| Client component handler | `'use client'` + same `log` |
| Middleware / edge | Same `log` — only `fetch` is used |
| Global render-crash | `app/global-error.tsx` boundary (App Router) |
| Pages Router 4xx/5xx | `pages/_error.tsx` |

There is **one** logger surface across runtimes. Bundle splitter decides server vs client automatically — you don't.

---

## Core concepts

### One logger, two runtimes

`createELSLogger(...)` is safe to import from both server and client code. On the server it ships directly. In the browser it ships via `fetch` too — your `apiKey` is still an ELS *scoped* key (write-only for one app), so it's fine to expose in the bundle just like Sentry's public DSN.

### Fire-and-forget

`log.error(...)` never throws and never blocks. Transport errors land in `console.error` (visible in server logs / browser devtools).

### Bindings & child loggers

```ts
const reqLog = log.child({ requestId: crypto.randomUUID(), userId: '42' });
reqLog.info('processing checkout');
```

Use bindings to carry per-request context through async boundaries.

---

## Configuration

`ELSConfig` matches the base client — see [@inso_web/els-client](../js/README.md). The most relevant fields:

| Option | Description |
|---|---|
| `endpoint` | ELS URL (required) |
| `apiKey` | API key (required) |
| `appSlug` | App slug (required) |
| `serviceName` | Module / service name |
| `deploymentEnv` | `DEV` / `STAGING` / `PRODUCTION` |
| `appVersion` | Version string (any format, ≤128 chars) |
| `minLevel` | Minimum level to send |

---

## Migration

### From `console.log` + global error boundary

**Before — server (Pages Router):**

```ts
// pages/api/users/[id].ts
export default function handler(req, res) {
  try {
    // ...
  } catch (err) {
    console.error('user fetch failed', err);
    res.status(500).end();
  }
}
```

**Before — client:**

```tsx
'use client';
useEffect(() => {
  const onError = (e: ErrorEvent) => console.error('window.error', e.error);
  window.addEventListener('error', onError);
  return () => window.removeEventListener('error', onError);
}, []);
```

**After — single logger across both:**

```ts
// lib/logger.ts
import { createELSLogger } from '@inso_web/els-next';
export const log = createELSLogger({ endpoint, apiKey, appSlug: 'my-app' });
```

```ts
// pages/api/users/[id].ts
import { log } from '@/lib/logger';
export default function handler(req, res) {
  try { /* ... */ }
  catch (err) {
    log.error(err as Error, 'user fetch failed');
    res.status(500).end();
  }
}
```

```tsx
'use client';
import { log } from '@/lib/logger';
useEffect(() => {
  const onError = (e: ErrorEvent) => log.error(e.error ?? e.message);
  window.addEventListener('error', onError);
  return () => window.removeEventListener('error', onError);
}, []);
```

| `console` method | ELS method | Notes |
|---|---|---|
| `console.log` / `info` | `log.info` | |
| `console.warn` | `log.warn` | |
| `console.error` | `log.error` | First arg can be `Error` or `string` |

**Gotchas:**

- `console.*` keeps writing to stdout / devtools. Leave it for local dev; ELS only carries remote-worthy events.
- Variadic `printf`-style formatting is not supported — pass structured fields instead.

---

### From @sentry/nextjs

**Before:**

```ts
// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_BUILD_VERSION,
});

// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
});

// api/users/[id]/route.ts
export async function GET() {
  try { /* ... */ }
  catch (err) {
    Sentry.captureException(err);
    return new Response('500', { status: 500 });
  }
}
```

**After:**

```ts
// lib/logger.ts — single config for client + server
import { createELSLogger } from '@inso_web/els-next';
export const log = createELSLogger({
  endpoint: process.env.NEXT_PUBLIC_ELS_URL!,
  apiKey: process.env.NEXT_PUBLIC_ELS_API_KEY!,
  appSlug: 'my-app',
  deploymentEnv: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEV',
  appVersion: process.env.NEXT_PUBLIC_BUILD_VERSION,
});

// api/users/[id]/route.ts
import { log } from '@/lib/logger';
export async function GET() {
  try { /* ... */ }
  catch (err) {
    log.error(err as Error, 'user fetch failed');
    return new Response('500', { status: 500 });
  }
}
```

| Sentry concept | ELS equivalent | Notes |
|---|---|---|
| `sentry.{server,client,edge}.config.ts` | One `lib/logger.ts` | No runtime-specific configs |
| `dsn` | `endpoint` + `apiKey` + `appSlug` | Three explicit fields |
| `captureException(err)` | `log.error(err)` | |
| `captureMessage(msg, level)` | `log.<level>(msg)` | |
| `release` | `appVersion` | Same field, any string ≤128 chars |
| `environment` | `deploymentEnv` | Fixed enum |
| Source maps upload | Not provided | Pair with another tool if critical |
| `withSentryConfig(...)` wrapper | Not needed | No build-time wrapper |

**Gotchas:**

- Sentry's Next plugin instruments build artefacts (sourcemap upload, tunnel route). ELS does neither — drop `withSentryConfig` and remove `sentry-cli`.
- For App Router's automatic error boundaries Sentry registers an integration; ELS uses the standard `app/global-error.tsx` pattern (shown above).
- Tracing / performance is out of scope — keep Sentry Performance alongside if you depend on it.

---

## Versioning

Next.js inlines `NEXT_PUBLIC_*` variables at build time. Pass through Dockerfile:

```Dockerfile
ARG NEXT_PUBLIC_BUILD_VERSION=dev
ENV NEXT_PUBLIC_BUILD_VERSION=$NEXT_PUBLIC_BUILD_VERSION
RUN npm run build
```

```yaml
# .gitlab-ci.yml
- export BUILD_VERSION=$(date -u +%Y%m%d%H%M%S)
- docker build --build-arg NEXT_PUBLIC_BUILD_VERSION="$BUILD_VERSION" ...
```

```ts
createELSLogger({ ..., appVersion: process.env.NEXT_PUBLIC_BUILD_VERSION });
```

ELS accepts any string ≤128 chars: semver, CalVer, date-compact, git SHA, opaque. The server auto-detects the format and sorts timelines.

---

## Quick reference

| Need | Use |
|---|---|
| API route logging | `import { log }` + `log.info(...)` |
| Server Component error | `log.error(err)` inside `try/catch` |
| Client error reporter | `useEffect` with `window.error` handler |
| Edge middleware | Same `log` (only `fetch` used) |
| Global render-crash | `app/global-error.tsx` |
| Pages-Router 4xx/5xx | `pages/_error.tsx` |
| Hide key from client bundle | Use server-only env vars + an internal `/api/log` proxy |
| Suppress noisy levels | `minLevel: 'warn'` |

---

## Why ELS

ELS for Node.js is a focused logging SaaS, not a full observability suite. It optimises for capture speed, AI-driven triage, and a low integration cost.

- **Lower weight.** No transitive deps, no build-time plugins.
- **Zero external API calls.** Only `POST /errors[/batch]` and `GET /health`.
- **AI-assisted diagnosis** on every stack trace.
- **5-minute integration.** One `lib/logger.ts` covers server, client, and edge.
- **Predictable price.** Tariffs live in the dashboard.

| Feature | ELS | Sentry | Datadog | Loki | LogRocket |
|---|---|---|---|---|---|
| AI on stack traces | Built-in | Paid add-on | Paid add-on | None | None |
| Zero-dep SDK | Yes | No | No | No | No |
| Free tier retention | 24h | 30d (limited) | Trial only | Self-cost | 3–30d |
| Setup time | ~5 min | 10–20 min | 30–60 min | Hours | 10–20 min |

ELS does **not** ship full APM / tracing, source-map upload, session replay, frontend RUM, or infra metrics. If any of those is critical — pair ELS with Grafana / Datadog or stay on Sentry.

→ **Sign up at [lk.insoweb.ru](https://lk.insoweb.ru)** to grab an API key.

---

## API

```ts
function createELSLogger(config: ELSConfig): Logger;
```

`ELSConfig` matches the base client — see [@inso_web/els-client](../js/README.md). `Logger` methods: `fatal` / `error` / `warn` / `info` / `debug` / `trace` / `child` / `flush`.

---

## FAQ

**Is the API key safe in the client bundle?** Yes. ELS keys are scoped — a `write` key for your app cannot read events. The same model Sentry uses for public DSNs. If you still want to hide it, run an internal `/api/log` proxy and only log from API routes.

**What if the API key is empty?** The SDK does not throw — it returns a no-op logger. Useful for `preview` deployments without keys yet.

**Does it work in edge runtimes?** Yes. The transport is plain `fetch` — no Node APIs.

**Does `withSentryConfig` need replacement?** No build-time wrapper is needed. Just import and use.

---

## Other ELS SDKs

Same wire format, same dashboard — pick by stack.

**Node.js family**
- [`@inso_web/els-client`](../js/README.md) — base TS / Node / browser client
- [`@inso_web/els-express`](../express/README.md) — Express middleware
- [`@inso_web/els-next`](../next/README.md) — Next.js helpers (this package)
- [`@inso_web/els-nest`](../nest/README.md) — NestJS module
- [`@inso_web/els-react`](../react/README.md) — React Provider, hooks, ErrorBoundary
- [`@inso_web/els-vue`](../vue/README.md) — Vue 3 plugin

**Other stacks**
- [`Inso.Els`](../csharp/README.md) — .NET (Core + ASP.NET Core + ILogger)
- [`io.github.official-inso:els-core`](../java/README.md) — Java + Spring Boot starter + SLF4J
- [`github.com/official-inso/els-go`](../els-go/README.md) — Go

→ **Full overview & comparison:** [../README.md](../README.md) · [github.com/official-inso/els-go/blob/main/sdks/README.md](https://github.com/official-inso/els-go/blob/main/sdks/README.md)

---

## Pricing

Free tier — **24-hour log retention**. See **[lk.insoweb.ru](https://lk.insoweb.ru)** for the full tariff matrix.

---

## License

[MIT](./LICENSE) © INSOWEB
