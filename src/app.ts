import Fastify, { type FastifyInstance } from "fastify";
import { openDatabase } from "./db.js";

export interface Item {
  id: number;
  feedTitle: string | null;
  title: string | null;
  link: string | null;
  published: string | null;
  read: boolean;
}

interface ItemRow {
  id: number;
  feed_title: string | null;
  title: string | null;
  link: string | null;
  published: string | null;
  read: number;
}

const SELECT_ITEMS = `
SELECT items.id, feeds.title AS feed_title, items.title, items.link,
       items.published, items.read
FROM items
JOIN feeds ON feeds.id = items.feed_id
ORDER BY COALESCE(items.published, items.first_seen) DESC
`;

export function createApp(options: { databasePath: string }): FastifyInstance {
  const db = openDatabase(options.databasePath);
  const app = Fastify({ logger: true });

  app.addHook("onClose", () => {
    db.close();
  });

  const selectItems = db.prepare(SELECT_ITEMS);

  app.get("/api/items", (): Item[] =>
    (selectItems.all() as unknown as ItemRow[]).map((row) => ({
      id: row.id,
      feedTitle: row.feed_title,
      title: row.title,
      link: row.link,
      published: row.published,
      read: row.read !== 0,
    })),
  );

  return app;
}
