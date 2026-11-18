'use client';

import React, { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Copy, Play, Server, Terminal } from 'lucide-react';
import type { ExternalStrategy } from '@/lib/mt5/externalApi';
import type { ModelingMode, Timeframe } from '@/lib/mt5/types';

function useOrigin(): string {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ''
  );
}

export function AiApiConsolePanel() {
  const origin = useOrigin();
  const baseUrl = origin || 'https://your-mt5-app.run.app';

  const [strategy, setStrategy] = useState<ExternalStrategy>('scalping_pro');
  const [symbol, setSymbol] = useState('XAUUSD');
  const [timeframe, setTimeframe] = useState<Timeframe>('M1');
  const [modeling, setModeling] = useState<ModelingMode>('real_ticks_slippage');
  const [accountType, setAccountType] = useState<'real' | 'demo'>('real');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testOutput, setTestOutput] = useState<string>('');
  const [testSummary, setTestSummary] = useState<{
    netProfit: number;
    sharpe: number;
    winRate: number;
    drawdown: number;
    trades: number;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);

  const sampleBody = useMemo(
    () =>
      JSON.stringify(
        {
          strategy,
          symbol,
          timeframe,
          fromDate: '2026-06-01',
          toDate: '2026-11-18',
          modeling,
          accountType,
          initialDeposit: 10000,
          leverage: 500,
          includeDeals: false,
        },
        null,
        2
      ),
    [strategy, symbol, timeframe, modeling, accountType]
  );

  const curlSnippet = useMemo(() => {
    const authLine = apiKeyInput.trim()
      ? ` \\\n  -H "Authorization: Bearer ${apiKeyInput.trim()}"`
      : '';
    return `curl -X POST "${baseUrl}/api/v1/ai/backtest"${authLine} \\\n  -H "Content-Type: application/json" \\\n  -d '${sampleBody.replace(/\n/g, ' ')}'`;
  }, [baseUrl, apiKeyInput, sampleBody]);

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // Clipboard fallback silently ignored
    }
  };

  const runLiveApiTest = async () => {
    setIsTesting(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKeyInput.trim()) {
        headers.Authorization = `Bearer ${apiKeyInput.trim()}`;
      }
      const res = await fetch('/api/v1/ai/backtest', {
        method: 'POST',
        headers,
        body: sampleBody,
      });
      const json = await res.json();
      setTestOutput(JSON.stringify(json, null, 2));
      if (json?.ok && json?.metrics && json?.analytics) {
        setTestSummary({
          netProfit: Number(json.metrics.totalNetProfit ?? 0),
          sharpe: Number(json.analytics.sharpeRatio ?? 0),
          winRate: Number(json.analytics.winRatePercent ?? 0),
          drawdown: Number(json.analytics.maxEquityDrawdownPercent ?? 0),
          trades: Number(json.metrics.totalTrades ?? 0),
        });
      } else {
        setTestSummary(null);
      }
      requestAnimationFrame(() => {
        outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    } catch (err) {
      setTestSummary(null);
      setTestOutput(
        JSON.stringify({ ok: false, error: String(err) }, null, 2)
      );
    } finally {
      setIsTesting(false);
    }
  };

  const endpoints = [
    {
      id: 'backtest',
      method: 'POST',
      path: `${baseUrl}/api/v1/ai/backtest`,
      desc: 'Chạy 1 backtest MT5 Real/Demo & trả về Metrics + Sharpe/Drawdown/WinRate',
    },
    {
      id: 'kronos',
      method: 'POST',
      path: `${baseUrl}/api/v1/ai/kronos`,
      desc: 'Dự báo K-Line tương lai bằng AI Kronos (shiyu-coder/Kronos) trên dữ liệu MT5 trực tiếp',
    },
    {
      id: 'sweep',
      method: 'POST',
      path: `${baseUrl}/api/v1/ai/sweep`,
      desc: 'Tối ưu tham số hàng loạt (tối đa 24 tổ hợp) xếp hạng theo Sharpe/Profit',
    },
    {
      id: 'openapi',
      method: 'GET',
      path: `${baseUrl}/api/v1/ai/openapi.json`,
      desc: 'OpenAPI 3.1 Schema cho OpenAI GPT Actions, Dify, Coze, LangChain',
    },
    {
      id: 'mcp',
      method: 'POST',
      path: `${baseUrl}/api/v1/ai/mcp`,
      desc: 'MCP JSON-RPC 2.0 (tools/list, tools/call) cho Claude / AI Agents',
    },
    {
      id: 'health',
      method: 'GET',
      path: `${baseUrl}/api/v1/ai/health`,
      desc: 'Kiểm tra trạng thái 24/24, danh sách cặp tiền, khung thời gian & chiến lược',
    },
  ];

  return (
    <div className="p-3 space-y-3 text-xs">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              Cổng API Backtest 24/24 cho AI bên ngoài (REST + OpenAPI + MCP)
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Hỗ trợ CORS · Stateless serverless · Optional Bearer Auth (<code className="font-mono">MT5_AI_API_KEY</code>)
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => copyText('openapi-top', `${baseUrl}/api/v1/ai/openapi.json`)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium"
        >
          {copiedId === 'openapi-top' ? (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          <span>Copy OpenAPI URL</span>
        </button>
      </div>

      {/* Endpoints Directory */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {endpoints.map((ep) => (
          <div
            key={ep.id}
            className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#131722] flex items-start justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span
                  className={`font-bold ${
                    ep.method === 'POST'
                      ? 'text-blue-700 dark:text-blue-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {ep.method}
                </span>
                <span className="truncate text-slate-900 dark:text-slate-100">
                  {ep.path}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {ep.desc}
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyText(ep.id, ep.path)}
              aria-label={`Copy ${ep.id} URL`}
              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-800 shrink-0"
            >
              {copiedId === ep.id ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Interactive Live API Sandbox + cURL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-5 rounded border border-slate-200 dark:border-slate-800 p-2.5 space-y-2.5 bg-white dark:bg-[#131722]">
          <div className="font-semibold flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Kiểm thử API trực tiếp (Sandbox)</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ai-api-strategy" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                Strategy
              </label>
              <select
                id="ai-api-strategy"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as ExternalStrategy)}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A25]"
              >
                <option value="scalping_pro">scalping_pro</option>
                <option value="kronos_forecast">kronos_forecast</option>
                <option value="ma_cross">ma_cross</option>
                <option value="rsi_reversion">rsi_reversion</option>
                <option value="donchian_breakout">donchian_breakout</option>
              </select>
            </div>
            <div>
              <label htmlFor="ai-api-symbol" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                Symbol
              </label>
              <select
                id="ai-api-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A25] font-mono"
              >
                <option value="XAUUSD">XAUUSD</option>
                <option value="EURUSD">EURUSD</option>
                <option value="GBPUSD">GBPUSD</option>
                <option value="USDJPY">USDJPY</option>
                <option value="BTCUSD">BTCUSD</option>
              </select>
            </div>
            <div>
              <label htmlFor="ai-api-tf" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                Timeframe
              </label>
              <select
                id="ai-api-tf"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A25] font-mono"
              >
                <option value="M1">M1</option>
                <option value="M5">M5</option>
                <option value="M15">M15</option>
                <option value="H1">H1</option>
                <option value="H4">H4</option>
                <option value="D1">D1</option>
              </select>
            </div>
            <div>
              <label htmlFor="ai-api-modeling" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                Modeling
              </label>
              <select
                id="ai-api-modeling"
                value={modeling}
                onChange={(e) => setModeling(e.target.value as ModelingMode)}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A25]"
              >
                <option value="real_ticks_slippage">real_ticks_slippage</option>
                <option value="every_tick">every_tick</option>
                <option value="ohlc_m1">ohlc_m1</option>
              </select>
            </div>
            <div>
              <label htmlFor="ai-api-account" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                Account Type
              </label>
              <select
                id="ai-api-account"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as 'real' | 'demo')}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A25] font-mono"
              >
                <option value="real">real</option>
                <option value="demo">demo</option>
              </select>
            </div>
            <div>
              <label htmlFor="ai-api-key" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                Bearer Key (tuỳ chọn)
              </label>
              <input
                id="ai-api-key"
                type="password"
                placeholder="Mở nếu chưa đặt ENV"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A25] font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isTesting}
              onClick={runLiveApiTest}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-60 text-white font-semibold"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isTesting ? 'Đang gọi API...' : 'Chạy thử API /api/v1/ai/backtest'}</span>
            </button>
            <button
              type="button"
              onClick={() => copyText('curl', curlSnippet)}
              className="inline-flex items-center gap-1 py-1.5 px-2.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
            >
              {copiedId === 'curl' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>cURL</span>
            </button>
          </div>
        </div>

        <div
          ref={outputRef}
          className="lg:col-span-7 rounded border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 p-2.5 flex flex-col min-h-[190px] max-h-[300px]"
        >
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 font-mono">
            <span>{testOutput ? 'HTTP 200 JSON Response (/api/v1/ai/backtest)' : 'cURL Request Preview (24/24)'}</span>
            <button
              type="button"
              onClick={() => copyText('json-out', testOutput || curlSnippet)}
              className="inline-flex items-center gap-1 text-slate-300 hover:text-white"
            >
              {copiedId === 'json-out' ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              <span>Copy</span>
            </button>
          </div>
          {testSummary && (
            <div className="grid grid-cols-4 gap-1.5 mb-2 p-1.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] tabular-nums">
              <div>
                <div className="text-slate-400">Net Profit</div>
                <div className={testSummary.netProfit >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                  ${testSummary.netProfit.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Sharpe</div>
                <div className="text-slate-100 font-semibold">{testSummary.sharpe.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-slate-400">Win Rate</div>
                <div className="text-slate-100 font-semibold">{testSummary.winRate.toFixed(1)}% ({testSummary.trades})</div>
              </div>
              <div>
                <div className="text-slate-400">Max DD</div>
                <div className="text-amber-400 font-semibold">{testSummary.drawdown.toFixed(2)}%</div>
              </div>
            </div>
          )}
          <pre className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed text-emerald-300 whitespace-pre-wrap break-all">
            {testOutput || curlSnippet}
          </pre>
        </div>
      </div>
    </div>
  );
}
