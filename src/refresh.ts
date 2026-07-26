// One pass over every configured Feed. Per-Feed timeout and the structured log
// line that counts what a Feed contributed belong to the resilience ticket; what
// is here is fetch, parse, insert.

import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./db.js";
import { parseFeed } from "./parse.js";
import type { ParsedItem } from "./parse.js";

/** What the fetch seam hands back. A hang is a promise that never settles. */
export interface FetchedFeed {
  status: number;
  body: string;
}

/**
 * The single seam in the codebase: how a Feed's XML is obtained. Production uses
 * HTTP; tests supply a local stub. Nothing else anywhere is stubbed.
 */
export type FetchFeed = (url: string) => Promise<FetchedFeed>;

export interface RefreshOptions {
  databasePath: string;
  /** The configured Feed URLs, in configuration order. */
  feeds: string[];
  fetchFeed: FetchFeed;
}

const UPSERT_FEED = `
INSERT INTO feeds (url, title) VALUES (?, ?)
ON CONFLICT (url) DO UPDATE SET title = excluded.title
RETURNING id
`;

// UNIQUE (feed_id, item_id) is the dedup: an Item already stored is left exactly
// as it is, read state and position included.
const INSERT_ITEM = `
INSERT OR IGNORE INTO items (feed_id, item_id, title, link, published, first_seen)
VALUES (?, ?, ?, ?, ?, ?)
`;

/** Identity is the publisher's, per Feed; an Item with none cannot be deduped. */
function isStorable(item: ParsedItem): boolean {
  return item.itemId !== null;
}

function storeFeed(
  database: DatabaseSync,
  url: string,
  body: string,
  firstSeen: string,
): void {
  const feed = parseFeed(body);
  const [row] = database
    .prepare(UPSERT_FEED)
    .all(url, feed.title) as unknown as [{ id: number }];
  const insertItem = database.prepare(INSERT_ITEM);

  for (const item of feed.items.filter(isStorable)) {
    insertItem.run(
      row.id,
      item.itemId,
      item.title,
      item.link,
      item.published,
      firstSeen,
    );
  }
}

/**
 * One pass over every configured Feed: fetch, parse, insert Items not already
 * stored. Never removes stored Items. A Feed that fails still aborts the pass —
 * per-Feed isolation and its timeout arrive with the resilience ticket.
 */
export async function refresh(options: RefreshOptions): Promise<void> {
  const database = openDatabase(options.databasePath);
  const firstSeen = new Date().toISOString();
  try {
    for (const url of options.feeds) {
      const fetched = await options.fetchFeed(url);
      if (fetched.status === 200) {
        storeFeed(database, url, fetched.body, firstSeen);
      }
    }
  } finally {
    database.close();
  }
}

/** Refresh on a timer for as long as the process lives. Returns a stop function. */
export function startRefreshing(
  options: RefreshOptions & { intervalMs: number },
): () => void {
  throw new Error(
    `Periodic Refresh is not implemented yet; the interval would be ${String(options.intervalMs)}ms.`,
  );
}
