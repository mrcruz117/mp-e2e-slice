// A long-lived process picks up new Items without being restarted. Correctness
// comes from the boot Refresh; this is the timer on top of it.
//
// Un-skipped by the ticket that implements periodic Refresh.

import { afterEach, describe, expect, test, vi } from "vitest";
import { startRefreshing } from "../src/refresh.js";
import type { TemporaryDatabase } from "./harness.js";
import { readItems, temporaryDatabase } from "./harness.js";

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

const feed = (guid: string, title: string) =>
  `<rss version="2.0"><channel><title>Blog</title>
<item><guid>${guid}</guid><title>${title}</title></item>
</channel></rss>`;

let database: TemporaryDatabase | undefined;
let stop: (() => void) | undefined;

afterEach(() => {
  stop?.();
  stop = undefined;
  database?.remove();
  database = undefined;
  vi.useRealTimers();
});

describe.skip("Refresh keeps running while the app is alive", () => {
  test("an Item published after boot appears without a restart", async () => {
    vi.useFakeTimers();
    database = temporaryDatabase();
    let body = feed("urn:1", "First");

    stop = startRefreshing({
      databasePath: database.path,
      feeds: ["http://blog.example.com/rss"],
      fetchFeed: () => Promise.resolve({ status: 200, body }),
      intervalMs: REFRESH_INTERVAL_MS,
    });

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(await readItems(database.path)).toHaveLength(1);

    body = feed("urn:2", "Second");
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);

    const items = await readItems(database.path);
    expect(items.map(({ title }) => title)).toContain("Second");
  });

  test("stopping ends the timer", async () => {
    vi.useFakeTimers();
    database = temporaryDatabase();
    let fetches = 0;

    const stopRefreshing = startRefreshing({
      databasePath: database.path,
      feeds: ["http://blog.example.com/rss"],
      fetchFeed: () => {
        fetches += 1;
        return Promise.resolve({ status: 200, body: feed("urn:1", "First") });
      },
      intervalMs: REFRESH_INTERVAL_MS,
    });

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    stopRefreshing();
    const afterStop = fetches;
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 3);

    expect(fetches).toBe(afterStop);
  });
});
