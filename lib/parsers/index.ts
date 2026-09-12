import { StatementParser, ParsedStatement, ParseOptions } from './types';
import { jpPostParser } from './jp-post';
import { mufgBankParser } from './mufg-bank';
import { mufgCardParser } from './mufg-card';
import { rakutenCardParser } from './rakuten-card';
import { firstTechPdfParser } from './first-tech-pdf';
import { capitalOnePdfParser } from './capital-one-pdf';

export * from './types';
export * from './utils';
export * from './jp-post';
export * from './mufg-bank';
export * from './mufg-card';
export * from './rakuten-card';
export * from './first-tech-pdf';
export * from './capital-one-pdf';

/**
 * Registry of all available institution statement parsers.
 */
export const parsers: StatementParser[] = [
  jpPostParser,
  mufgBankParser,
  mufgCardParser,
  rakutenCardParser,
  firstTechPdfParser,
  capitalOnePdfParser,
];

/**
 * Automatically finds the matching parser for a statement CSV or PDF and parses it.
 */
export function parseStatement(
  content: Buffer | string,
  options?: ParseOptions
): ParsedStatement | ParsedStatement[] {
  for (const parser of parsers) {
    if (parser.canParse(content)) {
      return parser.parse(content, options);
    }
  }

  throw new Error('Unsupported statement format: No matching parser found for this statement file.');
}


