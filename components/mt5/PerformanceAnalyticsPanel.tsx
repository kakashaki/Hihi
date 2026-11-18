'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, TrendingDown } from 'lucide-react';
import { computePerformanceAnalytics } from '@/lib/mt5/analytics';
import { formatMt5DateTime } from '@/lib/mt5/marketData';
import type { BacktestReport } from '@/lib/mt5/types';

interface PerformanceAnalyticsPanelProps {
  report: BacktestReport | null;
  onStartBacktest: () => void;
}

export function PerformanceAnalyticsPanel({
  report,
  onStartBacktest,
}: PerformanceAnalyticsPanelProps) {
  const [hoverDdIdx, setHoverDdIdx] = useState<number | null>(null);
  const [hoverMonthIdx, setHoverMonthIdx] = useState<number | null>(null);

  const analytics = useMemo(() => {
    if (!report) return null;
    return computePerformanceAnalytics(report);
  }, [report]);

  const ddChart = useMemo(() => {
    if (!analytics || analytics.underwaterCurve.length < 2) return null;
    const curve = analytics.underwaterCurve;
    const w = 520;
    const h = 132;
    const padL = 38;
    const padR = 10;
    const padT = 10;
    const padB = 20;

    const maxDd = Math.max(
      1,
      ...curve.map((pt) => pt.drawdownPercent)
    );
    const yMax = Math.ceil(maxDd * 1.15 * 10) / 10;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const xOf = (idx: number) => padL + (idx / Math.max(1, curve.length - 1)) * plotW;
    const yOf = (ddPct: number) => padT + (ddPct / Math.max(0.1, yMax)) * plotH;

    const step = Math.max(1, Math.floor(curve.length / 180));
    const sampled: number[] = [];
    for (let i = 0; i < curve.length; i += step) sampled.push(i);
    if (sampled[sampled.length - 1] !== curve.length - 1) sampled.push(curve.length - 1);

    const linePath = sampled
      .map((idx, k) => `${k === 0 ? 'M' : 'L'} ${xOf(idx).toFixed(1)} ${yOf(curve[idx].drawdownPercent).toFixed(1)}`)
      .join(' ');
    const areaPath = `${linePath} L ${xOf(sampled[sampled.length - 1]).toFixed(1)} ${padT} L ${xOf(
      sampled[0]
    ).toFixed(1)} ${padT} Z`;

    return {
      w,
      h,
      padL,
      padT,
      padR,
      plotW,
      plotH,
      yMax,
      curve,
      linePath,
      areaPath,
      xOf,
      yOf,
    };
  }, [analytics]);

  const monthlyChart = useMemo(() => {
    if (!analytics || analytics.monthlyBreakdown.length === 0) return null;
    const months = analytics.monthlyBreakdown;
    const w = 520;
    const h = 132;
    const padL = 48;
    const padR = 10;
    const padT = 12;
    const padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const maxAbs = Math.max(
      10,
      ...months.map((m) => Math.abs(m.netProfit))
    );
    const zeroY = padT + plotH / 2;
    const scaleY = (plotH / 2) / (maxAbs * 1.15);
    const slotW = plotW / months.length;
    const barW = Math.max(8, Math.min(34, slotW * 0.64));

    return {
      w,
      h,
      padL,
      padR,
      padT,
      plotW,
      plotH,
      zeroY,
      scaleY,
      slotW,
      barW,
      months,
    };
  }, [analytics]);

  if (!report || !analytics) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-xs text-slate-500 dark:text-slate-400 gap-2">
        <BarChart3 className="w-6 h-6 text-slate-400" />
        <p>Chưa có dữ liệu phân tích hiệu suất (Sharpe Ratio, Drawdown, Win Rate).</p>
        <button
          type="button"
          onClick={onStartBacktest}
          className="px-3 py-1.5 rounded bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold"
        >
          Chạy Backtest ngay
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 text-xs">
      {/* Friction / Over-trading Quant Audit Banner */}
      {analytics.frictionWarning && (
        <div
          role="status"
          className="flex items-start gap-2.5 px-3 py-2 rounded border border-amber-300 dark:border-amber-700/70 bg-amber-50/90 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold">Quant Friction Audit: </span>
            <span>{analytics.frictionWarning}</span>
          </div>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 font-mono tabular-nums">
        <div className="px-2.5 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#131722]">
          <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
            Sharpe Ratio
          </div>
          <div
            className={`text-sm font-bold mt-0.5 ${
              analytics.sharpeRatio >= 1
                ? 'text-emerald-600 dark:text-emerald-400'
                : analytics.sharpeRatio < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {analytics.sharpeRatio.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Sortino {analytics.sortinoRatio.toFixed(2)} · Calmar {analytics.calmarRatio.toFixed(2)}
          </div>
        </div>

        <div className="px-2.5 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#131722]">
          <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
            Max Drawdown (Equity)
          </div>
          <div className="text-sm font-bold text-amber-700 dark:text-amber-400 mt-0.5">
            {analytics.maxEquityDrawdownPercent.toFixed(2)}% (${analytics.maxEquityDrawdownUsd.toFixed(2)})
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Avg {analytics.avgDrawdownPercent.toFixed(2)}% · Max {analytics.maxDrawdownDurationBars} bars
          </div>
        </div>

        <div className="px-2.5 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#131722]">
          <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
            Win Rate
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
            {analytics.winRatePercent.toFixed(2)}% ({report.metrics.profitTrades}/{report.metrics.totalTrades})
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Long {analytics.longWinRatePercent.toFixed(1)}% · Short {analytics.shortWinRatePercent.toFixed(1)}%
          </div>
        </div>

        <div className="px-2.5 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#131722]">
          <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
            Profit Factor / R:R
          </div>
          <div
            className={`text-sm font-bold mt-0.5 ${
              analytics.profitFactor >= 1.2
                ? 'text-emerald-600 dark:text-emerald-400'
                : analytics.profitFactor < 1
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {analytics.profitFactor.toFixed(2)} · 1:{analytics.riskRewardRatio.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Win ${analytics.avgWinUsd.toFixed(2)} / Loss ${Math.abs(analytics.avgLossUsd).toFixed(2)}
          </div>
        </div>

        <div className="px-2.5 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#131722]">
          <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
            Return / Expectancy
          </div>
          <div
            className={`text-sm font-bold mt-0.5 ${
              analytics.returnPercent >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {analytics.returnPercent >= 0 ? '+' : ''}
            {analytics.returnPercent.toFixed(2)}% (${analytics.expectancyUsd.toFixed(2)}/lệnh)
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Recovery {analytics.recoveryFactor.toFixed(2)}
          </div>
        </div>

        <div className="px-2.5 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#131722]">
          <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
            Tần suất & Thời gian giữ
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
            {analytics.tradesPerDay} lệnh/ngày
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Avg Hold {analytics.avgHoldHours.toFixed(1)}h · Comm ${analytics.totalCommissionUsd.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Side-by-side Underwater Drawdown & Monthly Net Profit Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Underwater Drawdown SVG */}
        <div className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131722] p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
              <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              <span>Biểu đồ Drawdown (Underwater %)</span>
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
              {hoverDdIdx !== null && ddChart?.curve[hoverDdIdx] ? (
                <>
                  {formatMt5DateTime(ddChart.curve[hoverDdIdx].time)} · -
                  {ddChart.curve[hoverDdIdx].drawdownPercent.toFixed(2)}% (-$
                  {ddChart.curve[hoverDdIdx].drawdownUsd.toFixed(2)})
                </>
              ) : (
                <>Peak DD: -{analytics.maxEquityDrawdownPercent.toFixed(2)}%</>
              )}
            </span>
          </div>
          {ddChart ? (
            <svg
              viewBox={`0 0 ${ddChart.w} ${ddChart.h}`}
              className="w-full h-32"
              preserveAspectRatio="none"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const relX = ((e.clientX - rect.left) / rect.width) * ddChart.w;
                const ratio = Math.max(
                  0,
                  Math.min(1, (relX - ddChart.padL) / Math.max(1, ddChart.plotW))
                );
                setHoverDdIdx(Math.round(ratio * (ddChart.curve.length - 1)));
              }}
              onMouseLeave={() => setHoverDdIdx(null)}
            >
              {[0, 0.5, 1].map((r) => {
                const pctVal = ddChart.yMax * r;
                const y = ddChart.yOf(pctVal);
                return (
                  <g key={r}>
                    <line
                      x1={ddChart.padL}
                      y1={y}
                      x2={ddChart.w - ddChart.padR}
                      y2={y}
                      stroke="rgba(148,163,184,0.22)"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={4}
                      y={y + 3}
                      fontSize="9"
                      fill="currentColor"
                      className="text-slate-500 font-mono"
                    >
                      -{pctVal.toFixed(1)}%
                    </text>
                  </g>
                );
              })}
              <path d={ddChart.areaPath} fill="rgba(239, 68, 68, 0.18)" />
              <path d={ddChart.linePath} fill="none" stroke="#EF4444" strokeWidth="1.6" />
            </svg>
          ) : (
            <div className="h-32 flex items-center justify-center text-slate-400">
              Không đủ dữ liệu Equity Curve
            </div>
          )}
        </div>

        {/* Monthly Net Profit Bar Chart */}
        <div className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131722] p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
              <BarChart3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Lợi nhuận ròng theo tháng (Monthly P&L)</span>
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
              {hoverMonthIdx !== null && monthlyChart?.months[hoverMonthIdx] ? (
                <>
                  {monthlyChart.months[hoverMonthIdx].month} · $
                  {monthlyChart.months[hoverMonthIdx].netProfit.toFixed(2)} (
                  {monthlyChart.months[hoverMonthIdx].trades} lệnh · Win{' '}
                  {monthlyChart.months[hoverMonthIdx].winRatePercent}%)
                </>
              ) : (
                <>{analytics.monthlyBreakdown.length} tháng giao dịch</>
              )}
            </span>
          </div>
          {monthlyChart ? (
            <svg viewBox={`0 0 ${monthlyChart.w} ${monthlyChart.h}`} className="w-full h-32">
              <line
                x1={monthlyChart.padL}
                y1={monthlyChart.zeroY}
                x2={monthlyChart.w - monthlyChart.padR}
                y2={monthlyChart.zeroY}
                stroke="rgba(148,163,184,0.45)"
                strokeWidth="1"
              />
              <text
                x={4}
                y={monthlyChart.zeroY + 3}
                fontSize="9"
                fill="currentColor"
                className="text-slate-500 font-mono"
              >
                $0
              </text>
              {monthlyChart.months.map((m, idx) => {
                const xCenter = monthlyChart.padL + idx * monthlyChart.slotW + monthlyChart.slotW / 2;
                const barH = Math.max(2, Math.abs(m.netProfit) * monthlyChart.scaleY);
                const y = m.netProfit >= 0 ? monthlyChart.zeroY - barH : monthlyChart.zeroY;
                const isPos = m.netProfit >= 0;
                return (
                  <g
                    key={m.month}
                    onMouseEnter={() => setHoverMonthIdx(idx)}
                    onMouseLeave={() => setHoverMonthIdx(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={xCenter - monthlyChart.barW / 2}
                      y={y}
                      width={monthlyChart.barW}
                      height={barH}
                      rx={2}
                      fill={isPos ? '#16A34A' : '#EF4444'}
                      opacity={hoverMonthIdx === idx ? 1 : 0.85}
                    />
                    <text
                      x={xCenter}
                      y={monthlyChart.h - 5}
                      textAnchor="middle"
                      fontSize="9"
                      fill="currentColor"
                      className="text-slate-500 font-mono"
                    >
                      {m.month.slice(2)}
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className="h-32 flex items-center justify-center text-slate-400">
              Chưa có giao dịch đã đóng để tổng hợp theo tháng
            </div>
          )}
        </div>
      </div>

      {/* Bottom Breakdown Row: Exit Reasons + Risk & Friction Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-2.5 py-1.5 bg-slate-100 dark:bg-[#1E222D] border-b border-slate-200 dark:border-slate-800 font-semibold">
            Phân bổ lý do đóng lệnh (Exit Breakdown)
          </div>
          <table className="w-full text-xs border-collapse font-mono tabular-nums">
            <thead className="bg-slate-50 dark:bg-[#161A25] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="text-left px-2.5 py-1 font-sans">Lý do</th>
                <th className="text-right px-2.5 py-1">Số lệnh</th>
                <th className="text-right px-2.5 py-1">Tỷ trọng</th>
                <th className="text-right px-2.5 py-1">Net Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {analytics.closeReasonBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2.5 py-3 text-center text-slate-400 font-sans">
                    Chưa có lệnh nào được đóng
                  </td>
                </tr>
              ) : (
                analytics.closeReasonBreakdown.map((item) => (
                  <tr key={item.reason}>
                    <td className="px-2.5 py-1 font-sans font-medium">{item.label}</td>
                    <td className="px-2.5 py-1 text-right">{item.count}</td>
                    <td className="px-2.5 py-1 text-right">{item.sharePercent.toFixed(1)}%</td>
                    <td
                      className={`px-2.5 py-1 text-right font-semibold ${
                        item.netProfit >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      ${item.netProfit.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-2.5 py-1.5 bg-slate-100 dark:bg-[#1E222D] border-b border-slate-200 dark:border-slate-800 font-semibold">
            Thống kê rủi ro & Chi phí ma sát (Risk & Cost)
          </div>
          <div className="p-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono tabular-nums text-[11px]">
            <div className="flex justify-between">
              <span className="font-sans text-slate-500 dark:text-slate-400">Balance DD Max:</span>
              <span>
                ${analytics.maxBalanceDrawdownUsd.toFixed(2)} ({analytics.maxBalanceDrawdownPercent.toFixed(2)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-500 dark:text-slate-400">Modeling Mode:</span>
              <span className="uppercase">{analytics.modelingMode}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-500 dark:text-slate-400">Largest Win:</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                ${report.metrics.largestProfitTrade.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-500 dark:text-slate-400">Largest Loss:</span>
              <span className="text-red-600 dark:text-red-400">
                ${report.metrics.largestLossTrade.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-500 dark:text-slate-400">Total Commission:</span>
              <span>${analytics.totalCommissionUsd.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-500 dark:text-slate-400">Total Swap:</span>
              <span>${analytics.totalSwapUsd.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-500 dark:text-slate-400">Max Consec. Wins:</span>
              <span>{report.metrics.maxConsecutiveWins}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-500 dark:text-slate-400">Max Consec. Losses:</span>
              <span>{report.metrics.maxConsecutiveLosses}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
