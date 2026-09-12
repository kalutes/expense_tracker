export type Currency = 'JPY' | 'USD' | (string & {});
export type AccountType = 'bank' | 'credit' | (string & {});
export type InstitutionId =
  | 'JP_POST'
  | 'MUFG_BANK'
  | 'MUFG_CARD'
  | 'RAKUTEN_CARD'
  | 'PAYPAY_CARD'
  | 'FIRST_TECH'
  | 'FIRST_TECH_SAVINGS'
  | 'CAPITAL_ONE_VENTURE_X'
  | 'CAPITAL_ONE_VENTURE_ONE'
  | (string & {});


export interface ParsedTransaction {
  externalId?: string;       // External transaction ID if provided by provider
  date: string;             // ISO Date: "YYYY-MM-DD"
  amount: number;           // Positive = Expense / Outflow, Negative = Income / Inflow
  currency: Currency;       // 'JPY' | 'USD'
  merchant: string;         // Cleaned, human-readable merchant/counterparty name
  rawDetails: {
    type?: string;          // Transaction category / type
    description?: string;   // Transaction description / memo
    rawMerchant?: string;   // Raw original string before cleanup
    [key: string]: unknown;
  };
  runningBalance?: number;  // Running account balance after transaction (if provided by bank)
  status: 'posted' | 'pending';
  dedupHash: string;        // SHA-256 deterministic hash for idempotent imports
}

export interface ParsedStatement {
  accountId?: string;       // Optional deterministic account ID
  institution: InstitutionId;
  institutionName: string;
  accountType: AccountType;
  currency: Currency;
  accountNumber?: string;   // Account or card ending number if available
  currentBalance?: number;  // Latest balance from statement header / latest record
  statementDate?: string;   // Date statement was generated
  periodStart?: string;     // Statement period start (YYYY-MM-DD)
  periodEnd?: string;       // Statement period end (YYYY-MM-DD)
  transactionCount: number;
  totalInflow: number;      // Total income / deposits (positive number in summary)
  totalOutflow: number;     // Total expenses / withdrawals (positive number in summary)
  netChange: number;        // totalInflow - totalOutflow
  transactions: ParsedTransaction[];
}

export interface ParseOptions {
  accountId?: string;
  currency?: Currency;
}

export interface StatementParser {
  name: string;
  institution: InstitutionId;
  institutionName: string;
  accountType: AccountType;
  canParse(content: Buffer | string): boolean;
  parse(content: Buffer | string, options?: ParseOptions): ParsedStatement | ParsedStatement[];
}
