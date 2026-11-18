'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Square,
  Upload,
} from 'lucide-react';
import type { HistoryDatasetSummary } from '@/lib/mt5/historyLoader';
import {
  DEFAULT_EA_INPUTS,
  formatMt5DateTime,
  formatPrice,
  getSymbolSpec,
  MT5_SYMBOLS,
} from '@/lib/mt5/marketData';
import type {
  BacktestReport,
  BacktestSettings,
  CustomBotConfig,
  EaInputParams,
  JournalEntry,
  KronosForecastResult,
  KronosModelVariant,
  ModelingMode,
  Mt5Account,
  OpenPosition,
  Timeframe,
} from '@/lib/mt5/types';
import { AiApiConsolePanel } from './AiApiConsolePanel';
import { KronosPanel } from './KronosPanel';
import { PerformanceAnalyticsPanel } from './PerformanceAnalyticsPanel';

export type DockTabId =
  | 'settings'
  | 'inputs'
  | 'graph'
  | 'backtest'
  | 'analytics'
  | 'kronos'
  | 'trade'
  | 'journal'
  | 'api';

interface StrategyTesterDockProps {
  activeTab: DockTabId;
  onChangeTab: (tab: DockTabId) => void;
  account: Mt5Account;
  bots: CustomBotConfig[];
  settings: BacktestSettings;
  inputs: EaInputParams;
  report: BacktestReport | null;
  historySummary: HistoryDatasetSummary | null;
  openPosition: OpenPosition | null;
  manualBalance: number;
  manualEquity: number;
  manualMargin: number;
  journal: JournalEntry[];
  isRunning: boolean;
  isVisualRunning: boolean;
  progressPercent: number;
  mobileFullHeight?: boolean;
  kronosForecast?: KronosForecastResult | null;
  showKronosOverlay?: boolean;
  isKronosPredicting?: boolean;
  kronosError?: string | null;
  onToggleKronosOverlay?: () => void;
  onRunKronosForecast?: (config: {
    modelVariant: KronosModelVariant;
    lookback: number;
    predLen: number;
    temperature: number;
    topP: number;
    sampleCount: number;
    kronosServerUrl: string;
    preferPythonServer: boolean;
  }) => void;
  onRunKronosBacktest?: () => void;
  onExecuteKronosTrade?: (order: {
    action: 'BUY' | 'SELL';
    stopLoss: number;
    takeProfit: number;
    lotSize: number;
  }) => void;
  onSelectEa: (eaId: string) => void;
  onOpenAddBotModal: () => void;
  onChangeSettings: (patch: Partial<BacktestSettings>) => void;
  onChangeInputs: (patch: Partial<EaInputParams>) => void;
  onResetInputs: () => void;
  onStartBacktest: () => void;
  onStopBacktest: () => void;
  onImportCsvFile: (file: File) => void;
  onResetBrokerHistory: () => void;
  onJumpToBar: (barIndex: number) => void;
  onCloseOpenPosition: () => void;
  onResetDemoBalance: (amount: number) => void;
  onExportCsv: () => void;
}

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

export function StrategyTesterDock({
  activeTab,
  onChangeTab,
  account,
  bots,
  settings,
  inputs,
  report,
  historySummary,
  openPosition,
  manualBalance,
  manualEquity,
  manualMargin,
  journal,
  isRunning,
  isVisualRunning,
  progressPercent,
  mobileFullHeight = false,
  kronosForecast = null,
  showKronosOverlay = false,
  isKronosPredicting = false,
  kronosError = null,
  onToggleKronosOverlay = () => {},
  onRunKronosForecast = () => {},
  onRunKronosBacktest = () => {},
  onExecuteKronosTrade,
  onSelectEa,
  onOpenAddBotModal,
  onChangeSettings,
  onChangeInputs,
  onResetInputs,
  onStartBacktest,
  onStopBacktest,
  onImportCsvFile,
  onResetBrokerHistory,
  onJumpToBar,
  onCloseOpenPosition,
  onResetDemoBalance,
  onExportCsv,
}: StrategyTesterDockProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [demoTopup, setDemoTopup] = useState(10000);

  useEffect(() => {
    const el = tabRefs.current[activeTab];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeTab]);

  const spec = getSymbolSpec(settings.symbol);
  const activeMarginLevel =
    manualMargin > 0 ? ((manualEquity / manualMargin) * 100).toFixed(2) : '0.00';
  const freeMargin = Number((manualEquity - manualMargin).toFixed(2));

  // Graph SVG path calculation
  const graphData = useMemo(() => {
    const curve = report?.equityCurve ?? [];
    if (curve.length < 2) return null;

    const w = 880;
    const h = 165;
    const padL = 56;
    const padR = 12;
    const padT = 12;
    const padB = 22;

    let minV = Infinity;
    let maxV = -Infinity;
    for (const pt of curve) {
      if (pt.balance < minV) minV = pt.balance;
      if (pt.equity < minV) minV = pt.equity;
      if (pt.balance > maxV) maxV = pt.balance;
      if (pt.equity > maxV) maxV = pt.equity;
    }
    const span = Math.max(100, maxV - minV);
    minV -= span * 0.08;
    maxV += span * 0.08;

    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const xOf = (idx: number) => padL + (idx / Math.max(1, curve.length - 1)) * plotW;
    const yOf = (val: number) => padT + plotH - ((val - minV) / (maxV - minV)) * plotH;

    // Sample up to 240 points for crisp SVG performance
    const step = Math.max(1, Math.floor(curve.length / 240));
    const sampled: number[] = [];
    for (let i = 0; i < curve.length; i += step) sampled.push(i);
    if (sampled[sampled.length - 1] !== curve.length - 1) sampled.push(curve.length - 1);

    const balancePath = sampled
      .map((idx, k) => `${k === 0 ? 'M' : 'L'} ${xOf(idx).toFixed(1)} ${yOf(curve[idx].balance).toFixed(1)}`)
      .join(' ');

    const equityPath = sampled
      .map((idx, k) => `${k === 0 ? 'M' : 'L'} ${xOf(idx).toFixed(1)} ${yOf(curve[idx].equity).toFixed(1)}`)
      .join(' ');

    return {
      w,
      h,
      padL,
      padT,
      plotW,
      plotH,
      minV,
      maxV,
      balancePath,
      equityPath,
      curve,
      xOf,
      yOf,
    };
  }, [report]);

  const inputRows: Array<{
    key: keyof EaInputParams;
    label: string;
    type: string;
    step: number;
    min: number;
  }> = [
    { key: 'lotSize', label: 'LotSize (Khối lượng giao dịch)', type: 'double', step: 0.01, min: 0.01 },
    { key: 'fastMaPeriod', label: 'FastEMA_Period (EMA nhanh)', type: 'int', step: 1, min: 2 },
    { key: 'slowMaPeriod', label: 'SlowEMA_Period (EMA chậm)', type: 'int', step: 1, min: 5 },
    { key: 'rsiPeriod', label: 'RSI_Period (Chu kỳ RSI)', type: 'int', step: 1, min: 2 },
    { key: 'rsiOverbought', label: 'RSI_Overbought (Quá mua)', type: 'int', step: 1, min: 55 },
    { key: 'rsiOversold', label: 'RSI_Oversold (Quá bán)', type: 'int', step: 1, min: 5 },
    { key: 'donchianPeriod', label: 'Donchian_Period (Kênh phá vỡ)', type: 'int', step: 1, min: 5 },
    { key: 'stopOrderOffsetPoints', label: 'StopOrder_Offset_Points (Độ giãn Stop)', type: 'int', step: 5, min: 0 },
    { key: 'slippagePoints', label: 'Slippage_Points (Độ trượt giá Real Ticks)', type: 'int', step: 1, min: 0 },
    { key: 'stopLossPoints', label: 'StopLoss_Points (Cắt lỗ theo Point)', type: 'int', step: 10, min: 0 },
    { key: 'takeProfitPoints', label: 'TakeProfit_Points (Chốt lời theo Point)', type: 'int', step: 10, min: 0 },
    { key: 'trailingStopPoints', label: 'TrailingStop_Points (Dịch SL dương)', type: 'int', step: 10, min: 0 },
    { key: 'maxSpreadPoints', label: 'MaxSpread_Points (Spread tối đa)', type: 'int', step: 1, min: 5 },
  ];

  const tabs: Array<{ id: DockTabId; label: string }> = [
    { id: 'settings', label: 'Cài đặt (Settings)' },
    { id: 'inputs', label: 'Tham số (Inputs)' },
    { id: 'graph', label: 'Đồ thị (Graph)' },
    {
      id: 'backtest',
      label: report ? `Kết quả (${report.metrics.totalTrades})` : 'Kết quả (Backtest)',
    },
    { id: 'analytics', label: 'Phân tích (Analytics)' },
    { id: 'kronos', label: 'Kronos AI' },
    { id: 'trade', label: 'Giao dịch (Trade)' },
    { id: 'journal', label: 'Nhật ký (Journal)' },
    { id: 'api', label: 'AI API 24/24' },
  ];

  return (
    <section
      aria-label="Strategy Tester & Terminal Dock"
      className={`${
        mobileFullHeight ? 'flex-1 min-h-0' : 'h-[275px] md:h-[295px] shrink-0 border-t'
      } border-slate-300 dark:border-slate-800 bg-white dark:bg-[#161A25] text-slate-900 dark:text-slate-100 flex flex-col`}
    >
      {/* Dock Tab Bar + Progress Indicator */}
      <div className="flex items-center justify-between gap-3 px-2 border-b border-slate-300 dark:border-slate-800 bg-[#F3F4F6] dark:bg-[#1E222D] overflow-x-auto shrink-0">
        <div role="tablist" aria-label="Tab Strategy Tester" className="flex items-center gap-0.5">
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => onChangeTab(tab.id)}
                className={`px-2.5 md:px-3 py-2 md:py-1.5 text-[11px] md:text-xs font-medium border-b-2 whitespace-nowrap shrink-0 ${
                  selected
                    ? 'border-blue-700 bg-white dark:bg-[#161A25] text-blue-700 dark:text-blue-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="hidden xl:flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0 pr-1 whitespace-nowrap">
          {historySummary && (
            <span>
              {historySummary.symbol} {historySummary.timeframe} · {historySummary.barsCount} bars (
              {formatMt5DateTime(historySummary.fromTimestamp).slice(2, 10)}→
              {formatMt5DateTime(historySummary.toTimestamp).slice(2, 10)}) · Q{historySummary.historyQualityPercent}%
            </span>
          )}
          {(isRunning || isVisualRunning) && (
            <div className="flex items-center gap-1.5">
              <div className="w-24 h-2 bg-slate-300 dark:bg-slate-700 rounded-xs overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-150"
                  style={{ width: `${Math.min(100, progressPercent)}%` }}
                />
              </div>
              <span>{progressPercent}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'settings' && (
          <div className="p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs h-full">
            <div className="lg:col-span-9 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2.5 content-start">
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <label htmlFor="st-ea" className="text-[11px] text-slate-500 dark:text-slate-400">
                    Expert Advisor (Bot / Chiến lược)
                  </label>
                  <button
                    type="button"
                    onClick={onOpenAddBotModal}
                    className="inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Thêm Bot</span>
                  </button>
                </div>
                <select
                  id="st-ea"
                  value={settings.eaId}
                  onChange={(e) => onSelectEa(e.target.value)}
                  className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722]"
                >
                  {bots.map((ea) => (
                    <option key={ea.id} value={ea.id}>
                      {ea.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="st-symbol" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                  Cặp giao dịch (Symbol)
                </label>
                <select
                  id="st-symbol"
                  value={settings.symbol}
                  onChange={(e) => onChangeSettings({ symbol: e.target.value })}
                  className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono"
                >
                  {MT5_SYMBOLS.map((s) => (
                    <option key={s.symbol} value={s.symbol}>
                      {s.symbol} · {s.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="st-tf" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                  Khung thời gian (Timeframe)
                </label>
                <select
                  id="st-tf"
                  value={settings.timeframe}
                  onChange={(e) => onChangeSettings({ timeframe: e.target.value as Timeframe })}
                  className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono"
                >
                  {TIMEFRAMES.map((tf) => (
                    <option key={tf} value={tf}>
                      {tf}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="st-from" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                  Từ ngày (From Date)
                </label>
                <input
                  id="st-from"
                  type="date"
                  value={settings.fromDate}
                  onChange={(e) => onChangeSettings({ fromDate: e.target.value })}
                  className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono"
                />
              </div>

              <div>
                <label htmlFor="st-to" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                  Đến ngày (To Date)
                </label>
                <input
                  id="st-to"
                  type="date"
                  value={settings.toDate}
                  onChange={(e) => onChangeSettings({ toDate: e.target.value })}
                  className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono"
                />
              </div>

              <div>
                <label htmlFor="st-modeling" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                  Mô hình khớp lệnh (Modeling)
                </label>
                <select
                  id="st-modeling"
                  value={settings.modeling}
                  onChange={(e) =>
                    onChangeSettings({ modeling: e.target.value as ModelingMode })
                  }
                  className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722]"
                >
                  <option value="every_tick">Every tick (Mọi tick - Lý tưởng)</option>
                  <option value="real_ticks_slippage">Real Ticks (Variable Spread + Slippage)</option>
                  <option value="ohlc_m1">1 minute OHLC (OHLC trên M1)</option>
                  <option value="open_prices">Open prices only (Chỉ giá mở cửa)</option>
                </select>
              </div>

              <div>
                <label htmlFor="st-deposit" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                  Vốn ban đầu (Deposit · {account.currency})
                </label>
                <input
                  id="st-deposit"
                  type="number"
                  min={100}
                  step={500}
                  value={settings.initialDeposit}
                  onChange={(e) =>
                    onChangeSettings({ initialDeposit: Math.max(100, Number(e.target.value) || 1000) })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="st-leverage" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                  Đòn bẩy (Leverage)
                </label>
                <select
                  id="st-leverage"
                  value={settings.leverage}
                  onChange={(e) => onChangeSettings({ leverage: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono"
                >
                  <option value={100}>1:100</option>
                  <option value={200}>1:200</option>
                  <option value={500}>1:500</option>
                  <option value={1000}>1:1000</option>
                  <option value={2000}>1:2000</option>
                </select>
              </div>

              <div>
                <label htmlFor="st-delay" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                  Độ trễ mạng (Delays)
                </label>
                <select
                  id="st-delay"
                  value={settings.delayMs}
                  onChange={(e) => onChangeSettings({ delayMs: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono"
                >
                  <option value={0}>Zero latency (0 ms)</option>
                  <option value={25}>25 ms (Fast VPS)</option>
                  <option value={80}>80 ms (Standard Broker)</option>
                  <option value={150}>150 ms (High Latency)</option>
                </select>
              </div>
            </div>

            {/* Right Action Column */}
            <div className="lg:col-span-3 flex flex-col justify-between gap-2 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 pt-2 lg:pt-0 lg:pl-3">
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.visualMode}
                    onChange={(e) => onChangeSettings({ visualMode: e.target.checked })}
                    className="rounded border-slate-400"
                  />
                  <span className="font-medium">Chế độ trực quan (Visual mode)</span>
                </label>

                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.tsv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onImportCsvFile(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-medium whitespace-nowrap"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Nhập lịch sử CSV MT5</span>
                  </button>
                  {historySummary?.source === 'mt5_csv_import' && (
                    <button
                      type="button"
                      onClick={onResetBrokerHistory}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Dữ liệu gốc</span>
                    </button>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  Server: {account.serverName} ({account.accountType.toUpperCase()})
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isRunning || isVisualRunning ? (
                  <button
                    type="button"
                    onClick={onStopBacktest}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Dừng (Stop)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onStartBacktest}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold transition-colors shadow-xs"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Bắt đầu (Start)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'inputs' && (
          <div className="p-2.5 flex flex-col h-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Tham số đầu vào của EA: <strong className="text-slate-900 dark:text-white">{settings.eaId}</strong>
              </span>
              <button
                type="button"
                onClick={onResetInputs}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Mặc định</span>
              </button>
            </div>
            <div className="overflow-y-auto border border-slate-200 dark:border-slate-800 rounded">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 dark:bg-[#1E222D] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium">Biến (Variable)</th>
                    <th className="text-left px-3 py-1.5 font-medium">Kiểu (Type)</th>
                    <th className="text-right px-3 py-1.5 font-medium">Giá trị (Value)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {inputRows.map((row) => (
                    <tr key={row.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-1 font-medium text-slate-800 dark:text-slate-200">
                        <label htmlFor={`input-${row.key}`}>{row.label}</label>
                      </td>
                      <td className="px-3 py-1 font-mono text-slate-500 dark:text-slate-400">
                        {row.type}
                      </td>
                      <td className="px-3 py-1 text-right">
                        <input
                          id={`input-${row.key}`}
                          type="number"
                          step={row.step}
                          min={row.min}
                          value={inputs[row.key]}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            onChangeInputs({
                              [row.key]: Number.isFinite(val) ? val : DEFAULT_EA_INPUTS[row.key],
                            });
                          }}
                          className="w-28 px-2 py-0.5 text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono tabular-nums"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'graph' && (
          <div className="p-3 h-full flex flex-col">
            {!graphData ? (
              <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-500 dark:text-slate-400 gap-2">
                <p>Chưa có dữ liệu đồ thị. Hãy bấm Bắt đầu (Start) ở tab Cài đặt để chạy Backtest.</p>
                <button
                  type="button"
                  onClick={onStartBacktest}
                  className="px-3 py-1.5 rounded bg-[#16A34A] text-white font-semibold hover:bg-[#15803D]"
                >
                  Chạy Backtest ngay
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-4 font-mono tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-[#16A34A] inline-block" />
                      <span>Balance</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-[#2563EB] inline-block" />
                      <span>Equity</span>
                    </span>
                  </div>
                  <div className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {hoverIdx !== null && graphData.curve[hoverIdx] ? (
                      <span>
                        Bar #{hoverIdx + 1} · {formatMt5DateTime(graphData.curve[hoverIdx].time)} ·
                        Balance ${graphData.curve[hoverIdx].balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} ·
                        Equity ${graphData.curve[hoverIdx].equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <span>
                        Initial ${report!.metrics.initialDeposit.toLocaleString('en-US', { minimumFractionDigits: 2 })} → Final $
                        {report!.metrics.finalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-h-0 border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-[#131722] p-1">
                  <svg
                    viewBox={`0 0 ${graphData.w} ${graphData.h}`}
                    className="w-full h-full"
                    preserveAspectRatio="none"
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const relX = ((e.clientX - rect.left) / rect.width) * graphData.w;
                      const ratio = Math.max(
                        0,
                        Math.min(1, (relX - graphData.padL) / Math.max(1, graphData.plotW))
                      );
                      const idx = Math.round(ratio * (graphData.curve.length - 1));
                      setHoverIdx(idx);
                    }}
                    onMouseLeave={() => setHoverIdx(null)}
                  >
                    {[0, 0.25, 0.5, 0.75, 1].map((r) => {
                      const val = graphData.minV + (graphData.maxV - graphData.minV) * r;
                      const y = graphData.yOf(val);
                      return (
                        <g key={r}>
                          <line
                            x1={graphData.padL}
                            y1={y}
                            x2={graphData.w - 12}
                            y2={y}
                            stroke="rgba(148,163,184,0.22)"
                            strokeDasharray="3 3"
                          />
                          <text
                            x={4}
                            y={y + 3}
                            fontSize="10"
                            fill="currentColor"
                            className="text-slate-500 font-mono"
                          >
                            {Math.round(val)}
                          </text>
                        </g>
                      );
                    })}
                    <path
                      d={graphData.equityPath}
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth="1.5"
                      opacity="0.85"
                    />
                    <path
                      d={graphData.balancePath}
                      fill="none"
                      stroke="#16A34A"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'backtest' && (
          <div className="p-3 space-y-3 text-xs">
            {!report ? (
              <div className="py-10 text-center text-slate-500 dark:text-slate-400 space-y-2">
                <p>Chưa có báo cáo Backtest. Bấm Bắt đầu (Start) để mô phỏng chiến lược.</p>
                <button
                  type="button"
                  onClick={onStartBacktest}
                  className="px-3 py-1.5 rounded bg-[#16A34A] text-white font-semibold hover:bg-[#15803D]"
                >
                  Chạy Backtest ngay
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Báo cáo MT5 ·{' '}
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {report.accountLogin} ({report.accountType.toUpperCase()} · {report.serverName})
                    </span>{' '}
                    · {report.settings.symbol},{report.settings.timeframe} · {report.metrics.barsCount} bars ·{' '}
                    {report.metrics.ticksModeled.toLocaleString('en-US')} ticks ({report.metrics.executionTimeMs} ms)
                  </div>
                  <button
                    type="button"
                    onClick={onExportCsv}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Xuất CSV</span>
                  </button>
                </div>

                {/* MT5 Authentic Report Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 font-mono tabular-nums">
                  <div className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#131722]">
                    <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
                      Total Net Profit
                    </div>
                    <div
                      className={`text-sm font-bold ${
                        report.metrics.totalNetProfit >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      ${report.metrics.totalNetProfit.toFixed(2)}
                    </div>
                  </div>
                  <div className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#131722]">
                    <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
                      Profit Factor
                    </div>
                    <div className="text-sm font-bold">{report.metrics.profitFactor.toFixed(2)}</div>
                  </div>
                  <div className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#131722]">
                    <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
                      Equity Drawdown Max
                    </div>
                    <div className="text-sm font-bold text-amber-700 dark:text-amber-400">
                      ${report.metrics.equityDrawdownAbs.toFixed(2)} ({report.metrics.equityDrawdownPercent.toFixed(2)}%)
                    </div>
                  </div>
                  <div className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#131722]">
                    <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
                      Total Trades (Win %)
                    </div>
                    <div className="text-sm font-bold">
                      {report.metrics.totalTrades} ({report.metrics.profitTradesPercent.toFixed(1)}%)
                    </div>
                  </div>
                  <div className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#131722]">
                    <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
                      Expected Payoff
                    </div>
                    <div className="text-sm font-bold">${report.metrics.expectedPayoff.toFixed(2)}</div>
                  </div>
                  <div className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#131722]">
                    <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
                      Sharpe / Recovery
                    </div>
                    <div className="text-sm font-bold">
                      {report.metrics.sharpeRatio.toFixed(2)} / {report.metrics.recoveryFactor.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Secondary MT5 Details Row */}
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  <span>Gross Profit: ${report.metrics.grossProfit.toFixed(2)}</span>
                  <span>Gross Loss: ${report.metrics.grossLoss.toFixed(2)}</span>
                  <span>
                    Long Won: {report.metrics.longWon}/{report.metrics.longTrades} ({report.metrics.longWonPercent}%)
                  </span>
                  <span>
                    Short Won: {report.metrics.shortWon}/{report.metrics.shortTrades} ({report.metrics.shortWonPercent}%)
                  </span>
                  <span>Largest Win: ${report.metrics.largestProfitTrade.toFixed(2)}</span>
                  <span>Largest Loss: ${report.metrics.largestLossTrade.toFixed(2)}</span>
                  <span>
                    Max Consec. W/L: {report.metrics.maxConsecutiveWins} / {report.metrics.maxConsecutiveLosses}
                  </span>
                </div>

                {/* Deals & Orders History Table */}
                <div className="border border-slate-200 dark:border-slate-800 rounded overflow-x-auto">
                  <table className="w-full text-xs border-collapse font-mono tabular-nums">
                    <thead className="bg-slate-100 dark:bg-[#1E222D] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="text-left px-2 py-1.5">Ticket</th>
                        <th className="text-left px-2 py-1.5">Open Time</th>
                        <th className="text-left px-2 py-1.5">Type</th>
                        <th className="text-right px-2 py-1.5">Vol</th>
                        <th className="text-right px-2 py-1.5">Open</th>
                        <th className="text-right px-2 py-1.5">S/L</th>
                        <th className="text-right px-2 py-1.5">T/P</th>
                        <th className="text-left px-2 py-1.5">Close Time</th>
                        <th className="text-right px-2 py-1.5">Close</th>
                        <th className="text-right px-2 py-1.5">Comm</th>
                        <th className="text-right px-2 py-1.5">Net Profit</th>
                        <th className="text-right px-2 py-1.5">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {report.deals.map((deal) => (
                        <tr
                          key={deal.ticket}
                          onClick={() => onJumpToBar(deal.openBarIndex)}
                          title="Nhấp để nhảy biểu đồ tới lệnh này"
                          className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                        >
                          <td className="px-2 py-1">#{deal.ticket}</td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            {formatMt5DateTime(deal.openTime)}
                          </td>
                          <td
                            className={`px-2 py-1 uppercase font-semibold ${
                              deal.type === 'buy'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {deal.type}
                          </td>
                          <td className="px-2 py-1 text-right">{deal.volume.toFixed(2)}</td>
                          <td className="px-2 py-1 text-right">
                            {formatPrice(deal.openPrice, spec.digits)}
                          </td>
                          <td className="px-2 py-1 text-right text-slate-500">
                            {deal.sl > 0 ? formatPrice(deal.sl, spec.digits) : '0.00'}
                          </td>
                          <td className="px-2 py-1 text-right text-slate-500">
                            {deal.tp > 0 ? formatPrice(deal.tp, spec.digits) : '0.00'}
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            {formatMt5DateTime(deal.closeTime)}
                          </td>
                          <td className="px-2 py-1 text-right">
                            {formatPrice(deal.closePrice, spec.digits)}
                          </td>
                          <td className="px-2 py-1 text-right text-slate-500">
                            {deal.commission.toFixed(2)}
                          </td>
                          <td
                            className={`px-2 py-1 text-right font-semibold ${
                              deal.netProfit >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {deal.netProfit.toFixed(2)}
                          </td>
                          <td className="px-2 py-1 text-right font-medium">
                            {deal.balanceAfter.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <PerformanceAnalyticsPanel
            report={report}
            onStartBacktest={onStartBacktest}
          />
        )}

        {activeTab === 'trade' && (
          <div className="p-3 space-y-3 text-xs">
            {/* Account Live Balance Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131722]">
              <div className="flex flex-wrap items-center gap-5 font-mono tabular-nums">
                <span>
                  <span className="font-sans text-slate-500 dark:text-slate-400 mr-1.5">
                    Balance:
                  </span>
                  <strong>${manualBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
                <span>
                  <span className="font-sans text-slate-500 dark:text-slate-400 mr-1.5">
                    Equity:
                  </span>
                  <strong>${manualEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
                <span>
                  <span className="font-sans text-slate-500 dark:text-slate-400 mr-1.5">
                    Margin:
                  </span>
                  <span>${manualMargin.toFixed(2)}</span>
                </span>
                <span>
                  <span className="font-sans text-slate-500 dark:text-slate-400 mr-1.5">
                    Free Margin:
                  </span>
                  <span>${freeMargin.toFixed(2)}</span>
                </span>
                <span>
                  <span className="font-sans text-slate-500 dark:text-slate-400 mr-1.5">
                    Margin Level:
                  </span>
                  <span>{activeMarginLevel}%</span>
                </span>
              </div>

              {account.accountType === 'demo' ? (
                <div className="flex items-center gap-1.5">
                  <label htmlFor="demo-topup-input" className="sr-only">
                    Số dư Demo mới
                  </label>
                  <input
                    id="demo-topup-input"
                    type="number"
                    min={100}
                    step={1000}
                    value={demoTopup}
                    onChange={(e) => setDemoTopup(Number(e.target.value) || 10000)}
                    className="w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => onResetDemoBalance(demoTopup)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium whitespace-nowrap"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Nạp tiền Demo</span>
                  </button>
                </div>
              ) : (
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  Tài khoản REAL ({account.serverName}) · Không hỗ trợ nạp tiền ảo
                </span>
              )}
            </div>

            {/* Open Position Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded overflow-x-auto">
              <table className="w-full text-xs border-collapse font-mono tabular-nums">
                <thead className="bg-slate-100 dark:bg-[#1E222D] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="text-left px-2.5 py-1.5">Symbol</th>
                    <th className="text-left px-2.5 py-1.5">Ticket</th>
                    <th className="text-left px-2.5 py-1.5">Time</th>
                    <th className="text-left px-2.5 py-1.5">Type</th>
                    <th className="text-right px-2.5 py-1.5">Volume</th>
                    <th className="text-right px-2.5 py-1.5">Price</th>
                    <th className="text-right px-2.5 py-1.5">S/L</th>
                    <th className="text-right px-2.5 py-1.5">T/P</th>
                    <th className="text-right px-2.5 py-1.5">Commission</th>
                    <th className="text-right px-2.5 py-1.5">Profit</th>
                    <th className="text-right px-2.5 py-1.5">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {openPosition ? (
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-2.5 py-2 font-semibold">{openPosition.symbol}</td>
                      <td className="px-2.5 py-2">#{openPosition.ticket}</td>
                      <td className="px-2.5 py-2">{formatMt5DateTime(openPosition.openTime)}</td>
                      <td
                        className={`px-2.5 py-2 uppercase font-semibold ${
                          openPosition.type === 'buy'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {openPosition.type}
                      </td>
                      <td className="px-2.5 py-2 text-right">{openPosition.volume.toFixed(2)}</td>
                      <td className="px-2.5 py-2 text-right">
                        {formatPrice(openPosition.openPrice, getSymbolSpec(openPosition.symbol).digits)}
                      </td>
                      <td className="px-2.5 py-2 text-right">
                        {openPosition.sl > 0
                          ? formatPrice(openPosition.sl, getSymbolSpec(openPosition.symbol).digits)
                          : '0.00'}
                      </td>
                      <td className="px-2.5 py-2 text-right">
                        {openPosition.tp > 0
                          ? formatPrice(openPosition.tp, getSymbolSpec(openPosition.symbol).digits)
                          : '0.00'}
                      </td>
                      <td className="px-2.5 py-2 text-right">{openPosition.commission.toFixed(2)}</td>
                      <td
                        className={`px-2.5 py-2 text-right font-semibold ${
                          openPosition.unrealizedProfit >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {openPosition.unrealizedProfit.toFixed(2)}
                      </td>
                      <td className="px-2.5 py-2 text-right">
                        <button
                          type="button"
                          onClick={onCloseOpenPosition}
                          className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-sans font-medium"
                        >
                          Đóng lệnh
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-3 py-6 text-center font-sans text-slate-500 dark:text-slate-400"
                      >
                        Không có lệnh đang mở. Dùng nút Đặt lệnh nhanh (BUY/SELL) trên biểu đồ hoặc F9 để giao dịch Replay.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'journal' && (
          <div className="p-2.5 h-full overflow-y-auto font-mono text-xs space-y-1">
            {journal.map((entry) => {
              const lvlColor =
                entry.level === 'error'
                  ? 'text-red-600 dark:text-red-400'
                  : entry.level === 'success'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : entry.level === 'warning'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-slate-700 dark:text-slate-300';

              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 py-0.5 border-b border-slate-100 dark:border-slate-800/50 tabular-nums"
                >
                  <span className="text-slate-400 shrink-0">{entry.timestamp}</span>
                  <span className="w-16 font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                    {entry.source}
                  </span>
                  <span className={lvlColor}>{entry.message}</span>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'kronos' && (
          <div className="p-3 h-full overflow-y-auto">
            <KronosPanel
              symbol={settings.symbol}
              timeframe={settings.timeframe}
              forecast={kronosForecast}
              showOverlay={showKronosOverlay}
              isPredicting={isKronosPredicting}
              errorMsg={kronosError}
              defaultLot={inputs.lotSize}
              onToggleOverlay={onToggleKronosOverlay}
              onRunForecast={onRunKronosForecast}
              onRunKronosBacktest={onRunKronosBacktest}
              onExecuteKronosTrade={onExecuteKronosTrade}
            />
          </div>
        )}

        {activeTab === 'api' && <AiApiConsolePanel />}
      </div>
    </section>
  );
}
