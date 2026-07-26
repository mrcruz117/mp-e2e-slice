// What an interval Refresh must not disturb, and what it must survive. The
// pre-written periodic specs grade that the timer fires and that stopping it
// works; these grade the acceptance criteria left over — position stability,
// read state, per-Feed isolation on a tick, the shared code path including
// logging, and that two ticks never overlap.
//
// Written by the periodic Refresh ticket, run red first. Like the other
// resilience specs these expectations are ours, not feedparser's.

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../src/app.js";
import { refresh, startRefreshing } from "../src/refresh.js";
import type { FeedRefreshLine } from "../src/refresh.js";
import { start } from "../src/start.js";
import type { TemporaryDatabase } from "./harness.js";
import { readItems, temporaryDatabase } from "./harness.js";

const WEB_ROOT = fileURLToPath(new URL("../web", import.meta.url));

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

const item = (guid: string, title: string, published?: string) =>
  `<item><guid>${guid}</guid><title>${title}</title>${
    published === undefined ? "" : `<pubDate>${published}</pubDate>`
  }</item>`;

const blog = (items: string) =>
  `<rss version="2.0"><channel><title>Blog</title>${items}</channel></rss>`;

const OLD = item("urn:old", "Old", "Thu, 01 Jan 2004 00:00:00 GMT");
const NEW = item("urn:new", "New", "Fri, 01 Jan 2010 00:00:00 GMT");
const MIDDLE = item("urn:middle", "Middle", "Mon, 01 Jan 2007 00:00:00 GMT");

let database: TemporaryDatabase | undefined;
let stop: (() => void) | undefined;
let app: FastifyInstance | undefined;

afterEach(async () => {
  stop?.();
  stop = undefined;
  await app?.close();
  app = undefined;
  database?.remove();
  database = undefined;
  vi.useRealTimers();
});

/** A first Refresh the reader has already seen, before any tick. */
async function seed(body: string) {
  database = temporaryDatabase();
  await refresh({
    databasePath: database.path,
    feeds: ["blog"],
    fetchFeed: () => Promise.resolve({ status: 200, body }),
  });
  return database.path;
}

describe("an interval Refresh disturbs nothing the reader already has", () => {
  test("a new Item lands in date order without moving the Items around it", async () => {
    const path = await seed(blog(OLD + NEW));
    const before = await readItems(path);
    expect(before.map(({ title }) => title)).toEqual(["New", "Old"]);

    vi.useFakeTimers();
    stop = startRefreshing({
      databasePath: path,
      feeds: ["blog"],
      fetchFeed: () =>
        Promise.resolve({ status: 200, body: blog(OLD + NEW + MIDDLE) }),
      intervalMs: REFRESH_INTERVAL_MS,
    });
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);

    const after = await readItems(path);
    expect(after.map(({ title }) => title)).toEqual(["New", "Middle", "Old"]);
    // The rows the reader already had are the same rows, in the same order.
    const kept = after.filter(({ title }) => title !== "Middle");
    expect(kept.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
  });

  test("an Item read before a tick is still read after it", async () => {
    const path = await seed(blog(OLD + NEW));
    const [first] = await readItems(path);
    const app = createApp({ databasePath: path });
    try {
      await app.inject({
        method: "POST",
        url: `/api/items/${String(first?.id ?? 0)}/read`,
      });
    } finally {
      await app.close();
    }

    vi.useFakeTimers();
    stop = startRefreshing({
      databasePath: path,
      feeds: ["blog"],
      fetchFeed: () =>
        Promise.resolve({ status: 200, body: blog(OLD + NEW + MIDDLE) }),
      intervalMs: REFRESH_INTERVAL_MS,
    });
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);

    const after = await readItems(path);
    expect(after).toHaveLength(3);
    expect(after.find(({ id }) => id === first?.id)?.read).toBe(true);
    expect(after.find(({ title }) => title === "Middle")?.read).toBe(false);
  });
});

describe("an interval Refresh survives what a boot Refresh survives", () => {
  test("a Feed failing on a tick costs one Feed, and later ticks still run", async () => {
    database = temporaryDatabase();
    let body = blog(NEW);

    vi.useFakeTimers();
    stop = startRefreshing({
      databasePath: database.path,
      feeds: ["dead", "blog"],
      fetchFeed: (url) =>
        url === "blog"
          ? Promise.resolve({ status: 200, body })
          : Promise.reject(new Error("getaddrinfo ENOTFOUND dead.example.com")),
      intervalMs: REFRESH_INTERVAL_MS,
    });

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect((await readItems(database.path)).map(({ title }) => title)).toEqual([
      "New",
    ]);

    body = blog(NEW + MIDDLE);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect((await readItems(database.path)).map(({ title }) => title)).toEqual([
      "New",
      "Middle",
    ]);
  });

  test("a tick logs one line per Feed, as the boot Refresh does", async () => {
    database = temporaryDatabase();
    const lines: FeedRefreshLine[] = [];

    vi.useFakeTimers();
    stop = startRefreshing({
      databasePath: database.path,
      feeds: ["blog"],
      fetchFeed: () => Promise.resolve({ status: 200, body: blog(NEW) }),
      intervalMs: REFRESH_INTERVAL_MS,
      logFeedRefresh: (line) => lines.push(line),
    });
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      url: "blog",
      status: 200,
      inserted: 1,
      skipped: 0,
    });
  });

  test("a tick that is still running does not start a second one", async () => {
    database = temporaryDatabase();
    let fetches = 0;

    vi.useFakeTimers();
    stop = startRefreshing({
      databasePath: database.path,
      feeds: ["blog"],
      fetchFeed: () => {
        fetches += 1;
        // Never settles, so the tick is still in flight at every later tick.
        return new Promise<never>(() => undefined);
      },
      // Short enough that ticks queue up behind a Refresh that is still going.
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetches).toBe(1);
  });

  test("a tick that fails outright is reported and the timer carries on", async () => {
    const path = await seed(blog(NEW));

    vi.useFakeTimers();
    const errors: unknown[] = [];
    stop = startRefreshing({
      // The seeded database is a file, not a directory, so opening this path
      // throws before any Feed is reached — a failure `refresh()` cannot
      // contain, because it is not a Feed's.
      databasePath: join(path, "nested.db"),
      feeds: ["blog"],
      fetchFeed: () => Promise.resolve({ status: 200, body: blog(NEW) }),
      intervalMs: REFRESH_INTERVAL_MS,
      logRefreshError: (error) => errors.push(error),
    });
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 2);

    expect(errors).toHaveLength(2);
    expect(errors[0]).toBeInstanceOf(Error);
  });
});

describe("the app itself keeps Refreshing after boot", () => {
  test("an Item published after boot reaches the reader on the configured interval", async () => {
    database = temporaryDatabase();
    let body = blog(NEW);

    // Real timers: this grades that boot schedules the timer at all, which a
    // fake clock driven by the spec itself could not tell apart from nothing.
    app = await start({
      databasePath: database.path,
      feeds: ["blog"],
      fetchFeed: () => Promise.resolve({ status: 200, body }),
      refreshIntervalMs: 25,
      webRoot: WEB_ROOT,
      host: "127.0.0.1",
      port: 0,
    });
    expect((await readItems(database.path)).map(({ title }) => title)).toEqual([
      "New",
    ]);

    body = blog(NEW + MIDDLE);
    await expect
      .poll(
        async () =>
          (await readItems(database?.path ?? "")).map(({ title }) => title),
        { timeout: 5000 },
      )
      .toEqual(["New", "Middle"]);
  });
});
