// Parsing, judged by feedparser rather than by us. Every expectation here comes
// out of tests/fixtures/expectations.json, which is derived from the `Expect:`
// comments feedparser ships inside the fixtures. Nothing in this file states
// what a fixture should produce.
//
// Un-skipped by the ticket that implements Refresh and parsing.

import { afterEach, describe, expect, test } from "vitest";
import { refresh } from "../src/refresh.js";
import { loadExpectations, serveFixtures } from "./oracle.js";
import type { TemporaryDatabase } from "./harness.js";
import { readItems, temporaryDatabase } from "./harness.js";

const expectations = loadExpectations();
const itemScoped = expectations.filter(({ scope }) => scope === "item");

const forField = (...fields: string[]) =>
  itemScoped.filter(({ field }) => fields.includes(field));

let database: TemporaryDatabase | undefined;

afterEach(() => {
  database?.remove();
  database = undefined;
});

/** One fixture, configured as the only Feed, after one Refresh. */
async function itemsFrom(file: string) {
  database = temporaryDatabase();
  await refresh({
    databasePath: database.path,
    feeds: [file],
    fetchFeed: serveFixtures([file]),
  });
  return readItems(database.path);
}

describe.skip("the reader extracts what feedparser says a Feed contains", () => {
  for (const expectation of forField("title")) {
    test(`${expectation.file}: ${expectation.description}`, async () => {
      const items = await itemsFrom(expectation.file);
      expect(items).toHaveLength(1);
      expect(items[0]?.title).toBe(expectation.value);
    });
  }

  for (const expectation of forField("link")) {
    test(`${expectation.file}: ${expectation.description}`, async () => {
      const items = await itemsFrom(expectation.file);
      expect(items).toHaveLength(1);
      expect(items[0]?.link).toBe(expectation.value);
    });
  }

  // feedparser's `*_parsed` fixtures give the instant as a UTC struct_time, which
  // is an exact expected value from an independent source. The string-valued date
  // fixtures are the same instants in wire formats, and parsing them here to
  // compare would just be the code under test written twice — so those assert
  // only that the Item ended up with a date.
  for (const expectation of forField("published_parsed", "updated_parsed")) {
    test(`${expectation.file}: ${expectation.description}`, async () => {
      const [year, month, day, hour, minute, second] =
        expectation.value as number[];
      const items = await itemsFrom(expectation.file);
      expect(items).toHaveLength(1);
      expect(items[0]?.published).not.toBeNull();
      expect(new Date(items[0]?.published ?? "").toISOString()).toBe(
        new Date(
          Date.UTC(
            year ?? 0,
            (month ?? 1) - 1,
            day ?? 1,
            hour ?? 0,
            minute ?? 0,
            second ?? 0,
          ),
        ).toISOString(),
      );
    });
  }

  for (const expectation of forField("published", "updated")) {
    test(`${expectation.file}: ${expectation.description}`, async () => {
      const items = await itemsFrom(expectation.file);
      expect(items).toHaveLength(1);
      expect(items[0]?.published).not.toBeNull();
    });
  }
});
