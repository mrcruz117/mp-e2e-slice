// Reading the vendored oracle. No expectation is stated here — everything comes
// out of tests/fixtures/, which nothing in this repository may edit.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FetchFeed } from "../src/refresh.js";

export interface Expectation {
  /** Path within `tests/fixtures/`, e.g. `wellformed/rss/item_title.xml`. */
  file: string;
  description: string;
  expect: string;
  scope: "feed" | "item";
  index?: number;
  /** feedparser's field name: title, link, guid, id, published, updated, ±_parsed. */
  field: string;
  value: string | number[];
}

const FIXTURES = new URL("./fixtures/", import.meta.url);

export function loadExpectations(): Expectation[] {
  const raw = readFileSync(new URL("expectations.json", FIXTURES), "utf8");
  return (JSON.parse(raw) as { expectations: Expectation[] }).expectations;
}

export function fixtureXml(file: string): string {
  return readFileSync(fileURLToPath(new URL(file, FIXTURES)), "utf8");
}

/**
 * A fetch seam that serves the vendored fixtures. Each fixture is one Feed, and
 * its path is its URL, so a failure names the fixture that produced it.
 */
export function serveFixtures(files: string[]): FetchFeed {
  const bodies = new Map(files.map((file) => [file, fixtureXml(file)]));
  return (url: string) => {
    const body = bodies.get(url);
    if (body === undefined) {
      return Promise.reject(new Error(`No fixture configured for ${url}`));
    }
    return Promise.resolve({ status: 200, body });
  };
}
