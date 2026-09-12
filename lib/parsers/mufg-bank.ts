import {
  ParsedStatement,
  ParsedTransaction,
  ParseOptions,
  StatementParser,
} from './types';
import {
  detectAndDecode,
  generateDedupHash,
  normalizeJapaneseText,
  parseAmount,
  parseIsoDate,
  parseCsvRows,
} from './utils';

export class MufgBankParser implements StatementParser {
  name = 'MUFG Bank Parser';
  institution = 'MUFG_BANK' as const;
  institutionName = '三菱UFJ銀行 (MUFG Bank)';
  accountType = 'bank' as const;

  canParse(content: Buffer | string): boolean {
    const text = detectAndDecode(content);
    return (
      (text.includes('支払い金額') || text.includes('お支払金額') || text.includes('支払金額')) &&
      (text.includes('預かり金額') || text.includes('お預り金額') || text.includes('預入金額')) &&
      text.includes('差引残高')
    );
  }

  parse(content: Buffer | string, options?: ParseOptions): ParsedStatement {
    const text = detectAndDecode(content);
    const rows = parseCsvRows(text);

    let headerRowIndex = -1;
    let colDate = 0;
    let colType = 1;      // 摘要
    let colDesc = 2;      // 摘要内容
    let colOutflow = 3;   // 支払い金額
    let colInflow = 4;    // 預かり金額
    let colBalance = 5;   // 差引残高
    let colMemo = 6;      // メモ

    // Find table header row
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i];
      if (row.some((cell) => cell.includes('日付')) && row.some((cell) => cell.includes('差引残高'))) {
        headerRowIndex = i;
        // Dynamically find column indices if possible
        for (let j = 0; j < row.length; j++) {
          const h = row[j];
          if (h.includes('日付')) colDate = j;
          else if (h === '摘要') colType = j;
          else if (h.includes('摘要内容') || h.includes('詳細')) colDesc = j;
          else if (h.includes('支払') || h.includes('払出')) colOutflow = j;
          else if (h.includes('預') || h.includes('入金')) colInflow = j;
          else if (h.includes('残高')) colBalance = j;
          else if (h.includes('メモ')) colMemo = j;
        }
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new Error('Could not find MUFG Bank header row in CSV');
    }

    const transactions: ParsedTransaction[] = [];
    let totalInflow = 0;
    let totalOutflow = 0;
    let latestRunningBalance: number | undefined;
    let periodStart: string | undefined;
    let periodEnd: string | undefined;

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 4) continue;

      const rawDate = row[colDate];
      if (!rawDate) continue;

      const date = parseIsoDate(rawDate);
      if (!date || date.length < 8) continue;

      if (!periodStart || date < periodStart) periodStart = date;
      if (!periodEnd || date > periodEnd) periodEnd = date;

      const rawType = row[colType] || '';
      const rawDesc = row[colDesc] || '';
      const rawOutflow = row[colOutflow];
      const rawInflow = row[colInflow];
      const rawBalance = row[colBalance];
      const rawMemo = colMemo < row.length ? row[colMemo] : '';

      const outflowAmount = parseAmount(rawOutflow);
      const inflowAmount = parseAmount(rawInflow);

      if (outflowAmount === 0 && inflowAmount === 0 && !rawType && !rawDesc) {
        continue;
      }

      // Convention: Positive = Outflow / Expense, Negative = Inflow / Income
      let amount = 0;
      if (outflowAmount > 0) {
        amount = outflowAmount;
        totalOutflow += outflowAmount;
      } else if (inflowAmount > 0) {
        amount = -inflowAmount;
        totalInflow += inflowAmount;
      }

      const normType = normalizeJapaneseText(rawType);
      const normDesc = normalizeJapaneseText(rawDesc);
      const normMemo = normalizeJapaneseText(rawMemo);

      // Construct clean merchant name
      let merchant = '';
      if (normDesc && normType) {
        merchant = `${normDesc} (${normType})`;
      } else if (normDesc) {
        merchant = normDesc;
      } else if (normType) {
        merchant = normType;
      } else {
        merchant = 'MUFG Bank Transaction';
      }

      const runningBalance = rawBalance ? parseAmount(rawBalance) : undefined;
      if (runningBalance !== undefined && !isNaN(runningBalance)) {
        latestRunningBalance = runningBalance;
      }

      const dedupHash = generateDedupHash([
        options?.accountId ?? 'mufg-bank',
        date,
        amount,
        merchant,
        runningBalance,
      ]);

      transactions.push({
        date,
        amount,
        currency: 'JPY',
        merchant,
        rawDetails: {
          type: normType,
          description: normDesc,
          memo: normMemo,
          rawMerchant: `${rawType} ${rawDesc}`.trim(),
        },
        runningBalance,
        status: 'posted',
        dedupHash,
      });
    }

    return {
      accountId: 'mufg-bank',
      institution: this.institution,
      institutionName: this.institutionName,
      accountType: this.accountType,
      currency: 'JPY',
      currentBalance: latestRunningBalance,
      statementDate: periodEnd,
      periodStart,
      periodEnd,
      transactionCount: transactions.length,
      totalInflow,
      totalOutflow,
      netChange: totalInflow - totalOutflow,
      transactions,
    };
  }
}

export const mufgBankParser = new MufgBankParser();
