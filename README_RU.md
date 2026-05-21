# @inso_web/els-next

[![npm version](https://img.shields.io/npm/v/@inso_web/els-next.svg)](https://www.npmjs.com/package/@inso_web/els-next)
[![npm downloads](https://img.shields.io/npm/dm/@inso_web/els-next.svg)](https://www.npmjs.com/package/@inso_web/els-next)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![license MIT](https://img.shields.io/npm/l/@inso_web/els-next.svg)](./LICENSE)

Next.js helpers для **Inso Error Logs Service (ELS)** — управляемого SaaS централизованного сбора событий (от debug до fatal) с AI-диагностикой ошибок. Работает в API Routes (App + Pages Router), `middleware.ts`, edge runtime, server actions и в клиентском бандле.

> 🇬🇧 [English version → README.md](README.md)

---

## Содержание

- [Что вы получаете](#что-вы-получаете)
- [Установка](#установка)
- [Быстрый старт](#быстрый-старт)
  - [App Router](#1-app-router-рекомендуется)
  - [Pages Router](#2-pages-router)
  - [Клиентские компоненты](#3-клиентские-компоненты)
  - [Edge runtime](#4-edge-runtime)
- [Когда что использовать](#когда-что-использовать)
- [Ключевые концепции](#ключевые-концепции)
- [Конфигурация](#конфигурация)
- [Миграция](#миграция)
  - [С console.log + global error boundary](#с-consolelog--global-error-boundary)
  - [С @sentry/nextjs](#с-sentrynextjs)
- [Версионирование](#версионирование)
- [Quick reference](#quick-reference)
- [Почему ELS](#почему-els)
- [API](#api)
- [FAQ](#faq)
- [Другие ELS SDK](#другие-els-sdk)
- [Тарифы](#тарифы)
- [Лицензия](#лицензия)

---

## Что вы получаете

ELS из коробки даёт встроенную админ-панель. Каждое событие, отправленное этим SDK — серверные (API routes, middleware, RSC) и клиентские — попадает туда с полнотекстовым поиском, фасетной фильтрацией, AI-диагностикой и обнаружением регрессий по версиям.

| | |
|---|---|
| ![Список логов](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/01-error-logs-list.png) | ![Карточка события](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/02-event-detail-info.png) |
| Виртуальная таблица с фасетным сайдбаром (приложение, окружение, **версия**, источник, уровень, браузер, IP, категория). Live-режим обновляет данные каждые 5с. | Полные метаданные события: время, гео, окружение, **версия приложения**, fingerprint, session, карточки повторений, корреляция в рамках сессии. |
| ![AI-диагностика](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/03-error-detail-ai.png) | ![Аналитика](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/04-analytics-dashboard.png) |
| Распарсенный stack trace + AI-анализ: что сломалось, где, как чинить. | Timeline, donut'ы, топ URL/IP, тепловая карта по часам, **виджет регрессий по версиям**. |

---

## Установка

```bash
npm install @inso_web/els-client @inso_web/els-next
```

`@inso_web/els-client` — peer-зависимость.

**Требования:** Next.js 13+ (App Router) или Next.js 12+ (Pages Router), Node.js 18+.

---

## Быстрый старт

### 0. Создайте логгер

`lib/logger.ts` — один модуль для импорта отовсюду:

```ts
import { createELSLogger } from '@inso_web/els-next';

export const log = createELSLogger({
  apiKey: process.env.NEXT_PUBLIC_ELS_API_KEY ?? '',
  appSlug: 'my-nextjs-app',
  serviceName: 'web',
  deploymentEnv: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEV',
  appVersion: process.env.NEXT_PUBLIC_BUILD_VERSION,
  minLevel: 'info',
});
```

Ещё нет API-ключа? **[Зарегистрируйтесь на lk.insoweb.ru](https://lk.insoweb.ru)** — займёт минуту.

### 1. App Router (рекомендуется)

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

Глобальный error boundary — `app/global-error.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import { log } from '@/lib/logger';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { log.error(error, 'global-error boundary'); }, [error]);
  return (
    <html><body>
      <p>Что-то пошло не так</p>
      <button onClick={() => reset()}>Попробовать снова</button>
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

Кастомная страница ошибок — `pages/_error.tsx`:

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

### 3. Клиентские компоненты

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

Глобальные браузерные обработчики — в `app/layout.tsx` или отдельный `ErrorReporter`:

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

Логгер использует только глобальный `fetch` — полностью совместим с edge.

---

## Когда что использовать

| Сценарий | Что брать |
|---|---|
| API route в App Router | `import { log }` + `log.info(...)`, `log.error(...)` |
| Сбой fetch в Server Component | `log.error(err, 'rsc-fetch')` в `try/catch` |
| Хэндлер в client component | `'use client'` + тот же `log` |
| Middleware / edge | Тот же `log` — используется только `fetch` |
| Глобальный render-crash | `app/global-error.tsx` (App Router) |
| 4xx/5xx в Pages Router | `pages/_error.tsx` |

Поверхность логгера **одна** на все рантаймы. Bundler сам решает server vs client — вам не нужно.

---

## Ключевые концепции

### Один логгер, два рантайма

`createELSLogger(...)` безопасно импортируется и на сервере, и на клиенте. На сервере шлёт напрямую. В браузере — тоже через `fetch`; ваш `apiKey` — *scoped*-ключ (write-only для одного приложения), его можно безопасно положить в бандл, как Sentry public DSN.

### Fire-and-forget

`log.error(...)` не throw'ит и не блокирует. Транспортные ошибки уходят в `console.error` (видно в логах сервера / devtools).

### Bindings и child-логгеры

```ts
const reqLog = log.child({ requestId: crypto.randomUUID(), userId: '42' });
reqLog.info('processing checkout');
```

Используйте bindings, чтобы переносить per-request контекст через async-границы.

---

## Конфигурация

`ELSConfig` совпадает с базовым клиентом — см. [@inso_web/els-client](https://github.com/official-inso/els-client). Ключевые поля:

| Опция | Описание |
|---|---|
| `apiKey` | API-ключ (обязательно) |
| `appSlug` | Slug приложения (обязательно) |
| `serviceName` | Имя сервиса / модуля |
| `deploymentEnv` | `DEV` / `STAGING` / `PRODUCTION` |
| `appVersion` | Версия (любой формат, ≤128 символов) |
| `minLevel` | Минимальный уровень для отправки |

---

## Миграция

### С `console.log` + global error boundary

**Было — сервер (Pages Router):**

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

**Было — клиент:**

```tsx
'use client';
useEffect(() => {
  const onError = (e: ErrorEvent) => console.error('window.error', e.error);
  window.addEventListener('error', onError);
  return () => window.removeEventListener('error', onError);
}, []);
```

**Стало — один логгер на оба:**

```ts
// lib/logger.ts
import { createELSLogger } from '@inso_web/els-next';
export const log = createELSLogger({ apiKey, appSlug: 'my-app' });
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

| `console` | ELS | Заметки |
|---|---|---|
| `console.log` / `info` | `log.info` | |
| `console.warn` | `log.warn` | |
| `console.error` | `log.error` | Первый аргумент — `Error` или `string` |

**Подводные камни:**

- `console.*` продолжает писать в stdout / devtools. Оставьте для локальной разработки; в ELS — только удалённо значимые события.
- Variadic `printf` (`'%s %d'`) не поддерживается — используйте структурированные поля.

---

### С @sentry/nextjs

**Было:**

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

**Стало:**

```ts
// lib/logger.ts — один конфиг для client + server
import { createELSLogger } from '@inso_web/els-next';
export const log = createELSLogger({
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

| Sentry | ELS | Заметки |
|---|---|---|
| `sentry.{server,client,edge}.config.ts` | один `lib/logger.ts` | Без runtime-специфичных конфигов |
| `dsn` | `apiKey` + `appSlug` | Три явных поля |
| `captureException(err)` | `log.error(err)` | |
| `captureMessage(msg, level)` | `log.<level>(msg)` | |
| `release` | `appVersion` | То же, любая строка ≤128 |
| `environment` | `deploymentEnv` | Фиксированный enum |
| Source maps upload | не предоставляется | Оставьте отдельный инструмент, если критично |
| `withSentryConfig(...)` wrapper | не нужен | Без build-time wrapper |

**Подводные камни:**

- Sentry-плагин инструментирует билд (sourcemap upload, tunnel route). ELS этого не делает — удалите `withSentryConfig` и `sentry-cli`.
- Для App Router Sentry регистрирует integration; ELS использует стандартный `app/global-error.tsx` (см. выше).
- Tracing / performance — вне scope. Sentry Performance оставляйте рядом, если зависите.

---

## Версионирование

Next.js инлайнит `NEXT_PUBLIC_*` на этапе build. Прокидывайте через Dockerfile:

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

ELS принимает любой формат ≤128 символов: semver, CalVer, date-compact, git SHA, opaque. Сервер автоматически распознаёт тип и сортирует timeline.

---

## Quick reference

| Нужно | Делайте |
|---|---|
| Логирование в API route | `import { log }` + `log.info(...)` |
| Ошибка в Server Component | `log.error(err)` внутри `try/catch` |
| Клиентский error reporter | `useEffect` с `window.error` |
| Edge middleware | Тот же `log` (только `fetch`) |
| Глобальный render-crash | `app/global-error.tsx` |
| 4xx/5xx в Pages Router | `pages/_error.tsx` |
| Скрыть ключ из бандла | Server-only env + внутренний `/api/log` proxy |
| Подавить шумные уровни | `minLevel: 'warn'` |

---

## Почему ELS

ELS для Node.js — сфокусированный SaaS для логирования, а не observability-комбайн. Оптимизирован под скорость захвата, AI-диагностику и дешевизну интеграции.

- **Меньше веса.** Нет транзитивных deps, нет build-time плагинов.
- **Ноль внешних API.** Только `POST /errors[/batch]` и `GET /health`.
- **AI-диагностика** на каждом stack trace.
- **5 минут интеграции.** Один `lib/logger.ts` покрывает server, client, edge.
- **Прозрачные тарифы.** Цены в личном кабинете.

### Подробное сравнение

| Категория | ELS | Sentry | Datadog / New Relic | Grafana Loki | LogRocket / Logtail / BetterStack |
|---|---|---|---|---|---|
| Модель хостинга | Managed SaaS | SaaS или self-hosted | Только SaaS | Self-hosted / Grafana Cloud | SaaS |
| Runtime-зависимости SDK | Ноль | Средне (саб-SDK, интеграции) | Тяжёлый агент + tracing | Promtail / агент | Средне |
| Время интеграции | ~5 мин | 10–20 мин | 30–60 мин | Часы — дни | 10–20 мин |
| AI-диагностика | Встроена | Платный аддон | Платный аддон | Нет | Нет |
| Группировка / fingerprint | Да | Да | Да | Вручную через LogQL | Частично |
| Source-map upload | Нет | Да | Да | н/п | Частично |
| Session replay (frontend) | Нет | Платно | Платно | н/п | Да (core) |
| Distributed tracing / APM | Нет | Частично | Да (core) | Да с Tempo | Нет |
| Метрики инфраструктуры | Нет | Нет | Да (core) | Да с Mimir | Нет |
| Хранение на free-тарифе | 24 часа | 30 дней (лимит объёма) | Только триал | Self-cost | 3–30 дней |
| Поддержка / документация на русском | Нативно | Сообщество | Ограничено | Сообщество | Нет |

### Когда ELS — неподходящий выбор

- Нужен один вендор на **APM + логи + метрики** одним счётом — берите Datadog или New Relic.
- Триаж фронтенда строится вокруг **DOM session replay** — LogRocket или Sentry Replay.
- Публичное мобильное приложение, нужны symbolication и ANR-детект — Firebase Crashlytics или Sentry Mobile.

Во всех остальных сценариях — backend-ошибки, JS-ошибки фронта, request-логи, структурированные события с version-aware-аналитикой — ELS даёт самый короткий путь до рабочей панели.

→ **Регистрация на [lk.insoweb.ru](https://lk.insoweb.ru)** для API-ключа.

---

## API

```ts
function createELSLogger(config: ELSConfig): Logger;
```

`ELSConfig` совпадает с базовым клиентом — см. [@inso_web/els-client](https://github.com/official-inso/els-client). Методы `Logger`: `fatal` / `error` / `warn` / `info` / `debug` / `trace` / `child` / `flush`.

---

## FAQ

**Безопасно ли держать API-ключ в клиентском бандле?** Да. ELS-ключи scoped — `write`-ключ только пишет события, не читает. Та же модель что и у Sentry public DSN. Если всё же хочется скрыть — поднимите внутренний `/api/log` proxy и логируйте только из API routes.

**Что если ключ пустой?** SDK не throw'ит — возвращает silent-логгер. Удобно для preview-окружений без ключей.

**Работает в edge runtimes?** Да. Используется только `fetch` — без Node API.

**Нужен ли аналог `withSentryConfig`?** Нет, build-time wrapper не нужен. Просто импортируйте и используйте.

---

## Другие ELS SDK

Тот же wire-формат, та же панель — выбирайте по стеку.

**Node.js**
- [`@inso_web/els-client`](https://github.com/official-inso/els-client) — базовый TS / Node / browser клиент
- [`@inso_web/els-express`](https://github.com/official-inso/els-express) — Express middleware
- [`@inso_web/els-next`](https://github.com/official-inso/els-next) — хелперы для Next.js (этот репо)
- [`@inso_web/els-nest`](https://github.com/official-inso/els-nest) — NestJS module
- [`@inso_web/els-react`](https://github.com/official-inso/els-react) — React Provider, hooks, ErrorBoundary
- [`@inso_web/els-vue`](https://github.com/official-inso/els-vue) — Vue 3 plugin

**Другие стеки**
- [`Inso.Els`](https://github.com/official-inso/els-csharp) — .NET (Core + ASP.NET Core + ILogger)
- [`io.github.official-inso:els-core`](https://github.com/official-inso/els-java) — Java + Spring Boot starter + SLF4J
- [`github.com/official-inso/els-go`](https://github.com/official-inso/els-go) — Go

---

## Тарифы

Free-тариф — **хранение логов 24 часа**. Полный прайс на **[lk.insoweb.ru](https://lk.insoweb.ru)**.

---

## Лицензия

[MIT](./LICENSE) © INSOWEB
