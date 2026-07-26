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

describe("an Item carries the identity its publisher gave it", () => {
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
