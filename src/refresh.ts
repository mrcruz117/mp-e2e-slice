// The Refresh contract. Only the shapes are here; the behaviour arrives with the
// tickets that un-skip the specs already written against it.
//
// This file exists now because those specs do. They are the oracle's reach into
// the application, and a spec that does not compile is not a spec.

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

/**
 * One pass over every configured Feed: fetch, parse, insert Items not already
 * stored. Never throws out of its caller and never removes stored Items.
 */
export function refresh(options: RefreshOptions): Promise<void> {
  return Promise.reject(
    new Error(
      `Refresh is not implemented yet; ${String(options.feeds.length)} Feeds are configured.`,
    ),
  );
}

/** Refresh on a timer for as long as the process lives. Returns a stop function. */
export function startRefreshing(
  options: RefreshOptions & { intervalMs: number },
): () => void {
  throw new Error(
    `Periodic Refresh is not implemented yet; the interval would be ${String(options.intervalMs)}ms.`,
  );
}
