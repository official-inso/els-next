# @inso_web/els-next

[![npm version](https://img.shields.io/npm/v/@inso_web/els-next.svg)](https://www.npmjs.com/package/@inso_web/els-next)
[![npm downloads](https://img.shields.io/npm/dm/@inso_web/els-next.svg)](https://www.npmjs.com/package/@inso_web/els-next)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![license MIT](https://img.shields.io/npm/l/@inso_web/els-next.svg)](./LICENSE)

Next.js helpers для **Error Logs Service (ELS)**: логирование в API Routes (App Router и Pages Router), `middleware.ts`, edge runtime, серверные actions. Drop-in замена `console.log` для Next.js приложений.

## Что внутри

- `createELSLogger({ ... })` — фабрика логгера, работающая на сервере и в браузере.
- Совместим с App Router (`app/` directory), Pages Router (`pages/api/`), middleware, edge runtime.
- Без транзитивных зависимостей. Pino-совместимый API: `info` / `warn` / `error` / `child`.

---

## UI: что вы получаете

ELS из коробки даёт админ-панель — все события из вашего Next.js приложения попадают в неё.

### Список логов с фильтрами

![Список логов](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/01-error-logs-list.png)

Виртуальная таблица всех событий: trace ID, приложение, источник (client/server), уровень, сообщение, страница, IP. Левый сайдбар — фасеты по приложению, окружению, **версии**, источнику, уровню, браузеру, языку, IP, категории ошибки.

### Детальная карточка с метаданными

![Детальная карточка](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/02-event-detail-info.png)

Время сервера/клиента, IP с гео, окружение, **версия приложения**, fingerprint, session ID. Карточки повторений и корреляция событий справа.

### AI-диагностика ошибок

![AI диагностика](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/03-error-detail-ai.png)

Stack trace с распарсенными фреймами + AI-анализ что именно сломалось и как чинить.

### Аналитика и регрессии по версиям

![Аналитика](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/04-analytics-dashboard.png)

Total / critical+errors / warnings / error rate. AI-обзор слева, timeline в центре, donut'ы по приложению/источнику/уровню. **Виджет «Регрессии»**: какие fingerprint'ы появились впервые в свежей версии и какие пропали.

### Управление API-ключами

![API ключи](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/05-api-keys.png)
![Действия с ключом](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/06-api-key-actions.png)

Scoped-ключи (write/read/read-any), live/test environments, ротация без даунтайма.

### Избранные события

![Избранные](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/07-favorites.png)

Закладки на конкретные trace ID — для расследований, не теряются между сессиями.

---

## Установка

```bash
npm install @inso_web/els-client @inso_web/els-next
```

`@inso_web/els-client` — peer-зависимость.

---

## Quick Start

### 1. Создайте логгер

`lib/logger.ts`:

```ts
import { createELSLogger } from '@inso_web/els-next';

export const log = createELSLogger({
  endpoint: process.env.NEXT_PUBLIC_ELS_URL!,
  apiKey: process.env.NEXT_PUBLIC_ELS_API_KEY ?? '',
  appSlug: 'my-nextjs-app',
  serviceName: 'web',
  deploymentEnv: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEV',
  appVersion: process.env.NEXT_PUBLIC_BUILD_VERSION, // см. секцию ниже
  minLevel: 'info',
});
```

### 2. Используйте в API Routes (App Router)

`app/api/users/[id]/route.ts`:

```ts
import { log } from '@/lib/logger';

export async function GET(req: Request, { params }: { params: { id: string } }) {
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

### 3. Используйте в client components

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

### 4. Глобальные браузерные обработчики

`app/layout.tsx` или отдельный `ErrorReporter` компонент:

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

---

## Версионирование

Next.js инлайнит `NEXT_PUBLIC_*` переменные на этапе `npm run build`. Прокидывайте через Dockerfile build stage:

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

ELS принимает любой формат до 128 символов: semver, CalVer, date-compact, git SHA, opaque. Парсер на стороне сервера автоматически распознаёт тип и сортирует timeline.

---

## Edge runtime

Логгер работает в edge runtime — использует только `fetch`:

```ts
// middleware.ts
import { NextResponse } from 'next/server';
import { log } from '@/lib/logger';

export const config = { matcher: '/api/:path*' };

export function middleware(req: NextRequest) {
  log.info({ url: req.nextUrl.pathname }, 'Edge request');
  return NextResponse.next();
}
```

---

## API

```ts
function createELSLogger(config: ELSConfig): Logger;
```

`ELSConfig` совпадает с базовым клиентом — см. [@inso_web/els-client](https://www.npmjs.com/package/@inso_web/els-client). Главные поля:

| Опция | Описание |
|---|---|
| `endpoint` | URL ELS (обязательно) |
| `apiKey` | API-ключ (обязательно) |
| `appSlug` | Slug приложения (обязательно) |
| `serviceName` | Имя сервиса |
| `deploymentEnv` | `DEV` / `STAGING` / `PRODUCTION` |
| `appVersion` | Версия (любой формат, ≤128 символов) |
| `minLevel` | Минимальный уровень для отправки |

`Logger` методы: `fatal` / `error` / `warn` / `info` / `debug` / `trace` / `child` / `flush` (Pino-compatible).

---

## FAQ

**А `apiKey` для клиентского bundle — это безопасно?** Да. ELS-ключи scoped (только write для приложения), и они всё равно видны в bundle (как у Sentry public DSN). Если хотите спрятать — создайте серверный proxy и логируйте только из API Routes.

**Что если `apiKey` пустой?** SDK не throw'ит на этом — возвращает silent логгер. Удобно для preview/dev окружений где ключа ещё нет.

**Как работает с edge runtime?** Использует только глобальный `fetch` — никаких Node.js APIs. Совместимо.

---

## License

[MIT](./LICENSE) © INSOWEB
