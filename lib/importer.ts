import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseStatement, ParsedStatement } from './parsers';
import { syncStatementToDb, StatementSyncResult } from './db/repository';

export interface FileImportAccountSummary {
  id: string;
  name: string;
  currency: string;
  currentBalance: number;
  totalParsed: number;
  insertedCount: number;
  skippedDuplicateCount: number;
}

export interface FileImportResult {
  success: boolean;
  filename: string;
  savedPath?: string;
  accounts: FileImportAccountSummary[];
  totalParsed: number;
  totalInserted: number;
  totalDuplicates: number;
  error?: string;
}

export interface ImportOptions {
  buffer: Buffer;
  originalFilename: string;
  customBaseDir?: string;
}

/**
 * Gets the configured statements directory on the persistent dataset.
 */
export function getStatementsBaseDir(customDir?: string): string {
  if (customDir) {
    return path.resolve(process.cwd(), customDir);
  }
  if (process.env.STATEMENTS_DIR) {
    return path.resolve(process.cwd(), process.env.STATEMENTS_DIR);
  }
  const rootStatements = path.resolve(process.cwd(), 'statements');
  if (fs.existsSync(rootStatements)) {
    return rootStatements;
  }
  return path.resolve(process.cwd(), 'data/statements');
}

/**
 * Determines the directory name for an account based on the parsed statement.
 */
function getAccountDirName(parsed: ParsedStatement | ParsedStatement[]): string {
  if (Array.isArray(parsed)) {
    if (parsed.length > 0) {
      if (parsed[0].accountId?.startsWith('first-tech')) {
        return 'first-tech';
      }
      const rawId = parsed[0].accountId || parsed[0].institution;
      return rawId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    return 'unknown';
  }

  const rawId = parsed.accountId || parsed.institution;
  return rawId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Constructs a clean, date-based standardized filename for a statement.
 * E.g. "2024-08-24.pdf", "2026-08-31.pdf", "2026-09-12.csv", or "2026-01-01_to_2026-09-12.csv"
 */
function getStandardizedFilename(
  parsed: ParsedStatement | ParsedStatement[],
  originalFilename: string
): string {
  const ext = path.extname(originalFilename) || (Array.isArray(parsed) ? '.pdf' : '.csv');
  const stmts = Array.isArray(parsed) ? parsed : [parsed];

  // 1. Check for statementDate
  const stmtDate = stmts.find((s) => s.statementDate)?.statementDate;
  const pStart = stmts.find((s) => s.periodStart)?.periodStart;
  const pEnd = stmts.find((s) => s.periodEnd)?.periodEnd;

  let dateStr: string | undefined;

  if (stmtDate) {
    dateStr = stmtDate;
  } else if (pStart && pEnd) {
    if (pStart === pEnd) {
      dateStr = pStart;
    } else if (pStart.slice(0, 7) === pEnd.slice(0, 7)) {
      // Same month: e.g. 2026-09
      dateStr = pEnd;
    } else {
      dateStr = `${pStart}_to_${pEnd}`;
    }
  } else if (pEnd) {
    dateStr = pEnd;
  } else if (pStart) {
    dateStr = pStart;
  }

  // Fallback: inspect first transaction date if available
  if (!dateStr) {
    for (const s of stmts) {
      if (s.transactions.length > 0) {
        dateStr = s.transactions[0].date;
        break;
      }
    }
  }

  if (dateStr) {
    const cleanDate = dateStr.replace(/[^a-zA-Z0-9_-]/g, '-');
    return `${cleanDate}${ext.toLowerCase()}`;
  }

  return path.basename(originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Generates a unique, collision-resistant target file path.
 */
function resolveUniqueFilePath(targetDir: string, targetFilename: string, newBuffer: Buffer): string {
  const safeName = path.basename(targetFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = path.extname(safeName);
  const baseName = path.basename(safeName, ext);

  let candidate = path.join(targetDir, safeName);
  if (!fs.existsSync(candidate)) {
    return candidate;
  }

  // Check if existing file is byte-identical
  const existingBuffer = fs.readFileSync(candidate);
  if (existingBuffer.equals(newBuffer)) {
    return candidate;
  }

  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(targetDir, `${baseName}_${counter}${ext}`);
    if (fs.existsSync(candidate)) {
      const matchBuf = fs.readFileSync(candidate);
      if (matchBuf.equals(newBuffer)) {
        return candidate;
      }
    }
    counter++;
  }

  return candidate;
}

/**
 * Imports a statement file (CSV or PDF):
 * 1. Writes buffer to a temporary file for parsing.
 * 2. Parses the statement and extracts account metadata & transactions.
 * 3. Organizes and saves the file to statements/<account-id>/<statement-date>.<ext> on the persistent dataset.
 * 4. Ingests and deduplicates transactions into the SQLite database.
 */
export async function importStatementFile(options: ImportOptions): Promise<FileImportResult> {
  const { buffer, originalFilename, customBaseDir } = options;
  const tempDir = path.resolve(process.cwd(), 'data/temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const safeTempName = `upload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${path.basename(originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const tempFilePath = path.join(tempDir, safeTempName);

  try {
    fs.writeFileSync(tempFilePath, buffer);

    // 1. Parse statement
    const parsed = parseStatement(tempFilePath);

    // 2. Determine target account directory
    const accountDirName = getAccountDirName(parsed);
    const baseDir = getStatementsBaseDir(customBaseDir);
    const targetDir = path.join(baseDir, accountDirName);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 3. Move/Save organized file to statements/<account-id>/<standardized-date-filename>
    const standardizedFilename = getStandardizedFilename(parsed, originalFilename);
    const finalFilePath = resolveUniqueFilePath(targetDir, standardizedFilename, buffer);
    fs.writeFileSync(finalFilePath, buffer);

    // 4. Ingest to database
    const syncResults: StatementSyncResult[] = await syncStatementToDb(parsed);

    // 5. Aggregate statistics
    let totalParsed = 0;
    let totalInserted = 0;
    let totalDuplicates = 0;
    const accountSummaries: FileImportAccountSummary[] = [];

    for (const res of syncResults) {
      totalParsed += res.totalParsed;
      totalInserted += res.insertedCount;
      totalDuplicates += res.skippedDuplicateCount;
      accountSummaries.push({
        id: res.account.id,
        name: res.account.name,
        currency: res.account.currency,
        currentBalance: res.currentBalance,
        totalParsed: res.totalParsed,
        insertedCount: res.insertedCount,
        skippedDuplicateCount: res.skippedDuplicateCount,
      });
    }

    const relSavedPath = path.relative(process.cwd(), finalFilePath);

    return {
      success: true,
      filename: originalFilename,
      savedPath: relSavedPath,
      accounts: accountSummaries,
      totalParsed,
      totalInserted,
      totalDuplicates,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      filename: originalFilename,
      accounts: [],
      totalParsed: 0,
      totalInserted: 0,
      totalDuplicates: 0,
      error: errorMsg,
    };
  } finally {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // Ignore temp cleanup error
      }
    }
  }
}
