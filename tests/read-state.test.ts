// Read state through the API: set by the reader, never unset, per Item, and
// unaffected by a later Refresh.
//
// Un-skipped by the ticket that implements read state.

import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { refresh } from "../src/refresh.js";
import type { TemporaryDatabase } from "./harness.js";
import { readItems, temporaryDatabase } from "./harness.js";

const TWO_ITEMS = `<rss version="2.0"><channel><title>Blog</title>
<item><guid>urn:1</guid><title>First</title><link>http://example.com/1</link></item>
<item><guid>urn:2</guid><title>Second</title><link>http://example.com/2</link></item>
</channel></rss>`;

let database: TemporaryDatabase | undefined;

afterEach(() => {
  database?.remove();
  database = undefined;
});

async function markRead(databasePath: string, id: number) {
  const app = createApp({ databasePath });
  try {
    return await app.inject({
      method: "POST",
      url: `/api/items/${String(id)}/read`,
    });
  } finally {
    await app.close();
  }
}

async function seedTwoItems() {
  database = temporaryDatabase();
  await refresh({
    databasePath: database.path,
    feeds: ["blog"],
    fetchFeed: () => Promise.resolve({ status: 200, body: TWO_ITEMS }),
  });
  return database.path;
}

describe("the reader's progress is remembered", () => {
  test("marking an Item read is visible on the next read, and only for that Item", async () => {
    const path = await seedTwoItems();
    const [first, second] = await readItems(path);
    expect(first?.read).toBe(false);
    expect(second?.read).toBe(false);

    const response = await markRead(path, first?.id ?? 0);
    expect(response.statusCode).toBeLessThan(300);

    const after = await readItems(path);
    expect(after.find(({ id }) => id === first?.id)?.read).toBe(true);
    expect(after.find(({ id }) => id === second?.id)?.read).toBe(false);
  });

  test("marking an Item read twice is not an error and does not unmark it", async () => {
    const path = await seedTwoItems();
    const [first] = await readItems(path);

    await markRead(path, first?.id ?? 0);
    const second = await markRead(path, first?.id ?? 0);
    expect(second.statusCode).toBeLessThan(300);

    expect(
      (await readItems(path)).find(({ id }) => id === first?.id)?.read,
    ).toBe(true);
  });

  test("read state survives a Refresh that brings in new Items", async () => {
    const path = await seedTwoItems();
    const [first] = await readItems(path);
    await markRead(path, first?.id ?? 0);

    await refresh({
      databasePath: path,
      feeds: ["blog"],
      fetchFeed: () =>
        Promise.resolve({
          status: 200,
          body: TWO_ITEMS.replace(
            "</channel>",
            `<item><guid>urn:3</guid><title>Third</title></item></channel>`,
          ),
        }),
    });

    const after = await readItems(path);
    expect(after).toHaveLength(3);
    expect(after.find(({ id }) => id === first?.id)?.read).toBe(true);
  });
});
