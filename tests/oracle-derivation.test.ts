import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { deriveFromVendoredFixtures, transcribe } from "../scripts/oracle.js";

const EXPECTATIONS_PATH = fileURLToPath(
  new URL("./fixtures/expectations.json", import.meta.url),
);

interface Expectations {
  expectations: {
    file: string;
    field: string;
    scope: string;
    value: string | number[];
  }[];
}

function committed(): Expectations {
  return JSON.parse(readFileSync(EXPECTATIONS_PATH, "utf8")) as Expectations;
}

test("the expectations file still matches the Expect: comments it came from", () => {
  // The whole point of the oracle is that nobody in this repository authored it.
  // This is what makes that true: the file is re-derived from the vendored XML
  // on every test run, so a hand edit that weakened an expectation shows up here.
  expect(readFileSync(EXPECTATIONS_PATH, "utf8")).toBe(
    deriveFromVendoredFixtures(),
  );
});

test("the oracle covers both feed formats and every field the reader extracts", () => {
  const { expectations } = committed();

  const formats = new Set(
    expectations.map(({ file }) => file.split("/")[1] ?? ""),
  );
  expect(formats).toEqual(new Set(["rss", "atom10"]));

  const fields = new Set(expectations.map(({ field }) => field));
  for (const field of ["title", "link", "guid", "id", "published"]) {
    expect(fields).toContain(field);
  }
  expect(
    expectations.filter(({ scope }) => scope === "item").length,
  ).toBeGreaterThan(0);
  expect(
    expectations.filter(({ scope }) => scope === "feed").length,
  ).toBeGreaterThan(0);
});

test("transcribing reads feedparser's literal exactly, quoting and all", () => {
  const fixture = (expect_: string) =>
    `<!--\nDescription: d\nExpect:      ${expect_}\n-->\n<rss/>`;

  expect(
    transcribe(
      "f.xml",
      fixture("not bozo and entries[0]['title'] == 'Item 1 title'"),
    ),
  ).toMatchObject({
    scope: "item",
    index: 0,
    field: "title",
    value: "Item 1 title",
  });

  // Double quoting exists upstream only because the value contains an apostrophe.
  expect(
    transcribe(
      "f.xml",
      fixture(`not bozo and feed['title'] == "Mark's title"`),
    ),
  ).toMatchObject({ scope: "feed", field: "title", value: "Mark's title" });

  expect(
    transcribe(
      "f.xml",
      fixture(
        "not bozo and entries[0]['published_parsed'] == (2004, 1, 1, 19, 48, 21, 3, 1, 0)",
      ),
    ),
  ).toMatchObject({
    field: "published_parsed",
    value: [2004, 1, 1, 19, 48, 21, 3, 1, 0],
  });
});

test("an expression outside the transcribable subset is refused, never guessed", () => {
  const fixture = (expect_: string) =>
    `<!--\nDescription: d\nExpect:      ${expect_}\n-->\n<rss/>`;

  // A nested target, a second clause, a chained comparison, and a literal that
  // would need Python to settle. Each must drop out rather than be interpreted.
  expect(
    transcribe("f.xml", fixture("not bozo and feed['image']['link'] == 'x'")),
  ).toBeUndefined();
  expect(
    transcribe(
      "f.xml",
      fixture("not bozo and feed['description'] == '' and feed['link'] == 'x'"),
    ),
  ).toBeUndefined();
  expect(
    transcribe(
      "f.xml",
      fixture("entries[0]['link'] == entries[1]['link'] == 'x'"),
    ),
  ).toBeUndefined();
  expect(
    transcribe("f.xml", fixture(String.raw`feed['title'] == 'it\'s'`)),
  ).toBeUndefined();
  expect(transcribe("f.xml", "<rss/>")).toBeUndefined();
});
