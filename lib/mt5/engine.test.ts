import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateMt5Account,
  createNewMt5Account,
  resetDemoAccountBalance,
} from './auth';
import { runAutomatedBacktest } from './backtestEngine';
import { calculateEMA, calculateRSI, calculateBollingerBands } from './indicators';
import {
  DEFAULT_ACCOUNTS,
  DEFAULT_EA_INPUTS,
  generateHistoricalCandles,
} from './marketData';
import type { BacktestSettings } from './types';

test('MT5 auth: logs into pre-configured Real and Demo accounts and rejects wrong password', () => {
  const demoLogin = authenticateMt5Account(DEFAULT_ACCOUNTS, {
    login: '50192834',
    password: 'demo1234',
    serverId: 'metaquotes-demo',
    savePassword: true,
  });
  assert.equal(demoLogin.ok, true);
  assert.equal(demoLogin.account?.accountType, 'demo');

  const realLogin = authenticateMt5Account(DEFAULT_ACCOUNTS, {
    login: '88204195',
    password: 'real1234',
    serverId: 'exness-real8',
    savePassword: true,
  });
  assert.equal(realLogin.ok, true);
  assert.equal(realLogin.account?.accountType, 'real');

  const badLogin = authenticateMt5Account(DEFAULT_ACCOUNTS, {
    login: '88204195',
    password: 'wrongpassword',
    serverId: 'exness-real8',
    savePassword: false,
  });
  assert.equal(badLogin.ok, false);
  assert.match(badLogin.error ?? '', /Sai mật khẩu/);
});

test('MT5 auth: creates new Real/Demo accounts and restricts balance reset to Demo only', () => {
  const newReal = createNewMt5Account(DEFAULT_ACCOUNTS, {
    holderName: 'Le Bao',
    serverId: 'exness-real8',
    accountType: 'real',
    initialDeposit: 2500,
    leverage: 500,
    password: 'pass1234',
  });
  assert.equal(newReal.ok, true);
  assert.equal(newReal.account?.accountType, 'real');
  assert.equal(newReal.account?.balance, 2500);

  const resetReal = resetDemoAccountBalance(newReal.account!, 50000);
  assert.equal(resetReal.ok, false);

  const newDemo = createNewMt5Account(DEFAULT_ACCOUNTS, {
    holderName: 'Le Bao Demo',
    serverId: 'metaquotes-demo',
    accountType: 'demo',
    initialDeposit: 10000,
    leverage: 500,
    password: 'pass1234',
  });
  assert.equal(newDemo.ok, true);
  const resetDemo = resetDemoAccountBalance(newDemo.account!, 50000);
  assert.equal(resetDemo.ok, true);
  assert.equal(resetDemo.account?.balance, 50000);
});

test('Historical candle generator produces deterministic valid OHLC bars', () => {
  const c1 = generateHistoricalCandles('XAUUSD', 'H1', '2025-01-01', '2025-06-01', 400);
  const c2 = generateHistoricalCandles('XAUUSD', 'H1', '2025-01-01', '2025-06-01', 400);
  assert.equal(c1.length, 400);
  assert.deepEqual(c1, c2);
  for (const bar of c1) {
    assert.ok(bar.high >= Math.max(bar.open, bar.close));
    assert.ok(bar.low <= Math.min(bar.open, bar.close));
    assert.ok(bar.volume > 0);
  }
});

test('Indicators compute bounded RSI, EMA, and Bollinger Bands', () => {
  const candles = generateHistoricalCandles('EURUSD', 'H1', '2025-01-01', '2025-04-01', 250);
  const ema = calculateEMA(candles, 12);
  const rsi = calculateRSI(candles, 14);
  const bb = calculateBollingerBands(candles, 20, 2);

  assert.equal(ema.slice(0, 11).every((v) => v === null), true);
  assert.ok(typeof ema[11] === 'number');

  for (const r of rsi) {
    if (r !== null) {
      assert.ok(r >= 0 && r <= 100);
    }
  }
  for (const pt of bb) {
    if (pt !== null) {
      assert.ok(pt.upper >= pt.middle && pt.middle >= pt.lower);
    }
  }
});

test('Backtest engine executes trades, tracks equity curve, and applies Real server commission', () => {
  const candles = generateHistoricalCandles('XAUUSD', 'H1', '2025-01-01', '2025-06-01', 600);
  const settings: BacktestSettings = {
    eaId: 'ma_cross',
    symbol: 'XAUUSD',
    timeframe: 'H1',
    fromDate: '2025-01-01',
    toDate: '2025-06-01',
    modeling: 'every_tick',
    delayMs: 0,
    initialDeposit: 10000,
    leverage: 500,
    visualMode: false,
    visualSpeed: 8,
  };

  const demoAccount = DEFAULT_ACCOUNTS[0]; // MetaQuotes-Demo ($0 commission)
  const realAccount = DEFAULT_ACCOUNTS[2]; // Exness-MT5Real8 ($7/lot commission)

  const demoReport = runAutomatedBacktest(candles, settings, DEFAULT_EA_INPUTS, demoAccount);
  const realReport = runAutomatedBacktest(candles, settings, DEFAULT_EA_INPUTS, realAccount);

  assert.ok(demoReport.deals.length > 0);
  assert.equal(demoReport.equityCurve.length, candles.length);
  assert.equal(
    Number((demoReport.metrics.initialDeposit + demoReport.metrics.totalNetProfit).toFixed(2)),
    demoReport.metrics.finalBalance
  );

  // Real server charges commission so net profit must be lower than zero-commission Demo
  assert.ok(realReport.deals.every((d) => d.commission < 0));
  assert.ok(demoReport.deals.every((d) => d.commission === 0));
  assert.ok(realReport.metrics.finalBalance < demoReport.metrics.finalBalance);
});

import { normalizeAndValidateHistory, parseMt5HistoryCsv } from './historyLoader';

test('History loader parses authentic MT5 tab-separated CSV exports and repairs OHLC bounds', () => {
  const sampleCsv = [
    '<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>',
    '2025.02.10\t01:00:00\t2850.50\t2855.20\t2848.10\t2854.00\t1420\t0\t22',
    '2025.02.10\t02:00:00\t2854.00\t2853.00\t2856.00\t2855.25\t980\t0\t22',
    '2025.02.10\t01:00:00\t2850.50\t2855.20\t2848.10\t2854.00\t1420\t0\t22',
  ].join('\n');

  const parsed = parseMt5HistoryCsv(sampleCsv, 2);
  assert.equal(parsed.length, 3);

  const normalized = normalizeAndValidateHistory(parsed, 'XAUUSD', 'H1', 'mt5_csv_import');
  // Duplicate timestamp removed -> 2 bars
  assert.equal(normalized.candles.length, 2);
  assert.equal(normalized.summary.source, 'mt5_csv_import');
  for (const bar of normalized.candles) {
    assert.ok(bar.high >= Math.max(bar.open, bar.close));
    assert.ok(bar.low <= Math.min(bar.open, bar.close));
  }
});

import { computePerformanceAnalytics } from './analytics';

test('Performance analytics calculates Sharpe, Sortino, Calmar, underwater drawdown, and monthly totals accurately', () => {
  const candles = generateHistoricalCandles('XAUUSD', 'H1', '2025-01-01', '2025-09-01', 700);
  const settings: BacktestSettings = {
    eaId: 'ma_cross',
    symbol: 'XAUUSD',
    timeframe: 'H1',
    fromDate: '2025-01-01',
    toDate: '2025-09-01',
    modeling: 'every_tick',
    delayMs: 0,
    initialDeposit: 10000,
    leverage: 500,
    visualMode: false,
    visualSpeed: 8,
  };

  const report = runAutomatedBacktest(candles, settings, DEFAULT_EA_INPUTS, DEFAULT_ACCOUNTS[2]);
  const analytics = computePerformanceAnalytics(report);

  assert.equal(analytics.underwaterCurve.length, report.equityCurve.length);
  assert.ok(analytics.underwaterCurve.every((pt) => pt.drawdownPercent >= 0 && pt.drawdownUsd >= 0));
  assert.equal(analytics.winRatePercent, report.metrics.profitTradesPercent);
  assert.equal(analytics.sharpeRatio, report.metrics.sharpeRatio);
  assert.ok(Number.isFinite(analytics.sortinoRatio));
  assert.ok(Number.isFinite(analytics.calmarRatio));

  const monthlySum = analytics.monthlyBreakdown.reduce((acc, m) => acc + m.netProfit, 0);
  assert.ok(Math.abs(monthlySum - report.metrics.totalNetProfit) < 0.05);

  const reasonCountSum = analytics.closeReasonBreakdown.reduce((acc, r) => acc + r.count, 0);
  assert.equal(reasonCountSum, report.metrics.totalTrades);

  // Empty deals edge case should yield clean finite zeros
  const emptyReport = runAutomatedBacktest(
    candles,
    { ...settings, eaId: 'manual_replay' },
    DEFAULT_EA_INPUTS,
    DEFAULT_ACCOUNTS[0]
  );
  const emptyAnalytics = computePerformanceAnalytics(emptyReport);
  assert.equal(emptyAnalytics.winRatePercent, 0);
  assert.equal(emptyAnalytics.sharpeRatio, 0);
  assert.equal(emptyAnalytics.monthlyBreakdown.length, 0);
  assert.equal(emptyAnalytics.tradesPerDay, 0);
  assert.equal(emptyAnalytics.frictionWarning, null);
});

test('Scalping Robot Pro MT5 executes high-frequency trades and suffers edge erosion under Real Ticks variable spread + slippage', () => {
  const candles = generateHistoricalCandles('XAUUSD', 'M1', '2026-01-01', '2026-01-15', 750);
  const scalpInputs = {
    ...DEFAULT_EA_INPUTS,
    lotSize: 0.1,
    stopOrderOffsetPoints: 35,
    slippagePoints: 18,
    stopLossPoints: 180,
    takeProfitPoints: 220,
    trailingStopPoints: 80,
  };

  const idealSettings: BacktestSettings = {
    eaId: 'scalping_pro',
    symbol: 'XAUUSD',
    timeframe: 'M1',
    fromDate: '2026-01-01',
    toDate: '2026-01-15',
    modeling: 'every_tick',
    delayMs: 0,
    initialDeposit: 10000,
    leverage: 500,
    visualMode: false,
    visualSpeed: 8,
  };

  const realTickSettings: BacktestSettings = {
    ...idealSettings,
    modeling: 'real_ticks_slippage',
  };

  const idealReport = runAutomatedBacktest(candles, idealSettings, scalpInputs, DEFAULT_ACCOUNTS[0]);
  const realTickReport = runAutomatedBacktest(candles, realTickSettings, scalpInputs, DEFAULT_ACCOUNTS[0]);

  assert.ok(idealReport.deals.length > 20, 'Scalping Pro should produce frequent trades');
  assert.ok(realTickReport.metrics.ticksModeled > idealReport.metrics.ticksModeled);
  assert.ok(
    realTickReport.metrics.finalBalance < idealReport.metrics.finalBalance,
    'Real Ticks variable spread & slippage must reduce net profit vs ideal modeling'
  );

  // Custom bot override runs identical strategy deterministically
  const customBotReport = runAutomatedBacktest(
    candles,
    { ...idealSettings, eaId: 'custom_bot_myscalper' },
    scalpInputs,
    DEFAULT_ACCOUNTS[0],
    'scalping_pro'
  );
  assert.equal(customBotReport.deals.length, idealReport.deals.length);
  assert.equal(customBotReport.metrics.finalBalance, idealReport.metrics.finalBalance);

  const realAnalytics = computePerformanceAnalytics(realTickReport);
  assert.ok(realAnalytics.tradesPerDay > 0);
  assert.ok(realAnalytics.frictionWarning !== null);
});

import {
  buildOpenApiSpec,
  executeExternalAiBacktest,
  executeExternalAiSweep,
  verifyExternalApiAuth,
} from './externalApi';

test('External AI 24/24 API runs backtests, parameter sweeps, OpenAPI spec, and optional Bearer auth cleanly', () => {
  const res = executeExternalAiBacktest({
    strategy: 'scalping_pro',
    symbol: 'XAUUSD',
    timeframe: 'M1',
    modeling: 'real_ticks_slippage',
    accountType: 'real',
    initialDeposit: 10000,
    includeDeals: false,
  });

  assert.equal(res.ok, true);
  assert.equal(res.meta.strategy, 'scalping_pro');
  assert.equal(res.meta.accountType, 'real');
  assert.ok(res.metrics.totalTrades > 0);
  assert.equal(typeof res.analytics.sharpeRatio, 'number');
  assert.equal(res.deals, undefined);

  const sweep = executeExternalAiSweep({
    strategy: 'ma_cross',
    symbol: 'EURUSD',
    timeframe: 'H1',
    sortBy: 'sharpeRatio',
    grid: {
      fastMaPeriod: [8, 12],
      slowMaPeriod: [21, 30],
    },
  });
  assert.equal(sweep.ok, true);
  assert.equal(sweep.totalRuns, 4);
  assert.ok(sweep.bestRun !== null);
  assert.ok(sweep.runs[0].sharpeRatio >= sweep.runs[1].sharpeRatio);

  const spec = buildOpenApiSpec('https://example.run.app');
  assert.equal(spec.openapi, '3.1.0');
  assert.ok('/api/v1/ai/backtest' in spec.paths);
  assert.ok('/api/v1/ai/sweep' in spec.paths);

  // Open mode by default when MT5_AI_API_KEY is unset
  const openAuth = verifyExternalApiAuth({ get: () => null });
  assert.equal(openAuth.authorized, true);
  assert.equal(openAuth.authMode, 'open');
});

import {
  aggregateHourlyToH4,
  parseDateRangeSeconds,
  sanitizeBridgeUrl,
  subdivideParentCandles,
} from './liveFeed';
import {
  evaluateKronosBarSignal,
  KRONOS_MODEL_ZOO,
  runLocalKronosForecast,
} from './kronosEngine';
import { getSymbolSpec } from './marketData';

test('liveFeed helpers sanitize bridge URLs, parse [fromDate..toDate], aggregate H4, and subdivide H1 to M15 across full range', () => {
  assert.equal(sanitizeBridgeUrl('http://127.0.0.1:8787///'), 'http://127.0.0.1:8787');
  assert.equal(sanitizeBridgeUrl('ftp://invalid.host'), null);
  assert.equal(sanitizeBridgeUrl('   '), null);

  const range = parseDateRangeSeconds('2026-06-01', '2026-11-18');
  assert.ok(range.endSec > range.startSec);
  const spanDays = (range.endSec - range.startSec) / 86400;
  assert.ok(spanDays > 165 && spanDays < 175);

  const h1Bars = generateHistoricalCandles('XAUUSD', 'H1', '2026-06-01', '2026-06-15', 96);
  const h4Bars = aggregateHourlyToH4(h1Bars, 2);
  assert.ok(h4Bars.length > 0 && h4Bars.length <= Math.ceil(h1Bars.length / 4) + 1);
  for (const bar of h4Bars) {
    assert.ok(bar.high >= Math.max(bar.open, bar.close));
    assert.ok(bar.low <= Math.min(bar.open, bar.close));
  }

  const m15Subdivided = subdivideParentCandles(h1Bars, 3600, 'M15', 2, 1000);
  assert.equal(m15Subdivided.length, h1Bars.length * 4);
  assert.equal(m15Subdivided[0].time, h1Bars[0].time);
  for (const bar of m15Subdivided) {
    assert.ok(bar.high >= Math.max(bar.open, bar.close));
    assert.ok(bar.low <= Math.min(bar.open, bar.close));
  }
});

test('Kronos AI local quantized forecaster produces valid OHLCV bars, P10/P90 uncertainty bands, and causal EA signals', () => {
  assert.equal(KRONOS_MODEL_ZOO.length, 3);
  const candles = generateHistoricalCandles('XAUUSD', 'H1', '2026-06-01', '2026-11-18', 300);

  const f1 = runLocalKronosForecast({
    candles,
    symbol: 'XAUUSD',
    timeframe: 'H1',
    modelVariant: 'kronos-small',
    lookback: 256,
    predLen: 24,
    temperature: 1.0,
    topP: 0.9,
    sampleCount: 7,
  });
  const f2 = runLocalKronosForecast({
    candles,
    symbol: 'XAUUSD',
    timeframe: 'H1',
    modelVariant: 'kronos-small',
    lookback: 256,
    predLen: 24,
    temperature: 1.0,
    topP: 0.9,
    sampleCount: 7,
  });

  assert.equal(f1.ok, true);
  assert.equal(f1.forecastCandles.length, 24);
  assert.deepEqual(f1.forecastCandles, f2.forecastCandles);
  assert.ok(['BUY', 'SELL', 'HOLD'].includes(f1.tradeSignal.action));
  assert.ok(f1.tradeSignal.entryPrice > 0);
  assert.ok(f1.tradeSignal.riskRewardRatio >= 0);
  if (f1.tradeSignal.action === 'BUY') {
    assert.ok(f1.tradeSignal.stopLoss < f1.tradeSignal.entryPrice);
    assert.ok(f1.tradeSignal.takeProfit > f1.tradeSignal.entryPrice);
  } else if (f1.tradeSignal.action === 'SELL') {
    assert.ok(f1.tradeSignal.stopLoss > f1.tradeSignal.entryPrice);
    assert.ok(f1.tradeSignal.takeProfit < f1.tradeSignal.entryPrice);
  }

  const lastHistTime = candles[candles.length - 1].time;
  for (let idx = 0; idx < f1.forecastCandles.length; idx += 1) {
    const fc = f1.forecastCandles[idx];
    assert.equal(fc.time, lastHistTime + (idx + 1) * 3600);
    assert.ok(fc.high >= Math.max(fc.open, fc.close));
    assert.ok(fc.low <= Math.min(fc.open, fc.close));
    assert.ok(fc.p10 <= fc.p90);
    assert.ok(fc.volume >= 1);
  }

  // Causal walk-forward signal check (index < 48 returns null, valid bars return buy/sell/null)
  const spec = getSymbolSpec('XAUUSD');
  assert.equal(evaluateKronosBarSignal(candles, 10, spec), null);
  const signals = candles.map((_, idx) => evaluateKronosBarSignal(candles, idx, spec));
  assert.ok(signals.some((s) => s === 'buy' || s === 'sell'));
});

test('kronos_forecast strategy runs end-to-end in Backtest Engine and 24/24 External AI API', () => {
  const candles = generateHistoricalCandles('BTCUSD', 'H1', '2026-06-01', '2026-11-18', 500);
  const settings: BacktestSettings = {
    eaId: 'kronos_forecast',
    symbol: 'BTCUSD',
    timeframe: 'H1',
    fromDate: '2026-06-01',
    toDate: '2026-11-18',
    modeling: 'every_tick',
    delayMs: 0,
    initialDeposit: 10000,
    leverage: 500,
    visualMode: false,
    visualSpeed: 8,
  };

  const report = runAutomatedBacktest(candles, settings, DEFAULT_EA_INPUTS, DEFAULT_ACCOUNTS[0]);
  assert.equal(report.equityCurve.length, candles.length);
  assert.ok(report.deals.length > 0, 'kronos_forecast EA should execute trades across 500 H1 bars');

  const apiRes = executeExternalAiBacktest({
    strategy: 'kronos_forecast',
    symbol: 'XAUUSD',
    timeframe: 'H1',
    fromDate: '2026-06-01',
    toDate: '2026-11-18',
  });
  assert.equal(apiRes.ok, true);
  assert.equal(apiRes.meta.strategy, 'kronos_forecast');
  assert.equal(apiRes.meta.fromDate, '2026-06-01');
  assert.equal(apiRes.meta.toDate, '2026-11-18');
});



