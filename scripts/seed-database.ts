#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseStatement } from '../lib/parsers';
import { getAccounts, getTransactions, syncStatementToDb } from '../lib/db/repository';

function formatCurrency(amount: number, currency: string = 'JPY'): string {
  if (currency === 'JPY') {
    const prefix = amount < 0 ? '-¥' : '¥';
    return `${prefix}${Math.abs(Math.round(amount)).toLocaleString('ja-JP')}`;
  }
  const prefix = amount < 0 ? '-$' : '$';
  return `${prefix}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function walkStatementFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkStatementFiles(fullPath));
    } else if ((entry.name.endsWith('.csv') || entry.name.endsWith('.pdf')) && !entry.name.includes(':')) {
      results.push(fullPath);
    }
  }
  return results.sort(); // Sort files
}


async function seed() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npx tsx scripts/seed-database.ts [path-to-statements-dir]

Options:
  --help, -h    Show this help message

Examples:
  npx tsx scripts/seed-database.ts ./statements
  npx tsx scripts/seed-database.ts /path/to/my/statements
  npx tsx scripts/seed-database.ts ./data/statements
`);
    return;
  }

  console.log('\n🚀 Initializing SQLite Database and Seeding from Statements...\n');

  let statementsDir: string;
  const customArg = args.find((a) => !a.startsWith('-'));

  if (customArg) {
    statementsDir = path.resolve(process.cwd(), customArg);
  } else if (process.env.STATEMENTS_DIR) {
    statementsDir = path.resolve(process.cwd(), process.env.STATEMENTS_DIR);
  } else {
    const rootStatements = path.resolve(process.cwd(), 'statements');
    statementsDir = fs.existsSync(rootStatements)
      ? rootStatements
      : path.resolve(process.cwd(), 'data/statements');
  }

  console.log(`📂 Statements Directory: ${statementsDir}`);

  if (!fs.existsSync(statementsDir)) {
    console.log(`❌ Error: Directory does not exist: ${statementsDir}`);
    console.log('Usage: npx tsx scripts/seed-database.ts [path-to-statements-dir]\n');
    return;
  }

  const files = walkStatementFiles(statementsDir);

  if (files.length === 0) {
    console.log(`No statement files (.csv, .pdf) found in: ${statementsDir}`);
    console.log('Provide a directory path containing statement files, e.g.:');
    console.log('  npx tsx scripts/seed-database.ts /path/to/statements\n');
    return;
  }

  console.log(`📂 Processing ${files.length} statement files (CSVs & PDFs)...`);

  let totalParsed = 0;
  let totalInserted = 0;
  let totalDuplicates = 0;
  const startTime = performance.now();

  for (const filePath of files) {
    const relPath = path.relative(process.cwd(), filePath);
    try {
      const buffer = fs.readFileSync(filePath);
      const parsed = parseStatement(filePath.endsWith('.pdf') ? filePath : buffer);
      const results = await syncStatementToDb(parsed);

      for (const res of results) {
        totalParsed += res.totalParsed;
        totalInserted += res.insertedCount;
        totalDuplicates += res.skippedDuplicateCount;

        const balStr = formatCurrency(res.currentBalance, res.account.currency);
        console.log(
          `  📥 [${res.account.id.padEnd(20, ' ')}] ${relPath.padEnd(45, ' ')} -> ${res.insertedCount.toString().padStart(2, ' ')} new, ${res.skippedDuplicateCount.toString().padStart(2, ' ')} dups (Bal: ${balStr})`
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Error processing ${relPath}:`, errorMsg);
    }
  }

  const duration = (performance.now() - startTime).toFixed(2);
  const accountsList = await getAccounts();
  const allTransactions = await getTransactions();

  console.log('\n======================================================');
  console.log(`🎉 DATABASE SEED COMPLETE (${duration}ms)`);
  console.log('======================================================');
  console.log(`💾 Database File:       data/expense_tracker.db`);
  console.log(`📊 Total Ingested Txns: ${totalInserted.toLocaleString()} (from ${totalParsed.toLocaleString()} parsed, ${totalDuplicates} dups skipped)`);
  console.log(`🗄️ Database Total Txns: ${allTransactions.length.toLocaleString()}`);
  console.log('------------------------------------------------------');
  console.log('🏦 Account Balances:');

  let totalBankCashJPY = 0;
  let totalCardDebtJPY = 0;
  let totalBankCashUSD = 0;
  let totalCardDebtUSD = 0;

  for (const acc of accountsList) {
    const badge = acc.type === 'bank' ? '🏦 CASH' : '💳 DEBT';
    console.log(
      `  • ${acc.name.padEnd(32, ' ')} [${badge}] ${formatCurrency(acc.currentBalance, acc.currency).padStart(12, ' ')} (Last Sync: ${acc.lastSyncedAt || 'N/A'})`
    );
    if (acc.currency === 'JPY') {
      if (acc.type === 'bank') totalBankCashJPY += acc.currentBalance;
      else totalCardDebtJPY += acc.currentBalance;
    } else if (acc.currency === 'USD') {
      if (acc.type === 'bank') totalBankCashUSD += acc.currentBalance;
      else totalCardDebtUSD += acc.currentBalance;
    }
  }

  console.log('------------------------------------------------------');
  console.log(`💰 JPY Total Bank Cash:   ${formatCurrency(totalBankCashJPY, 'JPY')}`);
  console.log(`💳 JPY Total Card Debt:   ${formatCurrency(totalCardDebtJPY, 'JPY')}`);
  console.log(`📈 JPY Net Position:      ${formatCurrency(totalBankCashJPY - totalCardDebtJPY, 'JPY')}`);
  console.log('------------------------------------------------------');
  console.log(`💵 USD Total Bank Cash:   ${formatCurrency(totalBankCashUSD, 'USD')}`);
  console.log(`💳 USD Total Card Debt:   ${formatCurrency(totalCardDebtUSD, 'USD')}`);
  console.log(`📈 USD Net Position:      ${formatCurrency(totalBankCashUSD - totalCardDebtUSD, 'USD')}`);
  console.log('======================================================\n');
}

seed().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});

