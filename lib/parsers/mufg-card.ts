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

export class MufgCardParser implements StatementParser {
  name = 'MUFG Credit Card Parser';
  institution = 'MUFG_CARD' as const;
  institutionName = '三菱UFJカード / NICOS / DC (MUFG Card)';
  accountType = 'credit' as const;

  canParse(content: Buffer | string): boolean {
    const text = detectAndDecode(content);
    return (
      (text.includes('確定情報') && text.includes('お支払日')) ||
      (text.includes('ご利用店名（海外ご利用店名') && text.includes('ご利用金額（円）')) ||
      (text.includes('ご利用店名') && text.includes('支払回数') && text.includes('お支払日'))
    );
  }

  parse(content: Buffer | string, options?: ParseOptions): ParsedStatement {
    const text = detectAndDecode(content);
    const rows = parseCsvRows(text);

    let headerRowIndex = -1;
    let colStatus = 0;
    let colBillingDate = 1;
    let colMerchant = 2;
    let colSwipeDate = 3;
    let colPayType = 4;
    let colAmount = 6;
    let colNotes = 7;

    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i];
      if (row.some((c) => c.includes('確定情報') || c.includes('ご利用店名'))) {
        headerRowIndex = i;
        for (let j = 0; j < row.length; j++) {
          const h = row[j];
          if (h.includes('確定情報')) colStatus = j;
          else if (h.includes('お支払日') || h.includes('支払日')) colBillingDate = j;
          else if (h.includes('ご利用店名') || h.includes('利用店名')) colMerchant = j;
          else if (h.includes('ご利用日') || h.includes('利用日')) colSwipeDate = j;
          else if (h.includes('支払回数') || h.includes('支払区分')) colPayType = j;
          else if (h.includes('ご利用金額') || h.includes('利用金額')) colAmount = j;
          else if (h.includes('現地通貨') || h.includes('備考')) colNotes = j;
        }
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new Error('Could not find MUFG Credit Card header row in CSV');
    }

    const transactions: ParsedTransaction[] = [];
    let totalOutflow = 0;
    let totalInflow = 0;
    let periodStart: string | undefined;
    let periodEnd: string | undefined;
    let statementBillingDate: string | undefined;

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 3) continue;

      const rawMerchant = row[colMerchant] || '';
      // Skip cardholder name header row like: 【SURNAME FIRSTNAME 様】
      if (rawMerchant.startsWith('【') && rawMerchant.endsWith('様】')) {
        continue;
      }

      const rawSwipeDate = colSwipeDate < row.length ? row[colSwipeDate] : '';
      const rawBillingDate = colBillingDate < row.length ? row[colBillingDate] : '';
      const rawAmount = colAmount < row.length ? row[colAmount] : '';
      const rawStatus = colStatus < row.length ? row[colStatus] : '';
      const rawNotes = colNotes < row.length ? row[colNotes] : '';
      const rawPayType = colPayType < row.length ? row[colPayType] : '';

      const amountVal = parseAmount(rawAmount);
      if (!rawSwipeDate && !rawBillingDate && amountVal === 0) {
        continue;
      }

      // Determine transaction swipe date (prefer swipe date, fallback to billing date)
      const date = parseIsoDate(rawSwipeDate) || parseIsoDate(rawBillingDate);
      if (!date || date.length < 8) continue;

      const billingDateIso = parseIsoDate(rawBillingDate);
      if (billingDateIso && (!statementBillingDate || billingDateIso > statementBillingDate)) {
        statementBillingDate = billingDateIso;
      }

      if (!periodStart || date < periodStart) periodStart = date;
      if (!periodEnd || date > periodEnd) periodEnd = date;

      // Positive = Outflow (expense), Negative = Refund / payment
      const amount = amountVal;
      if (amount >= 0) {
        totalOutflow += amount;
      } else {
        totalInflow += Math.abs(amount);
      }

      const merchant = normalizeJapaneseText(rawMerchant) || 'MUFG Card Transaction';
      const normNotes = normalizeJapaneseText(rawNotes);
      const normPayType = normalizeJapaneseText(rawPayType);

      const dedupHash = generateDedupHash([
        options?.accountId ?? 'mufg-card',
        date,
        amount,
        merchant,
        billingDateIso,
      ]);

      transactions.push({
        date,
        amount,
        currency: 'JPY',
        merchant,
        rawDetails: {
          billingDate: billingDateIso,
          paymentTerms: normPayType,
          notes: normNotes,
          status: normalizeJapaneseText(rawStatus),
          rawMerchant,
        },
        status: 'posted',
        dedupHash,
      });
    }

    return {
      accountId: 'mufg-card',
      institution: this.institution,
      institutionName: this.institutionName,
      accountType: this.accountType,
      currency: 'JPY',
      currentBalance: totalOutflow, // Total statement billing balance
      statementDate: statementBillingDate,
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

export const mufgCardParser = new MufgCardParser();
