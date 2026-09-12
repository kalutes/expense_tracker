import { getAccounts, getTransactions } from '../lib/db/repository';
import { logoutAction } from './login/actions';
import { TransactionLedger } from '../components/TransactionLedger';
import { ImportModalTrigger } from '../components/ImportModalTrigger';
import { StatementImporter } from '../components/StatementImporter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatCurrency(amount: number, currency: string = 'JPY'): string {
  if (currency === 'JPY') {
    const prefix = amount < 0 ? '-¥' : '¥';
    return `${prefix}${Math.abs(Math.round(amount)).toLocaleString('ja-JP')}`;
  }
  if (currency === 'EUR') {
    const prefix = amount < 0 ? '-€' : '€';
    return `${prefix}${Math.abs(amount).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (currency === 'GBP') {
    const prefix = amount < 0 ? '-£' : '£';
    return `${prefix}${Math.abs(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const prefix = amount < 0 ? '-$' : '$';
  return `${prefix}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function HomePage() {
  const accountsList = await getAccounts();
  const allTransactions = await getTransactions();

  // Group accounts and calculate totals dynamically by currency
  const currencySummaries = accountsList.reduce((acc, account) => {
    const curr = account.currency || 'USD';
    if (!acc[curr]) {
      acc[curr] = {
        currency: curr,
        bankCash: 0,
        cardDebt: 0,
      };
    }
    if (account.type === 'bank') {
      acc[curr].bankCash += account.currentBalance;
    } else {
      acc[curr].cardDebt += account.currentBalance;
    }
    return acc;
  }, {} as Record<string, { currency: string; bankCash: number; cardDebt: number }>);

  // Sort currencies (JPY first, then USD, then others)
  const currencyList = Object.values(currencySummaries).sort((a, b) => {
    if (a.currency === 'JPY') return -1;
    if (b.currency === 'JPY') return 1;
    if (a.currency === 'USD') return -1;
    if (b.currency === 'USD') return 1;
    return a.currency.localeCompare(b.currency);
  });

  const cashAccounts = accountsList.filter((a) => a.type === 'bank');
  const debtAccounts = accountsList.filter((a) => a.type !== 'bank');

  return (
    <div className="min-h-screen bg-[#090d13] text-[#e6edf3] flex flex-col font-sans selection:bg-cyan-900 selection:text-cyan-200">
      {/* Top Navbar - Flat, Solid, No Transparency, Crisp Terminal Header */}
      <header className="border-b border-[#30363d] bg-[#0d1117] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="px-2 py-1 bg-[#161b22] border border-[#30363d] rounded text-emerald-400 font-mono text-xs font-bold tracking-tight">
              &gt;_
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold font-mono tracking-tight text-white flex items-center gap-1.5">
                  <span>EXPENSE_TRACKER</span>
                  <span className="text-[10px] font-normal px-1.5 py-0.2 bg-[#21262d] text-slate-400 rounded border border-[#30363d]">
                    v0.0.1
                  </span>
                </h1>
              </div>
              <p className="text-[11px] font-mono text-slate-400 hidden sm:block">
                Multi-Currency Ledger • Self-Hosted
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#161b22] border border-[#30363d] text-emerald-400 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>SYS.ONLINE</span>
            </div>

            <ImportModalTrigger />

            <form action={logoutAction}>
              <button
                type="submit"
                className="px-2.5 py-1 text-xs font-mono text-slate-300 hover:text-white bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] hover:border-slate-500 rounded transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>[LOGOUT]</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-6">
        {/* Zero-Data / Bootstrapping View if no accounts exist */}
        {accountsList.length === 0 ? (
          <div className="max-w-3xl mx-auto space-y-6 py-8">
            <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
              <div className="flex items-start justify-between border-b border-[#21262d] pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span>[SYSTEM_STATE : BOOTSTRAP_INITIAL_DATA]</span>
                  </div>
                  <h2 className="text-xl font-bold font-mono text-white">
                    Initial Statement Ingestion & Organization
                  </h2>
                </div>
                <span className="px-2 py-1 rounded bg-[#161b22] border border-[#30363d] text-[10px] font-mono text-slate-400">
                  READY
                </span>
              </div>

              <p className="text-xs font-mono text-slate-300 leading-relaxed">
                Welcome to your self-hosted Expense Tracker. Your database is currently empty.
                Drag and drop your bank and credit card statement files (<code className="text-cyan-300 bg-[#161b22] px-1 py-0.5 rounded">.csv</code>, <code className="text-cyan-300 bg-[#161b22] px-1 py-0.5 rounded">.pdf</code>) below to bootstrap your accounts and ledger.
                Files are automatically sorted and organized by account on your storage dataset.
              </p>

              <StatementImporter isInline={true} />

              <div className="pt-4 border-t border-[#21262d] text-[11px] font-mono text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span>CLI alternative:</span>
                <code className="text-slate-400 bg-[#161b22] px-2 py-1 rounded border border-[#21262d]">
                  npx tsx scripts/seed-database.ts [path/to/statements]
                </code>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Dynamic Multi-Currency Summary Cards */}
            <div className={`grid grid-cols-1 ${currencyList.length > 1 ? 'md:grid-cols-2' : ''} gap-4`}>
              {currencyList.map((c) => {
                const net = c.bankCash - c.cardDebt;
                const isJpy = c.currency === 'JPY';
                const themeBorder = isJpy ? 'hover:border-indigo-500/50' : 'hover:border-emerald-500/50';
                const themeBadge = isJpy ? 'text-indigo-400' : 'text-emerald-400';
                const themeDot = isJpy ? 'bg-indigo-400' : 'bg-emerald-400';

                return (
                  <div
                    key={c.currency}
                    className={`bg-[#0d1117] border border-[#30363d] ${themeBorder} rounded-xl p-5 transition-colors`}
                  >
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                      <span className={`text-xs font-mono uppercase tracking-wider ${themeBadge} flex items-center gap-1.5`}>
                        <span className={`w-1.5 h-1.5 ${themeDot} rounded-sm`} />
                        [NET_WORTH : {c.currency}]
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">{c.currency}</span>
                    </div>
                    <div className="text-3xl font-extrabold font-mono text-white tracking-tight my-2">
                      {formatCurrency(net, c.currency)}
                    </div>
                    <div className="pt-3 border-t border-[#21262d] grid grid-cols-2 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-slate-500 block text-[11px]">BANK_CASH:</span>
                        <span className="font-semibold text-emerald-400">{formatCurrency(c.bankCash, c.currency)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">CARD_DEBT:</span>
                        <span className="font-semibold text-rose-400">{formatCurrency(c.cardDebt, c.currency)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Connected Accounts Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <span>{'//'} CONNECTED_ACCOUNTS</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#161b22] border border-[#30363d] text-slate-300">
                {accountsList.length} TOTAL
              </span>
            </h2>
          </div>

          {/* Sub-section: Cash / Bank Accounts */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-400 font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-sm" />
              <span>[CASH_ACCOUNTS : LIQUID_ASSETS]</span>
              <span className="text-[10px] font-normal px-1.5 py-0.1 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">
                {cashAccounts.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {cashAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="bg-[#0d1117] border border-[#21262d] hover:border-emerald-500/30 rounded-lg p-3.5 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-xs font-medium text-white truncate max-w-[170px]" title={acc.name}>
                        {acc.name}
                      </h3>
                      <span className="px-1.5 py-0.2 text-[10px] font-mono uppercase rounded border bg-emerald-950/40 text-emerald-400 border-emerald-500/30">
                        CASH
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-500">
                      {acc.institution} • {acc.currency}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-[#161b22] flex items-baseline justify-between font-mono">
                    <span className="text-[10px] text-slate-500">BAL</span>
                    <span className="text-sm font-semibold text-white">
                      {formatCurrency(acc.currentBalance, acc.currency)}
                    </span>
                  </div>

                  {acc.lastSyncedAt && (
                    <div className="text-[10px] font-mono text-slate-500 mt-1 flex items-center justify-between">
                      <span>SYNC:</span>
                      <span>{acc.lastSyncedAt}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Sub-section: Credit Card / Debt Accounts */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2 text-[11px] font-mono text-rose-400 font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 bg-rose-400 rounded-sm" />
              <span>[DEBT_ACCOUNTS : CREDIT_LIABILITIES]</span>
              <span className="text-[10px] font-normal px-1.5 py-0.1 rounded bg-rose-950/40 text-rose-400 border border-rose-500/30">
                {debtAccounts.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {debtAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="bg-[#0d1117] border border-[#21262d] hover:border-rose-500/30 rounded-lg p-3.5 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-xs font-medium text-white truncate max-w-[170px]" title={acc.name}>
                        {acc.name}
                      </h3>
                      <span className="px-1.5 py-0.2 text-[10px] font-mono uppercase rounded border bg-rose-950/40 text-rose-400 border-rose-500/30">
                        DEBT
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-500">
                      {acc.institution} • {acc.currency}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-[#161b22] flex items-baseline justify-between font-mono">
                    <span className="text-[10px] text-slate-500">BAL</span>
                    <span className="text-sm font-semibold text-rose-400">
                      {formatCurrency(acc.currentBalance, acc.currency)}
                    </span>
                  </div>

                  {acc.lastSyncedAt && (
                    <div className="text-[10px] font-mono text-slate-500 mt-1 flex items-center justify-between">
                      <span>SYNC:</span>
                      <span>{acc.lastSyncedAt}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Interactive Transaction Ledger */}
        <section className="space-y-4 pt-2 border-t border-[#21262d]">
          <TransactionLedger accounts={accountsList} transactions={allTransactions} />
        </section>
          </>
        )}
      </main>
    </div>
  );
}
