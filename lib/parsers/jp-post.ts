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
  parseJapaneseEraDate,
  parseCsvRows,
} from './utils';

export class JpPostParser implements StatementParser {
  name = 'JP Post Bank Parser';
  institution = 'JP_POST' as const;
  institutionName = 'ゆうちょ銀行 (JP Post Bank)';
  accountType = 'bank' as const;

  canParse(content: Buffer | string): boolean {
    const text = detectAndDecode(content);
    return (
      text.includes('お客さま口座情報') ||
      (text.includes('取引日') && text.includes('入出金明細ＩＤ')) ||
      (text.includes('ゆうちょ') && text.includes('現在高'))
    );
  }

  parse(content: Buffer | string, options?: ParseOptions): ParsedStatement {
    const text = detectAndDecode(content);
    const rows = parseCsvRows(text);

    let accountNumber: string | undefined;
    let headerBalance: number | undefined;
    let periodStart: string | undefined;
    let periodEnd: string | undefined;
    let statementDate: string | undefined;

    let headerRowIndex = -1;

    // 1. Parse metadata header rows
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i];
      const lineStr = row.join(',');

      // Account number extraction from header
      const accMatch = lineStr.match(/お客さま口座番号[：:]\s*([0-9\-]+)/);
      if (accMatch) {
        accountNumber = accMatch[1];
      }

      // Current balance extraction from header
      if (lineStr.includes('現在高')) {
        for (const cell of row) {
          const parsed = parseAmount(cell);
          if (parsed > 0 || cell === '0') {
            headerBalance = parsed;
            break;
          }
        }
      }

      // Date period extraction
      const periodMatch = lineStr.match(/日付指定[：:]\s*(.+?)\s*～\s*(.+)/);
      if (periodMatch) {
        periodStart = parseJapaneseEraDate(periodMatch[1]) || parseIsoDate(periodMatch[1]);
        periodEnd = parseJapaneseEraDate(periodMatch[2]) || parseIsoDate(periodMatch[2]);
      }

      // Export date extraction
      const outMatch = lineStr.match(/出力日時[：:]\s*(令和.+?日|平成.+?日|\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2})/);
      if (outMatch) {
        statementDate = parseJapaneseEraDate(outMatch[1]) || parseIsoDate(outMatch[1]);
      }

      // Identify transaction table header
      if (row.some((cell) => cell.includes('取引日') || cell.includes('入出金明細ＩＤ'))) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new Error('Could not find JP Post transaction table header in CSV');
    }

    const transactions: ParsedTransaction[] = [];
    let totalInflow = 0;
    let totalOutflow = 0;
    let latestRunningBalance: number | undefined;

    // 2. Parse Data Rows
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 4) continue;

      const rawDate = row[0];
      const externalId = row[1];
      const rawInflow = row[2];
      const rawOutflow = row[3];
      const rawType = row[4]; // 詳細１
      const rawDesc = row[5]; // 詳細２
      const rawBalance = row[6]; // 現在（貸付）高

      if (!rawDate || (!rawInflow && !rawOutflow && !rawType && !rawDesc)) {
        continue;
      }

      const date = parseIsoDate(rawDate);
      if (!date || date.length < 8) continue;

      const inflowAmount = parseAmount(rawInflow);
      const outflowAmount = parseAmount(rawOutflow);

      // Amount convention: Positive = Outflow (spending), Negative = Inflow (income)
      let amount = 0;
      if (outflowAmount > 0) {
        amount = outflowAmount;
        totalOutflow += outflowAmount;
      } else if (inflowAmount > 0) {
        amount = -inflowAmount;
        totalInflow += inflowAmount;
      }

      const normType = normalizeJapaneseText(rawType || '');
      const normDesc = normalizeJapaneseText(rawDesc || '');

      // Build clean merchant name
      let merchant = '';
      if (normDesc && normType) {
        merchant = `${normDesc} (${normType})`;
      } else if (normDesc) {
        merchant = normDesc;
      } else if (normType) {
        merchant = normType;
      } else {
        merchant = 'JP Post Transaction';
      }

      const runningBalance = rawBalance ? parseAmount(rawBalance) : undefined;
      if (runningBalance !== undefined && !isNaN(runningBalance)) {
        latestRunningBalance = runningBalance;
      }

      const dedupHash = generateDedupHash([
        options?.accountId ?? 'jp-post',
        date,
        amount,
        merchant,
        externalId,
      ]);

      transactions.push({
        externalId: externalId || undefined,
        date,
        amount,
        currency: 'JPY',
        merchant,
        rawDetails: {
          type: normType,
          description: normDesc,
          rawMerchant: `${rawType || ''} ${rawDesc || ''}`.trim(),
        },
        runningBalance,
        status: 'posted',
        dedupHash,
      });
    }

    // Determine the most accurate current balance
    const currentBalance = headerBalance !== undefined ? headerBalance : latestRunningBalance;

    return {
      institution: this.institution,
      institutionName: this.institutionName,
      accountType: this.accountType,
      currency: 'JPY',
      accountNumber,
      currentBalance,
      statementDate,
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

export const jpPostParser = new JpPostParser();
