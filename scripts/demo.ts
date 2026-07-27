// The app, by hand, with Items you can actually click: the e2e publisher and a
// throwaway database, torn down on Ctrl-C. `npm start` serves the real Feeds in
// feeds.json; this serves the two local ones, so the list is the same every run.
//
// Not a second seam — the app fetches these over HTTP exactly as it fetches any
// other Feed. The only difference is who is publishing.

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";

const PORT = "3000";
const DATABASE_PATH = "data/demo.db";
const PUBLISHER_URL = "http://127.0.0.1:4175/blog.xml";
// Short enough to watch a tick land; the default 15 minutes is for production.
const REFRESH_INTERVAL_MS = "60000";

const children: ChildProcess[] = [];

function run(command: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.push(child);
  return child;
}

/** The app Refreshes before it listens, so the publisher has to be up first. */
async function waitForPublisher(): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(PUBLISHER_URL);
      if (response.ok) return;
    } catch {
      // Not listening yet. The attempt limit below is the real timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`the publisher never came up at ${PUBLISHER_URL}`);
}

function teardown() {
  for (const child of children) child.kill("SIGTERM");
  // A fresh database every run, so yesterday's read state can never confuse
  // what you are looking at now.
  rmSync(DATABASE_PATH, { force: true });
}

process.on("SIGINT", () => {
  teardown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  teardown();
  process.exit(0);
});

rmSync(DATABASE_PATH, { force: true });
run("node", ["e2e/feed-server.ts"]);
await waitForPublisher();
run("node", ["dist/server/server.js"], {
  PORT,
  DATABASE_PATH,
  FEEDS_CONFIG: "e2e/feeds.local.json",
  REFRESH_INTERVAL_MS,
});

process.stdout.write(
  `\ndemo on http://localhost:${PORT} — Ctrl-C stops both and deletes ${DATABASE_PATH}\n\n`,
);
