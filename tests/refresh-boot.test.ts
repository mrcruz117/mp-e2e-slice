// Story 2: the boot Refresh finishes before the server accepts connections, so
// the first reader through the door gets a list rather than an empty page.
//
// The Refresh is held open on the fetch seam; while it is held, nothing is
// listening. That ordering is the whole assertion.

import { afterEach, expect, test } from "vitest";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { start } from "../src/start.js";
import type { Item } from "../src/items.js";
import type { TemporaryDatabase } from "./harness.js";
import { temporaryDatabase } from "./harness.js";

const WEB_ROOT = fileURLToPath(new URL("../web", import.meta.url));

const FEED = `<rss version="2.0"><channel><title>Blog</title>
<item><guid>urn:1</guid><title>First</title></item>
</channel></rss>`;

let app: FastifyInstance | undefined;
let database: TemporaryDatabase | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  database?.remove();
  database = undefined;
});

/** A port nothing is listening on, so a connection to it can only be refused. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (address === null || typeof address === "string") {
          reject(new Error("the probe reported no port"));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

test("the server accepts no connection until the boot Refresh has finished", async () => {
  database = temporaryDatabase();
  const port = await freePort();
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  const starting = start({
    databasePath: database.path,
    feeds: ["http://blog.example.com/rss"],
    fetchFeed: async () => {
      await held;
      return { status: 200, body: FEED };
    },
    webRoot: WEB_ROOT,
    host: "127.0.0.1",
    port,
  });

  await expect(
    fetch(`http://127.0.0.1:${String(port)}/api/items`),
  ).rejects.toThrow();

  release();
  app = await starting;

  // The first response the server ever gives already has the Refresh in it.
  const response = await fetch(`http://127.0.0.1:${String(port)}/api/items`);
  const items = (await response.json()) as Item[];
  expect(items.map(({ title }) => title)).toEqual(["First"]);
});
