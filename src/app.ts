import Fastify, { type FastifyInstance } from "fastify";
import { openDatabase } from "./db.js";
import type { Item } from "./items.js";

interface ItemRow {
  id: number;
  item_id: string;
  feed_title: string | null;
  title: string | null;
  link: string | null;
  published: string | null;
  read: number;
}

const SELECT_ITEMS = `
SELECT items.id, items.item_id, feeds.title AS feed_title, items.title, items.link,
       items.published, items.read
FROM items
JOIN feeds ON feeds.id = items.feed_id
-- Items first seen in the same Refresh share a date; the rowid breaks the tie,
-- so a position is the same on every read.
ORDER BY COALESCE(items.published, items.first_seen) DESC, items.id DESC
`;

// Read state is set, never unset: a repeat mark writes the same value.
const MARK_READ = `UPDATE items SET read = 1 WHERE id = ?`;

export function createApp(options: { databasePath: string }): FastifyInstance {
  const db = openDatabase(options.databasePath);
  const app = Fastify({ logger: true });

  app.addHook("onClose", () => {
    db.close();
  });

  const selectItems = db.prepare(SELECT_ITEMS);

  app.get("/api/items", (): Item[] =>
    // node:sqlite types rows as Record<string, SQLOutputValue>; the column list
    // above is what actually fixes their shape, so the cast is the assertion.
    (selectItems.all() as unknown as ItemRow[]).map((row) => ({
      id: row.id,
      itemId: row.item_id,
      feedTitle: row.feed_title,
      title: row.title,
      link: row.link,
      published: row.published,
      read: row.read !== 0,
    })),
  );

  const markRead = db.prepare(MARK_READ);

  app.post<{ Params: { id: number } }>(
    "/api/items/:id/read",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "integer" } } },
      },
    },
    (request, reply) => {
      markRead.run(request.params.id);
      return reply.code(204).send();
    },
  );

  return app;
}
