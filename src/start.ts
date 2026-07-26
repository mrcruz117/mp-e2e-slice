// Boot: a Refresh first, the listening socket second. A reader who arrives with
// the very first request still gets a list rather than an empty page.

import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { refresh } from "./refresh.js";
import type { FetchFeed } from "./refresh.js";

export interface StartOptions {
  databasePath: string;
  feeds: string[];
  fetchFeed: FetchFeed;
  webRoot: string;
  host: string;
  port: number;
}

/** Resolves once the server is accepting connections, never before. */
export async function start(options: StartOptions): Promise<FastifyInstance> {
  await refresh({
    databasePath: options.databasePath,
    feeds: options.feeds,
    fetchFeed: options.fetchFeed,
  });

  const app = createApp({ databasePath: options.databasePath });
  await app.register(fastifyStatic, { root: options.webRoot });
  await app.listen({ host: options.host, port: options.port });
  return app;
}
