import { afterEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/app.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

test("a reader with no Feeds configured gets an empty Item list", async () => {
  app = createApp({ databasePath: ":memory:" });

  const response = await app.inject({ method: "GET", url: "/api/items" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual([]);
});
