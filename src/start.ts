// Boot: a Refresh first, the listening socket second. A reader who arrives with
// the very first request still gets a list rather than an empty page.

import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { refresh } from "./refresh.js";
import type { RefreshOptions } from "./refresh.js";

export type StartOptions = RefreshOptions & {
  webRoot: string;
  host: string;
  port: number;
};

/** Resolves once the server is accepting connections, never before. */
export async function start(options: StartOptions): Promise<FastifyInstance> {
  // Built before the Refresh only so the Refresh has somewhere to log; it is
  // still not listening until the Refresh has finished.
  const app = createApp({ databasePath: options.databasePath });

  await refresh({
    ...options,
    logFeedRefresh:
      options.logFeedRefresh ??
      ((line) => {
        app.log.info(line, "feed refresh");
      }),
  });

  await app.register(fastifyStatic, { root: options.webRoot });
  await app.listen({ host: options.host, port: options.port });
  return app;
}
