// Story 35: one structured line per Feed per Refresh, so that logs say why an
// Item is missing. Unlike the other resilience specs this one was not landed
// ahead of the implementation — it is written by the resilience ticket, run red
// first, and the log line's shape is ours rather than feedparser's.
//
// The logger is an option of `refresh()`, not a second seam: `refresh()` still
// resolves undefined, so the five numbers have nowhere else to go.

import { afterEach, describe, expect, test, vi } from "vitest";
import { refresh } from "../src/refresh.js";
import type { FeedRefreshLine, FetchedFeed } from "../src/refresh.js";
import type { TemporaryDatabase } from "./harness.js";
import { temporaryDatabase } from "./harness.js";

const GOOD = `<rss version="2.0"><channel><title>Good</title>
<item><guid>urn:good</guid><title>Still here</title></item>
<item><title>No guid and no link</title></item>
</channel></rss>`;

const SECRET_BODY = "upstream is unwell: user=admin token=hunter2";

const FETCH_TIMEOUT_MS = 10_000;

let database: TemporaryDatabase | undefined;

afterEach(() => {
  database?.remove();
  database = undefined;
  vi.useRealTimers();
});

/** A Refresh of one Feed, collecting every line it logs. */
function loggedRefresh(fetchFeed: () => Promise<FetchedFeed>) {
  database = temporaryDatabase();
  const lines: FeedRefreshLine[] = [];
  return {
    lines,
    options: {
      databasePath: database.path,
      feeds: ["http://blog.example.com/rss"],
      fetchFeed,
      logFeedRefresh: (line: FeedRefreshLine) => lines.push(line),
    },
  };
}

describe("every Feed fetch is logged", () => {
  test("a successful Feed logs its URL, status, counts and duration", async () => {
    const { lines, options } = loggedRefresh(() =>
      Promise.resolve({ status: 200, body: GOOD }),
    );

    await refresh(options);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      url: "http://blog.example.com/rss",
      status: 200,
      inserted: 1,
      // The Item with neither a guid nor a link cannot be deduped, so it is
      // skipped and counted rather than silently dropped.
      skipped: 1,
    });
    expect(lines[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(lines[0]?.error).toBeUndefined();
  });

  test("a second Refresh of an unchanged Feed logs that it inserted nothing", async () => {
    const { lines, options } = loggedRefresh(() =>
      Promise.resolve({ status: 200, body: GOOD }),
    );

    await refresh(options);
    await refresh(options);

    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ status: 200, inserted: 0, skipped: 1 });
  });

  test("one line per Feed per Refresh, in configuration order", async () => {
    database = temporaryDatabase();
    const lines: FeedRefreshLine[] = [];

    await refresh({
      databasePath: database.path,
      feeds: ["first", "second"],
      fetchFeed: () => Promise.resolve({ status: 200, body: GOOD }),
      logFeedRefresh: (line) => lines.push(line),
    });

    expect(lines.map(({ url }) => url)).toEqual(["first", "second"]);
  });

  test("a non-200 is logged with its status and without its body", async () => {
    const { lines, options } = loggedRefresh(() =>
      Promise.resolve({ status: 500, body: SECRET_BODY }),
    );

    await refresh(options);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ status: 500, inserted: 0, skipped: 0 });
    // Nothing was swallowed: the line says why the Feed contributed nothing.
    expect(lines[0]?.error).toEqual(expect.any(String));
    expect(JSON.stringify(lines[0])).not.toContain("hunter2");
  });

  test("an unparseable body is logged as a failure, without the body", async () => {
    const { lines, options } = loggedRefresh(() =>
      Promise.resolve({ status: 200, body: `<html>${SECRET_BODY}` }),
    );

    await refresh(options);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ status: 200, inserted: 0, skipped: 0 });
    expect(lines[0]?.error).toEqual(expect.any(String));
    expect(JSON.stringify(lines[0])).not.toContain("hunter2");
  });

  test("an unreachable Feed is logged with no status and a reason", async () => {
    const { lines, options } = loggedRefresh(() =>
      Promise.reject(new Error("getaddrinfo ENOTFOUND bad.example.com")),
    );

    await refresh(options);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ status: null, inserted: 0, skipped: 0 });
    expect(lines[0]?.error).toContain("ENOTFOUND");
  });

  test("a hanging Feed is logged after the timeout has elapsed", async () => {
    vi.useFakeTimers();
    const { lines, options } = loggedRefresh(
      () => new Promise<FetchedFeed>(() => undefined),
    );

    const pending = refresh(options);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 1_000);
    await pending;

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ status: null, inserted: 0, skipped: 0 });
    expect(lines[0]?.durationMs).toBeGreaterThanOrEqual(FETCH_TIMEOUT_MS);
    expect(lines[0]?.error).toEqual(expect.any(String));
  });
});
