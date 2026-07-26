// The Item id the publisher gave, through the read endpoint. The dedup spec
// proves only that identity is stable — it passes for link, title or ordinal
// alike — so without this the `guid` and `id` fixtures grade nothing.
//
// Every expected value here comes out of tests/fixtures/expectations.json.

import { afterEach, describe, expect, test } from "vitest";
import { refresh } from "../src/refresh.js";
import { loadExpectations, serveFixtures } from "./oracle.js";
import type { TemporaryDatabase } from "./harness.js";
import { readItems, temporaryDatabase } from "./harness.js";

const identityExpectations = loadExpectations().filter(
  ({ scope, field }) => scope === "item" && ["guid", "id"].includes(field),
);

let database: TemporaryDatabase | undefined;

afterEach(() => {
  database?.remove();
  database = undefined;
});

const SHARED_ID = (feedTitle: string, itemTitle: string) =>
  `<rss version="2.0"><channel><title>${feedTitle}</title>
<item><guid>urn:shared</guid><title>${itemTitle}</title></item>
</channel></rss>`;

describe("an Item carries the identity its publisher gave it", () => {
  test("two Feeds publishing the same id are two Items", async () => {
    database = temporaryDatabase();
    const bodies: Record<string, string> = {
      one: SHARED_ID("One", "From one"),
      two: SHARED_ID("Two", "From two"),
    };

    await refresh({
      databasePath: database.path,
      feeds: ["one", "two"],
      fetchFeed: (url) =>
        Promise.resolve({ status: 200, body: bodies[url] ?? "" }),
    });

    const items = await readItems(database.path);
    expect(items.map(({ feedTitle }) => feedTitle).sort()).toEqual([
      "One",
      "Two",
    ]);
    expect(items.every(({ itemId }) => itemId === "urn:shared")).toBe(true);
  });

  for (const expectation of identityExpectations) {
    test(`${expectation.file}: ${expectation.description}`, async () => {
      database = temporaryDatabase();
      await refresh({
        databasePath: database.path,
        feeds: [expectation.file],
        fetchFeed: serveFixtures([expectation.file]),
      });

      const items = await readItems(database.path);
      expect(items).toHaveLength(1);
      expect(items[0]?.itemId).toBe(expectation.value);
    });
  }
});
