'use client';

import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { formatPrice, getSymbolSpec, MT5_SYMBOLS } from '@/lib/mt5/marketData';
import type { LiveQuote } from '@/lib/mt5/types';

interface MarketWatchProps {
  quotes: Record<string, LiveQuote>;
  activeSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onOpenOrderForSymbol: (symbol: string) => void;
}

export function MarketWatch({
  quotes,
  activeSymbol,
  onSelectSymbol,
  onOpenOrderForSymbol,
}: MarketWatchProps) {
  const [tab, setTab] = useState<'symbols' | 'details'>('symbols');
  const [query, setQuery] = useState('');

  const filtered = MT5_SYMBOLS.filter(
    (s) =>
      s.symbol.toLowerCase().includes(query.toLowerCase()) ||
      s.description.toLowerCase().includes(query.toLowerCase())
  );

  const selectedSpec = getSymbolSpec(activeSymbol);
  const selectedQuote = quotes[activeSymbol];

  return (
    <section
      aria-label="Market Watch - Bảng giá"
      className="flex flex-col border-b border-slate-300 dark:border-slate-800 bg-white dark:bg-[#161A25] min-h-0 flex-1"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-[#F3F4F6] dark:bg-[#1E222D]">
        <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
          Bảng giá (Market Watch)
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab('symbols')}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
              tab === 'symbols'
                ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Ký hiệu
          </button>
          <button
            type="button"
            onClick={() => setTab('details')}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
              tab === 'details'
                ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Chi tiết
          </button>
        </div>
      </div>

      {tab === 'symbols' ? (
        <>
          <div className="px-2 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <label htmlFor="mw-search" className="sr-only">
              Tìm cặp tiền hoặc tài sản
            </label>
            <input
              id="mw-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm mã (XAUUSD, EURUSD...)"
              className="w-full text-xs bg-transparent text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          <div className="overflow-y-auto flex-1">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-100 dark:bg-[#1B202C] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left font-medium px-2 py-1">Mã</th>
                  <th className="text-right font-medium px-1.5 py-1">Bid</th>
                  <th className="text-right font-medium px-1.5 py-1">Ask</th>
                  <th className="text-right font-medium px-2 py-1">Spr</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 font-mono tabular-nums">
                {filtered.map((sym) => {
                  const q = quotes[sym.symbol];
                  const isActive = sym.symbol === activeSymbol;
                  const dirColor =
                    q?.direction === 'up'
                      ? 'text-blue-600 dark:text-blue-400'
                      : q?.direction === 'down'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-800 dark:text-slate-200';

                  return (
                    <tr
                      key={sym.symbol}
                      onClick={() => onSelectSymbol(sym.symbol)}
                      onDoubleClick={() => onOpenOrderForSymbol(sym.symbol)}
                      className={`cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-950/40'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="px-2 py-1.5 font-sans font-semibold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-1">
                          {q?.direction === 'up' ? (
                            <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                          ) : q?.direction === 'down' ? (
                            <ArrowDown className="w-3 h-3 text-red-600 dark:text-red-400 shrink-0" />
                          ) : (
                            <span className="w-3 h-3 shrink-0" />
                          )}
                          <span>{sym.symbol}</span>
                        </div>
                      </td>
                      <td className={`px-1.5 py-1.5 text-right ${dirColor}`}>
                        {q ? formatPrice(q.bid, sym.digits) : formatPrice(sym.basePrice, sym.digits)}
                      </td>
                      <td className={`px-1.5 py-1.5 text-right ${dirColor}`}>
                        {q
                          ? formatPrice(q.ask, sym.digits)
                          : formatPrice(sym.basePrice + sym.spreadPoints * sym.point, sym.digits)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-500 dark:text-slate-400">
                        {q?.spreadPoints ?? sym.spreadPoints}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-4 text-center font-sans text-xs text-slate-500 dark:text-slate-400"
                    >
                      Không tìm thấy mã phù hợp.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="p-2.5 overflow-y-auto flex-1 text-xs space-y-1.5 font-mono tabular-nums">
          <div className="font-sans font-semibold text-slate-900 dark:text-white pb-1 border-b border-slate-200 dark:border-slate-800">
            {selectedSpec.symbol} · {selectedSpec.description}
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-500 dark:text-slate-400">Bid / Ask</span>
            <span className="text-slate-900 dark:text-slate-100">
              {selectedQuote ? formatPrice(selectedQuote.bid, selectedSpec.digits) : '--'} /{' '}
              {selectedQuote ? formatPrice(selectedQuote.ask, selectedSpec.digits) : '--'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-500 dark:text-slate-400">Contract Size</span>
            <span className="text-slate-900 dark:text-slate-100">
              {selectedSpec.contractSize.toLocaleString('en-US')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-500 dark:text-slate-400">Digits / Point</span>
            <span className="text-slate-900 dark:text-slate-100">
              {selectedSpec.digits} / {selectedSpec.point}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-500 dark:text-slate-400">Spread (Live)</span>
            <span className="text-slate-900 dark:text-slate-100">
              {selectedQuote?.spreadPoints ?? selectedSpec.spreadPoints} points
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-500 dark:text-slate-400">Swap Long / Short</span>
            <span className="text-slate-900 dark:text-slate-100">
              {selectedSpec.swapLong} / {selectedSpec.swapShort}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
