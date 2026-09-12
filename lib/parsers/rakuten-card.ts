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

export class RakutenCardParser implements StatementParser {
  name = 'Rakuten Card Parser';
  institution = 'RAKUTEN_CARD' as const;
  institutionName = '楽天カード (Rakuten Card)';
  accountType = 'credit' as const;

  canParse(content: Buffer | string): boolean {
    const text = detectAndDecode(content);
    return (
      text.includes('利用日') &&
      (text.includes('利用店名・商品名') || text.includes('利用店名')) &&
      (text.includes('支払総額') || text.includes('新規サイン') || text.includes('手数料/利息'))
    );
  }

  parse(content: Buffer | string, options?: ParseOptions): ParsedStatement {
    const text = detectAndDecode(content);
    const rows = parseCsvRows(text);

    let headerRowIndex = -1;
    let colDate = 0;
    let colMerchant = 1;
    let colUser = 2;
    let colPayMethod = 3;
    let colAmount = 4;
    let colFee = 5;
    let colTotal = 6;
    let colBillingAmount = 7;
    let colSign = 9;

    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i];
      if (row.some((c) => c.includes('利用日')) && row.some((c) => c.includes('利用店名'))) {
        headerRowIndex = i;
        for (let j = 0; j < row.length; j++) {
          const h = row[j];
          if (h.includes('利用日')) colDate = j;
          else if (h.includes('利用店名') || h.includes('商品名')) colMerchant = j;
          else if (h.includes('利用者')) colUser = j;
          else if (h.includes('支払方法')) colPayMethod = j;
          else if (h.includes('利用金額')) colAmount = j;
          else if (h.includes('手数料') || h.includes('利息')) colFee = j;
          else if (h.includes('支払総額')) colTotal = j;
          else if (h.includes('支払金額')) colBillingAmount = j;
          else if (h.includes('サイン')) colSign = j;
        }
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new Error('Could not find Rakuten Card header row in CSV');
    }

    const transactions: ParsedTransaction[] = [];
    let totalOutflow = 0;
    let totalInflow = 0;
    let periodStart: string | undefined;
    let periodEnd: string | undefined;

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;

      const rawDate = row[colDate];
      const rawMerchant = row[colMerchant] || '';
      if (!rawDate && !rawMerchant) continue;

      const date = parseIsoDate(rawDate);
      if (!date || date.length < 8) continue;

      if (!periodStart || date < periodStart) periodStart = date;
      if (!periodEnd || date > periodEnd) periodEnd = date;

      const rawUser = colUser < row.length ? row[colUser] : '';
      const rawPayMethod = colPayMethod < row.length ? row[colPayMethod] : '';
      const rawAmount = colAmount < row.length ? row[colAmount] : '';
      const rawFee = colFee < row.length ? row[colFee] : '';
      const rawTotal = colTotal < row.length ? row[colTotal] : '';
      const rawBilling = colBillingAmount < row.length ? row[colBillingAmount] : '';
      const rawSign = colSign < row.length ? row[colSign] : '';

      const amountVal = parseAmount(rawTotal || rawAmount);
      if (amountVal >= 0) {
        totalOutflow += amountVal;
      } else {
        totalInflow += Math.abs(amountVal);
      }

      const merchant = normalizeJapaneseText(rawMerchant) || 'Rakuten Card Transaction';
      const normUser = normalizeJapaneseText(rawUser);
      const normPayMethod = normalizeJapaneseText(rawPayMethod);

      const dedupHash = generateDedupHash([
        options?.accountId ?? 'rakuten-card',
        date,
        amountVal,
        merchant,
        normUser,
        normPayMethod,
      ]);

      transactions.push({
        date,
        amount: amountVal,
        currency: 'JPY',
        merchant,
        rawDetails: {
          user: normUser,
          paymentMethod: normPayMethod,
          fee: parseAmount(rawFee),
          billingAmount: parseAmount(rawBilling),
          sign: rawSign,
          rawMerchant,
        },
        status: 'posted',
        dedupHash,
      });
    }

    return {
      accountId: 'rakuten-card',
      institution: this.institution,
      institutionName: this.institutionName,
      accountType: this.accountType,
      currency: 'JPY',
      currentBalance: totalOutflow, // Total statement billing balance
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

export const rakutenCardParser = new RakutenCardParser();
