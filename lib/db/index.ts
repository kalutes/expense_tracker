import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data/expense_tracker.db');

function getDatabasePath(): string {
  if (process.env.DATABASE_URL) {
    const raw = process.env.DATABASE_URL.replace(/^file:/, '');
    return path.resolve(process.cwd(), raw);
  }
  return DEFAULT_DB_PATH;
}

let sqliteInstance: Database.Database | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getSqliteDb(): { sqlite: Database.Database; db: ReturnType<typeof drizzle<typeof schema>> } {
  if (dbInstance && sqliteInstance) {
    return { sqlite: sqliteInstance, db: dbInstance };
  }

  const dbPath = getDatabasePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  sqliteInstance = new Database(dbPath);
  sqliteInstance.pragma('journal_mode = WAL');
  sqliteInstance.pragma('foreign_keys = ON');

  // Ensure tables exist
  sqliteInstance.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      institution TEXT NOT NULL,
      currency TEXT NOT NULL,
      current_balance REAL NOT NULL DEFAULT 0,
      account_number TEXT,
      sync_source TEXT NOT NULL DEFAULT 'manual',
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      merchant TEXT NOT NULL,
      category TEXT,
      status TEXT NOT NULL DEFAULT 'posted',
      source TEXT NOT NULL DEFAULT 'manual',
      external_id TEXT,
      running_balance REAL,
      dedup_hash TEXT NOT NULL UNIQUE,
      raw_details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_dedup_hash ON transactions(dedup_hash);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  `);

  dbInstance = drizzle(sqliteInstance, { schema });
  return { sqlite: sqliteInstance, db: dbInstance };
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    const { db } = getSqliteDb();
    return Reflect.get(db, prop);
  },
});

export * from './schema';
