// Boot: a Refresh first, the listening socket second. A reader who arrives with
// the very first request still gets a list rather than an empty page.

import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { refresh, startRefreshing } from "./refresh.js";
import type { RefreshOptions } from "./refresh.js";

/** Render sleeps after 15 minutes idle; a longer interval would rarely fire. */
export const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export type StartOptions = RefreshOptions & {
  webRoot: string;
  host: string;
  port: number;
  /** Optional so that the specs written before the timer stay unedited. */
  refreshIntervalMs?: number;
};

/** Resolves once the server is accepting connections, never before. */
export async function start(options: StartOptions): Promise<FastifyInstance> {
  // Built before the Refresh only so the Refresh has somewhere to log; it is
  // still not listening until the Refresh has finished.
  const app = createApp({ databasePath: options.databasePath });

  const logFeedRefresh =
    options.logFeedRefresh ??
    ((line) => {
      app.log.info(line, "feed refresh");
    });

  await refresh({ ...options, logFeedRefresh });

  await app.register(fastifyStatic, { root: options.webRoot });

  // The same Refresh as the boot one, logging included, on a timer from here on.
  const stopRefreshing = startRefreshing({
    ...options,
    logFeedRefresh,
    intervalMs: options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS,
    logRefreshError: (error) => {
      app.log.error({ err: error }, "periodic refresh failed");
    },
  });
  app.addHook("onClose", (_instance, done) => {
    stopRefreshing();
    done();
  });

  await app.listen({ host: options.host, port: options.port });
  return app;
}
