import { fileURLToPath } from "node:url";
import { loadFeeds, loadRefreshIntervalMs } from "./config.js";
import { start } from "./start.js";
import type { FetchedFeed } from "./refresh.js";

const PORT = Number(process.env.PORT ?? 3000);
const DATABASE_PATH = process.env.DATABASE_PATH ?? "data/feeds.db";
const FEEDS_CONFIG = process.env.FEEDS_CONFIG ?? "feeds.json";
const REFRESH_INTERVAL_MS = loadRefreshIntervalMs(
  process.env.REFRESH_INTERVAL_MS,
);

// dist/server/server.js -> dist/web
const WEB_ROOT = fileURLToPath(new URL("../web", import.meta.url));

/** The seam, in production: a Feed's XML over HTTP. */
async function fetchFeedOverHttp(url: string): Promise<FetchedFeed> {
  const response = await fetch(url, { headers: { accept: "application/xml" } });
  return { status: response.status, body: await response.text() };
}

await start({
  databasePath: DATABASE_PATH,
  feeds: loadFeeds(FEEDS_CONFIG),
  fetchFeed: fetchFeedOverHttp,
  refreshIntervalMs: REFRESH_INTERVAL_MS,
  webRoot: WEB_ROOT,
  // Render reaches the container only on 0.0.0.0.
  host: "0.0.0.0",
  port: PORT,
});
