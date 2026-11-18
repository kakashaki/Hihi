import type {
  BrokerServer,
  Candle,
  CustomBotConfig,
  EaInputParams,
  Mt5Account,
  Mt5Symbol,
  Timeframe,
} from './types';

export const BROKER_SERVERS: BrokerServer[] = [
  {
    id: 'metaquotes-demo',
    name: 'MetaQuotes-Demo',
    company: 'MetaQuotes Ltd.',
    accountType: 'demo',
    pingMs: 18,
    commissionPerLot: 0,
    stopOutPercent: 50,
    marginCallPercent: 100,
  },
  {
    id: 'exness-trial9',
    name: 'Exness-MT5Trial9',
    company: 'Exness Technologies Ltd.',
    accountType: 'demo',
    pingMs: 12,
    commissionPerLot: 0,
    stopOutPercent: 0,
    marginCallPercent: 60,
  },
  {
    id: 'exness-real8',
    name: 'Exness-MT5Real8',
    company: 'Exness Technologies Ltd.',
    accountType: 'real',
    pingMs: 14,
    commissionPerLot: 7.0,
    stopOutPercent: 30,
    marginCallPercent: 60,
  },
  {
    id: 'icmarkets-demo',
    name: 'ICMarketsSC-Demo',
    company: 'Raw Trading Ltd.',
    accountType: 'demo',
    pingMs: 21,
    commissionPerLot: 7.0,
    stopOutPercent: 50,
    marginCallPercent: 100,
  },
  {
    id: 'icmarkets-real2',
    name: 'ICMarketsSC-MT5-2',
    company: 'Raw Trading Ltd.',
    accountType: 'real',
    pingMs: 19,
    commissionPerLot: 7.0,
    stopOutPercent: 50,
    marginCallPercent: 100,
  },
  {
    id: 'xmglobal-real',
    name: 'XMGlobal-MT5 3',
    company: 'XM Global Limited',
    accountType: 'real',
    pingMs: 26,
    commissionPerLot: 0,
    stopOutPercent: 20,
    marginCallPercent: 50,
  },
  {
    id: 'ftmo-demo',
    name: 'FTMO-Demo',
    company: 'FTMO Evaluation',
    accountType: 'demo',
    pingMs: 24,
    commissionPerLot: 3.0,
    stopOutPercent: 50,
    marginCallPercent: 100,
  },
];

export const DEFAULT_ACCOUNTS: Mt5Account[] = [
  {
    login: '50192834',
    password: 'demo1234',
    holderName: 'Demo Standard Trader',
    serverId: 'metaquotes-demo',
    serverName: 'MetaQuotes-Demo',
    company: 'MetaQuotes Ltd.',
    accountType: 'demo',
    currency: 'USD',
    balance: 10000.0,
    leverage: 500,
    savePassword: true,
  },
  {
    login: '50881209',
    password: 'demo1234',
    holderName: 'Exness Trial Pro',
    serverId: 'exness-trial9',
    serverName: 'Exness-MT5Trial9',
    company: 'Exness Technologies Ltd.',
    accountType: 'demo',
    currency: 'USD',
    balance: 25000.0,
    leverage: 2000,
    savePassword: true,
  },
  {
    login: '88204195',
    password: 'real1234',
    holderName: 'Nguyen Minh Tuan',
    serverId: 'exness-real8',
    serverName: 'Exness-MT5Real8',
    company: 'Exness Technologies Ltd.',
    accountType: 'real',
    currency: 'USD',
    balance: 5420.85,
    leverage: 500,
    savePassword: true,
  },
  {
    login: '21094481',
    password: 'real1234',
    holderName: 'Tran Hoang Nam (Raw)',
    serverId: 'icmarkets-real2',
    serverName: 'ICMarketsSC-MT5-2',
    company: 'Raw Trading Ltd.',
    accountType: 'real',
    currency: 'USD',
    balance: 15800.0,
    leverage: 500,
    savePassword: true,
  },
];

export const MT5_SYMBOLS: Mt5Symbol[] = [
  {
    symbol: 'XAUUSD',
    description: 'Gold vs US Dollar',
    category: 'Metals',
    digits: 2,
    point: 0.01,
    contractSize: 100,
    basePrice: 3758.5,
    spreadPoints: 22,
    volatility: 8.5,
    swapLong: -12.4,
    swapShort: 4.2,
  },
  {
    symbol: 'EURUSD',
    description: 'Euro vs US Dollar',
    category: 'Forex',
    digits: 5,
    point: 0.00001,
    contractSize: 100000,
    basePrice: 1.09736,
    spreadPoints: 9,
    volatility: 0.0018,
    swapLong: -4.8,
    swapShort: 1.6,
  },
  {
    symbol: 'GBPUSD',
    description: 'Great Britain Pound vs US Dollar',
    category: 'Forex',
    digits: 5,
    point: 0.00001,
    contractSize: 100000,
    basePrice: 1.3167,
    spreadPoints: 12,
    volatility: 0.0023,
    swapLong: -3.9,
    swapShort: 0.8,
  },
  {
    symbol: 'USDJPY',
    description: 'US Dollar vs Japanese Yen',
    category: 'Forex',
    digits: 3,
    point: 0.001,
    contractSize: 100000,
    basePrice: 159.19,
    spreadPoints: 10,
    volatility: 0.31,
    swapLong: 9.2,
    swapShort: -16.5,
  },
  {
    symbol: 'BTCUSD',
    description: 'Bitcoin vs US Dollar',
    category: 'Crypto',
    digits: 2,
    point: 0.01,
    contractSize: 1,
    basePrice: 63580.0,
    spreadPoints: 1800,
    volatility: 480.0,
    swapLong: -18.0,
    swapShort: -12.0,
  },
  {
    symbol: 'US30',
    description: 'Wall Street 30 Index',
    category: 'Indices',
    digits: 1,
    point: 0.1,
    contractSize: 1,
    basePrice: 50386.7,
    spreadPoints: 24,
    volatility: 110.0,
    swapLong: -6.2,
    swapShort: -2.1,
  },
  {
    symbol: 'NAS100',
    description: 'US Tech 100 Index',
    category: 'Indices',
    digits: 1,
    point: 0.1,
    contractSize: 1,
    basePrice: 27116.0,
    spreadPoints: 16,
    volatility: 82.0,
    swapLong: -5.4,
    swapShort: -1.8,
  },
  {
    symbol: 'AUDUSD',
    description: 'Australian Dollar vs US Dollar',
    category: 'Forex',
    digits: 5,
    point: 0.00001,
    contractSize: 100000,
    basePrice: 0.67215,
    spreadPoints: 9,
    volatility: 0.0014,
    swapLong: -2.4,
    swapShort: 0.4,
  },
];

export const EA_STRATEGIES: CustomBotConfig[] = [
  {
    id: 'ma_cross',
    name: 'Moving Average Crossover EA',
    fileName: 'Experts\\Examples\\Moving Average\\Moving Average.ex5',
    baseStrategy: 'ma_cross',
    description: 'Tự động giao dịch khi đường EMA nhanh cắt đường EMA chậm kèm SL/TP & Trailing Stop.',
    defaultInputs: {},
  },
  {
    id: 'rsi_reversion',
    name: 'RSI Mean Reversion EA',
    fileName: 'Experts\\Advisors\\ExpertRSI.ex5',
    baseStrategy: 'rsi_reversion',
    description: 'Vào lệnh đảo chiều khi RSI vượt vùng quá mua/quá bán với quản lý vốn cố định.',
    defaultInputs: {},
  },
  {
    id: 'donchian_breakout',
    name: 'Donchian Breakout Trend EA',
    fileName: 'Experts\\Advisors\\ExpertDonchian.ex5',
    baseStrategy: 'donchian_breakout',
    description: 'Bắt sóng phá vỡ đỉnh/đáy N nến gần nhất kết hợp Trailing Stop bảo vệ lợi nhuận.',
    defaultInputs: {},
  },
  {
    id: 'scalping_pro',
    name: 'Scalping Robot Pro MT5',
    fileName: 'Experts\\Market\\Scalping Robot Pro MT5.ex5',
    baseStrategy: 'scalping_pro',
    description:
      'Bot scalping tần suất cao đặt lệnh Stop Order bám biến động ngắn; nhạy cảm với Spread biến động và Slippage thực tế.',
    defaultInputs: {
      lotSize: 0.1,
      stopOrderOffsetPoints: 35,
      slippagePoints: 14,
      stopLossPoints: 180,
      takeProfitPoints: 220,
      trailingStopPoints: 80,
      maxSpreadPoints: 50,
    },
  },
  {
    id: 'kronos_forecast',
    name: 'Kronos AI K-Line Foundation EA',
    fileName: 'Experts\\AI\\KronosPredictor_MT5.ex5',
    baseStrategy: 'kronos_forecast',
    description:
      'Expert Advisor ứng dụng mô hình Kronos K-Line Tokenization dự báo chuỗi nến tương lai (causal lookback) kèm SL/TP & Trailing Stop.',
    defaultInputs: {
      lotSize: 0.1,
      fastMaPeriod: 10,
      slowMaPeriod: 24,
      stopLossPoints: 360,
      takeProfitPoints: 720,
      trailingStopPoints: 180,
      maxSpreadPoints: 60,
    },
  },
  {
    id: 'manual_replay',
    name: 'Manual Backtest (Giao dịch Replay)',
    fileName: 'Experts\\Manual\\ReplayTester.ex5',
    baseStrategy: 'ma_cross',
    description: 'Chạy nến trực quan để bạn tự đặt lệnh Buy/Sell, SL/TP thủ công giống thực chiến.',
    defaultInputs: {},
  },
];

export const DEFAULT_EA_INPUTS: EaInputParams = {
  lotSize: 0.1,
  fastMaPeriod: 12,
  slowMaPeriod: 26,
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  donchianPeriod: 20,
  stopOrderOffsetPoints: 35,
  slippagePoints: 12,
  stopLossPoints: 450,
  takeProfitPoints: 900,
  trailingStopPoints: 250,
  maxSpreadPoints: 60,
};

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
  W1: 604800,
  MN: 2592000,
};

export function getSymbolSpec(symbol: string): Mt5Symbol {
  return MT5_SYMBOLS.find((s) => s.symbol === symbol) ?? MT5_SYMBOLS[0];
}

export function getBrokerServer(serverIdOrName: string): BrokerServer {
  return (
    BROKER_SERVERS.find(
      (s) => s.id === serverIdOrName || s.name === serverIdOrName
    ) ?? BROKER_SERVERS[0]
  );
}

/** Deterministic PRNG (Mulberry32) so candle series & unit tests are reproducible */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function generateHistoricalCandles(
  symbolName: string,
  timeframe: Timeframe,
  fromDate: string,
  toDate: string,
  maxBars = 1200
): Candle[] {
  const spec = getSymbolSpec(symbolName);
  const stepSec = TIMEFRAME_SECONDS[timeframe];

  const startMs = Date.parse(`${fromDate}T00:00:00Z`);
  const endMs = Date.parse(`${toDate}T23:59:59Z`);
  const safeStart = Number.isFinite(startMs) ? Math.floor(startMs / 1000) : 1704067200;
  const safeEnd = Number.isFinite(endMs) ? Math.floor(endMs / 1000) : safeStart + 86400 * 90;

  const rawCount = Math.max(120, Math.floor((safeEnd - safeStart) / stepSec));
  const barCount = Math.min(maxBars, Math.max(120, rawCount));

  // Scale volatility cleanly relative to H1
  const tfMultiplier = Math.sqrt(stepSec / 3600);
  const barVol = spec.volatility * tfMultiplier;

  const rng = createRng(hashString(`${symbolName}:${timeframe}:${fromDate}:${toDate}`));
  const candles: Candle[] = [];

  // Start price slightly offset from basePrice for natural trend room
  let price = spec.basePrice * (0.94 + rng() * 0.08);
  let regimeDrift = 0;

  const roundPrice = (p: number) =>
    Number(Math.max(spec.point * 10, p).toFixed(spec.digits));

  // Align start time backwards from safeEnd if capped at maxBars
  const actualStart = safeEnd - barCount * stepSec;

  for (let i = 0; i < barCount; i += 1) {
    const time = actualStart + i * stepSec;

    // Periodic regime shifts for realistic trends, ranges, and breakouts
    if (i % 45 === 0) {
      regimeDrift = (rng() - 0.48) * barVol * 0.42;
    }

    // Box-Muller approximate normal move
    const u1 = Math.max(1e-6, rng());
    const u2 = rng();
    const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    const open = price;
    const wave = Math.sin(i / 18) * barVol * 0.16;
    const bodyDelta = regimeDrift + wave + normal * barVol * 0.68;
    const close = roundPrice(open + bodyDelta);

    const upperWick = Math.abs(rng() * barVol * (0.25 + rng() * 0.55));
    const lowerWick = Math.abs(rng() * barVol * (0.25 + rng() * 0.55));

    const high = roundPrice(Math.max(open, close) + upperWick);
    const low = roundPrice(Math.min(open, close) - lowerWick);

    const volume = Math.max(
      10,
      Math.round(80 + Math.abs(bodyDelta / Math.max(spec.point, barVol)) * 220 + rng() * 140)
    );

    candles.push({
      time,
      open: roundPrice(open),
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  return candles;
}

export function formatPrice(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(digits);
}

export function formatMt5DateTime(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}`;
}
