'use client';

import React, { useState } from 'react';
import { Check, Copy, PlugZap, RotateCcw, Server, Wifi, X } from 'lucide-react';
import { MT5_PYTHON_BRIDGE_SCRIPT } from '@/lib/mt5/liveFeed';
import { formatPrice, getSymbolSpec } from '@/lib/mt5/marketData';
import type { LiveQuote } from '@/lib/mt5/types';

interface Mt5BridgeModalProps {
  open: boolean;
  bridgeUrl: string;
  bridgeToken: string;
  liveFeedSource: 'mt5_bridge' | 'live_broker_feed' | 'fallback_reference';
  liveFeedLabel: string;
  quotes: Record<string, LiveQuote>;
  onClose: () => void;
  onApplyBridge: (url: string, token: string) => void;
  onResetBridge: () => void;
}

export function Mt5BridgeModal({
  open,
  bridgeUrl,
  bridgeToken,
  liveFeedSource,
  liveFeedLabel,
  quotes,
  onClose,
  onApplyBridge,
  onResetBridge,
}: Mt5BridgeModalProps) {
  const [urlInput, setUrlInput] = useState(bridgeUrl);
  const [tokenInput, setTokenInput] = useState(bridgeToken);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showScript, setShowScript] = useState(false);

  if (!open) return null;

  const handleTestAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = urlInput.trim();
    if (!cleaned) {
      setTestResult({
        ok: false,
        message: 'Vui lòng nhập URL của MT5 Terminal Bridge (vd: https://mt5.domain.com hoặc http://127.0.0.1:8787).',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/mt5/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bridgeUrl: cleaned,
          bridgeToken: tokenInput.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setTestResult({
          ok: false,
          message: json.error ?? 'Không kết nối được tới MT5 Bridge.',
        });
      } else {
        setTestResult({
          ok: true,
          latencyMs: json.latencyMs,
          message: `Đã kết nối thành công tới ${json.serverLabel} (${json.latencyMs} ms).`,
        });
        onApplyBridge(cleaned, tokenInput.trim());
      }
    } catch {
      setTestResult({
        ok: false,
        message: 'Lỗi mạng khi kiểm tra MT5 Bridge.',
      });
    } finally {
      setTesting(false);
    }
  };

  const copyPythonScript = async () => {
    try {
      await navigator.clipboard.writeText(MT5_PYTHON_BRIDGE_SCRIPT);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const sampleSymbols = ['XAUUSD', 'EURUSD', 'BTCUSD', 'US30'];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mt5-bridge-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4"
    >
      <div className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E222D] text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-[#F3F4F6] dark:bg-[#171B26] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h2 id="mt5-bridge-title" className="text-sm font-semibold truncate">
              Kết nối Giá & Nến Trực tiếp từ MT5 (Live Feed & Bridge)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ MT5 Bridge"
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* Current Active Live Source Summary */}
          <div className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#161A25] p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Nguồn giá trực tiếp đang chạy
              </span>
              <span
                className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${
                  liveFeedSource === 'mt5_bridge'
                    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                    : liveFeedSource === 'live_broker_feed'
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                }`}
              >
                {liveFeedLabel || 'Live Market Feed'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {sampleSymbols.map((sym) => {
                const spec = getSymbolSpec(sym);
                const q = quotes[sym];
                return (
                  <div
                    key={sym}
                    className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131722] px-2.5 py-1.5 font-mono tabular-nums"
                  >
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{sym}</div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {q ? formatPrice(q.bid, spec.digits) : formatPrice(spec.basePrice, spec.digits)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Optional Direct Desktop MT5 Terminal Bridge Form */}
          <form onSubmit={handleTestAndConnect} className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <Server className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Tùy chọn: Kết nối trực tiếp tới Terminal MT5 trên Windows/VPS của bạn</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              Mặc định hệ thống đã lấy giá Spot/ECN thực tế theo thời gian thực (Swissquote BBO + Binance Spot + Yahoo Finance). Nếu bạn muốn lấy chính xác từng tick & spread của sàn Exness/ICMarkets/XM đang mở trên máy Windows/VPS, hãy chạy script Bridge và dán URL vào đây.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2">
                <label
                  htmlFor="bridge-url-input"
                  className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                >
                  URL MT5 Bridge (HTTP/HTTPS Tunnel)
                </label>
                <input
                  id="bridge-url-input"
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://mt5-bridge.your-vps.com"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor="bridge-token-input"
                  className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                >
                  Bearer Token (Nếu có)
                </label>
                <input
                  id="bridge-token-input"
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="MT5_BRIDGE_TOKEN"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono text-xs"
                />
              </div>
            </div>

            {testResult && (
              <div
                className={`rounded border px-3 py-2 text-[11px] ${
                  testResult.ok
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                    : 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300'
                }`}
              >
                {testResult.message}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setUrlInput('');
                  setTokenInput('');
                  setTestResult(null);
                  onResetBridge();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Dùng Live Feed mặc định</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowScript((s) => !s)}
                  className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
                >
                  {showScript ? 'Ẩn script mt5_bridge.py' : 'Xem script mt5_bridge.py'}
                </button>
                <button
                  type="submit"
                  disabled={testing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold"
                >
                  <PlugZap className="w-3.5 h-3.5" />
                  <span>{testing ? 'Đang kiểm tra...' : 'Kiểm tra & Kết nối'}</span>
                </button>
              </div>
            </div>
          </form>

          {showScript && (
            <div className="rounded border border-slate-300 dark:border-slate-700 bg-[#0F131D] text-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 bg-[#171B26]">
                <span className="font-mono text-[11px] text-slate-300">mt5_bridge.py (Windows / Wine + MetaTrader5)</span>
                <button
                  type="button"
                  onClick={copyPythonScript}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200"
                >
                  {copiedScript ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedScript ? 'Đã chép' : 'Copy'}</span>
                </button>
              </div>
              <pre className="p-3 text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed">
                {MT5_PYTHON_BRIDGE_SCRIPT}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
