'use client';

import React, { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        setIsPending(false);
      } else {
        window.location.href = '/';
      }
    } catch {
      setError('Network error connecting to ledger server');
      setIsPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d13] text-[#e6edf3] flex flex-col items-center justify-center p-4 font-sans selection:bg-cyan-900 selection:text-cyan-200">
      <div className="w-full max-w-md">
        {/* Terminal Card */}
        <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl overflow-hidden shadow-2xl">
          {/* Card Header */}
          <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="px-2 py-0.5 bg-[#090d13] border border-[#30363d] rounded text-emerald-400 font-mono text-xs font-bold tracking-tight">
                &gt;_
              </div>
              <h1 className="text-xs font-bold font-mono tracking-tight text-white flex items-center gap-2">
                <span>EXPENSE_TRACKER</span>
                <span className="text-[10px] font-normal px-1.5 py-0.2 bg-[#21262d] text-slate-400 rounded border border-[#30363d]">
                  v0.0.1
                </span>
              </h1>
            </div>

            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#090d13] border border-[#30363d] text-emerald-400 font-mono text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>SYS.ONLINE</span>
            </div>
          </div>

          {/* Card Body */}
          <div className="p-6 sm:p-8 space-y-6">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-cyan-400 uppercase tracking-wider mb-1 font-semibold">
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-sm" />
                <span>[AUTHENTICATION : REQUIRED]</span>
              </div>
              <p className="text-xs font-mono text-slate-400 leading-relaxed">
                Enter your master password to unlock your multi-currency ledger and statement vault.
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="bg-rose-950/40 border border-rose-500/50 rounded-lg p-3 text-xs font-mono text-rose-300 flex items-start gap-2">
                <span className="font-bold">[ERR]</span>
                <span>{error}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="password"
                  className="block text-[11px] font-mono font-medium text-slate-400 uppercase tracking-wider mb-1.5"
                >
                  ACCESS_KEY // PASSWORD
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    placeholder="••••••••••••"
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-cyan-400 rounded-lg px-3.5 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 transition-colors pr-16"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded bg-[#090d13] border border-[#30363d] hover:border-slate-500 transition-colors cursor-pointer"
                  >
                    {showPassword ? '[HIDE]' : '[SHOW]'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-mono text-xs font-bold py-2.5 px-4 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                {isPending ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    <span>[AUTHENTICATING...]</span>
                  </>
                ) : (
                  <>
                    <span>[UNLOCK_SESSION]</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </form>

            {/* Footer Information */}
            <div className="pt-4 border-t border-[#21262d] flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>SELF_HOSTED • ISOLATED</span>
              <span>AES / HMAC_SHA256</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
