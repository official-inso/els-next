export {
  createELSLogger,
  getLogger,
  _resetLoggerForTests,
} from "./createLogger.js";
export { withELSLogger } from "./withELSLogger.js";
export type { NextApiRequestWithLogger } from "./withELSLogger.js";
export { withELSRouteLogger } from "./routeHandler.js";
export type { ELSRouteContext } from "./routeHandler.js";
export { withELSMiddleware } from "./middleware.js";

// Re-export ELSClient и типы
export { ELSClient } from "@inso_web/els-client";
export type {
  ELSConfig,
  ErrorEntry,
  Logger,
  LogLevel,
} from "@inso_web/els-client";
