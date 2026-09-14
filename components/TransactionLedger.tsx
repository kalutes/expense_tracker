'use client';

import React, { useState, useMemo } from 'react';
import type { Account, Transaction } from '../lib/db';

interface TransactionLedgerProps {
  accounts: Account[];
  transactions: Transaction[];
}

interface ParsedRawDetails {
  authorizedUser?: string;
  cardLast4?: string;
  postDate?: string;
  foreignAmount?: number;
  foreignCurrency?: string;
  exchangeRate?: number;
  rawMerchant?: string;
  rawDesc?: string;
  type?: string;
  category?: string;
  [key: string]: unknown;
}

export function TransactionLedger({ accounts, transactions }: TransactionLedgerProps) {
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('ALL');
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const [selectedCurrency, setSelectedCurrency] = useState<'ALL' | 'USD' | 'JPY'>('ALL');
  const [selectedType, setSelectedType] = useState<'ALL' | 'EXPENSE' | 'INCOME'>('ALL');
  const [selectedYear, setSelectedYear] = useState('ALL');

  // Mobile Filters toggle
  const [mobileFiltersExpanded, setMobileFiltersExpanded] = useState(false);

  // Sorting
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'merchant'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modal inspection
  const [inspectTxn, setInspectTxn] = useState<Transaction | null>(null);

  // Account Lookup Map
  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    for (const acc of accounts) {
      map.set(acc.id, acc);
    }
    return map;
  }, [accounts]);

  // Pre-parse details for snappy filtering
  const enrichedTransactions = useMemo(() => {
    return transactions.map((t) => {
      let parsedDetails: ParsedRawDetails = {};
      if (t.rawDetails) {
        try {
          parsedDetails = JSON.parse(t.rawDetails);
        } catch {
          // fallback to empty
        }
      }
      const acc = accountMap.get(t.accountId);
      const year = t.date ? t.date.substring(0, 4) : '';
      return {
        ...t,
        accountName: acc?.name || t.accountId,
        accountCurrency: acc?.currency || t.currency,
        accountType: acc?.type || 'credit',
        parsedDetails,
        year,
      };
    });
  }, [transactions, accountMap]);

  // Available Years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const t of enrichedTransactions) {
      if (t.year) years.add(t.year);
    }
    return Array.from(years).sort().reverse();
  }, [enrichedTransactions]);

  // Dynamic Available Users
  const availableUsers = useMemo(() => {
    const userMap = new Map<string, number>();
    for (const t of enrichedTransactions) {
      const u = t.parsedDetails?.authorizedUser;
      if (u) {
        userMap.set(u, (userMap.get(u) || 0) + 1);
      }
    }
    return Array.from(userMap.entries()).map(([name, count]) => ({ name, count }));
  }, [enrichedTransactions]);

  // Filter & Search Logic
  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return enrichedTransactions.filter((t) => {
      // Account Filter
      if (selectedAccountId !== 'ALL' && t.accountId !== selectedAccountId) {
        return false;
      }

      // User Filter
      if (selectedUser !== 'ALL' && t.parsedDetails.authorizedUser !== selectedUser) {
        return false;
      }

      // Currency Filter
      if (selectedCurrency !== 'ALL' && t.currency !== selectedCurrency) {
        return false;
      }

      // Type Filter (In DB: amount > 0 is Expense, amount <= 0 is Income/Credit)
      if (selectedType === 'EXPENSE' && t.amount <= 0) {
        return false;
      }
      if (selectedType === 'INCOME' && t.amount > 0) {
        return false;
      }

      // Year Filter
      if (selectedYear !== 'ALL' && t.year !== selectedYear) {
        return false;
      }

      // Search Query
      if (query) {
        const merchantMatch = t.merchant.toLowerCase().includes(query);
        const amountMatch = t.amount.toString().includes(query) || Math.abs(t.amount).toFixed(2).includes(query);
        const rawMatch =
          t.parsedDetails.rawMerchant?.toLowerCase().includes(query) ||
          t.parsedDetails.rawDesc?.toLowerCase().includes(query);
        const dateMatch = t.date.includes(query);
        const userMatch = t.parsedDetails.authorizedUser?.toLowerCase().includes(query);

        if (!merchantMatch && !amountMatch && !rawMatch && !dateMatch && !userMatch) {
          return false;
        }
      }

      return true;
    });
  }, [enrichedTransactions, selectedAccountId, selectedUser, selectedCurrency, selectedType, selectedYear, searchQuery]);

  // Sorted Transactions
  const sortedTransactions = useMemo(() => {
    const items = [...filteredTransactions];
    items.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        comparison = a.date.localeCompare(b.date);
      } else if (sortBy === 'amount') {
        comparison = a.amount - b.amount;
      } else if (sortBy === 'merchant') {
        comparison = a.merchant.localeCompare(b.merchant);
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
    return items;
  }, [filteredTransactions, sortBy, sortOrder]);

  // Dynamic Subtotals for Active Filters
  const summaryTotals = useMemo(() => {
    let expenseUSD = 0;
    let incomeUSD = 0;
    let expenseJPY = 0;
    let incomeJPY = 0;

    for (const t of filteredTransactions) {
      if (t.currency === 'USD') {
        if (t.amount > 0) expenseUSD += t.amount;
        else incomeUSD += Math.abs(t.amount);
      } else {
        if (t.amount > 0) expenseJPY += t.amount;
        else incomeJPY += Math.abs(t.amount);
      }
    }

    return { expenseUSD, incomeUSD, expenseJPY, incomeJPY };
  }, [filteredTransactions]);

  // Pagination Slice
  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / pageSize));
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTransactions.slice(start, start + pageSize);
  }, [sortedTransactions, currentPage, pageSize]);

  // Handle filter changes (reset page)
  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedAccountId('ALL');
    setSelectedUser('ALL');
    setSelectedCurrency('ALL');
    setSelectedType('ALL');
    setSelectedYear('ALL');
    setCurrentPage(1);
  };

  const activeFilterCount =
    (searchQuery ? 1 : 0) +
    (selectedAccountId !== 'ALL' ? 1 : 0) +
    (selectedUser !== 'ALL' ? 1 : 0) +
    (selectedCurrency !== 'ALL' ? 1 : 0) +
    (selectedType !== 'ALL' ? 1 : 0) +
    (selectedYear !== 'ALL' ? 1 : 0);

  const hasActiveFilters = activeFilterCount > 0;

  // Export Filtered CSV
  const handleExportCsv = () => {
    if (sortedTransactions.length === 0) return;

    const headers = [
      'Date',
      'Account',
      'Currency',
      'Type',
      'Amount',
      'Merchant',
      'User',
      'FX Amount',
      'FX Currency',
      'FX Rate',
      'Status',
      'External ID',
    ];
    const rows = sortedTransactions.map((t) => [
      `"${t.date}"`,
      `"${t.accountName.replace(/"/g, '""')}"`,
      `"${t.currency}"`,
      `"${t.amount > 0 ? 'Expense' : 'Credit/Inflow'}"`,
      (t.amount > 0 ? -t.amount : Math.abs(t.amount)).toFixed(t.currency === 'USD' ? 2 : 0),
      `"${t.merchant.replace(/"/g, '""')}"`,
      `"${t.parsedDetails.authorizedUser || 'Primary'}"`,
      t.parsedDetails.foreignAmount || '',
      t.parsedDetails.foreignCurrency || '',
      t.parsedDetails.exchangeRate || '',
      `"${t.status}"`,
      `"${t.externalId || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `expense_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /**
   * Helper formatting:
   * Expenses (DB amount > 0): NEGATIVE (e.g. -$9.78, -¥1,500)
   * Credits / Inflows (DB amount <= 0): POSITIVE (e.g. +$3,152.60, +¥50,000)
   */
  const formatAmount = (amount: number, currency: string) => {
    if (currency === 'JPY') {
      if (amount > 0) {
        return `-¥${Math.round(amount).toLocaleString('ja-JP')}`;
      } else {
        return `+¥${Math.abs(Math.round(amount)).toLocaleString('ja-JP')}`;
      }
    } else {
      if (amount > 0) {
        return `-$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else {
        return `+$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    }
  };

  const getAccountBadgeStyle = (accountId: string) => {
    const palette = [
      'text-indigo-400 border-indigo-500/40 bg-[#161b22]',
      'text-cyan-400 border-cyan-500/40 bg-[#161b22]',
      'text-emerald-400 border-emerald-500/40 bg-[#161b22]',
      'text-teal-400 border-teal-500/40 bg-[#161b22]',
      'text-rose-400 border-rose-500/40 bg-[#161b22]',
      'text-amber-400 border-amber-500/40 bg-[#161b22]',
      'text-violet-400 border-violet-500/40 bg-[#161b22]',
      'text-sky-400 border-sky-500/40 bg-[#161b22]',
      'text-fuchsia-400 border-fuchsia-500/40 bg-[#161b22]',
      'text-lime-400 border-lime-500/40 bg-[#161b22]',
    ];

    let hash = 0;
    for (let i = 0; i < accountId.length; i++) {
      hash = (hash * 31 + accountId.charCodeAt(i)) % palette.length;
    }
    return palette[Math.abs(hash)];
  };

  const getUserBadgeStyle = (userName: string) => {
    const palette = [
      {
        chipSelected: 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/50 font-bold',
        chipUnselected: 'text-fuchsia-400/80 hover:text-fuchsia-300 hover:bg-fuchsia-950/30',
        tableBadge: 'bg-fuchsia-950/40 text-fuchsia-300 border-fuchsia-500/50',
      },
      {
        chipSelected: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold',
        chipUnselected: 'text-cyan-400/80 hover:text-cyan-300 hover:bg-cyan-950/30',
        tableBadge: 'bg-cyan-950/40 text-cyan-300 border-cyan-500/50',
      },
      {
        chipSelected: 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold',
        chipUnselected: 'text-amber-400/80 hover:text-amber-300 hover:bg-amber-950/30',
        tableBadge: 'bg-amber-950/40 text-amber-300 border-amber-500/50',
      },
      {
        chipSelected: 'bg-violet-500/20 text-violet-300 border border-violet-500/50 font-bold',
        chipUnselected: 'text-violet-400/80 hover:text-violet-300 hover:bg-violet-950/30',
        tableBadge: 'bg-violet-950/40 text-violet-300 border-violet-500/50',
      },
    ];

    let hash = 0;
    for (let i = 0; i < userName.length; i++) {
      hash = (hash * 31 + userName.charCodeAt(i)) % palette.length;
    }
    return palette[Math.abs(hash)];
  };

  return (
    <div className="space-y-4 font-mono">
      {/* Header & Global Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="text-emerald-400">&gt;</span>
              <span>HISTORICAL_TRANSACTION_LEDGER</span>
            </h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-normal bg-[#161b22] text-slate-300 border border-[#30363d]">
              [{filteredTransactions.length.toLocaleString()} / {transactions.length.toLocaleString()}]
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Querying raw ledger index • Dual-currency in-memory engine
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="px-2.5 py-1.5 sm:py-1 text-slate-300 hover:text-white bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] rounded transition-colors cursor-pointer flex items-center gap-1 active:scale-95"
            >
              <span>[RESET_FILTERS]</span>
            </button>
          )}

          <button
            onClick={handleExportCsv}
            disabled={filteredTransactions.length === 0}
            className="px-3 py-1.5 sm:py-1 text-emerald-400 hover:text-emerald-300 bg-[#161b22] hover:bg-[#21262d] border border-emerald-500/40 rounded transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            <span>[EXPORT_CSV : {filteredTransactions.length.toLocaleString()}]</span>
          </button>
        </div>
      </div>

      {/* Control Panel: Flat Retro Terminal Filter Box */}
      <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3.5 sm:p-4 space-y-3">
        {/* Row 1: Search Input & Mobile Filter Accordion Toggle */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch">
          {/* Prompt Search Input */}
          <div className="relative flex-1 flex items-center">
            <div className="absolute left-3 text-emerald-400 font-bold select-none text-xs">
              $&gt;
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleFilterChange();
              }}
              placeholder="Search merchant, amount, note, date..."
              className="w-full pl-8 pr-8 py-2 sm:py-1.5 bg-[#090d13] border border-[#30363d] focus:border-emerald-500 rounded text-xs text-white placeholder-slate-600 transition-colors outline-none font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  handleFilterChange();
                }}
                className="absolute right-2.5 p-1 text-slate-500 hover:text-white text-xs font-mono"
              >
                [x]
              </button>
            )}
          </div>

          {/* Mobile Filter Expand Toggle */}
          <button
            onClick={() => setMobileFiltersExpanded((prev) => !prev)}
            className="sm:hidden flex items-center justify-between px-3 py-2 bg-[#161b22] border border-[#30363d] rounded text-xs text-slate-200 active:bg-[#21262d]"
          >
            <span className="flex items-center gap-1.5">
              <span>[FILTERS & PARAMS]</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40">
                  {activeFilterCount}
                </span>
              )}
            </span>
            <span className="text-emerald-400 text-xs">{mobileFiltersExpanded ? '▲ HIDE' : '▼ SHOW'}</span>
          </button>
        </div>

        {/* Collapsible on Mobile, always visible on tablet/desktop */}
        <div className={`${mobileFiltersExpanded ? 'block' : 'hidden'} sm:block space-y-3 pt-1`}>
          {/* Dynamic User Tag Chips */}
          {availableUsers.length > 0 && (
            <div className="flex items-center gap-1 p-1.5 bg-[#090d13] border border-[#30363d] rounded text-xs overflow-x-auto">
              <span className="text-[11px] text-slate-500 px-1.5 select-none whitespace-nowrap">
                USER:
              </span>
              <button
                onClick={() => {
                  setSelectedUser('ALL');
                  handleFilterChange();
                }}
                className={`py-1 sm:py-0.5 px-2.5 sm:px-2 rounded text-[11px] transition-all whitespace-nowrap shrink-0 ${
                  selectedUser === 'ALL'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-[#161b22]'
                }`}
              >
                [ALL]
              </button>
              {availableUsers.map((u) => {
                const isSelected = selectedUser === u.name;
                const userStyle = getUserBadgeStyle(u.name);
                return (
                  <button
                    key={u.name}
                    onClick={() => {
                      setSelectedUser(u.name);
                      handleFilterChange();
                    }}
                    className={`py-1 sm:py-0.5 px-2.5 sm:px-2 rounded text-[11px] transition-all flex items-center justify-center gap-1 whitespace-nowrap shrink-0 ${
                      isSelected
                        ? userStyle.chipSelected
                        : userStyle.chipUnselected
                    }`}
                  >
                    <span>[{u.name.toUpperCase()}</span>
                    <span className="text-[10px] opacity-80">({u.count})]</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Row 2: Account Selectors */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
            <span className="text-[11px] text-slate-500 mr-1 select-none">
              ACCOUNT:
            </span>
            <button
              onClick={() => {
                setSelectedAccountId('ALL');
                handleFilterChange();
              }}
              className={`px-2.5 sm:px-2 py-1 sm:py-0.5 rounded text-[11px] transition-all border shrink-0 ${
                selectedAccountId === 'ALL'
                  ? 'bg-white text-black border-white font-bold'
                  : 'bg-[#090d13] text-slate-400 border-[#21262d] hover:text-white hover:border-[#30363d]'
              }`}
            >
              [ALL: {transactions.length.toLocaleString()}]
            </button>

            {accounts.map((acc) => {
              const isSelected = selectedAccountId === acc.id;
              return (
                <button
                  key={acc.id}
                  onClick={() => {
                    setSelectedAccountId(acc.id);
                    handleFilterChange();
                  }}
                  className={`px-2.5 sm:px-2 py-1 sm:py-0.5 rounded text-[11px] transition-all border truncate max-w-[200px] shrink-0 ${
                    isSelected
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold'
                      : 'bg-[#090d13] text-slate-400 border-[#21262d] hover:text-white hover:border-[#30363d]'
                  }`}
                  title={acc.name}
                >
                  [{acc.name.replace(/\(.*\)/, '').trim()}]
                </button>
              );
            })}
          </div>

          {/* Row 3: Secondary Filters (Currency, Type, Year, Sort) */}
          <div className="pt-2 border-t border-[#21262d] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Currency Filter */}
              <div className="flex items-center gap-1 bg-[#090d13] border border-[#21262d] rounded p-0.5 text-[11px]">
                <button
                  onClick={() => {
                    setSelectedCurrency('ALL');
                    handleFilterChange();
                  }}
                  className={`px-2 py-1 sm:px-1.5 sm:py-0.5 rounded ${
                    selectedCurrency === 'ALL' ? 'bg-[#21262d] text-white' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  CURR:ALL
                </button>
                <button
                  onClick={() => {
                    setSelectedCurrency('USD');
                    handleFilterChange();
                  }}
                  className={`px-2 py-1 sm:px-1.5 sm:py-0.5 rounded ${
                    selectedCurrency === 'USD'
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 font-bold'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  $ USD
                </button>
                <button
                  onClick={() => {
                    setSelectedCurrency('JPY');
                    handleFilterChange();
                  }}
                  className={`px-2 py-1 sm:px-1.5 sm:py-0.5 rounded ${
                    selectedCurrency === 'JPY'
                      ? 'bg-indigo-950/60 text-indigo-400 border border-indigo-500/30 font-bold'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  ¥ JPY
                </button>
              </div>

              {/* Type Filter */}
              <div className="flex items-center gap-1 bg-[#090d13] border border-[#21262d] rounded p-0.5 text-[11px]">
                <button
                  onClick={() => {
                    setSelectedType('ALL');
                    handleFilterChange();
                  }}
                  className={`px-2 py-1 sm:px-1.5 sm:py-0.5 rounded ${
                    selectedType === 'ALL' ? 'bg-[#21262d] text-white' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  TYPE:ALL
                </button>
                <button
                  onClick={() => {
                    setSelectedType('EXPENSE');
                    handleFilterChange();
                  }}
                  className={`px-2 py-1 sm:px-1.5 sm:py-0.5 rounded ${
                    selectedType === 'EXPENSE'
                      ? 'bg-rose-950/60 text-rose-400 border border-rose-500/30 font-bold'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  - EXPENSES
                </button>
                <button
                  onClick={() => {
                    setSelectedType('INCOME');
                    handleFilterChange();
                  }}
                  className={`px-2 py-1 sm:px-1.5 sm:py-0.5 rounded ${
                    selectedType === 'INCOME'
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 font-bold'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  + INFLOWS
                </button>
              </div>

              {/* Year Selector */}
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-slate-500">YEAR:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    handleFilterChange();
                  }}
                  className="bg-[#090d13] border border-[#21262d] text-slate-300 rounded px-2 py-1 sm:px-1.5 sm:py-0.5 text-[11px] outline-none focus:border-emerald-500"
                >
                  <option value="ALL">ALL_YEARS</option>
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-slate-500">SORT:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'amount' | 'merchant')}
                className="bg-[#090d13] border border-[#21262d] text-slate-300 rounded px-2 py-1 sm:px-1.5 sm:py-0.5 text-[11px] outline-none focus:border-emerald-500"
              >
                <option value="date">DATE</option>
                <option value="amount">AMOUNT</option>
                <option value="merchant">MERCHANT</option>
              </select>
              <button
                onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                className="px-2 py-1 sm:px-1.5 sm:py-0.5 bg-[#090d13] hover:bg-[#161b22] border border-[#21262d] rounded text-slate-300 hover:text-white"
              >
                {sortOrder === 'desc' ? 'DESC [▼]' : 'ASC [▲]'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live Dynamic Subtotals Banner - Responsive Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 bg-[#0d1117] border border-[#21262d] rounded-lg p-3 text-xs">
        <div>
          <span className="text-slate-500 block text-[10px]">FILTERED_EXPENSES (USD):</span>
          <span className="font-bold text-rose-400 text-sm">
            -${summaryTotals.expenseUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block text-[10px]">FILTERED_INFLOWS (USD):</span>
          <span className="font-bold text-emerald-400 text-sm">
            +${summaryTotals.incomeUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block text-[10px]">FILTERED_EXPENSES (JPY):</span>
          <span className="font-bold text-rose-400 text-sm">
            -¥{Math.round(summaryTotals.expenseJPY).toLocaleString('ja-JP')}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block text-[10px]">FILTERED_INFLOWS (JPY):</span>
          <span className="font-bold text-emerald-400 text-sm">
            +¥{Math.round(summaryTotals.incomeJPY).toLocaleString('ja-JP')}
          </span>
        </div>
      </div>

      {/* Ledger Content */}
      <div className="bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden">
        {paginatedTransactions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 space-y-2">
            <p className="text-amber-400 font-bold">{'//'} 0 RECORDS MATCHING QUERY</p>
            <p className="text-slate-500">Try adjusting your filters or resetting parameters.</p>
            <button
              onClick={clearAllFilters}
              className="mt-2 px-3 py-1.5 text-xs text-emerald-400 bg-[#161b22] border border-[#30363d] rounded active:scale-95"
            >
              [RESET_ALL_FILTERS]
            </button>
          </div>
        ) : (
          <>
            {/* 1. Mobile Card View (< md screens) */}
            <div className="md:hidden divide-y divide-[#161b22]">
              {paginatedTransactions.map((t) => {
                const isExpense = t.amount > 0;
                const user = t.parsedDetails?.authorizedUser;
                const userStyle = user ? getUserBadgeStyle(user) : null;
                const hasFx = Boolean(t.parsedDetails?.foreignCurrency);

                return (
                  <div
                    key={t.id}
                    onClick={() => setInspectTxn(t)}
                    className="p-3.5 hover:bg-[#161b22] active:bg-[#161b22] transition-colors cursor-pointer space-y-2"
                  >
                    {/* Top Row: Date, Account Badge, User Badge */}
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{t.date}</span>
                        <span
                          className={`inline-block px-1.5 py-0.2 rounded text-[10px] border truncate max-w-[130px] ${getAccountBadgeStyle(
                            t.accountId
                          )}`}
                          title={t.accountName}
                        >
                          {t.accountName.replace(/\(.*\)/, '').trim()}
                        </span>
                      </div>

                      {user && userStyle && (
                        <span
                          className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold border shrink-0 ${userStyle.tableBadge}`}
                        >
                          {user.toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Middle Row: Merchant Name */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-sans font-medium text-slate-100 leading-snug">
                        {t.merchant}
                      </div>
                      {/* Amount */}
                      <div className="text-right shrink-0">
                        <span className={`text-sm font-bold font-mono ${isExpense ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {formatAmount(t.amount, t.currency)}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row: Foreign Currency Badge & Inspect Hint */}
                    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 pt-0.5">
                      {hasFx ? (
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-[#090d13] text-cyan-400 border border-cyan-500/40 font-mono">
                          FX: {t.parsedDetails.foreignCurrency} {t.parsedDetails.foreignAmount?.toLocaleString()} @ {t.parsedDetails.exchangeRate}
                        </span>
                      ) : (
                        <span className="text-slate-600">{t.source.toUpperCase()}</span>
                      )}

                      <span className="text-slate-400 text-[10px] flex items-center gap-1">
                        <span>DETAILS</span>
                        <span className="text-emerald-400">&gt;</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 2. Desktop High-Density Table (>= md screens) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-[#30363d] bg-[#090d13] text-slate-400 text-[11px]">
                    <th className="py-2.5 px-3.5 w-[105px]">DATE</th>
                    <th className="py-2.5 px-3.5">MERCHANT_DESCRIPTION</th>
                    <th className="py-2.5 px-3.5 w-[160px]">ACCOUNT</th>
                    <th className="py-2.5 px-3.5 w-[90px] text-center">USER</th>
                    <th className="py-2.5 px-3.5 text-right w-[130px]">AMOUNT</th>
                    <th className="py-2.5 px-2 w-[45px] text-center">RAW</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#161b22]">
                  {paginatedTransactions.map((t) => {
                    const isExpense = t.amount > 0;
                    const user = t.parsedDetails?.authorizedUser;
                    const userStyle = user ? getUserBadgeStyle(user) : null;
                    const hasFx = Boolean(t.parsedDetails?.foreignCurrency);

                    return (
                      <tr
                        key={t.id}
                        onClick={() => setInspectTxn(t)}
                        className="hover:bg-[#161b22] transition-colors cursor-pointer group"
                      >
                        {/* Date */}
                        <td className="py-2 px-3.5 text-slate-400 whitespace-nowrap text-[11px]">
                          {t.date}
                        </td>

                        {/* Merchant & FX pill */}
                        <td className="py-2 px-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-slate-200 group-hover:text-white font-sans text-xs">
                              {t.merchant}
                            </span>

                            {/* Foreign Currency conversion badge */}
                            {hasFx && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] bg-[#090d13] text-cyan-400 border border-cyan-500/40">
                                [FX: {t.parsedDetails.foreignCurrency} {t.parsedDetails.foreignAmount?.toLocaleString()} @ {t.parsedDetails.exchangeRate}]
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Account Badge */}
                        <td className="py-2 px-3.5 whitespace-nowrap">
                          <span
                            className={`inline-block px-1.5 py-0.2 rounded text-[10px] border truncate max-w-[145px] ${getAccountBadgeStyle(
                              t.accountId
                            )}`}
                            title={t.accountName}
                          >
                            {t.accountName.replace(/\(.*\)/, '').trim()}
                          </span>
                        </td>

                        {/* User Tag */}
                        <td className="py-2 px-3.5 text-center whitespace-nowrap">
                          {user && userStyle ? (
                            <span
                              className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold border ${userStyle.tableBadge}`}
                            >
                              {user.toUpperCase()}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-600">—</span>
                          )}
                        </td>

                        {/* Amount with Preferred Negative Expense / Positive Credit Signs */}
                        <td className="py-2 px-3.5 text-right font-bold whitespace-nowrap">
                          <span className={isExpense ? 'text-rose-400' : 'text-emerald-400'}>
                            {formatAmount(t.amount, t.currency)}
                          </span>
                        </td>

                        {/* Inspect button */}
                        <td className="py-2 px-2 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectTxn(t);
                            }}
                            className="p-1 rounded text-slate-500 hover:text-white hover:bg-[#21262d] transition-colors"
                            title="View raw JSON data"
                          >
                            &lt;/&gt;
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Flat Terminal Pagination Controls */}
        <div className="px-3.5 py-3 border-t border-[#30363d] bg-[#090d13] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center justify-between sm:justify-start gap-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span>ROWS:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-[#161b22] border border-[#30363d] text-slate-300 rounded px-2 py-1 outline-none focus:border-emerald-500"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <span className="text-slate-500">
              [{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sortedTransactions.length)} OF {sortedTransactions.length.toLocaleString()}]
            </span>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[11px]">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded bg-[#161b22] border border-[#30363d] text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
            >
              |&lt;
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded bg-[#161b22] border border-[#30363d] text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
            >
              PREV
            </button>

            <span className="px-2 py-1 text-white font-bold">
              PAGE {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 rounded bg-[#161b22] border border-[#30363d] text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
            >
              NEXT
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 rounded bg-[#161b22] border border-[#30363d] text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
            >
              &gt;|
            </button>
          </div>
        </div>
      </div>

      {/* Flat Retro Inspector Modal / Slide-up Sheet */}
      {inspectTxn && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#0d1117] border border-[#30363d] rounded-t-2xl sm:rounded-xl max-w-xl w-full p-5 shadow-2xl space-y-3.5 max-h-[88vh] overflow-y-auto font-mono text-xs animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-start justify-between pb-3 border-b border-[#21262d]">
              <div>
                <span className="text-[10px] text-emerald-400 block">{'//'} TRANSACTION_INSPECTOR</span>
                <h3 className="text-base font-bold text-white mt-0.5 font-sans">{inspectTxn.merchant}</h3>
              </div>
              <button
                onClick={() => setInspectTxn(null)}
                className="px-3 py-1.5 rounded text-slate-300 hover:text-white bg-[#161b22] border border-[#30363d] active:scale-95 text-xs"
              >
                [CLOSE]
              </button>
            </div>

            {/* Quick Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#090d13] p-3 rounded-lg border border-[#21262d]">
                <span className="text-slate-500 block text-[10px]">AMOUNT</span>
                <span className={`text-base font-bold ${inspectTxn.amount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {formatAmount(inspectTxn.amount, inspectTxn.currency)}
                </span>
              </div>

              <div className="bg-[#090d13] p-3 rounded-lg border border-[#21262d]">
                <span className="text-slate-500 block text-[10px]">DATE</span>
                <span className="text-xs text-slate-200">{inspectTxn.date}</span>
              </div>

              <div className="bg-[#090d13] p-3 rounded-lg border border-[#21262d]">
                <span className="text-slate-500 block text-[10px]">ACCOUNT</span>
                <span className="text-xs text-slate-200">{accountMap.get(inspectTxn.accountId)?.name || inspectTxn.accountId}</span>
              </div>

              <div className="bg-[#090d13] p-3 rounded-lg border border-[#21262d]">
                <span className="text-slate-500 block text-[10px]">SOURCE_STATUS</span>
                <span className="text-xs text-slate-200 uppercase">{inspectTxn.source} • {inspectTxn.status}</span>
              </div>
            </div>

            {/* Deduplication Hash */}
            <div className="bg-[#090d13] p-3 rounded-lg border border-[#21262d] space-y-1">
              <span className="text-slate-500 block text-[10px]">DEDUP_HASH_SHA256</span>
              <span className="text-[10px] text-slate-400 break-all select-all block font-mono">
                {inspectTxn.dedupHash}
              </span>
            </div>

            {/* Raw Details JSON */}
            <div className="bg-[#090d13] p-3 rounded-lg border border-[#21262d] space-y-1">
              <span className="text-slate-500 block text-[10px]">RAW_PAYLOAD_JSON</span>
              <pre className="text-[11px] text-emerald-300 overflow-x-auto p-2.5 bg-black rounded max-h-48 font-mono leading-relaxed">
                {inspectTxn.rawDetails
                  ? JSON.stringify(JSON.parse(inspectTxn.rawDetails), null, 2)
                  : 'null'}
              </pre>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setInspectTxn(null)}
                className="w-full sm:w-auto px-4 py-2 text-xs text-white bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] rounded font-bold active:scale-95"
              >
                [CLOSE]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
