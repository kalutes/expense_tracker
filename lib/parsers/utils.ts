import fs from 'node:fs';
import crypto from 'node:crypto';

/**
 * Detects encoding (Shift-JIS vs UTF-8) and decodes Buffer or returns string.
 */
export function detectAndDecode(content: Buffer | string): string {
  if (typeof content === 'string') {
    if ((content.endsWith('.csv') || content.endsWith('.txt')) && fs.existsSync(content)) {
      try {
        const fileBuffer = fs.readFileSync(content);
        return detectAndDecode(fileBuffer);
      } catch {
        // Fall through to string processing
      }
    }
    // Strip UTF-8 BOM if present
    return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  }

  // Check for UTF-8 BOM (EF BB BF)
  if (content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf) {
    return content.subarray(3).toString('utf-8');
  }

  // Check if it is valid UTF-8
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    const utf8Text = utf8Decoder.decode(content);
    // If it decodes cleanly and contains standard Japanese/ASCII characters without replacement characters
    if (!utf8Text.includes('\ufffd')) {
      return utf8Text;
    }
  } catch {
    // Not valid UTF-8, fall through to Shift-JIS
  }

  // Try Shift-JIS / Windows-31J / CP932
  try {
    const sjisDecoder = new TextDecoder('shift-jis');
    return sjisDecoder.decode(content);
  } catch {
    // Fallback to utf-8 non-fatal
    return content.toString('utf-8');
  }
}

/**
 * Robust RFC 4180 compliant CSV parser that handles quoted strings with commas and newlines.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        // Only push non-empty rows or rows with more than 1 field
        if (currentRow.some((field) => field.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((field) => field.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Normalizes full-width alphanumeric ASCII characters and half-width Katakana.
 */
export function normalizeJapaneseText(str: string): string {
  if (!str) return '';

  // 1. Convert full-width alphanumeric to half-width (e.g. Ａ-Ｚ, ａ-ｚ, ０-９, 　)
  let result = str
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' '); // Full-width space to half-width

  // 2. Map half-width katakana (including voiced/semi-voiced marks) to full-width katakana
  const kanaMap: Record<string, string> = {
    'ｶﾞ': 'ガ', 'ｷﾞ': 'ギ', 'ｸﾞ': 'グ', 'ｹﾞ': 'ゲ', 'ｺﾞ': 'ゴ',
    'ｻﾞ': 'ザ', 'ｼﾞ': 'ジ', 'ｽﾞ': 'ズ', 'ｾﾞ': 'ゼ', 'ｿﾞ': 'ゾ',
    'ﾀﾞ': 'ダ', 'ﾁﾞ': 'ヂ', 'ﾂﾞ': 'ヅ', 'ﾃﾞ': 'デ', 'ﾄﾞ': 'ド',
    'ﾊﾞ': 'バ', 'ﾋﾞ': 'ビ', 'ﾌﾞ': 'ブ', 'ﾍﾞ': 'ベ', 'ﾎﾞ': 'ボ',
    'ﾊﾟ': 'パ', 'ﾋﾟ': 'ピ', 'ﾌﾟ': 'プ', 'ﾍﾟ': 'ペ', 'ﾎﾟ': 'ポ',
    'ｳﾞ': 'ヴ', 'ﾜﾞ': 'ヷ', 'ｦﾞ': 'ヺ',
    'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
    'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
    'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
    'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
    'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
    'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
    'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
    'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
    'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
    'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
    'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
    'ｯ': 'ッ', 'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ',
    'ｰ': 'ー', '･': '・', '｡': '。', '｢': '「', '｣': '」',
  };

  const reg = new RegExp(Object.keys(kanaMap).join('|'), 'g');
  result = result.replace(reg, (matched) => kanaMap[matched] || matched);

  // 3. Normalize various dashes/hyphens used as Katakana prolonged sound mark (ー)
  // e.g., バ-ミヤン -> バーミヤン, カ-ド -> カード, フアミリ-マ-ト -> フアミリーマート
  result = result.replace(/([\u30A0-\u30FF\u3040-\u309F])[-˗֊‐‑‒–—―⁻₋−－]/g, '$1ー');

  // Clean excessive whitespace
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Parses amounts from numerical strings (e.g., "1,234.56", "¥1,500", " - 450 ").
 */
export function parseAmount(val: string | number | undefined | null): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.toString().replace(/[¥,\\\s"']/g, '');
  if (cleaned === '' || cleaned === '-') return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Converts Japanese Era dates (e.g., "令和 05 年 04 月 01 日", "平成30年01月15日") to ISO "YYYY-MM-DD".
 */
export function parseJapaneseEraDate(str: string): string | null {
  if (!str) return null;
  const match = str.match(/(令和|平成|昭和)\s*(\d+|元)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
  if (!match) return null;

  const [, era, yearStr, monthStr, dayStr] = match;
  let year = yearStr === '元' ? 1 : parseInt(yearStr, 10);

  if (era === '令和') {
    year += 2018; // Reiwa 1 = 2019
  } else if (era === '平成') {
    year += 1988; // Heisei 1 = 1989
  } else if (era === '昭和') {
    year += 1925; // Showa 1 = 1926
  }

  const month = parseInt(monthStr, 10).toString().padStart(2, '0');
  const day = parseInt(dayStr, 10).toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses date string in various formats: "YYYYMMDD", "YYYY/MM/DD", "YYYY-MM-DD", "YYYY年MM月DD日".
 */
export function parseIsoDate(val: string): string {
  if (!val) return '';
  const trimmed = val.trim();

  // Try Era date first
  const eraDate = parseJapaneseEraDate(trimmed);
  if (eraDate) return eraDate;

  // YYYYMMDD (e.g. 20240601)
  if (/^\d{8}$/.test(trimmed)) {
    const y = trimmed.slice(0, 4);
    const m = trimmed.slice(4, 6);
    const d = trimmed.slice(6, 8);
    return `${y}-${m}-${d}`;
  }

  // YYYY/M/D or YYYY-M-D or YYYY.M.D
  const sepMatch = trimmed.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (sepMatch) {
    const [, y, m, d] = sepMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYY年M月D日
  const kanjiMatch = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (kanjiMatch) {
    const [, y, m, d] = kanjiMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return trimmed;
}

/**
 * Computes deterministic SHA-256 deduplication hash.
 */
export function generateDedupHash(parts: (string | number | undefined | null)[]): string {
  const normalized = parts.map((p) => (p === undefined || p === null ? '' : String(p).trim())).join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
