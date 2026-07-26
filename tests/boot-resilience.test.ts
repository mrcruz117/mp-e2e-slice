// Stories 30 and 36 at the boot boundary: the resilience specs drive `refresh()`
// directly, so nothing there would notice a failing Feed taking the whole app
// down with it. Written by the resilience ticket for that gap.

import { afterEach, expect, test } from "vitest";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { start } from "../src/start.js";
import type { Item } from "../src/items.js";
import type { TemporaryDatabase } from "./harness.js";
import { temporaryDatabase } from "./harness.js";

const WEB_ROOT = fileURLToPath(new URL("../web", import.meta.url));

const GOOD = `<rss version="2.0"><channel><title>Good</title>
<item><guid>urn:good</guid><title>Still here</title></item>
</channel></rss>`;

let app: FastifyInstance | undefined;
let database: TemporaryDatabase | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  database?.remove();
  database = undefined;
});

/** The port the server actually got, having been asked for any free one. */
function portOf(instance: FastifyInstance): number {
  const address = instance.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the server reported no port");
  }
  return address.port;
}

test("a Feed that fails at boot stops neither startup nor serving", async () => {
  database = temporaryDatabase();

  app = await start({
    databasePath: database.path,
    feeds: ["dead", "good"],
    fetchFeed: (url) =>
      url === "good"
        ? Promise.resolve({ status: 200, body: GOOD })
        : Promise.reject(new Error("getaddrinfo ENOTFOUND dead.example.com")),
    webRoot: WEB_ROOT,
    host: "127.0.0.1",
    port: 0,
  });

  const response = await fetch(
    `http://127.0.0.1:${String(portOf(app))}/api/items`,
  );
  expect(response.status).toBe(200);
  const items = (await response.json()) as Item[];
  expect(items.map(({ title }) => title)).toEqual(["Still here"]);
});
