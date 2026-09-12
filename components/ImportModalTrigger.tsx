'use client';

import React, { useState } from 'react';
import { StatementImporter } from './StatementImporter';

export function ImportModalTrigger() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="px-2.5 py-1 text-xs font-mono text-cyan-300 hover:text-cyan-100 bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/40 hover:border-cyan-400 rounded transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
      >
        <span className="text-cyan-400 font-bold">+</span>
        <span>[IMPORT]</span>
      </button>

      <StatementImporter
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
