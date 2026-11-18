import { computePerformanceAnalytics, type PerformanceAnalytics } from './analytics';
import { runAutomatedBacktest } from './backtestEngine';
import {
  loadBrokerHistoricalData,
  type LoadedHistoryResult,
  normalizeAndValidateHistory,
} from './historyLoader';
import { fetchLiveHistoricalCandles } from './liveFeed';
import {
  BROKER_SERVERS,
  DEFAULT_ACCOUNTS,
  DEFAULT_EA_INPUTS,
  EA_STRATEGIES,
  MT5_SYMBOLS,
} from './marketData';
import type {
  AccountType,
  BacktestMetrics,
  BacktestReport,
  BacktestSettings,
  Candle,
  EaInputParams,
  EaStrategyId,
  ModelingMode,
  Mt5Account,
  Timeframe,
} from './types';

export type ExternalStrategy = Exclude<EaStrategyId, 'manual_replay'>;

export interface ExternalBacktestRequest {
  strategy?: ExternalStrategy;
  strategyId?: ExternalStrategy;
  eaId?: ExternalStrategy;
  symbol?: string;
  timeframe?: Timeframe;
  fromDate?: string;
  toDate?: string;
  modeling?: ModelingMode;
  accountType?: AccountType;
  serverId?: string;
  initialDeposit?: number;
  leverage?: number;
  maxBars?: number;
  barsCount?: number;
  inputs?: Partial<EaInputParams>;
  customCandles?: Candle[];
  bridgeUrl?: string;
  bridgeToken?: string;
  includeDeals?: boolean;
  includeEquityCurve?: boolean;
}

export interface ExternalBacktestResponse {
  ok: true;
  meta: {
    engine: string;
    strategy: ExternalStrategy;
    symbol: string;
    timeframe: Timeframe;
    fromDate: string;
    toDate: string;
    modeling: ModelingMode;
    accountType: AccountType;
    serverName: string;
    commissionPerLotUsd: number;
    dataSource?: string;
    latestPrice?: number;
    barsProcessed: number;
    executionTimeMs: number;
  };
  metrics: BacktestMetrics;
  analytics: Omit<PerformanceAnalytics, 'underwaterCurve'> & {
    underwaterPointsCount: number;
  };
  deals?: BacktestReport['deals'];
  equityCurve?: BacktestReport['equityCurve'];
}

export interface ExternalSweepRequest extends ExternalBacktestRequest {
  sortBy?: 'sharpeRatio' | 'totalNetProfit' | 'profitFactor' | 'winRatePercent';
  grid: {
    stopLossPoints?: number[];
    takeProfitPoints?: number[];
    fastMaPeriod?: number[];
    fastPeriod?: number[];
    slowMaPeriod?: number[];
    slowPeriod?: number[];
    lotSize?: number[];
    modeling?: ModelingMode[];
    timeframe?: Timeframe[];
  };
}

export const AI_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
};

const VALID_STRATEGIES = new Set<ExternalStrategy>([
  'ma_cross',
  'rsi_reversion',
  'donchian_breakout',
  'scalping_pro',
  'kronos_forecast',
]);

const VALID_TIMEFRAMES = new Set<Timeframe>([
  'M1',
  'M5',
  'M15',
  'M30',
  'H1',
  'H4',
  'D1',
  'W1',
  'MN',
]);

const VALID_MODELING = new Set<ModelingMode>([
  'every_tick',
  'real_ticks_slippage',
  'ohlc_m1',
  'open_prices',
]);

export function verifyExternalApiAuth(headers: {
  get: (name: string) => string | null;
}): { authorized: boolean; authMode: 'open' | 'bearer_required'; error?: string } {
  const configuredKey = process.env.MT5_AI_API_KEY?.trim();
  if (!configuredKey) {
    return { authorized: true, authMode: 'open' };
  }

  const authHeader = headers.get('authorization')?.trim() ?? '';
  const xApiKey = headers.get('x-api-key')?.trim() ?? '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (bearerToken === configuredKey || xApiKey === configuredKey) {
    return { authorized: true, authMode: 'bearer_required' };
  }

  return {
    authorized: false,
    authMode: 'bearer_required',
    error: 'Unauthorized: Missing or invalid Bearer token / X-API-Key for MT5 AI API.',
  };
}

function resolveAccountForRequest(req: ExternalBacktestRequest): Mt5Account {
  const accType: AccountType = req.accountType === 'real' ? 'real' : 'demo';
  const matched =
    (req.serverId
      ? DEFAULT_ACCOUNTS.find((a) => a.serverId === req.serverId)
      : undefined) ??
    DEFAULT_ACCOUNTS.find((a) => a.accountType === accType) ??
    DEFAULT_ACCOUNTS[0];

  const server =
    BROKER_SERVERS.find((s) => s.id === (req.serverId ?? matched.serverId)) ??
    BROKER_SERVERS.find((s) => s.accountType === accType) ??
    BROKER_SERVERS[0];

  const deposit = Math.max(100, Math.min(10_000_000, Number(req.initialDeposit) || matched.balance));
  const leverage = Math.max(10, Math.min(3000, Number(req.leverage) || matched.leverage));

  return {
    ...matched,
    serverId: server.id,
    serverName: server.name,
    company: server.company,
    accountType: server.accountType,
    balance: deposit,
    leverage,
  };
}

export function normalizeExternalBacktestParams(raw: ExternalBacktestRequest): {
  strategy: ExternalStrategy;
  settings: BacktestSettings;
  inputs: EaInputParams;
  account: Mt5Account;
  maxBars: number;
  customCandles: Candle[] | null;
  includeDeals: boolean;
  includeEquityCurve: boolean;
} {
  const rawStrategy = raw.strategy ?? raw.strategyId ?? raw.eaId;
  const strategy: ExternalStrategy =
    rawStrategy && VALID_STRATEGIES.has(rawStrategy) ? rawStrategy : 'ma_cross';

  const symbolUpper = (raw.symbol ?? 'XAUUSD').trim().toUpperCase();
  const knownSymbol = MT5_SYMBOLS.find((s) => s.symbol === symbolUpper)?.symbol ?? 'XAUUSD';

  const timeframe: Timeframe =
    raw.timeframe && VALID_TIMEFRAMES.has(raw.timeframe) ? raw.timeframe : 'H1';

  const modeling: ModelingMode =
    raw.modeling && VALID_MODELING.has(raw.modeling) ? raw.modeling : 'every_tick';

  const fromDate = raw.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(raw.fromDate)
    ? raw.fromDate
    : '2026-06-01';
  const toDate = raw.toDate && /^\d{4}-\d{2}-\d{2}$/.test(raw.toDate)
    ? raw.toDate
    : '2026-11-18';

  const account = resolveAccountForRequest(raw);
  const strategyDefaults =
    EA_STRATEGIES.find((s) => s.id === strategy)?.defaultInputs ?? {};

  const inputs: EaInputParams = {
    ...DEFAULT_EA_INPUTS,
    ...strategyDefaults,
    ...(raw.inputs ?? {}),
  };

  const settings: BacktestSettings = {
    eaId: strategy,
    symbol: knownSymbol,
    timeframe,
    fromDate,
    toDate,
    modeling,
    delayMs: 0,
    initialDeposit: account.balance,
    leverage: account.leverage,
    visualMode: false,
    visualSpeed: 8,
  };

  const maxBars = Math.max(120, Math.min(8000, Number(raw.maxBars ?? raw.barsCount) || 4500));
  const customCandles =
    Array.isArray(raw.customCandles) && raw.customCandles.length >= 30
      ? raw.customCandles
      : null;

  return {
    strategy,
    settings,
    inputs,
    account,
    maxBars,
    customCandles,
    includeDeals: Boolean(raw.includeDeals),
    includeEquityCurve: Boolean(raw.includeEquityCurve),
  };
}

function buildBacktestApiResponse(
  strategy: ExternalStrategy,
  settings: BacktestSettings,
  inputs: EaInputParams,
  account: Mt5Account,
  loaded: LoadedHistoryResult,
  includeDeals: boolean,
  includeEquityCurve: boolean
): ExternalBacktestResponse {
  const report = runAutomatedBacktest(loaded.candles, settings, inputs, account, strategy);
  const fullAnalytics = computePerformanceAnalytics(report);
  const { underwaterCurve, ...analyticsSummary } = fullAnalytics;
  const server = BROKER_SERVERS.find((s) => s.id === account.serverId) ?? BROKER_SERVERS[0];
  const lastCandle = loaded.candles[loaded.candles.length - 1];

  const response: ExternalBacktestResponse = {
    ok: true,
    meta: {
      engine: 'MT5 Strategy Tester Engine v4620',
      strategy,
      symbol: settings.symbol,
      timeframe: settings.timeframe,
      fromDate: settings.fromDate,
      toDate: settings.toDate,
      modeling: settings.modeling,
      accountType: account.accountType,
      serverName: account.serverName,
      commissionPerLotUsd: server.commissionPerLot,
      dataSource: loaded.summary.providerName ?? loaded.summary.source,
      latestPrice: lastCandle?.close,
      barsProcessed: loaded.candles.length,
      executionTimeMs: report.metrics.executionTimeMs,
    },
    metrics: report.metrics,
    analytics: {
      ...analyticsSummary,
      underwaterPointsCount: underwaterCurve.length,
    },
  };

  if (includeDeals) {
    response.deals = report.deals;
  }
  if (includeEquityCurve) {
    response.equityCurve = report.equityCurve;
  }

  return response;
}

export function executeExternalAiBacktest(
  raw: ExternalBacktestRequest
): ExternalBacktestResponse {
  const {
    strategy,
    settings,
    inputs,
    account,
    maxBars,
    customCandles,
    includeDeals,
    includeEquityCurve,
  } = normalizeExternalBacktestParams(raw);

  const loaded = customCandles
    ? normalizeAndValidateHistory(
        customCandles,
        settings.symbol,
        settings.timeframe,
        'mt5_csv_import'
      )
    : loadBrokerHistoricalData(
        settings.symbol,
        settings.timeframe,
        settings.fromDate,
        settings.toDate,
        maxBars
      );

  return buildBacktestApiResponse(
    strategy,
    settings,
    inputs,
    account,
    loaded,
    includeDeals,
    includeEquityCurve
  );
}

export async function executeExternalAiBacktestLive(
  raw: ExternalBacktestRequest
): Promise<ExternalBacktestResponse> {
  const {
    strategy,
    settings,
    inputs,
    account,
    maxBars,
    customCandles,
    includeDeals,
    includeEquityCurve,
  } = normalizeExternalBacktestParams(raw);

  const loaded = customCandles
    ? normalizeAndValidateHistory(
        customCandles,
        settings.symbol,
        settings.timeframe,
        'mt5_csv_import'
      )
    : await fetchLiveHistoricalCandles({
        symbol: settings.symbol,
        timeframe: settings.timeframe,
        fromDate: settings.fromDate,
        toDate: settings.toDate,
        maxBars,
        bridgeUrl: raw.bridgeUrl,
        bridgeToken: raw.bridgeToken,
      });

  return buildBacktestApiResponse(
    strategy,
    settings,
    inputs,
    account,
    loaded,
    includeDeals,
    includeEquityCurve
  );
}

export function executeExternalAiSweep(raw: ExternalSweepRequest): {
  ok: true;
  totalRuns: number;
  sortBy: string;
  bestRun: {
    params: Record<string, string | number>;
    metrics: BacktestMetrics;
    analytics: ExternalBacktestResponse['analytics'];
  } | null;
  runs: Array<{
    rank: number;
    params: Record<string, string | number>;
    totalNetProfit: number;
    sharpeRatio: number;
    profitFactor: number;
    winRatePercent: number;
    maxDrawdownPercent: number;
    totalTrades: number;
    expectancyUsd: number;
  }>;
} {
  const slList = raw.grid?.stopLossPoints?.length ? raw.grid.stopLossPoints : [undefined];
  const tpList = raw.grid?.takeProfitPoints?.length ? raw.grid.takeProfitPoints : [undefined];
  const fastSrc = raw.grid?.fastMaPeriod?.length ? raw.grid.fastMaPeriod : raw.grid?.fastPeriod;
  const fastList = fastSrc?.length ? fastSrc : [undefined];
  const slowSrc = raw.grid?.slowMaPeriod?.length ? raw.grid.slowMaPeriod : raw.grid?.slowPeriod;
  const slowList = slowSrc?.length ? slowSrc : [undefined];
  const lotList = raw.grid?.lotSize?.length ? raw.grid.lotSize : [undefined];
  const modelingList = raw.grid?.modeling?.length ? raw.grid.modeling : [undefined];
  const tfList = raw.grid?.timeframe?.length ? raw.grid.timeframe : [undefined];

  const combinations: Array<{
    params: Record<string, string | number>;
    req: ExternalBacktestRequest;
  }> = [];

  const MAX_RUNS = 24;

  outer: for (const timeframe of tfList) {
    for (const modeling of modelingList) {
      for (const lotSize of lotList) {
        for (const fastMaPeriod of fastList) {
          for (const slowMaPeriod of slowList) {
            for (const stopLossPoints of slList) {
              for (const takeProfitPoints of tpList) {
                const paramPatch: Record<string, string | number> = {};
                const inputPatch: Partial<EaInputParams> = { ...(raw.inputs ?? {}) };

                if (timeframe !== undefined) paramPatch.timeframe = timeframe;
                if (modeling !== undefined) paramPatch.modeling = modeling;
                if (lotSize !== undefined) {
                  paramPatch.lotSize = lotSize;
                  inputPatch.lotSize = lotSize;
                }
                if (fastMaPeriod !== undefined) {
                  paramPatch.fastMaPeriod = fastMaPeriod;
                  inputPatch.fastMaPeriod = fastMaPeriod;
                }
                if (slowMaPeriod !== undefined) {
                  paramPatch.slowMaPeriod = slowMaPeriod;
                  inputPatch.slowMaPeriod = slowMaPeriod;
                }
                if (stopLossPoints !== undefined) {
                  paramPatch.stopLossPoints = stopLossPoints;
                  inputPatch.stopLossPoints = stopLossPoints;
                }
                if (takeProfitPoints !== undefined) {
                  paramPatch.takeProfitPoints = takeProfitPoints;
                  inputPatch.takeProfitPoints = takeProfitPoints;
                }

                combinations.push({
                  params: paramPatch,
                  req: {
                    ...raw,
                    timeframe: timeframe ?? raw.timeframe,
                    modeling: modeling ?? raw.modeling,
                    inputs: inputPatch,
                    includeDeals: false,
                    includeEquityCurve: false,
                  },
                });

                if (combinations.length >= MAX_RUNS) break outer;
              }
            }
          }
        }
      }
    }
  }

  const sortBy = raw.sortBy ?? 'sharpeRatio';
  const evaluated = combinations.map((c) => {
    const res = executeExternalAiBacktest(c.req);
    return {
      params: c.params,
      res,
    };
  });

  evaluated.sort((a, b) => {
    if (sortBy === 'totalNetProfit') {
      return b.res.metrics.totalNetProfit - a.res.metrics.totalNetProfit;
    }
    if (sortBy === 'profitFactor') {
      return b.res.metrics.profitFactor - a.res.metrics.profitFactor;
    }
    if (sortBy === 'winRatePercent') {
      return b.res.analytics.winRatePercent - a.res.analytics.winRatePercent;
    }
    return b.res.analytics.sharpeRatio - a.res.analytics.sharpeRatio;
  });

  const best = evaluated[0] ?? null;

  return {
    ok: true,
    totalRuns: evaluated.length,
    sortBy,
    bestRun: best
      ? {
          params: best.params,
          metrics: best.res.metrics,
          analytics: best.res.analytics,
        }
      : null,
    runs: evaluated.map((item, idx) => ({
      rank: idx + 1,
      params: item.params,
      totalNetProfit: item.res.metrics.totalNetProfit,
      sharpeRatio: item.res.analytics.sharpeRatio,
      profitFactor: item.res.metrics.profitFactor,
      winRatePercent: item.res.analytics.winRatePercent,
      maxDrawdownPercent: item.res.analytics.maxEquityDrawdownPercent,
      totalTrades: item.res.metrics.totalTrades,
      expectancyUsd: item.res.analytics.expectancyUsd,
    })),
  };
}

export async function executeExternalAiSweepLive(raw: ExternalSweepRequest) {
  const distinctTfs = Array.from(
    new Set(
      raw.grid?.timeframe?.length
        ? raw.grid.timeframe
        : [raw.timeframe ?? 'H1']
    )
  ) as Timeframe[];

  const normalized = normalizeExternalBacktestParams(raw);
  const candleCache = new Map<Timeframe, Candle[]>();

  if (!normalized.customCandles) {
    await Promise.all(
      distinctTfs.map(async (tf) => {
        const loaded = await fetchLiveHistoricalCandles({
          symbol: normalized.settings.symbol,
          timeframe: tf,
          fromDate: normalized.settings.fromDate,
          toDate: normalized.settings.toDate,
          maxBars: normalized.maxBars,
          bridgeUrl: raw.bridgeUrl,
          bridgeToken: raw.bridgeToken,
        });
        candleCache.set(tf, loaded.candles);
      })
    );
  }

  // Temporarily evaluate using pre-fetched live candles when grid uses single timeframe or per-tf fallback
  const slList = raw.grid?.stopLossPoints?.length ? raw.grid.stopLossPoints : [undefined];
  const tpList = raw.grid?.takeProfitPoints?.length ? raw.grid.takeProfitPoints : [undefined];
  const fastSrc = raw.grid?.fastMaPeriod?.length ? raw.grid.fastMaPeriod : raw.grid?.fastPeriod;
  const fastList = fastSrc?.length ? fastSrc : [undefined];
  const slowSrc = raw.grid?.slowMaPeriod?.length ? raw.grid.slowMaPeriod : raw.grid?.slowPeriod;
  const slowList = slowSrc?.length ? slowSrc : [undefined];
  const lotList = raw.grid?.lotSize?.length ? raw.grid.lotSize : [undefined];
  const modelingList = raw.grid?.modeling?.length ? raw.grid.modeling : [undefined];
  const tfList = raw.grid?.timeframe?.length ? raw.grid.timeframe : [undefined];

  const combinations: Array<{
    params: Record<string, string | number>;
    req: ExternalBacktestRequest;
  }> = [];
  const MAX_RUNS = 24;

  outer: for (const timeframe of tfList) {
    for (const modeling of modelingList) {
      for (const lotSize of lotList) {
        for (const fastMaPeriod of fastList) {
          for (const slowMaPeriod of slowList) {
            for (const stopLossPoints of slList) {
              for (const takeProfitPoints of tpList) {
                const paramPatch: Record<string, string | number> = {};
                const inputPatch: Partial<EaInputParams> = { ...(raw.inputs ?? {}) };
                if (timeframe !== undefined) paramPatch.timeframe = timeframe;
                if (modeling !== undefined) paramPatch.modeling = modeling;
                if (lotSize !== undefined) {
                  paramPatch.lotSize = lotSize;
                  inputPatch.lotSize = lotSize;
                }
                if (fastMaPeriod !== undefined) {
                  paramPatch.fastMaPeriod = fastMaPeriod;
                  inputPatch.fastMaPeriod = fastMaPeriod;
                }
                if (slowMaPeriod !== undefined) {
                  paramPatch.slowMaPeriod = slowMaPeriod;
                  inputPatch.slowMaPeriod = slowMaPeriod;
                }
                if (stopLossPoints !== undefined) {
                  paramPatch.stopLossPoints = stopLossPoints;
                  inputPatch.stopLossPoints = stopLossPoints;
                }
                if (takeProfitPoints !== undefined) {
                  paramPatch.takeProfitPoints = takeProfitPoints;
                  inputPatch.takeProfitPoints = takeProfitPoints;
                }

                const effTf = (timeframe ?? normalized.settings.timeframe) as Timeframe;
                const cachedCandles = normalized.customCandles ?? candleCache.get(effTf);

                combinations.push({
                  params: paramPatch,
                  req: {
                    ...raw,
                    timeframe: effTf,
                    modeling: modeling ?? raw.modeling,
                    inputs: inputPatch,
                    customCandles: cachedCandles,
                    includeDeals: false,
                    includeEquityCurve: false,
                  },
                });
                if (combinations.length >= MAX_RUNS) break outer;
              }
            }
          }
        }
      }
    }
  }

  const sortBy = raw.sortBy ?? 'sharpeRatio';
  const evaluated = combinations.map((c) => ({
    params: c.params,
    res: executeExternalAiBacktest(c.req),
  }));

  evaluated.sort((a, b) => {
    if (sortBy === 'totalNetProfit') return b.res.metrics.totalNetProfit - a.res.metrics.totalNetProfit;
    if (sortBy === 'profitFactor') return b.res.metrics.profitFactor - a.res.metrics.profitFactor;
    if (sortBy === 'winRatePercent') return b.res.analytics.winRatePercent - a.res.analytics.winRatePercent;
    return b.res.analytics.sharpeRatio - a.res.analytics.sharpeRatio;
  });

  const best = evaluated[0] ?? null;
  return {
    ok: true as const,
    totalRuns: evaluated.length,
    sortBy,
    bestRun: best
      ? { params: best.params, metrics: best.res.metrics, analytics: best.res.analytics }
      : null,
    runs: evaluated.map((item, idx) => ({
      rank: idx + 1,
      params: item.params,
      totalNetProfit: item.res.metrics.totalNetProfit,
      sharpeRatio: item.res.analytics.sharpeRatio,
      profitFactor: item.res.metrics.profitFactor,
      winRatePercent: item.res.analytics.winRatePercent,
      maxDrawdownPercent: item.res.analytics.maxEquityDrawdownPercent,
      totalTrades: item.res.metrics.totalTrades,
      expectancyUsd: item.res.analytics.expectancyUsd,
    })),
  };
}

export function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'MetaTrader 5 Backtest & Quant Analytics API (24/24 External AI Ready)',
      version: '1.0.0',
      description:
        'REST API & MCP-ready endpoints allowing external AI agents to run MT5 Real/Demo backtests, parameter sweeps, and fetch historical OHLCV market candles 24/24.',
    },
    servers: [{ url: baseUrl, description: 'MT5 Strategy Tester Server' }],
    paths: {
      '/api/v1/ai/health': {
        get: {
          operationId: 'getBacktestCapabilities',
          summary: 'Check 24/24 availability, supported symbols, timeframes, strategies, and servers',
          responses: { '200': { description: 'Capabilities metadata' } },
        },
      },
      '/api/v1/ai/backtest': {
        post: {
          operationId: 'runMt5Backtest',
          summary: 'Execute a single MT5 strategy backtest and return metrics + quant analytics',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    strategy: {
                      type: 'string',
                      enum: [
                        'ma_cross',
                        'rsi_reversion',
                        'donchian_breakout',
                        'scalping_pro',
                        'kronos_forecast',
                      ],
                      default: 'scalping_pro',
                    },
                    symbol: {
                      type: 'string',
                      enum: MT5_SYMBOLS.map((s) => s.symbol),
                      default: 'XAUUSD',
                    },
                    timeframe: {
                      type: 'string',
                      enum: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'],
                      default: 'H1',
                    },
                    fromDate: { type: 'string', default: '2026-06-01' },
                    toDate: { type: 'string', default: '2026-11-18' },
                    modeling: {
                      type: 'string',
                      enum: ['every_tick', 'real_ticks_slippage', 'ohlc_m1', 'open_prices'],
                      default: 'real_ticks_slippage',
                    },
                    accountType: { type: 'string', enum: ['demo', 'real'], default: 'real' },
                    initialDeposit: { type: 'number', default: 10000 },
                    leverage: { type: 'number', default: 500 },
                    includeDeals: { type: 'boolean', default: false },
                    includeEquityCurve: { type: 'boolean', default: false },
                    inputs: {
                      type: 'object',
                      properties: {
                        lotSize: { type: 'number', default: 0.1 },
                        fastMaPeriod: { type: 'integer', default: 12 },
                        slowMaPeriod: { type: 'integer', default: 26 },
                        rsiPeriod: { type: 'integer', default: 14 },
                        stopLossPoints: { type: 'integer', default: 450 },
                        takeProfitPoints: { type: 'integer', default: 900 },
                        trailingStopPoints: { type: 'integer', default: 250 },
                        slippagePoints: { type: 'integer', default: 12 },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Backtest metrics and performance analytics' } },
        },
      },
      '/api/v1/ai/sweep': {
        post: {
          operationId: 'optimizeMt5Parameters',
          summary: 'Run batch parameter sweep (up to 24 combinations) ranked by Sharpe, Profit, or PF',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    strategy: { type: 'string', default: 'ma_cross' },
                    symbol: { type: 'string', default: 'XAUUSD' },
                    sortBy: {
                      type: 'string',
                      enum: ['sharpeRatio', 'totalNetProfit', 'profitFactor', 'winRatePercent'],
                    },
                    grid: {
                      type: 'object',
                      properties: {
                        stopLossPoints: { type: 'array', items: { type: 'integer' } },
                        takeProfitPoints: { type: 'array', items: { type: 'integer' } },
                        fastMaPeriod: { type: 'array', items: { type: 'integer' } },
                        slowMaPeriod: { type: 'array', items: { type: 'integer' } },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Ranked optimization results' } },
        },
      },
      '/api/v1/ai/kronos': {
        post: {
          operationId: 'predictKronosCandles',
          summary:
            'Run Kronos K-Line Foundation Model forecast (NeoQuasar/Kronos-mini/small/base) on live MT5 OHLCV bars',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    symbol: { type: 'string', default: 'XAUUSD' },
                    timeframe: { type: 'string', default: 'H1' },
                    modelVariant: {
                      type: 'string',
                      enum: ['kronos-mini', 'kronos-small', 'kronos-base'],
                      default: 'kronos-small',
                    },
                    lookback: { type: 'integer', default: 256 },
                    predLen: { type: 'integer', default: 24 },
                    temperature: { type: 'number', default: 1.0 },
                    topP: { type: 'number', default: 0.9 },
                    sampleCount: { type: 'integer', default: 7 },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Predicted OHLCV K-lines and P10-P90 bands' } },
        },
      },
      '/api/mt5/history': {
        get: {
          operationId: 'getMt5HistoricalCandles',
          summary: 'Load historical OHLCV bars for any MT5 symbol & timeframe',
          parameters: [
            { name: 'symbol', in: 'query', schema: { type: 'string', default: 'XAUUSD' } },
            { name: 'timeframe', in: 'query', schema: { type: 'string', default: 'H1' } },
            { name: 'fromDate', in: 'query', schema: { type: 'string', default: '2026-06-01' } },
            { name: 'toDate', in: 'query', schema: { type: 'string', default: '2026-11-18' } },
          ],
          responses: { '200': { description: 'OHLCV candles array and dataset summary' } },
        },
      },
    },
  };
}

export const MCP_TOOLS_DEFINITION = [
  {
    name: 'mt5_run_backtest',
    description:
      'Run a MetaTrader 5 Real/Demo strategy backtest and return Net Profit, Sharpe Ratio, Sortino, Drawdown, Win Rate, and Quant Friction Audit.',
    inputSchema: {
      type: 'object',
      properties: {
        strategy: {
          type: 'string',
          enum: [
            'ma_cross',
            'rsi_reversion',
            'donchian_breakout',
            'scalping_pro',
            'kronos_forecast',
          ],
        },
        symbol: { type: 'string' },
        timeframe: { type: 'string' },
        modeling: {
          type: 'string',
          enum: ['every_tick', 'real_ticks_slippage', 'ohlc_m1', 'open_prices'],
        },
        accountType: { type: 'string', enum: ['demo', 'real'] },
        initialDeposit: { type: 'number' },
        inputs: { type: 'object' },
      },
    },
  },
  {
    name: 'mt5_optimize_parameters',
    description:
      'Execute a batch parameter grid sweep (up to 24 combinations) and rank configurations by Sharpe Ratio or Net Profit.',
    inputSchema: {
      type: 'object',
      required: ['grid'],
      properties: {
        strategy: { type: 'string' },
        symbol: { type: 'string' },
        timeframe: { type: 'string' },
        sortBy: { type: 'string' },
        grid: { type: 'object' },
      },
    },
  },
  {
    name: 'mt5_get_market_history',
    description: 'Fetch historical OHLCV bars and spread/contract metadata for an MT5 symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        timeframe: { type: 'string' },
        fromDate: { type: 'string' },
        toDate: { type: 'string' },
        maxBars: { type: 'integer' },
      },
    },
  },
  {
    name: 'kronos_predict_kline',
    description:
      'Run shiyu-coder/Kronos Foundation Model K-Line forecasting on live MT5 OHLCV candlesticks to generate future predicted OHLCV bars, P10/P90 uncertainty bands, and directional bias.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        timeframe: { type: 'string' },
        modelVariant: {
          type: 'string',
          enum: ['kronos-mini', 'kronos-small', 'kronos-base'],
        },
        lookback: { type: 'integer' },
        predLen: { type: 'integer' },
        temperature: { type: 'number' },
        topP: { type: 'number' },
        sampleCount: { type: 'integer' },
        kronosServerUrl: { type: 'string' },
      },
    },
  },
];
