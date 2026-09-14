'use client';

import React, { useState, useRef, useCallback } from 'react';
import { FileImportResult } from '@/lib/importer';

interface StatementImporterProps {
  isInline?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onImportComplete?: () => void;
}

export function StatementImporter({
  isInline = false,
  isOpen = false,
  onClose,
  onImportComplete,
}: StatementImporterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFilesToProcess, setTotalFilesToProcess] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [results, setResults] = useState<FileImportResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter(
        (f) => f.name.endsWith('.csv') || f.name.endsWith('.pdf')
      );

      if (files.length === 0) {
        setErrorMessage('Please upload valid statement files (.csv or .pdf).');
        return;
      }

      setErrorMessage(null);
      setIsProcessing(true);
      setTotalFilesToProcess(files.length);
      setResults([]);

      const importedResults: FileImportResult[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentFileIndex(i + 1);
        setCurrentFileName(file.name);

        const formData = new FormData();
        formData.append('file', file);

        try {
          const res = await fetch('/api/import', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            importedResults.push({
              success: false,
              filename: file.name,
              accounts: [],
              totalParsed: 0,
              totalInserted: 0,
              totalDuplicates: 0,
              error: errData.error || `HTTP ${res.status}: Failed to import`,
            });
          } else {
            const data = await res.json();
            if (data.results && data.results.length > 0) {
              importedResults.push(...data.results);
            } else {
              importedResults.push({
                success: true,
                filename: file.name,
                accounts: [],
                totalParsed: 0,
                totalInserted: 0,
                totalDuplicates: 0,
              });
            }
          }
        } catch (err) {
          importedResults.push({
            success: false,
            filename: file.name,
            accounts: [],
            totalParsed: 0,
            totalInserted: 0,
            totalDuplicates: 0,
            error: err instanceof Error ? err.message : 'Network error during upload',
          });
        }

        setResults([...importedResults]);
      }

      setIsProcessing(false);
      if (onImportComplete) {
        onImportComplete();
      }
    },
    [onImportComplete]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const totalInsertedSum = results.reduce((acc, r) => acc + r.totalInserted, 0);
  const totalDuplicatesSum = results.reduce((acc, r) => acc + r.totalDuplicates, 0);
  const successfulCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  const content = (
    <div className="space-y-4">
      {/* Dropzone Area */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          dragActive
            ? 'border-cyan-400 bg-cyan-950/30 text-cyan-200 shadow-lg shadow-cyan-950/50'
            : isProcessing
            ? 'border-slate-700 bg-[#0d1117]/60 cursor-not-allowed text-slate-500'
            : 'border-[#30363d] bg-[#0d1117] hover:border-cyan-500/50 hover:bg-[#161b22] text-slate-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,.pdf"
          onChange={handleInputChange}
          disabled={isProcessing}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-lg bg-[#161b22] border border-[#30363d] flex items-center justify-center text-cyan-400 font-mono text-xl">
            {isProcessing ? '⏳' : '📥'}
          </div>

          <div>
            <p className="text-sm font-mono font-semibold text-white">
              {isProcessing
                ? `PROCESSING [${currentFileIndex}/${totalFilesToProcess}]: ${currentFileName}`
                : 'DRAG & DROP STATEMENTS (CSV / PDF) HERE'}
            </p>
            <p className="text-xs font-mono text-slate-500 mt-1">
              {isProcessing
                ? 'Parsing statements, deduplicating records, and organizing dataset folders...'
                : 'or click to browse from your device • Batch multi-file upload supported'}
            </p>
          </div>

          {!isProcessing && (
            <div className="flex items-center gap-2 pt-1 text-[11px] font-mono text-slate-400">
              <span className="px-2 py-0.5 rounded bg-[#161b22] border border-[#30363d]">
                Supported: MUFG, JP Post, Rakuten Card, First Tech, Capital One
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Live Processing Bar */}
      {isProcessing && totalFilesToProcess > 0 && (
        <div className="bg-[#0d1117] border border-cyan-500/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-cyan-400 font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              INGESTING & ORGANIZING FILES...
            </span>
            <span className="text-slate-400">
              {currentFileIndex} / {totalFilesToProcess} (
              {Math.round((currentFileIndex / totalFilesToProcess) * 100)}%)
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#161b22] rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 transition-all duration-300"
              style={{ width: `${(currentFileIndex / totalFilesToProcess) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="bg-rose-950/40 border border-rose-500/50 rounded-lg p-3 text-xs font-mono text-rose-300 flex items-start gap-2">
          <span>❌</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Results List */}
      {results.length > 0 && (
        <div className="space-y-3">
          {/* Summary Header */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 font-bold">
                ✓ {successfulCount} SUCCEEDED
              </span>
              {failedCount > 0 && (
                <span className="text-rose-400 font-bold">
                  ✗ {failedCount} FAILED
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-slate-300">
              <span>
                <strong className="text-white">+{totalInsertedSum}</strong> new txns
              </span>
              <span>
                <strong className="text-slate-400">{totalDuplicatesSum}</strong> duplicates skipped
              </span>
            </div>
          </div>

          {/* Detailed Per-File Cards */}
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {results.map((r, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border font-mono text-xs transition-colors ${
                  r.success
                    ? 'bg-[#0d1117] border-[#21262d] hover:border-[#30363d]'
                    : 'bg-rose-950/20 border-rose-500/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={r.success ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {r.success ? '[OK]' : '[ERR]'}
                      </span>
                      <span className="text-white font-semibold truncate max-w-sm sm:max-w-md" title={r.filename}>
                        {r.filename}
                      </span>
                    </div>

                    {r.savedPath && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <span>📁 Saved:</span>
                        <code className="text-cyan-300/80 bg-[#161b22] px-1 py-0.2 rounded border border-[#30363d]">
                          {r.savedPath}
                        </code>
                      </p>
                    )}

                    {r.error && (
                      <p className="text-[11px] text-rose-400">{r.error}</p>
                    )}
                  </div>

                  {r.success && (
                    <div className="text-right text-[11px] shrink-0">
                      <span className="text-emerald-400 font-bold">+{r.totalInserted}</span>
                      <span className="text-slate-500 ml-1">({r.totalDuplicates} dups)</span>
                    </div>
                  )}
                </div>

                {/* Account Details if imported */}
                {r.accounts && r.accounts.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[#161b22] flex flex-wrap gap-2">
                    {r.accounts.map((acc) => (
                      <span
                        key={acc.id}
                        className="px-1.5 py-0.5 rounded bg-[#161b22] border border-[#30363d] text-[10px] text-slate-300"
                      >
                        {acc.name} • {acc.currency} {acc.currentBalance.toLocaleString()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Action Button */}
          {!isProcessing && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  window.location.reload();
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-2"
              >
                <span>[DONE • REFRESH DASHBOARD]</span>
                <span>→</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (isInline) {
    return content;
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-[#090d13] border border-[#30363d] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#30363d] bg-[#0d1117] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="px-2 py-0.5 bg-[#161b22] border border-[#30363d] rounded text-cyan-400 font-mono text-xs font-bold">
              +
            </div>
            <h3 className="font-mono text-sm font-bold text-white tracking-tight">
              STATEMENT_IMPORTER // INGEST_DATA
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-400 hover:text-white font-mono text-xs px-2 py-1 rounded hover:bg-[#21262d] transition-colors cursor-pointer"
          >
            [ESC / CLOSE]
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {content}
        </div>
      </div>
    </div>
  );
}
