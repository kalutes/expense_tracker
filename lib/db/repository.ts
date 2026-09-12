import crypto from 'node:crypto';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { db, accounts, transactions, Account, NewAccount, Transaction } from './index';
import { ParsedStatement } from '../parsers/types';

export async function getAccounts(): Promise<Account[]> {
  return db.select().from(accounts).all();
}

export async function getAccountById(id: string): Promise<Account | undefined> {
  const result = db.select().from(accounts).where(eq(accounts.id, id)).get();
  return result;
}

export async function upsertAccount(data: NewAccount): Promise<Account> {
  const existing = await getAccountById(data.id);
  const now = new Date().toISOString();

  if (existing) {
    const isNewerOrEqual =
      !existing.lastSyncedAt ||
      !data.lastSyncedAt ||
      data.lastSyncedAt >= existing.lastSyncedAt;

    db.update(accounts)
      .set({
        name: data.name ?? existing.name,
        currentBalance: isNewerOrEqual && data.currentBalance !== undefined ? data.currentBalance : existing.currentBalance,
        accountNumber: data.accountNumber ?? existing.accountNumber,
        lastSyncedAt: isNewerOrEqual ? (data.lastSyncedAt ?? existing.lastSyncedAt) : existing.lastSyncedAt,
        updatedAt: now,
      })
      .where(eq(accounts.id, data.id))
      .run();
    return (await getAccountById(data.id))!;
  }

  db.insert(accounts)
    .values({
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return (await getAccountById(data.id))!;
}


export interface TransactionFilter {
  accountId?: string;
  currency?: 'JPY' | 'USD';
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export async function getTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
  const conditions = [];
  if (filter?.accountId) {
    conditions.push(eq(transactions.accountId, filter.accountId));
  }
  if (filter?.currency) {
    conditions.push(eq(transactions.currency, filter.currency));
  }
  if (filter?.startDate) {
    conditions.push(gte(transactions.date, filter.startDate));
  }
  if (filter?.endDate) {
    conditions.push(lte(transactions.date, filter.endDate));
  }

  let query = db.select().from(transactions);

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const finalQuery = query
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(filter?.limit ?? -1)
    .offset(filter?.offset ?? 0);

  return finalQuery.all();
}

export interface StatementSyncResult {
  account: Account;
  totalParsed: number;
  insertedCount: number;
  skippedDuplicateCount: number;
  currentBalance: number;
}

/**
 * Ingests a ParsedStatement (or array of ParsedStatements) into the database:
 * 1. Finds or creates the target Account.
 * 2. Inserts new transactions (skipping duplicates).
 * 3. Updates the Account's balance and lastSyncedAt timestamp if the statement is current/newer.
 */
export async function syncStatementToDb(
  statement: ParsedStatement | ParsedStatement[],
  overrideAccountId?: string
): Promise<StatementSyncResult[]> {
  const stmts = Array.isArray(statement) ? statement : [statement];
  const results: StatementSyncResult[] = [];

  for (const stmt of stmts) {
    const defaultId = stmt.accountId || stmt.institution.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const accountId = overrideAccountId || defaultId;

    // Get existing account before upsert to check lastSyncedAt and preserve user customizations
    const existingAcc = await getAccountById(accountId);
    const syncSource = 'statement';

    // Upsert Account dynamically
    const account = await upsertAccount({
      id: accountId,
      name: existingAcc?.name || stmt.institutionName || stmt.institution,
      type: existingAcc?.type || stmt.accountType || 'bank',
      institution: stmt.institution,
      currency: existingAcc?.currency || stmt.currency || 'USD',
      currentBalance: stmt.currentBalance ?? existingAcc?.currentBalance ?? 0,
      accountNumber: stmt.accountNumber ?? existingAcc?.accountNumber,
      syncSource,
      lastSyncedAt: stmt.statementDate || new Date().toISOString().split('T')[0],
    });

    let insertedCount = 0;
    let skippedDuplicateCount = 0;
    const now = new Date().toISOString();

    // Insert transactions with deduplication
    for (const t of stmt.transactions) {
      const existing = db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.dedupHash, t.dedupHash))
        .get();

      if (existing) {
        skippedDuplicateCount++;
        continue;
      }

      const txnId = crypto.randomUUID();
      db.insert(transactions)
        .values({
          id: txnId,
          accountId: account.id,
          date: t.date,
          amount: t.amount,
          currency: t.currency,
          merchant: t.merchant,
          status: t.status,
          source: syncSource,
          externalId: t.externalId,
          runningBalance: t.runningBalance,
          dedupHash: t.dedupHash,
          rawDetails: t.rawDetails ? JSON.stringify(t.rawDetails) : null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      insertedCount++;
    }


    // Only update balance if statement has a balance AND is newer than or equal to current lastSyncedAt
    if (stmt.currentBalance !== undefined) {
      const isNewerOrEqual =
        !existingAcc?.lastSyncedAt ||
        !stmt.statementDate ||
        stmt.statementDate >= existingAcc.lastSyncedAt;

      if (isNewerOrEqual) {
        db.update(accounts)
          .set({
            currentBalance: stmt.currentBalance,
            lastSyncedAt: stmt.statementDate || new Date().toISOString().split('T')[0],
            updatedAt: now,
          })
          .where(eq(accounts.id, account.id))
          .run();
      }
    }

    const updatedAccount = (await getAccountById(account.id))!;

    results.push({
      account: updatedAccount,
      totalParsed: stmt.transactionCount,
      insertedCount,
      skippedDuplicateCount,
      currentBalance: updatedAccount.currentBalance,
    });
  }

  return results;
}

