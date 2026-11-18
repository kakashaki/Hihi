export type AccountType = 'real' | 'demo';

export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1' | 'MN';

export type ChartStyle = 'candles' | 'bars' | 'line';

export type ModelingMode =
  | 'every_tick'
  | 'real_ticks_slippage'
  | 'ohlc_m1'
  | 'open_prices';

export type EaStrategyId =
  | 'ma_cross'
  | 'rsi_reversion'
  | 'donchian_breakout'
  | 'scalping_pro'
  | 'kronos_forecast'
  | 'manual_replay';

export type KronosModelVariant = 'kronos-mini' | 'kronos-small' | 'kronos-base';

export type KronosEngineMode = 'kronos_local_quant' | 'kronos_python_server';

export interface KronosForecastCandle extends Candle {
  p10: number;
  p90: number;
}

export interface KronosTradeSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  rationale: string;
}

export interface KronosForecastResult {
  ok: true;
  symbol: string;
  timeframe: Timeframe;
  modelVariant: KronosModelVariant;
  engineUsed: KronosEngineMode;
  engineLabel: string;
  dataSource: string;
  lookbackBars: number;
  predLen: number;
  temperature: number;
  topP: number;
  sampleCount: number;
  currentPrice: number;
  targetPrice: number;
  expectedMovePercent: number;
  expectedMovePoints: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidencePercent: number;
  regimeLabel: string;
  tradeSignal: KronosTradeSignal;
  forecastCandles: KronosForecastCandle[];
  generatedAt: number;
}

export interface CustomBotConfig {
  id: string;
  name: string;
  fileName: string;
  baseStrategy: Exclude<EaStrategyId, 'manual_replay'>;
  description: string;
  defaultInputs: Partial<EaInputParams>;
  isCustom?: boolean;
}

export interface BrokerServer {
  id: string;
  name: string;
  company: string;
  accountType: AccountType;
  pingMs: number;
  commissionPerLot: number; // USD round-turn per 1.00 lot
  stopOutPercent: number;
  marginCallPercent: number;
}

export interface Mt5Account {
  login: string;
  password: string;
  holderName: string;
  serverId: string;
  serverName: string;
  company: string;
  accountType: AccountType;
  currency: 'USD' | 'EUR';
  balance: number;
  leverage: number; // e.g., 500 means 1:500
  savePassword: boolean;
  isInvestorOnly?: boolean;
}

export interface Mt5Symbol {
  symbol: string;
  description: string;
  category: 'Forex' | 'Metals' | 'Crypto' | 'Indices';
  digits: number;
  point: number;
  contractSize: number;
  basePrice: number;
  spreadPoints: number;
  volatility: number; // relative per H1 bar
  swapLong: number;
  swapShort: number;
}

export interface LiveQuote {
  symbol: string;
  bid: number;
  ask: number;
  spreadPoints: number;
  direction: 'up' | 'down' | 'flat';
  time: number;
}

export interface Candle {
  time: number; // epoch seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EaInputParams {
  lotSize: number;
  fastMaPeriod: number;
  slowMaPeriod: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  donchianPeriod: number;
  stopOrderOffsetPoints: number;
  slippagePoints: number;
  stopLossPoints: number;
  takeProfitPoints: number;
  trailingStopPoints: number;
  maxSpreadPoints: number;
}

export interface BacktestSettings {
  eaId: string; // built-in EaStrategyId or custom bot id
  symbol: string;
  timeframe: Timeframe;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  modeling: ModelingMode;
  delayMs: number;
  initialDeposit: number;
  leverage: number;
  visualMode: boolean;
  visualSpeed: number; // 1..32
}

export interface OpenPosition {
  ticket: number;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  openTime: number;
  openBarIndex: number;
  openPrice: number;
  sl: number;
  tp: number;
  commission: number;
  swap: number;
  comment: string;
  unrealizedProfit: number;
}

export interface TradeDeal {
  ticket: number;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  openTime: number;
  openBarIndex: number;
  openPrice: number;
  closeTime: number;
  closeBarIndex: number;
  closePrice: number;
  sl: number;
  tp: number;
  commission: number;
  swap: number;
  profit: number;
  netProfit: number;
  balanceAfter: number;
  closeReason: 'tp' | 'sl' | 'signal' | 'manual' | 'stop_out' | 'end_of_test';
  comment: string;
}

export interface EquityPoint {
  barIndex: number;
  time: number;
  balance: number;
  equity: number;
  marginLoadPercent: number;
}

export interface BacktestMetrics {
  initialDeposit: number;
  finalBalance: number;
  totalNetProfit: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  expectedPayoff: number;
  recoveryFactor: number;
  sharpeRatio: number;
  balanceDrawdownAbs: number;
  balanceDrawdownPercent: number;
  equityDrawdownAbs: number;
  equityDrawdownPercent: number;
  totalTrades: number;
  shortTrades: number;
  shortWon: number;
  shortWonPercent: number;
  longTrades: number;
  longWon: number;
  longWonPercent: number;
  profitTrades: number;
  profitTradesPercent: number;
  lossTrades: number;
  lossTradesPercent: number;
  largestProfitTrade: number;
  largestLossTrade: number;
  averageProfitTrade: number;
  averageLossTrade: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  historyQualityPercent: number;
  barsCount: number;
  ticksModeled: number;
  executionTimeMs: number;
}

export interface BacktestReport {
  id: string;
  runAt: number;
  accountLogin: string;
  accountType: AccountType;
  serverName: string;
  settings: BacktestSettings;
  inputs: EaInputParams;
  metrics: BacktestMetrics;
  deals: TradeDeal[];
  equityCurve: EquityPoint[];
}

export interface JournalEntry {
  id: string;
  timestamp: string;
  source: 'Accounts' | 'Network' | 'Tester' | 'Trades' | 'System';
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface IndicatorToggles {
  fastEma: boolean;
  slowEma: boolean;
  bollinger: boolean;
  rsiSubchart: boolean;
}
