import { ELSClient, type ELSConfig } from "@inso_web/els-client";

let _logger: ELSClient | null = null;

/**
 * Создаёт singleton-инстанс ELSClient для всего Next.js приложения.
 * Идемпотентно: повторные вызовы возвращают тот же инстанс.
 *
 * Вызывается обычно один раз в `lib/els.ts` или эквивалентном bootstrap-файле,
 * который импортируется в API routes / route handlers.
 */
export function createELSLogger(config: ELSConfig): ELSClient {
  if (!_logger) {
    _logger = new ELSClient(config);
  }
  return _logger;
}

/**
 * Возвращает уже созданный singleton логгер.
 * Бросает если `createELSLogger()` ещё не был вызван.
 */
export function getLogger(): ELSClient {
  if (!_logger) {
    throw new Error(
      "ELS logger not initialized. Call createELSLogger(config) at app startup (e.g. in lib/els.ts).",
    );
  }
  return _logger;
}

/** Сбросить singleton — для тестов */
export function _resetLoggerForTests(): void {
  _logger = null;
}
