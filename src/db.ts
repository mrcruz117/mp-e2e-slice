import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS feeds (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  url   TEXT NOT NULL UNIQUE,
  title TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id    INTEGER NOT NULL REFERENCES feeds(id),
  item_id    TEXT NOT NULL,
  title      TEXT,
  link       TEXT,
  published  TEXT,
  first_seen TEXT NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (feed_id, item_id)
) STRICT;
`;

export function openDatabase(databasePath: string): DatabaseSync {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
