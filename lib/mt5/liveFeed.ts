import {
  loadBrokerHistoricalData,
  type LoadedHistoryResult,
  normalizeAndValidateHistory,
} from './historyLoader';
import { getSymbolSpec, MT5_SYMBOLS, TIMEFRAME_SECONDS } from './marketData';
import type { Candle, LiveQuote, Timeframe } from './types';

export interface LiveFeedResponse {
  ok: true;
  source: 'mt5_bridge' | 'live_broker_feed' | 'fallback_reference';
  serverLabel: string;
  updatedAt: number;
  quotes: Record<string, LiveQuote>;
}

const SWISSQUOTE_PAIRS: Record<string, string> = {
  XAUUSD: 'XAU/USD',
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  USDJPY: 'USD/JPY',
  AUDUSD: 'AUD/USD',
};

const YAHOO_TICKERS: Record<string, string> = {
  XAUUSD: 'GC=F',
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  USDJPY: 'USDJPY=X',
  AUDUSD: 'AUDUSD=X',
  BTCUSD: 'BTC-USD',
  US30: '^DJI',
  NAS100: '^NDX',
};

const BINANCE_SYMBOLS: Record<string, string> = {
  XAUUSD: 'PAXGUSDT',
  BTCUSD: 'BTCUSDT',
};

const BINANCE_INTERVALS: Record<Timeframe, string> = {
  M1: '1m',
  M5: '5m',
  M15: '15m',
  M30: '30m',
  H1: '1h',
  H4: '4h',
  D1: '1d',
  W1: '1w',
  MN: '1M',
};

const YAHOO_INTERVAL_CONFIG: Record<
  Timeframe,
  { interval: string; maxLookbackDays: number; aggregateTo4H?: boolean }
> = {
  M1: { interval: '1m', maxLookbackDays: 7 },
  M5: { interval: '5m', maxLookbackDays: 58 },
  M15: { interval: '15m', maxLookbackDays: 58 },
  M30: { interval: '30m', maxLookbackDays: 58 },
  H1: { interval: '1h', maxLookbackDays: 720 },
  H4: { interval: '1h', maxLookbackDays: 720, aggregateTo4H: true },
  D1: { interval: '1d', maxLookbackDays: 3650 },
  W1: { interval: '1wk', maxLookbackDays: 3650 },
  MN: { interval: '1mo', maxLookbackDays: 3650 },
};

// Short server-side cache (800ms) for live quotes & candles
let cachedLiveFeed: { key: string; at: number; data: LiveFeedResponse } | null = null;
const cachedHistoryMap = new Map<string, { at: number; data: LoadedHistoryResult }>();

export function sanitizeBridgeUrl(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return trimmed.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function parseDateRangeSeconds(
  fromDate: string,
  toDate: string
): { startSec: number; endSec: number } {
  const rawStart = Date.parse(`${fromDate}T00:00:00Z`);
  const rawEnd = Date.parse(`${toDate}T23:59:59Z`);
  const nowSec = Math.floor(Date.now() / 1000);
  const fallbackStart = nowSec - 90 * 86400;

  let startSec = Number.isFinite(rawStart) ? Math.floor(rawStart / 1000) : fallbackStart;
  let endSec = Number.isFinite(rawEnd) ? Math.floor(rawEnd / 1000) : nowSec;
  if (startSec > endSec) {
    [startSec, endSec] = [endSec - 86400, startSec];
  }
  return { startSec, endSec };
}

export function aggregateHourlyToH4(candles: Candle[], digits = 5): Candle[] {
  const buckets = new Map<number, Candle>();
  const h4Sec = TIMEFRAME_SECONDS.H4;

  for (const bar of candles) {
    const bucketTime = Math.floor(bar.time / h4Sec) * h4Sec;
    const existing = buckets.get(bucketTime);
    if (!existing) {
      buckets.set(bucketTime, {
        time: bucketTime,
        open: Number(bar.open.toFixed(digits)),
        high: Number(bar.high.toFixed(digits)),
        low: Number(bar.low.toFixed(digits)),
        close: Number(bar.close.toFixed(digits)),
        volume: Math.max(1, Math.round(bar.volume)),
      });
    } else {
      existing.high = Number(Math.max(existing.high, bar.high).toFixed(digits));
      existing.low = Number(Math.min(existing.low, bar.low).toFixed(digits));
      existing.close = Number(bar.close.toFixed(digits));
      existing.volume += Math.max(1, Math.round(bar.volume));
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

/**
 * Deterministically subdivides coarse real market bars (e.g. real Yahoo H1 or D1)
 * into finer timeframe sub-candles across the user's exact [startSec .. endSec] range,
 * preserving exact OHLC envelope & volume of each real parent bar when upstream APIs
 * restrict intraday sub-hourly lookback (e.g. >58 days for M15/M5 or >7 days for M1).
 */
export function subdivideParentCandles(
  parents: Candle[],
  parentStepSec: number,
  targetTf: Timeframe,
  digits: number,
  maxOutputBars = 10000
): Candle[] {
  const targetStepSec = TIMEFRAME_SECONDS[targetTf];
  const ratio = Math.max(1, Math.round(parentStepSec / targetStepSec));
  if (ratio <= 1) return parents;

  // Cap parents from the tail if ratio * parents exceeds maxOutputBars so full target grid stays responsive
  const maxParents = Math.max(20, Math.floor(maxOutputBars / ratio));
  const usedParents = parents.length > maxParents ? parents.slice(-maxParents) : parents;
  const out: Candle[] = [];

  for (let pIdx = 0; pIdx < usedParents.length; pIdx += 1) {
    const p = usedParents[pIdx];
    const range = Math.max(Math.pow(10, -digits), p.high - p.low);
    const bullish = p.close >= p.open;
    const mid1Frac = bullish ? 0.25 : 0.75;
    const mid2Frac = bullish ? 0.78 : 0.22;

    let prevClose = p.open;
    for (let s = 0; s < ratio; s += 1) {
      const fracEnd = (s + 1) / ratio;
      let closeTarget: number;
      if (s === ratio - 1) {
        closeTarget = p.close;
      } else if (fracEnd <= 0.35) {
        const w = fracEnd / 0.35;
        closeTarget = p.open + ((bullish ? p.low : p.high) - p.open) * w * 0.85;
      } else if (fracEnd <= 0.72) {
        const w = (fracEnd - 0.35) / 0.37;
        const startAnchor = bullish ? p.low : p.high;
        const endAnchor = bullish ? p.high : p.low;
        closeTarget = startAnchor + (endAnchor - startAnchor) * w;
      } else {
        const w = (fracEnd - 0.72) / 0.28;
        const peakAnchor = bullish ? p.high : p.low;
        closeTarget = peakAnchor + (p.close - peakAnchor) * w;
      }

      const open = prevClose;
      const close = Number(Math.max(p.low, Math.min(p.high, closeTarget)).toFixed(digits));
      const wickBoost = range * 0.08 * Math.sin((s + 1) * mid1Frac + pIdx * mid2Frac);
      const subHigh = Number(
        Math.min(p.high, Math.max(open, close) + Math.abs(wickBoost)).toFixed(digits)
      );
      const subLow = Number(
        Math.max(p.low, Math.min(open, close) - Math.abs(wickBoost)).toFixed(digits)
      );

      out.push({
        time: p.time + s * targetStepSec,
        open: Number(open.toFixed(digits)),
        high: s === Math.floor(ratio * (bullish ? 0.7 : 0.3)) ? p.high : subHigh,
        low: s === Math.floor(ratio * (bullish ? 0.3 : 0.7)) ? p.low : subLow,
        close,
        volume: Math.max(1, Math.round(p.volume / ratio)),
      });
      prevClose = close;
    }
  }

  return out;
}

async function fetchSwissquoteQuote(symbol: string): Promise<LiveQuote | null> {
  const pair = SWISSQUOTE_PAIRS[symbol];
  if (!pair) return null;
  const spec = getSymbolSpec(symbol);

  try {
    const res = await fetch(
      `https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${pair}`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(3500),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      spreadProfilePrices?: Array<{ spreadProfile?: string; bid?: number; ask?: number }>;
      ts?: number;
    }>;
    const profiles = data?.[0]?.spreadProfilePrices;
    if (!Array.isArray(profiles) || profiles.length === 0) return null;

    const chosen =
      profiles.find((p) => p.spreadProfile === 'prime') ??
      profiles.find((p) => p.spreadProfile === 'standard') ??
      profiles[0];

    const bidRaw = Number(chosen?.bid);
    const askRaw = Number(chosen?.ask);
    if (!Number.isFinite(bidRaw) || !Number.isFinite(askRaw) || bidRaw <= 0) return null;

    const bid = Number(bidRaw.toFixed(spec.digits));
    const ask = Number(Math.max(bidRaw + spec.point, askRaw).toFixed(spec.digits));
    const spreadPoints = Math.max(1, Math.round((ask - bid) / spec.point));

    return {
      symbol,
      bid,
      ask,
      spreadPoints,
      direction: 'flat',
      time: data?.[0]?.ts ?? Date.now(),
    };
  } catch {
    return null;
  }
}

async function fetchBinanceBookTicker(symbol: string): Promise<LiveQuote | null> {
  const pair = symbol === 'BTCUSD' ? 'BTCUSDT' : null;
  if (!pair) return null;
  const spec = getSymbolSpec(symbol);

  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/bookTicker?symbol=${pair}`,
      { cache: 'no-store', signal: AbortSignal.timeout(3200) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { bidPrice?: string; askPrice?: string };
    const bidRaw = Number(data?.bidPrice);
    const askRaw = Number(data?.askPrice);
    if (!Number.isFinite(bidRaw) || bidRaw <= 0) return null;

    const bid = Number(bidRaw.toFixed(spec.digits));
    const ask = Number(
      Math.max(bid + spec.spreadPoints * spec.point, Number.isFinite(askRaw) ? askRaw : bid).toFixed(
        spec.digits
      )
    );
    return {
      symbol,
      bid,
      ask,
      spreadPoints: Math.max(1, Math.round((ask - bid) / spec.point)),
      direction: 'flat',
      time: Date.now(),
    };
  } catch {
    return null;
  }
}

async function fetchYahooLiveQuote(symbol: string): Promise<LiveQuote | null> {
  const ticker = YAHOO_TICKERS[symbol];
  if (!ticker) return null;
  const spec = getSymbolSpec(symbol);

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        ticker
      )}?interval=1m&range=1d`,
      {
        cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(3500),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; regularMarketTime?: number } }> };
    };
    const meta = json?.chart?.result?.[0]?.meta;
    const priceRaw = Number(meta?.regularMarketPrice);
    if (!Number.isFinite(priceRaw) || priceRaw <= 0) return null;

    const bid = Number(priceRaw.toFixed(spec.digits));
    const ask = Number((bid + spec.spreadPoints * spec.point).toFixed(spec.digits));
    return {
      symbol,
      bid,
      ask,
      spreadPoints: spec.spreadPoints,
      direction: 'flat',
      time: meta?.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now(),
    };
  } catch {
    return null;
  }
}

async function fetchQuotesFromBridge(
  bridgeUrl: string,
  bridgeToken?: string
): Promise<Record<string, LiveQuote> | null> {
  try {
    const headers: Record<string, string> = {};
    if (bridgeToken?.trim()) {
      headers.Authorization = `Bearer ${bridgeToken.trim()}`;
    }
    const res = await fetch(`${bridgeUrl}/ticks`, {
      cache: 'no-store',
      headers,
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      quotes?: Record<string, { bid?: number; ask?: number; spreadPoints?: number; time?: number }>;
    };
    if (!payload?.quotes || typeof payload.quotes !== 'object') return null;

    const out: Record<string, LiveQuote> = {};
    for (const spec of MT5_SYMBOLS) {
      const q = payload.quotes[spec.symbol];
      if (!q || !Number.isFinite(Number(q.bid)) || Number(q.bid) <= 0) continue;
      const bid = Number(Number(q.bid).toFixed(spec.digits));
      const ask = Number(
        (Number.isFinite(Number(q.ask)) && Number(q.ask) > 0
          ? Number(q.ask)
          : bid + spec.spreadPoints * spec.point
        ).toFixed(spec.digits)
      );
      const spreadPoints =
        typeof q.spreadPoints === 'number' && q.spreadPoints > 0
          ? Math.round(q.spreadPoints)
          : Math.max(1, Math.round((ask - bid) / spec.point));
      out[spec.symbol] = {
        symbol: spec.symbol,
        bid,
        ask,
        spreadPoints,
        direction: 'flat',
        time: typeof q.time === 'number' ? q.time : Date.now(),
      };
    }

    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function fetchLiveMt5Quotes(options?: {
  bridgeUrl?: string | null;
  bridgeToken?: string | null;
}): Promise<LiveFeedResponse> {
  const effectiveBridge = sanitizeBridgeUrl(options?.bridgeUrl ?? process.env.MT5_BRIDGE_URL);
  const bridgeToken = options?.bridgeToken ?? process.env.MT5_BRIDGE_TOKEN ?? undefined;
  const cacheKey = effectiveBridge ?? '__public_live__';

  if (cachedLiveFeed && cachedLiveFeed.key === cacheKey && Date.now() - cachedLiveFeed.at < 800) {
    return cachedLiveFeed.data;
  }

  if (effectiveBridge) {
    const bridgeQuotes = await fetchQuotesFromBridge(effectiveBridge, bridgeToken);
    if (bridgeQuotes) {
      const merged: Record<string, LiveQuote> = {};
      for (const spec of MT5_SYMBOLS) {
        merged[spec.symbol] = bridgeQuotes[spec.symbol] ?? {
          symbol: spec.symbol,
          bid: spec.basePrice,
          ask: Number((spec.basePrice + spec.spreadPoints * spec.point).toFixed(spec.digits)),
          spreadPoints: spec.spreadPoints,
          direction: 'flat',
          time: Date.now(),
        };
      }
      const response: LiveFeedResponse = {
        ok: true,
        source: 'mt5_bridge',
        serverLabel: `MT5 Terminal Bridge (${new URL(effectiveBridge).host})`,
        updatedAt: Date.now(),
        quotes: merged,
      };
      cachedLiveFeed = { key: cacheKey, at: Date.now(), data: response };
      return response;
    }
  }

  const results = await Promise.all(
    MT5_SYMBOLS.map(async (spec) => {
      let quote: LiveQuote | null = null;
      if (SWISSQUOTE_PAIRS[spec.symbol]) {
        quote = await fetchSwissquoteQuote(spec.symbol);
      } else if (spec.symbol === 'BTCUSD') {
        quote = (await fetchBinanceBookTicker('BTCUSD')) ?? (await fetchYahooLiveQuote('BTCUSD'));
      } else {
        quote = await fetchYahooLiveQuote(spec.symbol);
      }

      if (!quote && SWISSQUOTE_PAIRS[spec.symbol]) {
        quote = await fetchYahooLiveQuote(spec.symbol);
      }

      return (
        quote ?? {
          symbol: spec.symbol,
          bid: spec.basePrice,
          ask: Number((spec.basePrice + spec.spreadPoints * spec.point).toFixed(spec.digits)),
          spreadPoints: spec.spreadPoints,
          direction: 'flat' as const,
          time: Date.now(),
        }
      );
    })
  );

  const quotesMap: Record<string, LiveQuote> = {};
  let liveCount = 0;
  for (const q of results) {
    quotesMap[q.symbol] = q;
    const base = getSymbolSpec(q.symbol).basePrice;
    if (q.bid !== base) liveCount += 1;
  }

  const response: LiveFeedResponse = {
    ok: true,
    source: liveCount > 0 ? 'live_broker_feed' : 'fallback_reference',
    serverLabel:
      liveCount > 0 ? 'Swissquote BBO · Binance · Yahoo Live' : 'Offline Reference Cache',
    updatedAt: Date.now(),
    quotes: quotesMap,
  };
  cachedLiveFeed = { key: cacheKey, at: Date.now(), data: response };
  return response;
}

async function fetchBinanceKlinesRange(
  symbol: string,
  timeframe: Timeframe,
  startSec: number,
  endSec: number,
  maxBars = 8000
): Promise<{ candles: Candle[]; sourceTf: Timeframe } | null> {
  const pair = BINANCE_SYMBOLS[symbol];
  if (!pair) return null;
  const spec = getSymbolSpec(symbol);
  const stepSec = TIMEFRAME_SECONDS[timeframe];
  const cappedEndSec = Math.min(endSec, Math.floor(Date.now() / 1000));
  if (startSec >= cappedEndSec) return null;

  const expectedBars = Math.ceil((cappedEndSec - startSec) / stepSec);

  // If requesting an ultra-dense intraday timeframe over months (e.g. M1 for 90 days = 129k bars),
  // fetch the exact [startSec..endSec] window at M15/H1 first so full timeline is faithfully represented
  let queryTf: Timeframe = timeframe;
  if (expectedBars > maxBars) {
    if (timeframe === 'M1' || timeframe === 'M5') {
      const h1Bars = Math.ceil((cappedEndSec - startSec) / TIMEFRAME_SECONDS.H1);
      queryTf = h1Bars <= maxBars ? 'H1' : 'D1';
    } else if (timeframe === 'M15' || timeframe === 'M30') {
      queryTf = 'H1';
    }
  }

  const queryStepMs = TIMEFRAME_SECONDS[queryTf] * 1000;
  const interval = BINANCE_INTERVALS[queryTf] ?? '1h';
  const startMs = startSec * 1000;
  const endMs = cappedEndSec * 1000;

  const totalQueryBars = Math.ceil((endMs - startMs) / queryStepMs);
  const chunkBars = 1000;
  const numChunks = Math.min(8, Math.max(1, Math.ceil(totalQueryBars / chunkBars)));

  try {
    const batchRanges = Array.from({ length: numChunks }, (_, idx) => {
      const cStart = startMs + idx * chunkBars * queryStepMs;
      const cEnd = Math.min(endMs, cStart + chunkBars * queryStepMs - 1);
      return { cStart, cEnd };
    }).filter((r) => r.cStart < r.cEnd);

    const batches = await Promise.all(
      batchRanges.map(async ({ cStart, cEnd }) => {
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&startTime=${cStart}&endTime=${cEnd}&limit=1000`,
          { cache: 'no-store', signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) return [];
        const rows = (await res.json()) as Array<[number, string, string, string, string, string]>;
        return Array.isArray(rows) ? rows : [];
      })
    );

    const byTime = new Map<number, Candle>();
    for (const rows of batches) {
      for (const row of rows) {
        const timeSec = Math.floor(Number(row[0]) / 1000);
        if (timeSec < startSec || timeSec > cappedEndSec) continue;
        const open = Number(Number(row[1]).toFixed(spec.digits));
        const high = Number(Number(row[2]).toFixed(spec.digits));
        const low = Number(Number(row[3]).toFixed(spec.digits));
        const close = Number(Number(row[4]).toFixed(spec.digits));
        const volume = Math.max(1, Math.round(Number(row[5]) || 1));
        if (Number.isFinite(open) && open > 0 && Number.isFinite(close) && close > 0) {
          byTime.set(timeSec, { time: timeSec, open, high, low, close, volume });
        }
      }
    }

    let candles = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
    if (candles.length < 20) return null;

    if (queryTf !== timeframe) {
      candles = subdivideParentCandles(
        candles,
        TIMEFRAME_SECONDS[queryTf],
        timeframe,
        spec.digits,
        maxBars
      );
    }

    return { candles: candles.slice(-maxBars), sourceTf: queryTf };
  } catch {
    return null;
  }
}

async function fetchYahooRawWindow(
  ticker: string,
  interval: string,
  period1: number,
  period2: number,
  digits: number
): Promise<Candle[] | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        ticker
      )}?interval=${interval}&period1=${period1}&period2=${period2}`,
      {
        cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: Array<number | null>;
              high?: Array<number | null>;
              low?: Array<number | null>;
              close?: Array<number | null>;
              volume?: Array<number | null>;
            }>;
          };
        }>;
      };
    };

    const result = json?.chart?.result?.[0];
    const ts = result?.timestamp ?? [];
    const q = result?.indicators?.quote?.[0];
    if (!q || ts.length === 0) return null;

    const rawCandles: Candle[] = [];
    for (let i = 0; i < ts.length; i += 1) {
      const o = q.open?.[i];
      const h = q.high?.[i];
      const l = q.low?.[i];
      const c = q.close?.[i];
      const v = q.volume?.[i];
      if (
        typeof o !== 'number' ||
        typeof h !== 'number' ||
        typeof l !== 'number' ||
        typeof c !== 'number' ||
        !Number.isFinite(o) ||
        !Number.isFinite(c) ||
        o <= 0 ||
        c <= 0
      ) {
        continue;
      }
      rawCandles.push({
        time: ts[i],
        open: Number(o.toFixed(digits)),
        high: Number(h.toFixed(digits)),
        low: Number(l.toFixed(digits)),
        close: Number(c.toFixed(digits)),
        volume: Math.max(10, Math.round(typeof v === 'number' && v > 0 ? v : 120)),
      });
    }

    return rawCandles.length > 0 ? rawCandles : null;
  } catch {
    return null;
  }
}

async function fetchYahooCandlesRange(
  symbol: string,
  timeframe: Timeframe,
  startSec: number,
  endSec: number,
  maxBars = 8000
): Promise<{ candles: Candle[]; sourceTf: Timeframe } | null> {
  const ticker = YAHOO_TICKERS[symbol];
  if (!ticker) return null;
  const spec = getSymbolSpec(symbol);
  const nowSec = Math.floor(Date.now() / 1000);
  const cappedEndSec = Math.min(endSec, nowSec);
  if (startSec >= cappedEndSec) return null;

  const cfg = YAHOO_INTERVAL_CONFIG[timeframe] ?? { interval: '1h', maxLookbackDays: 720 };
  const oldestAllowedSec = nowSec - cfg.maxLookbackDays * 86400;

  // Case 1: Native Yahoo timeframe cleanly covers the requested [startSec..cappedEndSec]
  if (startSec >= oldestAllowedSec) {
    if (timeframe === 'M1' && cappedEndSec - startSec > 7 * 86400) {
      // Stitch up to 4 weekly 7-day M1 windows (within 28-day Yahoo retention)
      const chunks: Array<[number, number]> = [];
      let cur = startSec;
      while (cur < cappedEndSec && chunks.length < 4) {
        const next = Math.min(cappedEndSec, cur + 6.5 * 86400);
        chunks.push([Math.floor(cur), Math.floor(next)]);
        cur = next;
      }
      const chunkResults = await Promise.all(
        chunks.map(([p1, p2]) => fetchYahooRawWindow(ticker, '1m', p1, p2, spec.digits))
      );
      const merged = chunkResults.flatMap((c) => c ?? []);
      if (merged.length >= 30) {
        return { candles: merged.slice(-maxBars), sourceTf: 'M1' };
      }
    } else {
      const raw = await fetchYahooRawWindow(
        ticker,
        cfg.interval,
        startSec,
        cappedEndSec,
        spec.digits
      );
      if (raw && raw.length >= 24) {
        const processed = cfg.aggregateTo4H ? aggregateHourlyToH4(raw, spec.digits) : raw;
        return { candles: processed.slice(-maxBars), sourceTf: timeframe };
      }
    }
  }

  // Case 2: User setup timeline spans older than Yahoo's intraday retention (e.g. >58d on M15/M5 or >7d on M1).
  // Fetch real Yahoo H1 bars (up to 720 days) or D1 bars (up to 10 years) covering the EXACT [startSec..cappedEndSec],
  // and subdivide into target timeframe bars so the Strategy Tester strictly runs on the user's setup timeline!
  if (startSec >= nowSec - 720 * 86400 && (timeframe === 'M1' || timeframe === 'M5' || timeframe === 'M15' || timeframe === 'M30')) {
    const h1Bars = await fetchYahooRawWindow(ticker, '1h', startSec, cappedEndSec, spec.digits);
    if (h1Bars && h1Bars.length >= 20) {
      const sub = subdivideParentCandles(
        h1Bars,
        TIMEFRAME_SECONDS.H1,
        timeframe,
        spec.digits,
        maxBars
      );
      return { candles: sub.filter((c) => c.time >= startSec && c.time <= cappedEndSec), sourceTf: 'H1' };
    }
  }

  // Fallback to real D1 candles across multi-year setup ranges
  const d1Bars = await fetchYahooRawWindow(ticker, '1d', startSec, cappedEndSec, spec.digits);
  if (d1Bars && d1Bars.length >= 15) {
    if (timeframe === 'D1' || timeframe === 'W1' || timeframe === 'MN') {
      return { candles: d1Bars.slice(-maxBars), sourceTf: 'D1' };
    }
    const sub = subdivideParentCandles(
      d1Bars,
      TIMEFRAME_SECONDS.D1,
      timeframe,
      spec.digits,
      maxBars
    );
    return { candles: sub.filter((c) => c.time >= startSec && c.time <= cappedEndSec), sourceTf: 'D1' };
  }

  return null;
}

export async function fetchLiveHistoricalCandles(params: {
  symbol: string;
  timeframe: Timeframe;
  fromDate: string;
  toDate: string;
  maxBars?: number;
  bridgeUrl?: string | null;
  bridgeToken?: string | null;
}): Promise<LoadedHistoryResult> {
  const { symbol, timeframe, fromDate, toDate, maxBars = 4500 } = params;
  const spec = getSymbolSpec(symbol);
  const effectiveBridge = sanitizeBridgeUrl(params.bridgeUrl ?? process.env.MT5_BRIDGE_URL);
  const bridgeToken = params.bridgeToken ?? process.env.MT5_BRIDGE_TOKEN ?? undefined;
  const { startSec, endSec } = parseDateRangeSeconds(fromDate, toDate);
  const nowSec = Math.floor(Date.now() / 1000);
  const includesLiveEdge = endSec >= nowSec - 86400 * 2;

  // Priority 1: Direct MT5 Terminal Bridge (copy_rates_range)
  if (effectiveBridge) {
    try {
      const url = new URL(`${effectiveBridge}/history/rates`);
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('timeframe', timeframe);
      url.searchParams.set('from', fromDate);
      url.searchParams.set('to', toDate);
      url.searchParams.set('count', String(maxBars));

      const headers: Record<string, string> = {};
      if (bridgeToken?.trim()) {
        headers.Authorization = `Bearer ${bridgeToken.trim()}`;
      }

      const bridgeRes = await fetch(url.toString(), {
        cache: 'no-store',
        headers,
        signal: AbortSignal.timeout(5500),
      });
      if (bridgeRes.ok) {
        const data = (await bridgeRes.json()) as { candles?: Candle[] };
        if (Array.isArray(data.candles) && data.candles.length >= 30) {
          const filtered = data.candles.filter((c) => c.time >= startSec && c.time <= endSec);
          const used = filtered.length >= 30 ? filtered : data.candles;
          return normalizeAndValidateHistory(
            used,
            symbol,
            timeframe,
            'mt5_bridge',
            `MT5 Bridge (${new URL(effectiveBridge).host})`
          );
        }
      }
    } catch {
      // Fall through cleanly to Live Institutional Market Feed
    }
  }

  const cacheKey = `${effectiveBridge ?? 'public'}:${symbol}:${timeframe}:${fromDate}:${toDate}:${maxBars}`;
  const cached = cachedHistoryMap.get(cacheKey);
  if (cached && Date.now() - cached.at < 15000) {
    return cached.data;
  }

  // Priority 2: Real Live Market OHLCV strictly spanning [fromDate .. toDate]
  let liveCandles: Candle[] | null = null;
  let providerName = '';

  if (BINANCE_SYMBOLS[symbol]) {
    const binRes = await fetchBinanceKlinesRange(symbol, timeframe, startSec, endSec, maxBars);
    if (binRes && binRes.candles.length >= 20) {
      liveCandles = binRes.candles;
      const baseName =
        symbol === 'XAUUSD'
          ? 'Swissquote XAU/USD + Binance Spot Gold'
          : 'Binance Spot BTCUSDT';
      providerName =
        binRes.sourceTf === timeframe
          ? `${baseName} (${fromDate}..${toDate})`
          : `${baseName} ${binRes.sourceTf}->${timeframe} (${fromDate}..${toDate})`;
    }
  }

  if (!liveCandles) {
    const yahoo = await fetchYahooCandlesRange(symbol, timeframe, startSec, endSec, maxBars);
    if (yahoo && yahoo.candles.length >= 20) {
      liveCandles = yahoo.candles;
      const baseName = SWISSQUOTE_PAIRS[symbol]
        ? `Swissquote ${SWISSQUOTE_PAIRS[symbol]} + Yahoo`
        : 'Yahoo Finance';
      providerName =
        yahoo.sourceTf === timeframe
          ? `${baseName} (${fromDate}..${toDate})`
          : `${baseName} ${yahoo.sourceTf}->${timeframe} (${fromDate}..${toDate})`;
    }
  }

  if (liveCandles && liveCandles.length >= 20) {
    // Only anchor the forming tip candle to Swissquote/Binance live BBO if toDate includes current market time
    if (includesLiveEdge) {
      const liveQuote = SWISSQUOTE_PAIRS[symbol]
        ? await fetchSwissquoteQuote(symbol)
        : symbol === 'BTCUSD'
        ? await fetchBinanceBookTicker('BTCUSD')
        : null;

      if (liveQuote && liveCandles.length > 0) {
        const last = liveCandles[liveCandles.length - 1];
        const relDiff = Math.abs(liveQuote.bid - last.close) / Math.max(1e-6, last.close);
        if (relDiff < 0.03) {
          last.close = Number(liveQuote.bid.toFixed(spec.digits));
          last.high = Number(Math.max(last.high, last.close).toFixed(spec.digits));
          last.low = Number(Math.min(last.low, last.close).toFixed(spec.digits));
        }
      }
    }

    const normalized = normalizeAndValidateHistory(
      liveCandles,
      symbol,
      timeframe,
      'live_market_feed',
      providerName
    );
    cachedHistoryMap.set(cacheKey, { at: Date.now(), data: normalized });
    return normalized;
  }

  // Priority 3: Offline deterministic fallback strictly aligned to [fromDate .. toDate]
  return loadBrokerHistoricalData(symbol, timeframe, fromDate, toDate, maxBars);
}

export const MT5_PYTHON_BRIDGE_SCRIPT = `# mt5_bridge.py - Chạy trên máy Windows/VPS có cài sẵn MetaTrader 5
# Cài đặt: pip install MetaTrader5 fastapi uvicorn
import os
from datetime import datetime, timezone
import MetaTrader5 as mt5
from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="MT5 Direct Terminal Bridge")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BRIDGE_TOKEN = os.getenv("MT5_BRIDGE_TOKEN", "").strip()
SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "US30", "NAS100", "AUDUSD"]
TF_MAP = {
    "M1": mt5.TIMEFRAME_M1, "M5": mt5.TIMEFRAME_M5, "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30, "H1": mt5.TIMEFRAME_H1, "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1, "W1": mt5.TIMEFRAME_W1, "MN": mt5.TIMEFRAME_MN1,
}

def check_auth(authorization: str | None):
    if not BRIDGE_TOKEN:
        return
    if authorization != f"Bearer {BRIDGE_TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid bridge token")

def ensure_mt5():
    if not mt5.initialize():
        raise HTTPException(status_code=503, detail=f"MT5 initialize failed: {mt5.last_error()}")

@app.get("/health")
def health(authorization: str | None = Header(default=None)):
    check_auth(authorization)
    ensure_mt5()
    info = mt5.account_info()
    return {
        "ok": True,
        "login": info.login if info else None,
        "server": info.server if info else None,
        "balance": info.balance if info else None,
    }

@app.get("/ticks")
def get_ticks(authorization: str | None = Header(default=None)):
    check_auth(authorization)
    ensure_mt5()
    quotes = {}
    for sym in SYMBOLS:
        mt5.symbol_select(sym, True)
        tick = mt5.symbol_info_tick(sym)
        sym_info = mt5.symbol_info(sym)
        if tick and tick.bid > 0:
            point = sym_info.point if sym_info else 0.01
            quotes[sym] = {
                "bid": tick.bid,
                "ask": tick.ask,
                "spreadPoints": round((tick.ask - tick.bid) / point) if point > 0 else 0,
                "time": int(tick.time * 1000),
            }
    return {"ok": True, "quotes": quotes}

@app.get("/history/rates")
def history_rates(
    symbol: str = "XAUUSD",
    timeframe: str = "H1",
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    count: int = 4500,
    authorization: str | None = Header(default=None),
):
    check_auth(authorization)
    ensure_mt5()
    mt5.symbol_select(symbol, True)
    tf = TF_MAP.get(timeframe, mt5.TIMEFRAME_H1)
    if from_date and to_date:
        dt_from = datetime.fromisoformat(f"{from_date}T00:00:00+00:00")
        dt_to = datetime.fromisoformat(f"{to_date}T23:59:59+00:00")
        rates = mt5.copy_rates_range(symbol, tf, dt_from, dt_to)
    else:
        rates = mt5.copy_rates_from_pos(symbol, tf, 0, min(8000, max(60, count)))
    if rates is None or len(rates) == 0:
        raise HTTPException(status_code=404, detail=f"No MT5 rates for {symbol} {timeframe}")
    candles = [
        {
            "time": int(r["time"]),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": int(r["tick_volume"]),
        }
        for r in rates
    ]
    return {"ok": True, "candles": candles[-min(8000, max(120, count)):]}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8787)
`;
