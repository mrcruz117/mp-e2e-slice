// Item identity, which the read endpoint never shows. It is observable only as
// behaviour: refresh an unchanged Feed twice and nothing new appears. That makes
// this the spec that covers feedparser's `guid` and Atom `id` fixtures.
//
// Un-skipped by the ticket that implements Refresh and dedup.

import { afterEach, describe, expect, test } from "vitest";
import { refresh } from "../src/refresh.js";
import { loadExpectations, serveFixtures } from "./oracle.js";
import { readItems, temporaryDatabase } from "./harness.js";

const identityFixtures = loadExpectations()
  .filter(
    ({ scope, field }) => scope === "item" && ["guid", "id"].includes(field),
  )
  .map(({ file }) => file);

const NO_IDENTIFIER = `<rss version="2.0"><channel><title>Anonymous</title>
<item><title>No guid and no link</title></item>
<item><title>Has a link</title><link>http://example.com/a</link></item>
</channel></rss>`;

let database: { path: string; remove: () => void } | undefined;

afterEach(() => {
  database?.remove();
  database = undefined;
});

describe.skip("a Refresh inserts only Items it has not seen", () => {
  test("a second Refresh of unchanged Feeds inserts nothing", async () => {
    database = temporaryDatabase();
    const options = {
      databasePath: database.path,
      feeds: identityFixtures,
      fetchFeed: serveFixtures(identityFixtures),
    };

    await refresh(options);
    const first = await readItems(database.path);
    await refresh(options);
    const second = await readItems(database.path);

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  test("a Feed that grows contributes only its new Items", async () => {
    const one = `<rss version="2.0"><channel><title>Blog</title>
<item><guid>urn:1</guid><title>First</title></item>
</channel></rss>`;
    const two = `<rss version="2.0"><channel><title>Blog</title>
<item><guid>urn:2</guid><title>Second</title></item>
<item><guid>urn:1</guid><title>First</title></item>
</channel></rss>`;

    database = temporaryDatabase();
    const feeds = ["http://blog.example.com/rss"];
    let body = one;
    const options = {
      databasePath: database.path,
      feeds,
      fetchFeed: () => Promise.resolve({ status: 200, body }),
    };

    await refresh(options);
    expect(await readItems(database.path)).toHaveLength(1);

    body = two;
    await refresh(options);
    const items = await readItems(database.path);
    expect(items).toHaveLength(2);
    expect(items.map(({ title }) => title)).toContain("First");
    expect(items.map(({ title }) => title)).toContain("Second");
  });

  test("an Item with neither an id nor a link is skipped rather than duplicated", async () => {
    database = temporaryDatabase();
    const options = {
      databasePath: database.path,
      feeds: ["http://anonymous.example.com/rss"],
      fetchFeed: () => Promise.resolve({ status: 200, body: NO_IDENTIFIER }),
    };

    await refresh(options);
    await refresh(options);

    const items = await readItems(database.path);
    expect(items.map(({ title }) => title)).toEqual(["Has a link"]);
  });
});
