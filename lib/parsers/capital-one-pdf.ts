import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  StatementParser,
  ParsedStatement,
  ParsedTransaction,
} from './types';
import { generateDedupHash, parseAmount } from './utils';

const MONTH_MAP: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

export class CapitalOnePdfParser implements StatementParser {
  name = 'Capital One Credit Card PDF Parser';
  institution = 'CAPITAL_ONE_VENTURE_X' as const;
  institutionName = 'Capital One Credit Card';
  accountType = 'credit' as const;

  canParse(content: Buffer | string): boolean {
    if (typeof content === 'string') {
      if (content.endsWith('.pdf')) {
        try {
          const header = execSync(`pdftotext -l 1 -layout "${content}" -`, { encoding: 'utf-8' });
          return (
            (header.includes('Capital One') || header.includes('capitalone.com') || header.includes('CAPITAL ONE') || header.includes('Venture')) &&
            (header.includes('ending in') || header.includes('Billing Cycle') || header.includes('Payment Information'))
          );
        } catch {
          return false;
        }
      }
      return (
        (content.includes('Capital One') || content.includes('capitalone.com') || content.includes('Venture')) &&
        (content.includes('ending in') || content.includes('Billing Cycle'))
      );
    }

    if (content.length > 4 && content[0] === 0x25 && content[1] === 0x50 && content[2] === 0x44 && content[3] === 0x46) {
      const sample = content.subarray(0, Math.min(content.length, 4000)).toString('latin1');
      if (sample.includes('Capital One') || sample.includes('capitalone.com') || sample.includes('Venture')) return true;
      const tmpPath = path.resolve(process.cwd(), `data/temp_probe_co_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
      try {
        fs.writeFileSync(tmpPath, content);
        const header = execSync(`pdftotext -l 1 -layout "${tmpPath}" -`, { encoding: 'utf-8' });
        return (
          (header.includes('Capital One') || header.includes('capitalone.com') || header.includes('CAPITAL ONE') || header.includes('Venture')) &&
          (header.includes('ending in') || header.includes('Billing Cycle') || header.includes('Payment Information'))
        );
      } catch {
        return false;
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }
    }

    return false;
  }

  parse(content: Buffer | string): ParsedStatement {
    let text = '';
    if (typeof content === 'string') {
      if (content.endsWith('.pdf')) {
        text = execSync(`pdftotext -layout "${content}" -`, { encoding: 'utf-8' });
      } else {
        text = content;
      }
    } else {
      const tmpPath = path.resolve(process.cwd(), `data/temp_co_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
      fs.writeFileSync(tmpPath, content);
      try {
        text = execSync(`pdftotext -layout "${tmpPath}" -`, { encoding: 'utf-8' });
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }
    }

    // 1. Determine Card / Account Variant & Account Number Dynamically
    const endingMatch = text.match(/(?:ending in|Account ending in)\s*(\d{4})/i) || text.match(/#(\d{4}):/);
    const baseAccountNumber = endingMatch ? endingMatch[1] : undefined;

    let institution: 'CAPITAL_ONE_VENTURE_X' | 'CAPITAL_ONE_VENTURE_ONE' = 'CAPITAL_ONE_VENTURE_X';
    let institutionName = baseAccountNumber ? `Capital One Venture X (..${baseAccountNumber})` : 'Capital One Venture X';
    let accountId = 'capital-one-venture-x';

    if (text.includes('VentureOne') || text.includes('VENTUREONE')) {
      institution = 'CAPITAL_ONE_VENTURE_ONE';
      institutionName = baseAccountNumber ? `Capital One VentureOne (..${baseAccountNumber})` : 'Capital One VentureOne';
      accountId = 'capital-one-venture-one';
    }

    // 2. Billing Cycle & Statement Date
    const cycleMatch = text.match(/([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s*-\s*([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})/);
    if (!cycleMatch) {
      throw new Error('Could not find Capital One billing cycle in PDF text');
    }

    const [, startMStr, startDStr, startYStr, endMStr, endDStr, endYStr] = cycleMatch;
    const startYear = parseInt(startYStr, 10);
    const startMonth = MONTH_MAP[startMStr] || 1;
    const endYear = parseInt(endYStr, 10);
    const endMonth = MONTH_MAP[endMStr] || 1;
    const periodStart = `${startYStr}-${startMonth.toString().padStart(2, '0')}-${startDStr.padStart(2, '0')}`;
    const periodEnd = `${endYStr}-${endMonth.toString().padStart(2, '0')}-${endDStr.padStart(2, '0')}`;
    const statementDate = periodEnd;

    // 3. New Balance (Statement Ending Balance)
    let currentBalance: number | undefined;
    const balMatch = text.match(/New Balance\s*=\s*\$([0-9,]+\.\d{2})/i);
    if (balMatch) {
      currentBalance = parseAmount(balMatch[1]);
    } else {
      const balMatch2 = text.match(/New Balance\s*\$([0-9,]+\.\d{2})/i);
      if (balMatch2) currentBalance = parseAmount(balMatch2[1]);
    }

    // Helper to construct ISO transaction date with year-crossover handling
    function makeIsoDate(mmmDd: string): string {
      const parts = mmmDd.trim().split(/\s+/);
      if (parts.length < 2) return statementDate;
      const mStr = parts[0];
      const dStr = parts[1];
      const m = MONTH_MAP[mStr] || endMonth;
      const d = parseInt(dStr, 10);
      let year = endYear;
      if (startMonth === 12 && m === 12 && endMonth === 1) {
        year = startYear;
      } else if (m === startMonth && startYear !== endYear) {
        year = startYear;
      }
      return `${year}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    }

    const lines = text.split(/\r?\n/);
    let currentUser: string | undefined = undefined;
    let currentCardLast4 = baseAccountNumber;
    let currentSection: 'NONE' | 'PAYMENTS' | 'TRANSACTIONS' | 'FEES' = 'NONE';

    const transactionsList: ParsedTransaction[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Dynamic User section header extraction: e.g. "FIRSTNAME M LASTNAME #1234: Payments, Credits and Adjustments" or "FIRSTNAME LASTNAME #5678: Transactions"
      const userMatch = line.match(/^([A-Z\s]+)\s+#(\d{4}):\s*(Payments, Credits and Adjustments|Transactions)/);
      if (userMatch) {
        const rawUserName = userMatch[1].trim();
        currentCardLast4 = userMatch[2];
        const sectionType = userMatch[3];

        // Format first name to Title Case dynamically (e.g. "JOHN" -> "John", "JANE" -> "Jane")
        const nameParts = rawUserName.split(/\s+/).filter(Boolean);
        if (nameParts.length > 0) {
          currentUser = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase();
        } else {
          currentUser = 'Primary';
        }

        currentSection = sectionType.startsWith('Payments') ? 'PAYMENTS' : 'TRANSACTIONS';
        continue;
      }

      if (line.match(/^\s*Fees\s*$/i) || line.includes('Total Fees for This Period')) {
        if (line.match(/^\s*Fees\s*$/i)) currentSection = 'FEES';
        else currentSection = 'NONE';
        continue;
      }

      if (
        line.includes('Total Transactions for This Period') ||
        line.includes('Interest Charged') ||
        line.includes('Interest Charge Calculation') ||
        line.includes('Account Notifications')
      ) {
        currentSection = 'NONE';
        continue;
      }

      // --- PAYMENTS / CREDITS ---
      if (currentSection === 'PAYMENTS') {
        const pMatch = line.match(/^\s*([A-Za-z]{3}\s+\d{1,2})\s+([A-Za-z]{3}\s+\d{1,2})\s+(.+?)\s+-\s*\$([0-9,]+\.\d{2})\s*$/);
        if (pMatch) {
          const [, transDate, postDate, rawDesc, rawAmt] = pMatch;
          const date = makeIsoDate(transDate);
          const amt = -parseAmount(rawAmt); // Payment is Inflow -> negative amount
          const merchant = rawDesc.replace(/\s+/g, ' ').trim();
          const dedupHash = generateDedupHash([accountId, date, amt, merchant, currentUser, currentCardLast4]);

          transactionsList.push({
            date,
            amount: amt,
            currency: 'USD',
            merchant: merchant || 'Capital One Payment',
            rawDetails: {
              rawDesc,
              postDate,
              authorizedUser: currentUser,
              cardLast4: currentCardLast4,
              type: 'payment',
            },
            status: 'posted',
            dedupHash,
          });
          continue;
        }
      }

      // --- TRANSACTIONS (Purchases / Refunds) ---
      if (currentSection === 'TRANSACTIONS') {
        const tMatch = line.match(/^\s*([A-Za-z]{3}\s+\d{1,2})\s+([A-Za-z]{3}\s+\d{1,2})\s+(.+?)\s+(-?\s*\$[0-9,]+\.\d{2})\s*$/);
        if (tMatch) {
          const [, transDate, postDate, rawDesc, rawAmt] = tMatch;
          const date = makeIsoDate(transDate);
          const isRefund = rawAmt.includes('-');
          const cleanAmtStr = rawAmt.replace(/[^0-9.]/g, '');
          const parsed = parseAmount(cleanAmtStr);
          const amt = isRefund ? -parsed : parsed; // Expense is positive, refund is negative
          const merchant = rawDesc.replace(/\s+/g, ' ').trim();

          // Check if followed by multi-line foreign exchange info
          let foreignDetails: { foreignAmount?: number; foreignCurrency?: string; exchangeRate?: number } | undefined;
          if (i + 3 < lines.length) {
            const nextL1 = lines[i + 1].trim();
            const nextL2 = lines[i + 2].trim();
            const nextL3 = lines[i + 3].trim();
            if (nextL1.startsWith('$') && nextL3.includes('Exchange Rate')) {
              const foreignAmt = parseAmount(nextL1.replace(/^\$/, ''));
              const foreignCurr = nextL2;
              const rateMatch = nextL3.match(/^([0-9.]+)\s+Exchange Rate/i);
              const rate = rateMatch ? parseFloat(rateMatch[1]) : undefined;
              foreignDetails = {
                foreignAmount: foreignAmt,
                foreignCurrency: foreignCurr,
                exchangeRate: rate,
              };
            }
          }

          const dedupHash = generateDedupHash([accountId, date, amt, merchant, currentUser, currentCardLast4]);

          transactionsList.push({
            date,
            amount: amt,
            currency: 'USD',
            merchant: merchant || 'Credit Card Purchase',
            rawDetails: {
              rawDesc,
              postDate,
              authorizedUser: currentUser,
              cardLast4: currentCardLast4,
              type: isRefund ? 'refund' : 'purchase',
              ...foreignDetails,
            },
            status: 'posted',
            dedupHash,
          });
          continue;
        }
      }

      // --- FEES ---
      if (currentSection === 'FEES') {
        const fMatch = line.match(/^\s*([A-Za-z]{3}\s+\d{1,2})\s+([A-Za-z]{3}\s+\d{1,2})\s+(.+?)\s+\$([0-9,]+\.\d{2})\s*$/);
        if (fMatch) {
          const [, transDate, postDate, rawDesc, rawAmt] = fMatch;
          const date = makeIsoDate(transDate);
          const amt = parseAmount(rawAmt);
          const merchant = rawDesc.replace(/\s+/g, ' ').trim();
          const dedupHash = generateDedupHash([accountId, date, amt, merchant, currentUser || 'Primary', baseAccountNumber || '']);

          transactionsList.push({
            date,
            amount: amt,
            currency: 'USD',
            merchant: merchant || 'Capital One Fee',
            rawDetails: {
              rawDesc,
              postDate,
              authorizedUser: currentUser || 'Primary',
              cardLast4: baseAccountNumber,
              type: 'fee',
            },
            status: 'posted',
            dedupHash,
          });
          continue;
        }
      }
    }

    let totalInflow = 0;
    let totalOutflow = 0;
    for (const t of transactionsList) {
      if (t.amount < 0) totalInflow += Math.abs(t.amount);
      else totalOutflow += t.amount;
    }

    return {
      accountId,
      institution,
      institutionName,
      accountType: 'credit',
      currency: 'USD',
      accountNumber: baseAccountNumber,
      currentBalance,
      statementDate,
      periodStart,
      periodEnd,
      transactionCount: transactionsList.length,
      totalInflow,
      totalOutflow,
      netChange: totalInflow - totalOutflow,
      transactions: transactionsList,
    };
  }
}

export const capitalOnePdfParser = new CapitalOnePdfParser();
