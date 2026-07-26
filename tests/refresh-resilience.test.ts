// One bad Feed must cost exactly one Feed. These expectations are ours, not
// feedparser's — worth remembering when judging how much they prove.
//
// Un-skipped by the ticket that implements Refresh error handling.

import { afterEach, describe, expect, test, vi } from "vitest";
import { refresh } from "../src/refresh.js";
import type { FetchedFeed } from "../src/refresh.js";
import { readItems, temporaryDatabase } from "./harness.js";

const GOOD = `<rss version="2.0"><channel><title>Good</title>
<item><guid>urn:good</guid><title>Still here</title></item>
</channel></rss>`;

const FETCH_TIMEOUT_MS = 10_000;

let database: { path: string; remove: () => void } | undefined;

afterEach(() => {
  database?.remove();
  database = undefined;
  vi.useRealTimers();
});

/** The good Feed, plus one Feed that fails in the way under test. */
function withBadFeed(bad: () => Promise<FetchedFeed>) {
  database = temporaryDatabase();
  return {
    databasePath: database.path,
    feeds: ["good", "bad"],
    fetchFeed: (url: string) =>
      url === "good" ? Promise.resolve({ status: 200, body: GOOD }) : bad(),
  };
}

describe.skip("a failing Feed leaves every other Feed working", () => {
  test("an unreachable Feed is skipped and the Refresh completes", async () => {
    const options = withBadFeed(() =>
      Promise.reject(new Error("getaddrinfo ENOTFOUND bad.example.com")),
    );

    await expect(refresh(options)).resolves.toBeUndefined();

    const items = await readItems(options.databasePath);
    expect(items.map(({ title }) => title)).toEqual(["Still here"]);
  });

  test("a non-200 response is skipped for that Refresh", async () => {
    const options = withBadFeed(() =>
      Promise.resolve({ status: 500, body: "upstream is unwell" }),
    );

    await refresh(options);

    const items = await readItems(options.databasePath);
    expect(items.map(({ title }) => title)).toEqual(["Still here"]);
  });

  test("a body that is not parseable XML is skipped", async () => {
    const options = withBadFeed(() =>
      Promise.resolve({ status: 200, body: "<html>not a feed at all" }),
    );

    await refresh(options);

    const items = await readItems(options.databasePath);
    expect(items.map(({ title }) => title)).toEqual(["Still here"]);
  });

  test("a Feed that hangs times out and does not hold up the others", async () => {
    vi.useFakeTimers();
    const options = withBadFeed(
      () => new Promise<FetchedFeed>(() => undefined),
    );

    const pending = refresh(options);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 1_000);
    await pending;

    const items = await readItems(options.databasePath);
    expect(items.map(({ title }) => title)).toEqual(["Still here"]);
  });

  test("a Feed that starts failing keeps the Items it delivered before", async () => {
    database = temporaryDatabase();
    let healthy = true;
    const options = {
      databasePath: database.path,
      feeds: ["flaky"],
      fetchFeed: () =>
        healthy
          ? Promise.resolve({ status: 200, body: GOOD })
          : Promise.resolve({ status: 503, body: "" }),
    };

    await refresh(options);
    healthy = false;
    await refresh(options);

    const items = await readItems(database.path);
    expect(items.map(({ title }) => title)).toEqual(["Still here"]);
  });

  test("the reader still gets a list when every Feed fails", async () => {
    database = temporaryDatabase();
    await refresh({
      databasePath: database.path,
      feeds: ["one", "two"],
      fetchFeed: () => Promise.reject(new Error("everything is down")),
    });

    expect(await readItems(database.path)).toEqual([]);
  });
});
