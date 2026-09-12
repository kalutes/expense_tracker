import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  ParsedStatement,
  ParsedTransaction,
  StatementParser,
} from './types';
import { generateDedupHash, parseAmount } from './utils';

export class FirstTechPdfParser implements StatementParser {
  name = 'First Tech Federal Credit Union PDF Parser';
  institution = 'FIRST_TECH' as const;
  institutionName = 'First Tech Federal Credit Union';
  accountType = 'bank' as const;

  canParse(content: Buffer | string): boolean {
    if (typeof content === 'string') {
      if (content.endsWith('.pdf')) {
        try {
          const header = execSync(`pdftotext -l 1 -layout "${content}" -`, { encoding: 'utf-8' });
          return header.includes('First Tech') || header.includes('firsttechfed.com');
        } catch {
          return false;
        }
      }
      return content.includes('First Tech') && content.includes('Account Number:');
    }

    // Buffer check: PDF header (%PDF-)
    if (content.length > 4 && content[0] === 0x25 && content[1] === 0x50 && content[2] === 0x44 && content[3] === 0x46) {
      const sample = content.subarray(0, Math.min(content.length, 4000)).toString('latin1');
      if (sample.includes('First Tech') || sample.includes('firsttechfed')) return true;
      const tmpPath = path.resolve(process.cwd(), `data/temp_probe_ft_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
      try {
        fs.writeFileSync(tmpPath, content);
        const header = execSync(`pdftotext -l 1 -layout "${tmpPath}" -`, { encoding: 'utf-8' });
        return header.includes('First Tech') || header.includes('firsttechfed.com');
      } catch {
        return false;
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }
    }

    return false;
  }

  parse(content: Buffer | string): ParsedStatement | ParsedStatement[] {
    let text = '';
    if (typeof content === 'string') {
      if (content.endsWith('.pdf')) {
        text = execSync(`pdftotext -layout "${content}" -`, { encoding: 'utf-8' });
      } else {
        text = content;
      }
    } else {
      const tmpPath = path.resolve(process.cwd(), `data/temp_ft_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
      fs.writeFileSync(tmpPath, content);
      try {
        text = execSync(`pdftotext -layout "${tmpPath}" -`, { encoding: 'utf-8' });
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }
    }

    const dateMatch = text.match(/Statement Date:\s*(\d{2})\/(\d{2})\/(\d{4})/);
    if (!dateMatch) {
      throw new Error('Could not find First Tech Statement Date in PDF text');
    }

    const [, stmtM, stmtD, stmtY] = dateMatch;
    const statementDate = `${stmtY}-${stmtM}-${stmtD}`;
    const statementYear = parseInt(stmtY, 10);
    const statementMonth = parseInt(stmtM, 10);

    const accMatch = text.match(/Account Number:\s*(\d+)/);
    const baseAccountNumber = accMatch ? accMatch[1] : undefined;

    function makeIsoDate(mmdd: string): string {
      const [mStr, dStr] = mmdd.split('/');
      const m = parseInt(mStr, 10);
      const d = parseInt(dStr, 10);
      let year = statementYear;
      if (statementMonth === 1 && m === 12) {
        year = statementYear - 1;
      } else if (statementMonth === 12 && m === 1) {
        year = statementYear + 1;
      }
      return `${year}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    }

    const lines = text.split(/\r?\n/);

    let currentSection: 'NONE' | 'SAVINGS' | 'CHECKING_DEPOSITS' | 'CHECKING_DEBITS' | 'CHECKING_CHECKS' = 'NONE';
    let checkingAccountNumber: string | undefined = baseAccountNumber;
    let savingsAccountNumber: string | undefined = baseAccountNumber;

    let savingsStartBalance: number | undefined;
    let savingsEndBalance: number | undefined;
    let checkingEndingBalance: number | undefined;

    const savingsTxns: ParsedTransaction[] = [];
    const checkingTxns: ParsedTransaction[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimEnd();

      // Only check section headers if line is NOT a transaction date line
      if (!line.match(/^\s*\d{2}\/\d{2}/)) {
        if (/Membership Savings\s*(\d+)?/i.test(line)) {
          const match = line.match(/Membership Savings\s*(\d+)/i);
          if (match) savingsAccountNumber = match[1];
          currentSection = 'SAVINGS';
          continue;
        }

        if (/^\s*(Dividend Rewards Checking|Rewards Checking|Carefree Checking|Checking)(\s+\d+)?/i.test(line)) {
          const match = line.match(/(?:Dividend Rewards Checking|Rewards Checking|Carefree Checking|Checking)\s*(\d+)/i);
          if (match) checkingAccountNumber = match[1];
          currentSection = 'NONE';
        }

        const endBalMatch = line.match(/Ending Balance:\s*([0-9,]+\.\d{2})/i);
        if (endBalMatch) {
          checkingEndingBalance = parseAmount(endBalMatch[1]);
        }

        if (line.includes('DEPOSITS') && (currentSection === 'NONE' || currentSection.startsWith('CHECKING'))) {
          currentSection = 'CHECKING_DEPOSITS';
          continue;
        }

        if ((line.includes('MISCELLANEOUS DEBITS') || line.includes('WITHDRAWALS')) && (currentSection === 'NONE' || currentSection.startsWith('CHECKING'))) {
          currentSection = 'CHECKING_DEBITS';
          continue;
        }

        if (line.includes('CHECKS PAID') && (currentSection === 'NONE' || currentSection.startsWith('CHECKING'))) {
          currentSection = 'CHECKING_CHECKS';
          continue;
        }

        if (line.includes('Total Deposits:') || line.includes('Total Miscellaneous Debits:') || line.includes('Truth in Savings Disclosure:') || line.includes('YOUR BILLING RIGHTS')) {
          if (currentSection.startsWith('CHECKING')) {
            currentSection = 'NONE';
          }
        }
      }

      // --- SAVINGS ---
      if (currentSection === 'SAVINGS') {

        const startMatch = line.match(/(\d{2}\/\d{2})?\s*Starting Balance\s*([0-9,]+\.\d{2})/i);
        if (startMatch) {
          savingsStartBalance = parseAmount(startMatch[2]);
          continue;
        }

        const savMatch = line.match(/^\s*(\d{2}\/\d{2})\s+(\d{2}\/\d{2})?\s+(.+?)\s+([-\d,]+\.\d{2})\s+([0-9,]+\.\d{2})\s*$/);
        if (savMatch) {
          const [, transDate, , rawDesc, rawAmt, rawBal] = savMatch;
          const date = makeIsoDate(transDate);
          const amt = parseAmount(rawAmt);
          const runningBal = parseAmount(rawBal);
          savingsEndBalance = runningBal;

          const finalAmt = amt >= 0 ? -amt : Math.abs(amt);
          const merchant = rawDesc.replace(/\s+/g, ' ').trim();
          const dedupHash = generateDedupHash(['first-tech-savings', date, finalAmt, merchant, runningBal]);

          savingsTxns.push({
            date,
            amount: finalAmt,
            currency: 'USD',
            merchant: merchant || 'Savings Transaction',
            rawDetails: { rawDesc, rawAmt, rawBal },
            runningBalance: runningBal,
            status: 'posted',
            dedupHash,
          });
          continue;
        }
      }

      // --- CHECKING DEPOSITS ---
      if (currentSection === 'CHECKING_DEPOSITS') {
        const depMatch = line.match(/^\s*(\d{2}\/\d{2})\s+(\d{2}\/\d{2})?\s+(.+?)\s+([0-9,]+\.\d{2})\s*$/);
        if (depMatch) {
          const [, transDate, , rawDesc, rawAmt] = depMatch;
          const date = makeIsoDate(transDate);
          const amt = parseAmount(rawAmt);
          const finalAmt = -Math.abs(amt);
          const merchant = rawDesc.replace(/\s+/g, ' ').trim();
          const dedupHash = generateDedupHash(['first-tech-checking', date, finalAmt, merchant]);

          checkingTxns.push({
            date,
            amount: finalAmt,
            currency: 'USD',
            merchant: merchant || 'First Tech Deposit',
            rawDetails: { rawDesc, rawAmt },
            status: 'posted',
            dedupHash,
          });
          continue;
        }
      }

      // --- CHECKING DEBITS ---
      if (currentSection === 'CHECKING_DEBITS') {
        const debMatch = line.match(/^\s*(\d{2}\/\d{2})\s+(\d{2}\/\d{2})?\s+(.+?)\s+([-\d,]+\.\d{2})\s*$/);
        if (debMatch) {
          const [, transDate, , rawDesc, rawAmt] = debMatch;
          const date = makeIsoDate(transDate);
          const amt = parseAmount(rawAmt);
          const finalAmt = Math.abs(amt);
          const merchant = rawDesc.replace(/\s+/g, ' ').trim();
          const dedupHash = generateDedupHash(['first-tech-checking', date, finalAmt, merchant]);

          checkingTxns.push({
            date,
            amount: finalAmt,
            currency: 'USD',
            merchant: merchant || 'First Tech Debit',
            rawDetails: { rawDesc, rawAmt },
            status: 'posted',
            dedupHash,
          });
          continue;
        }
      }

      // --- CHECKING CHECKS PAID ---
      if (currentSection === 'CHECKING_CHECKS') {
        const chkMatch = line.match(/^\s*(\d+)\s+(\d{2}\/\d{2})\s+([0-9,]+\.\d{2})\s*$/);
        if (chkMatch) {
          const [, checkNo, transDate, rawAmt] = chkMatch;
          const date = makeIsoDate(transDate);
          const amt = parseAmount(rawAmt);
          const finalAmt = Math.abs(amt);
          const merchant = `Check #${checkNo}`;
          const dedupHash = generateDedupHash(['first-tech-checking', date, finalAmt, merchant]);

          checkingTxns.push({
            date,
            amount: finalAmt,
            currency: 'USD',
            merchant,
            rawDetails: { checkNo, rawAmt },
            status: 'posted',
            dedupHash,
          });
          continue;
        }
      }
    }

    const results: ParsedStatement[] = [];

    // Checking Account
    if (checkingTxns.length > 0 || checkingEndingBalance !== undefined) {
      let totalInflow = 0;
      let totalOutflow = 0;
      for (const t of checkingTxns) {
        if (t.amount < 0) totalInflow += Math.abs(t.amount);
        else totalOutflow += t.amount;
      }

      results.push({
        accountId: 'first-tech-checking',
        institution: 'FIRST_TECH',
        institutionName: 'First Tech Rewards Checking',
        accountType: 'bank',
        currency: 'USD',
        accountNumber: checkingAccountNumber,
        currentBalance: checkingEndingBalance,
        statementDate,
        transactionCount: checkingTxns.length,
        totalInflow,
        totalOutflow,
        netChange: totalInflow - totalOutflow,
        transactions: checkingTxns,
      });
    }

    // Savings Account
    if (savingsTxns.length > 0 || savingsEndBalance !== undefined || savingsStartBalance !== undefined) {
      let totalInflow = 0;
      let totalOutflow = 0;
      for (const t of savingsTxns) {
        if (t.amount < 0) totalInflow += Math.abs(t.amount);
        else totalOutflow += t.amount;
      }

      results.push({
        accountId: 'first-tech-savings',
        institution: 'FIRST_TECH_SAVINGS',
        institutionName: 'First Tech Membership Savings',
        accountType: 'bank',
        currency: 'USD',
        accountNumber: savingsAccountNumber,
        currentBalance: savingsEndBalance !== undefined ? savingsEndBalance : savingsStartBalance,
        statementDate,
        transactionCount: savingsTxns.length,
        totalInflow,
        totalOutflow,
        netChange: totalInflow - totalOutflow,
        transactions: savingsTxns,
      });
    }

    return results;
  }
}

export const firstTechPdfParser = new FirstTechPdfParser();
