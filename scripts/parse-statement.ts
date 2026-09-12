#!/usr/bin/env node
import fs from 'node:fs';
import { parseStatement } from '../lib/parsers';

function formatCurrency(amount: number, currency: string = 'JPY'): string {
  if (currency === 'JPY') {
    const prefix = amount < 0 ? '-¥' : '¥';
    return `${prefix}${Math.abs(Math.round(amount)).toLocaleString('ja-JP')}`;
  }
  const prefix = amount < 0 ? '-$' : '$';
  return `${prefix}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/parse-statement.ts <path-to-csv> [--json] [--limit <n>]');
    process.exit(1);
  }

  const filePath = args[0];
  const isJson = args.includes('--json');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10;

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const startTime = performance.now();

  try {
    const rawParsed = parseStatement(filePath.endsWith('.pdf') ? filePath : fileBuffer);
    const durationMs = (performance.now() - startTime).toFixed(2);
    const statements = Array.isArray(rawParsed) ? rawParsed : [rawParsed];

    if (isJson) {
      console.log(JSON.stringify(rawParsed, null, 2));
      return;
    }

    for (const statement of statements) {
      console.log('\n======================================================');
      console.log(`🏦 Institution:     ${statement.institutionName} (${statement.institution})`);
      console.log(`📋 Account Type:    ${statement.accountType.toUpperCase()}`);
      if (statement.accountNumber) {
        console.log(`🔢 Account Number:  ${statement.accountNumber}`);
      }
      if (statement.currentBalance !== undefined) {
        console.log(`💰 Current Balance: ${formatCurrency(statement.currentBalance, statement.currency)}`);
      }
      if (statement.periodStart && statement.periodEnd) {
        console.log(`📅 Period:          ${statement.periodStart} ~ ${statement.periodEnd}`);
      }
      console.log(`📊 Transactions:    ${statement.transactionCount} total`);
      console.log(`📈 Total Inflow:    +${formatCurrency(statement.totalInflow, statement.currency)}`);
      console.log(`📉 Total Outflow:   -${formatCurrency(statement.totalOutflow, statement.currency)}`);
      console.log(`⚡ Parse Time:      ${durationMs}ms`);
      console.log('======================================================\n');

      console.log(`--- First ${Math.min(limit, statement.transactions.length)} Transactions ---`);
      const preview = statement.transactions.slice(0, limit);
      for (const [idx, t] of preview.entries()) {
        const typeStr = t.amount < 0 ? '🟢 INFLOW ' : '🔴 OUTFLOW';
        const balanceStr = t.runningBalance !== undefined ? ` | Balance: ${formatCurrency(t.runningBalance, t.currency)}` : '';
        console.log(
          `#${String(idx + 1).padStart(3, ' ')} [${t.date}] ${typeStr} ${formatCurrency(Math.abs(t.amount), t.currency).padStart(12, ' ')} | ${t.merchant}${balanceStr}`
        );
      }

      if (statement.transactions.length > limit) {
        console.log(`\n... and ${statement.transactions.length - limit} more transactions.`);
      }
    }

    console.log('\n✅ Statement parsed successfully!');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('❌ Parse Failed:', errorMsg);
    process.exit(1);
  }
}

main();
