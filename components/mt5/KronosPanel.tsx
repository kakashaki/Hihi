'use client';

import React, { useState } from 'react';
import {
  BrainCircuit,
  Check,
  Copy,
  Eye,
  EyeOff,
  Play,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { KRONOS_MODEL_ZOO, KRONOS_PYTHON_SERVER_SCRIPT } from '@/lib/mt5/kronosEngine';
import { formatMt5DateTime, formatPrice, getSymbolSpec } from '@/lib/mt5/marketData';
import type {
  KronosForecastResult,
  KronosModelVariant,
  Timeframe,
} from '@/lib/mt5/types';

interface KronosPanelProps {
  symbol: string;
  timeframe: Timeframe;
  forecast: KronosForecastResult | null;
  showOverlay: boolean;
  isPredicting: boolean;
  errorMsg: string | null;
  defaultLot?: number;
  onToggleOverlay: () => void;
  onRunForecast: (config: {
    modelVariant: KronosModelVariant;
    lookback: number;
    predLen: number;
    temperature: number;
    topP: number;
    sampleCount: number;
    kronosServerUrl: string;
    preferPythonServer: boolean;
  }) => void;
  onRunKronosBacktest: () => void;
  onExecuteKronosTrade?: (order: {
    action: 'BUY' | 'SELL';
    stopLoss: number;
    takeProfit: number;
    lotSize: number;
  }) => void;
}

export function KronosPanel({
  symbol,
  timeframe,
  forecast,
  showOverlay,
  isPredicting,
  errorMsg,
  defaultLot = 0.1,
  onToggleOverlay,
  onRunForecast,
  onRunKronosBacktest,
  onExecuteKronosTrade,
}: KronosPanelProps) {
  const [modelVariant, setModelVariant] = useState<KronosModelVariant>('kronos-small');
  const [lookback, setLookback] = useState(256);
  const [predLen, setPredLen] = useState(24);
  const [temperature, setTemperature] = useState(1.0);
  const [topP, setTopP] = useState(0.9);
  const [sampleCount, setSampleCount] = useState(7);
  const [kronosServerUrl, setKronosServerUrl] = useState('');
  const [preferPythonServer, setPreferPythonServer] = useState(false);
  const [showPythonGuide, setShowPythonGuide] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [tradeLot, setTradeLot] = useState(defaultLot);

  const spec = getSymbolSpec(symbol);
  const activeModelMeta =
    KRONOS_MODEL_ZOO.find((m) => m.id === modelVariant) ?? KRONOS_MODEL_ZOO[1];

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(KRONOS_PYTHON_SERVER_SCRIPT);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div className="space-y-3 text-xs">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <BrainCircuit className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 dark:text-white truncate">
              Kronos AI Foundation Model (shiyu-coder/Kronos)
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Mô hình Transformer lượng tử hóa chuỗi nến K-Line · {symbol},{timeframe} · Context tối đa {activeModelMeta.maxContext} bars
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {forecast && (
            <button
              type="button"
              onClick={onToggleOverlay}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-medium transition-colors ${
                showOverlay
                  ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {showOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{showOverlay ? 'Đang vẽ lên Chart' : 'Hiện lên Chart'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onRunKronosBacktest}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-emerald-600/50 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-[11px] font-semibold transition-colors"
          >
            <Play className="w-3 h-3" />
            <span>Backtest EA Kronos</span>
          </button>
        </div>
      </div>

      {/* Predictor Controls Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <div className="col-span-2 sm:col-span-2 lg:col-span-2">
          <label htmlFor="kronos-model" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
            Mô hình Kronos (Hugging Face)
          </label>
          <select
            id="kronos-model"
            value={modelVariant}
            onChange={(e) => {
              const next = e.target.value as KronosModelVariant;
              setModelVariant(next);
              const meta = KRONOS_MODEL_ZOO.find((m) => m.id === next);
              if (meta && lookback > meta.maxContext) {
                setLookback(meta.maxContext);
              }
            }}
            className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono text-xs"
          >
            {KRONOS_MODEL_ZOO.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · ctx {m.maxContext}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="kronos-lookback" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
            Lookback (nến)
          </label>
          <input
            id="kronos-lookback"
            type="number"
            min={32}
            max={activeModelMeta.maxContext}
            step={16}
            value={lookback}
            onChange={(e) =>
              setLookback(Math.max(32, Math.min(activeModelMeta.maxContext, Number(e.target.value) || 256)))
            }
            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono tabular-nums"
          />
        </div>

        <div>
          <label htmlFor="kronos-predlen" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
            Pred Len (nến tới)
          </label>
          <input
            id="kronos-predlen"
            type="number"
            min={4}
            max={72}
            step={2}
            value={predLen}
            onChange={(e) => setPredLen(Math.max(4, Math.min(72, Number(e.target.value) || 24)))}
            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono tabular-nums"
          />
        </div>

        <div>
          <label htmlFor="kronos-temp" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
            Temp (T)
          </label>
          <input
            id="kronos-temp"
            type="number"
            min={0.3}
            max={1.8}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Math.max(0.3, Math.min(1.8, Number(e.target.value) || 1.0)))}
            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono tabular-nums"
          />
        </div>

        <div>
          <label htmlFor="kronos-samples" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
            Samples (MC)
          </label>
          <input
            id="kronos-samples"
            type="number"
            min={1}
            max={24}
            step={1}
            value={sampleCount}
            onChange={(e) => setSampleCount(Math.max(1, Math.min(24, Number(e.target.value) || 7)))}
            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono tabular-nums"
          />
        </div>

        <div className="col-span-2 sm:col-span-2 lg:col-span-1 flex items-end">
          <button
            type="button"
            disabled={isPredicting}
            onClick={() =>
              onRunForecast({
                modelVariant,
                lookback,
                predLen,
                temperature,
                topP,
                sampleCount,
                kronosServerUrl,
                preferPythonServer,
              })
            }
            className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded bg-violet-700 hover:bg-violet-800 disabled:opacity-60 text-white font-semibold transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isPredicting ? 'Đang dự báo...' : 'Dự báo Kronos'}</span>
          </button>
        </div>
      </div>

      {/* Optional External PyTorch KronosPredictor Server Row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131722] px-2.5 py-2">
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2">
          <label htmlFor="kronos-topp" className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
            top_p:
          </label>
          <input
            id="kronos-topp"
            type="number"
            min={0.4}
            max={1.0}
            step={0.05}
            value={topP}
            onChange={(e) => setTopP(Math.max(0.4, Math.min(1.0, Number(e.target.value) || 0.9)))}
            className="w-16 px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A25] font-mono tabular-nums text-[11px]"
          />
          <input
            type="url"
            value={kronosServerUrl}
            onChange={(e) => setKronosServerUrl(e.target.value)}
            placeholder="Tùy chọn: URL PyTorch Kronos Server (vd: http://127.0.0.1:8899)"
            className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A25] font-mono text-[11px]"
          />
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={preferPythonServer}
              onChange={(e) => setPreferPythonServer(e.target.checked)}
              className="rounded border-slate-400"
            />
            <span>Bắt buộc Python PyTorch</span>
          </label>
          <button
            type="button"
            onClick={() => setShowPythonGuide((s) => !s)}
            className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-[11px] font-medium"
          >
            {showPythonGuide ? 'Ẩn kronos_server.py' : 'Script PyTorch'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 px-3 py-2 text-[11px]">
          {errorMsg}
        </div>
      )}

      {showPythonGuide && (
        <div className="rounded border border-slate-300 dark:border-slate-700 bg-[#0F131D] text-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 bg-[#171B26]">
            <span className="font-mono text-[11px]">
              kronos_server.py · {activeModelMeta.hfRepo} + {activeModelMeta.tokenizer}
            </span>
            <button
              type="button"
              onClick={handleCopyScript}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px]"
            >
              {copiedScript ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedScript ? 'Đã chép' : 'Copy'}</span>
            </button>
          </div>
          <pre className="p-2.5 text-[10px] font-mono overflow-x-auto max-h-44 leading-relaxed">
            {KRONOS_PYTHON_SERVER_SCRIPT}
          </pre>
        </div>
      )}

      {/* Forecast Results Summary + Predicted Candles Table */}
      {forecast ? (
        <div className="space-y-2.5">
          {/* Kronos AI Actionable Trade Plan + 1-Click Order Execution */}
          <div className="rounded border border-violet-300/80 dark:border-violet-800/70 bg-violet-50/50 dark:bg-violet-950/20 p-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Khuyến nghị Giao dịch AI Kronos:
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                    forecast.tradeSignal.action === 'BUY'
                      ? 'bg-blue-600 text-white'
                      : forecast.tradeSignal.action === 'SELL'
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-600 text-white'
                  }`}
                >
                  {forecast.tradeSignal.action}
                </span>
                <span className="font-mono tabular-nums text-[11px] text-slate-700 dark:text-slate-300">
                  Entry: <strong>{formatPrice(forecast.tradeSignal.entryPrice, spec.digits)}</strong> · SL:{' '}
                  <strong className="text-red-600 dark:text-red-400">
                    {formatPrice(forecast.tradeSignal.stopLoss, spec.digits)}
                  </strong>{' '}
                  · TP:{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {formatPrice(forecast.tradeSignal.takeProfit, spec.digits)}
                  </strong>{' '}
                  · R:R <strong>1:{forecast.tradeSignal.riskRewardRatio}</strong>
                </span>
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                {forecast.tradeSignal.rationale}
              </div>
            </div>

            {onExecuteKronosTrade && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <label htmlFor="kronos-trade-lot" className="text-[11px] text-slate-500 dark:text-slate-400">
                  Lot:
                </label>
                <input
                  id="kronos-trade-lot"
                  type="number"
                  min={0.01}
                  max={50}
                  step={0.01}
                  value={tradeLot}
                  onChange={(e) => setTradeLot(Math.max(0.01, Number(e.target.value) || 0.1))}
                  className="w-16 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono tabular-nums text-[11px]"
                />
                <button
                  type="button"
                  disabled={forecast.tradeSignal.action === 'HOLD'}
                  onClick={() => {
                    if (forecast.tradeSignal.action === 'HOLD') return;
                    onExecuteKronosTrade({
                      action: forecast.tradeSignal.action,
                      stopLoss: forecast.tradeSignal.stopLoss,
                      takeProfit: forecast.tradeSignal.takeProfit,
                      lotSize: tradeLot,
                    });
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold text-white transition-colors disabled:opacity-45 ${
                    forecast.tradeSignal.action === 'SELL'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-blue-700 hover:bg-blue-800'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {forecast.tradeSignal.action === 'HOLD'
                      ? 'Chờ tín hiệu (HOLD)'
                      : `Vào lệnh ${forecast.tradeSignal.action} theo Kronos`}
                  </span>
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131722] p-2">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Xu hướng (Bias)</div>
              <div
                className={`mt-0.5 inline-flex items-center gap-1 font-bold text-xs ${
                  forecast.bias === 'bullish'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : forecast.bias === 'bearish'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {forecast.bias === 'bullish' ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : forecast.bias === 'bearish' ? (
                  <TrendingDown className="w-3.5 h-3.5" />
                ) : null}
                <span>{forecast.bias.toUpperCase()}</span>
              </div>
            </div>

            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131722] p-2 font-mono tabular-nums">
              <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">
                Giá hiện tại → Mục tiêu ({forecast.predLen} nến)
              </div>
              <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                {formatPrice(forecast.currentPrice, spec.digits)} →{' '}
                <span className="text-violet-600 dark:text-violet-400">
                  {formatPrice(forecast.targetPrice, spec.digits)}
                </span>
              </div>
            </div>

            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131722] p-2 font-mono tabular-nums">
              <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">Biên độ kỳ vọng</div>
              <div
                className={`mt-0.5 font-bold ${
                  forecast.expectedMovePercent >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {forecast.expectedMovePercent >= 0 ? '+' : ''}
                {forecast.expectedMovePercent}% ({forecast.expectedMovePoints >= 0 ? '+' : ''}
                {forecast.expectedMovePoints} pts)
              </div>
            </div>

            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131722] p-2 font-mono tabular-nums">
              <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">Độ tin cậy (MC Band)</div>
              <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                {forecast.confidencePercent}% ({forecast.sampleCount} paths)
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131722] p-2">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Chế độ & Engine</div>
              <div className="mt-0.5 text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate">
                {forecast.regimeLabel}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
            <table className="w-full text-[11px] font-mono tabular-nums border-collapse">
              <thead className="bg-slate-100 dark:bg-[#1B202C] text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="text-left px-2 py-1 font-medium">#</th>
                  <th className="text-left px-2 py-1 font-medium">Thời gian dự báo</th>
                  <th className="text-right px-2 py-1 font-medium">Open</th>
                  <th className="text-right px-2 py-1 font-medium">High</th>
                  <th className="text-right px-2 py-1 font-medium">Low</th>
                  <th className="text-right px-2 py-1 font-medium">Close (Med)</th>
                  <th className="text-right px-2 py-1 font-medium">Dải P10 .. P90</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {forecast.forecastCandles.slice(0, 12).map((bar, idx) => (
                  <tr key={bar.time} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-2 py-1 text-slate-500">+{idx + 1}</td>
                    <td className="px-2 py-1">{formatMt5DateTime(bar.time)}</td>
                    <td className="px-2 py-1 text-right">{formatPrice(bar.open, spec.digits)}</td>
                    <td className="px-2 py-1 text-right">{formatPrice(bar.high, spec.digits)}</td>
                    <td className="px-2 py-1 text-right">{formatPrice(bar.low, spec.digits)}</td>
                    <td
                      className={`px-2 py-1 text-right font-semibold ${
                        bar.close >= bar.open
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatPrice(bar.close, spec.digits)}
                    </td>
                    <td className="px-2 py-1 text-right text-slate-500 dark:text-slate-400">
                      {formatPrice(bar.p10, spec.digits)} .. {formatPrice(bar.p90, spec.digits)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-slate-500 dark:text-slate-400">
          Nhấn <strong>Dự báo Kronos</strong> để chạy mô hình K-Line Foundation trên dữ liệu nến thực tế của <strong>{symbol} ({timeframe})</strong> và vẽ chuỗi nến dự đoán trực tiếp lên biểu đồ MT5.
        </div>
      )}
    </div>
  );
}
