// One list across every Feed, newest first, and positions that do not move under
// the reader. These expectations are ours, not feedparser's.
//
// Un-skipped by the ticket that implements ordering.

import { afterEach, describe, expect, test } from "vitest";
import { refresh } from "../src/refresh.js";
import { readItems, temporaryDatabase } from "./harness.js";

const OLD_AND_NEW = `<rss version="2.0"><channel><title>Dated</title>
<item><guid>urn:old</guid><title>Old</title><pubDate>Thu, 01 Jan 2004 00:00:00 GMT</pubDate></item>
<item><guid>urn:new</guid><title>New</title><pubDate>Fri, 01 Jan 2010 00:00:00 GMT</pubDate></item>
</channel></rss>`;

const UNDATED = `<rss version="2.0"><channel><title>Undated</title>
<item><guid>urn:undated</guid><title>Undated</title></item>
</channel></rss>`;

const UNPARSEABLE_DATE = `<rss version="2.0"><channel><title>Sloppy</title>
<item><guid>urn:sloppy</guid><title>Sloppy</title><pubDate>whenever, really</pubDate></item>
</channel></rss>`;

let database: { path: string; remove: () => void } | undefined;

afterEach(() => {
  database?.remove();
  database = undefined;
});

function serve(bodies: Record<string, string>) {
  return (url: string) =>
    Promise.resolve({ status: 200, body: bodies[url] ?? "" });
}

describe.skip("Items from every Feed appear in one list, newest first", () => {
  test("dated Items are ordered by their published date across Feeds", async () => {
    database = temporaryDatabase();
    await refresh({
      databasePath: database.path,
      feeds: ["dated", "undated"],
      fetchFeed: serve({ dated: OLD_AND_NEW, undated: UNDATED }),
    });

    const items = await readItems(database.path);
    expect(items.map(({ title }) => title)).toEqual(["New", "Undated", "Old"]);
  });

  test("an Item whose date cannot be parsed still appears, ordered by first sight", async () => {
    database = temporaryDatabase();
    await refresh({
      databasePath: database.path,
      feeds: ["sloppy"],
      fetchFeed: serve({ sloppy: UNPARSEABLE_DATE }),
    });

    const items = await readItems(database.path);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Sloppy");
    expect(items[0]?.published).toBeNull();
  });

  test("positions do not move when a later Refresh adds nothing", async () => {
    database = temporaryDatabase();
    const options = {
      databasePath: database.path,
      feeds: ["dated", "undated"],
      fetchFeed: serve({ dated: OLD_AND_NEW, undated: UNDATED }),
    };

    await refresh(options);
    const before = await readItems(database.path);
    await refresh(options);
    const after = await readItems(database.path);

    expect(after.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
  });

  test("each Item carries the title of the Feed it came from", async () => {
    database = temporaryDatabase();
    await refresh({
      databasePath: database.path,
      feeds: ["dated", "undated"],
      fetchFeed: serve({ dated: OLD_AND_NEW, undated: UNDATED }),
    });

    const items = await readItems(database.path);
    expect(items.find(({ title }) => title === "New")?.feedTitle).toBe("Dated");
    expect(items.find(({ title }) => title === "Undated")?.feedTitle).toBe(
      "Undated",
    );
  });
});
