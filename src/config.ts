// The Feed list, and the only way to change it: edit the file and restart.

import { readFileSync } from "node:fs";

/** Render sleeps after 15 minutes idle; a longer interval would rarely fire. */
export const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/**
 * The interval between Refreshes, from the environment. Rejected rather than
 * coerced: `Number("soon")` is NaN, and `setInterval` treats NaN as 1ms — a
 * Refresh loop hammering the database instead of a timer.
 */
export function loadRefreshIntervalMs(configured: string | undefined): number {
  if (configured === undefined) return DEFAULT_REFRESH_INTERVAL_MS;
  const intervalMs = Number(configured);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error(
      `REFRESH_INTERVAL_MS must be a positive number of milliseconds, not ${configured}`,
    );
  }
  return intervalMs;
}

/** The configured Feed URLs, in the order the file lists them. */
export function loadFeeds(configPath: string): string[] {
  const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
  if (
    !Array.isArray(parsed) ||
    parsed.some((feed) => typeof feed !== "string")
  ) {
    throw new Error(`${configPath} must hold a JSON array of Feed URLs`);
  }
  return parsed as string[];
}
