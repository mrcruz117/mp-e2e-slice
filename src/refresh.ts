// One pass over every configured Feed: fetch, parse, insert. Each Feed is
// handled on its own, so one dead blog costs exactly one Feed.

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

/**
 * What one Feed contributed to one Refresh. `status` is null when the fetch
 * never produced a response, and `error` is present exactly when the Feed was
 * skipped. Response bodies are never part of it.
 */
export interface FeedRefreshLine {
  url: string;
  status: number | null;
  inserted: number;
  skipped: number;
  durationMs: number;
  error?: string;
}

export interface RefreshOptions {
  databasePath: string;
  /** The configured Feed URLs, in configuration order. */
  feeds: string[];
  fetchFeed: FetchFeed;
  /**
   * One structured line per Feed per Refresh. Optional so that the specs
   * written before it stay unedited; the default drops the line.
   */
  logFeedRefresh?: (line: FeedRefreshLine) => void;
}

/** Boot cannot be held hostage by one slow server. */
const FETCH_TIMEOUT_MS = 10_000;

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

interface Counts {
  inserted: number;
  skipped: number;
}

function storeFeed(
  database: DatabaseSync,
  url: string,
  body: string,
  firstSeen: string,
): Counts {
  const feed = parseFeed(body);
  const [row] = database
    .prepare(UPSERT_FEED)
    .all(url, feed.title) as unknown as [{ id: number }];
  const insertItem = database.prepare(INSERT_ITEM);

  const storable = feed.items.filter(isStorable);
  let inserted = 0;
  for (const item of storable) {
    // Already-stored Items insert nothing; only genuinely new ones count.
    const result = insertItem.run(
      row.id,
      item.itemId,
      item.title,
      item.link,
      item.published,
      firstSeen,
    );
    inserted += Number(result.changes);
  }
  return { inserted, skipped: feed.items.length - storable.length };
}

/**
 * The seam's promise, or a rejection once the timeout elapses. A `setTimeout`
 * race rather than `AbortSignal.timeout()`; see ADR-0004.
 */
async function fetchWithinTimeout(
  fetchFeed: FetchFeed,
  url: string,
): Promise<FetchedFeed> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(`Feed fetch timed out after ${String(FETCH_TIMEOUT_MS)}ms`),
      );
    }, FETCH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([fetchFeed(url), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One Feed, in isolation: whatever it does, the caller gets a line about it. */
async function refreshFeed(
  database: DatabaseSync,
  url: string,
  fetchFeed: FetchFeed,
  firstSeen: string,
): Promise<FeedRefreshLine> {
  const startedAt = Date.now();
  const line = (
    rest: Omit<FeedRefreshLine, "url" | "durationMs">,
  ): FeedRefreshLine => ({
    url,
    durationMs: Date.now() - startedAt,
    ...rest,
  });

  let status: number | null = null;
  try {
    const fetched = await fetchWithinTimeout(fetchFeed, url);
    status = fetched.status;
    if (status !== 200) {
      return line({
        status,
        inserted: 0,
        skipped: 0,
        error: `Feed responded ${String(status)}`,
      });
    }
    return line({
      status,
      ...storeFeed(database, url, fetched.body, firstSeen),
    });
  } catch (error) {
    // Fetch failure, timeout, or a body carrying no Feed: the Item rows this
    // Feed already has stay exactly as they are.
    return line({ status, inserted: 0, skipped: 0, error: reasonOf(error) });
  }
}

/**
 * One pass over every configured Feed: fetch, parse, insert Items not already
 * stored. Never removes stored Items, and never throws out of its caller — a
 * Feed that fails is logged, skipped, and costs only itself.
 */
export async function refresh(options: RefreshOptions): Promise<void> {
  const log = options.logFeedRefresh ?? (() => undefined);
  const database = openDatabase(options.databasePath);
  const firstSeen = new Date().toISOString();
  try {
    for (const url of options.feeds) {
      log(await refreshFeed(database, url, options.fetchFeed, firstSeen));
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
