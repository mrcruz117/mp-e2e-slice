import { defineConfig } from "@playwright/test";

// Two apps, because the two specs need opposite worlds: one with no Feeds at
// all, one whose Feeds have known contents. Those Feeds are served from
// localhost by e2e/feed-server.ts, so the app still fetches them over HTTP.
const EMPTY_PORT = 4173;
const READING_PORT = 4174;
const FEED_SERVER_PORT = 4175;

const emptyUrl = `http://127.0.0.1:${String(EMPTY_PORT)}`;
const readingUrl = `http://127.0.0.1:${String(READING_PORT)}`;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  projects: [
    {
      name: "empty",
      testMatch: "item-list.spec.ts",
      use: { baseURL: emptyUrl },
    },
    {
      name: "reading",
      testMatch: "reading.spec.ts",
      use: { baseURL: readingUrl },
    },
  ],
  // Started in order, each waited for before the next: the apps Refresh at boot,
  // so the publisher has to be listening before either of them starts.
  webServer: [
    {
      command: "node e2e/feed-server.ts",
      url: `http://127.0.0.1:${String(FEED_SERVER_PORT)}/blog.xml`,
      reuseExistingServer: false,
      env: { FEED_SERVER_PORT: String(FEED_SERVER_PORT) },
    },
    {
      command: "rm -f data/e2e.db && npm run build && npm start",
      url: emptyUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(EMPTY_PORT),
        // A fresh file per run, so a stale database can never make a spec pass.
        DATABASE_PATH: "data/e2e.db",
        FEEDS_CONFIG: "e2e/feeds.empty.json",
      },
    },
    {
      // The build above is this one's too; both serve the same dist/.
      command: "rm -f data/e2e-reading.db && npm start",
      url: readingUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(READING_PORT),
        DATABASE_PATH: "data/e2e-reading.db",
        FEEDS_CONFIG: "e2e/feeds.local.json",
      },
    },
  ],
});
