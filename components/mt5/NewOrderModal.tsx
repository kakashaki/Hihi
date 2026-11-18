'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { formatPrice, getSymbolSpec, MT5_SYMBOLS } from '@/lib/mt5/marketData';

interface NewOrderModalProps {
  open: boolean;
  symbol: string;
  currentBid: number;
  onClose: () => void;
  onExecuteOrder: (params: {
    symbol: string;
    side: 'buy' | 'sell';
    volume: number;
    slPrice: number;
    tpPrice: number;
    comment: string;
  }) => void;
}

export function NewOrderModal({
  open,
  symbol,
  currentBid,
  onClose,
  onExecuteOrder,
}: NewOrderModalProps) {
  const [selectedSymbol, setSelectedSymbol] = useState(symbol);
  const [volume, setVolume] = useState(0.1);
  const [slPrice, setSlPrice] = useState(0);
  const [tpPrice, setTpPrice] = useState(0);
  const [comment, setComment] = useState('Manual Backtest');

  if (!open) return null;

  const spec = getSymbolSpec(selectedSymbol);
  const bid = selectedSymbol === symbol ? currentBid : spec.basePrice;
  const ask = bid + spec.spreadPoints * spec.point;

  const submitSide = (side: 'buy' | 'sell') => {
    onExecuteOrder({
      symbol: selectedSymbol,
      side,
      volume: Math.max(0.01, volume),
      slPrice: Math.max(0, slPrice),
      tpPrice: Math.max(0, tpPrice),
      comment,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mt5-order-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded border border-slate-300 dark:border-slate-700 bg-[#F8FAFC] dark:bg-[#1E222D] text-slate-900 dark:text-slate-100 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#E5E7EB] dark:bg-[#171B26] border-b border-slate-300 dark:border-slate-700">
          <h2 id="mt5-order-title" className="text-sm font-semibold">
            Đặt lệnh mới (Order · F9)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại đặt lệnh"
            className="p-1 rounded hover:bg-slate-300 dark:hover:bg-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="order-symbol" className="block font-medium mb-1">
                Cặp tiền / Tài sản (Symbol)
              </label>
              <select
                id="order-symbol"
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono"
              >
                {MT5_SYMBOLS.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="order-volume" className="block font-medium mb-1">
                Khối lượng (Volume / Lots)
              </label>
              <input
                id="order-volume"
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value) || 0.01)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="order-sl" className="block font-medium mb-1">
                Cắt lỗ (Stop Loss)
              </label>
              <input
                id="order-sl"
                type="number"
                step={spec.point}
                min="0"
                value={slPrice}
                onChange={(e) => setSlPrice(Number(e.target.value) || 0)}
                placeholder="0.00 (Không đặt)"
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="order-tp" className="block font-medium mb-1">
                Chốt lời (Take Profit)
              </label>
              <input
                id="order-tp"
                type="number"
                step={spec.point}
                min="0"
                value={tpPrice}
                onChange={(e) => setTpPrice(Number(e.target.value) || 0)}
                placeholder="0.00 (Không đặt)"
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono tabular-nums"
              />
            </div>
          </div>

          <div>
            <label htmlFor="order-comment" className="block font-medium mb-1">
              Ghi chú (Comment)
            </label>
            <input
              id="order-comment"
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722]"
            />
          </div>

          <div className="py-2 text-center font-mono tabular-nums text-base font-bold text-slate-900 dark:text-white border-y border-slate-200 dark:border-slate-700">
            {formatPrice(bid, spec.digits)} / {formatPrice(ask, spec.digits)}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => submitSide('sell')}
              className="py-2.5 px-4 rounded bg-[#B91C1C] hover:bg-[#DC2626] text-white font-semibold transition-colors"
            >
              Sell by Market
            </button>
            <button
              type="button"
              onClick={() => submitSide('buy')}
              className="py-2.5 px-4 rounded bg-[#1D4ED8] hover:bg-[#2563EB] text-white font-semibold transition-colors"
            >
              Buy by Market
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
