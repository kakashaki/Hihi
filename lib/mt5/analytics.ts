import type { BacktestReport, TradeDeal } from './types';

export interface UnderwaterPoint {
  barIndex: number;
  time: number;
  drawdownUsd: number;
  drawdownPercent: number;
}

export interface MonthlyPerformance {
  month: string; // YYYY.MM
  trades: number;
  wins: number;
  winRatePercent: number;
  netProfit: number;
}

export interface CloseReasonStat {
  reason: TradeDeal['closeReason'];
  label: string;
  count: number;
  sharePercent: number;
  netProfit: number;
}

export interface PerformanceAnalytics {
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  profitFactor: number;
  recoveryFactor: number;
  winRatePercent: number;
  lossRatePercent: number;
  longWinRatePercent: number;
  shortWinRatePercent: number;
  expectancyUsd: number;
  returnPercent: number;
  riskRewardRatio: number;
  avgWinUsd: number;
  avgLossUsd: number;
  maxEquityDrawdownUsd: number;
  maxEquityDrawdownPercent: number;
  maxBalanceDrawdownUsd: number;
  maxBalanceDrawdownPercent: number;
  avgDrawdownPercent: number;
  maxDrawdownDurationBars: number;
  avgHoldHours: number;
  totalCommissionUsd: number;
  totalSwapUsd: number;
  tradesPerDay: number;
  modelingMode: BacktestReport['settings']['modeling'];
  frictionWarning: string | null;
  underwaterCurve: UnderwaterPoint[];
  monthlyBreakdown: MonthlyPerformance[];
  closeReasonBreakdown: CloseReasonStat[];
}

const CLOSE_REASON_LABELS: Record<TradeDeal['closeReason'], string> = {
  tp: 'Take Profit (TP)',
  sl: 'Stop Loss (SL)',
  signal: 'EA Signal Reverse',
  manual: 'Manual Close',
  stop_out: 'Stop Out',
  end_of_test: 'End of Test',
};

function toYearMonth(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${d.getUTCFullYear()}.${m}`;
}

export function computePerformanceAnalytics(report: BacktestReport): PerformanceAnalytics {
  const { metrics, deals, equityCurve, settings } = report;
  const initial = Math.max(1, metrics.initialDeposit);

  // 1. Underwater Drawdown curve & drawdown duration
  let peakEquity = initial;
  let ddSum = 0;
  let currentDdBars = 0;
  let maxDrawdownDurationBars = 0;

  const underwaterCurve: UnderwaterPoint[] = equityCurve.map((pt) => {
    if (pt.equity >= peakEquity) {
      peakEquity = pt.equity;
      currentDdBars = 0;
    } else {
      currentDdBars += 1;
      if (currentDdBars > maxDrawdownDurationBars) {
        maxDrawdownDurationBars = currentDdBars;
      }
    }
    const ddUsd = Math.max(0, Number((peakEquity - pt.equity).toFixed(2)));
    const ddPct = peakEquity > 0 ? Number(((ddUsd / peakEquity) * 100).toFixed(2)) : 0;
    ddSum += ddPct;

    return {
      barIndex: pt.barIndex,
      time: pt.time,
      drawdownUsd: ddUsd,
      drawdownPercent: ddPct,
    };
  });

  const avgDrawdownPercent =
    underwaterCurve.length > 0 ? Number((ddSum / underwaterCurve.length).toFixed(2)) : 0;

  // 2. Return %, Sortino Ratio, Calmar Ratio
  const returnPercent = Number(((metrics.totalNetProfit / initial) * 100).toFixed(2));
  const calmarRatio =
    metrics.equityDrawdownPercent > 0
      ? Number((returnPercent / metrics.equityDrawdownPercent).toFixed(2))
      : returnPercent > 0
      ? 10.0
      : 0;

  let sortinoRatio = 0;
  if (deals.length > 2) {
    const returns = deals.map((d) => d.netProfit / initial);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downsideSq = returns.reduce((acc, r) => (r < 0 ? acc + r * r : acc), 0);
    const downsideDev = Math.sqrt(downsideSq / returns.length);
    sortinoRatio =
      downsideDev > 0
        ? Number(((mean / downsideDev) * Math.sqrt(returns.length)).toFixed(2))
        : mean > 0
        ? 10.0
        : 0;
  }

  // 3. Risk/Reward, Hold Duration, Commission/Swap totals
  const avgWinUsd = metrics.averageProfitTrade;
  const avgLossUsd = metrics.averageLossTrade; // negative or 0
  const riskRewardRatio =
    Math.abs(avgLossUsd) > 0
      ? Number((avgWinUsd / Math.abs(avgLossUsd)).toFixed(2))
      : avgWinUsd > 0
      ? 10.0
      : 0;

  let totalHoldSec = 0;
  let totalCommissionUsd = 0;
  let totalSwapUsd = 0;

  const monthMap = new Map<string, { trades: number; wins: number; netProfit: number }>();
  const reasonMap = new Map<TradeDeal['closeReason'], { count: number; netProfit: number }>();

  for (const deal of deals) {
    totalHoldSec += Math.max(0, deal.closeTime - deal.openTime);
    totalCommissionUsd += deal.commission;
    totalSwapUsd += deal.swap;

    const ym = toYearMonth(deal.closeTime);
    const mEntry = monthMap.get(ym) ?? { trades: 0, wins: 0, netProfit: 0 };
    mEntry.trades += 1;
    if (deal.netProfit > 0) mEntry.wins += 1;
    mEntry.netProfit = Number((mEntry.netProfit + deal.netProfit).toFixed(2));
    monthMap.set(ym, mEntry);

    const rEntry = reasonMap.get(deal.closeReason) ?? { count: 0, netProfit: 0 };
    rEntry.count += 1;
    rEntry.netProfit = Number((rEntry.netProfit + deal.netProfit).toFixed(2));
    reasonMap.set(deal.closeReason, rEntry);
  }

  const avgHoldHours =
    deals.length > 0 ? Number((totalHoldSec / deals.length / 3600).toFixed(1)) : 0;

  const firstTime = equityCurve.length > 0 ? equityCurve[0].time : 0;
  const lastTime = equityCurve.length > 1 ? equityCurve[equityCurve.length - 1].time : firstTime;
  const durationDays = Math.max(1, (lastTime - firstTime) / 86400);
  const tradesPerDay = deals.length > 0 ? Number((deals.length / durationDays).toFixed(1)) : 0;

  let frictionWarning: string | null = null;
  if (settings.modeling === 'real_ticks_slippage' && metrics.expectedPayoff < 0) {
    frictionWarning = `Cảnh báo Quant Postmortem (Real Ticks): Spread giãn nở và độ trượt giá (Slippage) khi khớp Stop Order đã đẩy Expected Payoff xuống $${metrics.expectedPayoff.toFixed(
      2
    )}/lệnh (PF ${metrics.profitFactor.toFixed(2)})${
      metrics.profitTradesPercent >= 45
        ? ` dù Win Rate đạt ${metrics.profitTradesPercent.toFixed(1)}%`
        : ''
    }.`;
  } else if (tradesPerDay >= 25 || deals.length >= 160) {
    frictionWarning = `Cảnh báo tần suất giao dịch cao (${deals.length} lệnh, ~${tradesPerDay} lệnh/ngày): Dễ nhạy cảm với Spread biến động, trượt giá Stop Order và giới hạn tần suất gửi/hủy lệnh của broker ECN / Prop Firm.`;
  }

  const monthlyBreakdown: MonthlyPerformance[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      trades: v.trades,
      wins: v.wins,
      winRatePercent: v.trades > 0 ? Number(((v.wins / v.trades) * 100).toFixed(1)) : 0,
      netProfit: v.netProfit,
    }));

  const closeReasonBreakdown: CloseReasonStat[] = Array.from(reasonMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([reason, v]) => ({
      reason,
      label: CLOSE_REASON_LABELS[reason],
      count: v.count,
      sharePercent: deals.length > 0 ? Number(((v.count / deals.length) * 100).toFixed(1)) : 0,
      netProfit: v.netProfit,
    }));

  return {
    sharpeRatio: metrics.sharpeRatio,
    sortinoRatio,
    calmarRatio,
    profitFactor: metrics.profitFactor,
    recoveryFactor: metrics.recoveryFactor,
    winRatePercent: metrics.profitTradesPercent,
    lossRatePercent: metrics.lossTradesPercent,
    longWinRatePercent: metrics.longWonPercent,
    shortWinRatePercent: metrics.shortWonPercent,
    expectancyUsd: metrics.expectedPayoff,
    returnPercent,
    riskRewardRatio,
    avgWinUsd,
    avgLossUsd,
    maxEquityDrawdownUsd: metrics.equityDrawdownAbs,
    maxEquityDrawdownPercent: metrics.equityDrawdownPercent,
    maxBalanceDrawdownUsd: metrics.balanceDrawdownAbs,
    maxBalanceDrawdownPercent: metrics.balanceDrawdownPercent,
    avgDrawdownPercent,
    maxDrawdownDurationBars,
    avgHoldHours,
    totalCommissionUsd: Number(totalCommissionUsd.toFixed(2)),
    totalSwapUsd: Number(totalSwapUsd.toFixed(2)),
    tradesPerDay,
    modelingMode: settings.modeling,
    frictionWarning,
    underwaterCurve,
    monthlyBreakdown,
    closeReasonBreakdown,
  };
}
