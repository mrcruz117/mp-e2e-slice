// Driving the app the way a reader does: through the HTTP API, never through
// its internals. Refresh and the read endpoint open the database separately, so
// a test needs a real file rather than `:memory:`.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import type { Item } from "../src/items.js";

export function temporaryDatabase(): { path: string; remove: () => void } {
  const directory = mkdtempSync(join(tmpdir(), "feed-reader-"));
  return {
    path: join(directory, "test.db"),
    remove: () => {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** Every Item the reader would see, in the order the reader would see it. */
export async function readItems(databasePath: string): Promise<Item[]> {
  const app = createApp({ databasePath });
  try {
    const response = await app.inject({ method: "GET", url: "/api/items" });
    if (response.statusCode !== 200) {
      throw new Error(`GET /api/items returned ${String(response.statusCode)}`);
    }
    return response.json<Item[]>();
  } finally {
    await app.close();
  }
}
