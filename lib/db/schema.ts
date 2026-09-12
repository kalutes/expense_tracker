import { sql } from 'drizzle-orm';
import { sqliteTable, text, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<'bank' | 'credit' | (string & {})>().notNull(),
  institution: text('institution').notNull(),
  currency: text('currency').$type<'JPY' | 'USD' | (string & {})>().notNull(),
  currentBalance: real('current_balance').notNull().default(0),
  accountNumber: text('account_number'),
  syncSource: text('sync_source').$type<'csv' | 'pdf' | 'manual' | (string & {})>().notNull().default('manual'),
  lastSyncedAt: text('last_synced_at'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // ISO YYYY-MM-DD
    amount: real('amount').notNull(), // Positive = Expense / Outflow, Negative = Income / Inflow
    currency: text('currency').$type<'JPY' | 'USD' | (string & {})>().notNull(),
    merchant: text('merchant').notNull(),
    category: text('category'),
    status: text('status').$type<'posted' | 'pending'>().notNull().default('posted'),
    source: text('source').$type<'csv' | 'pdf' | 'manual' | (string & {})>().notNull().default('manual'),

    externalId: text('external_id'),
    runningBalance: real('running_balance'),
    dedupHash: text('dedup_hash').notNull(),
    rawDetails: text('raw_details'), // JSON string of raw metadata
    createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex('idx_transactions_dedup_hash').on(table.dedupHash),
    index('idx_transactions_account_date').on(table.accountId, table.date),
    index('idx_transactions_date').on(table.date),
  ]
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
