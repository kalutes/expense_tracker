'use client';

import React, { useState } from 'react';

export function LogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network error on logout
    }
    window.location.href = '/login';
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="px-2.5 py-1 text-xs font-mono text-slate-300 hover:text-white bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] hover:border-slate-500 rounded transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
    >
      <span>{isLoggingOut ? '[LOGGING OUT...]' : '[LOGOUT]'}</span>
    </button>
  );
}
