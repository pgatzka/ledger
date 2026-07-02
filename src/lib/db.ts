import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// A single shared connection per process, opened lazily on first use. Opening at
// import time breaks `next build`, where multiple worker processes import the
// route modules concurrently and contend on the SQLite file. Deferring the open
// to the first real query keeps it out of the build's page-data collection.
declare global {
  // eslint-disable-next-line no-var
  var __ledgerDb: Database.Database | undefined;
}

function openDb(): Database.Database {
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "ledger.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const conn = new Database(dbPath);
  conn.pragma("journal_mode = WAL");
  conn.pragma("busy_timeout = 5000");
  conn.pragma("foreign_keys = ON");

  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  conn.exec(fs.readFileSync(schemaPath, "utf8"));
  return conn;
}

function getDb(): Database.Database {
  if (!globalThis.__ledgerDb) {
    globalThis.__ledgerDb = openDb();
  }
  return globalThis.__ledgerDb;
}

// A Proxy so callers can keep writing `db.prepare(...)` while the underlying
// connection is created only on first property access (i.e. at request time).
export const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const conn = getDb();
    const value = Reflect.get(conn as object, prop, receiver);
    return typeof value === "function" ? value.bind(conn) : value;
  },
});
