// The Feed list, and the only way to change it: edit the file and restart.

import { readFileSync } from "node:fs";

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
