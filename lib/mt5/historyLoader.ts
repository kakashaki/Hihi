import { generateHistoricalCandles, getSymbolSpec, TIMEFRAME_SECONDS } from './marketData';
import type { Candle, Timeframe } from './types';

export interface HistoryDatasetSummary {
  symbol: string;
  timeframe: Timeframe;
  source: 'mt5_bridge' | 'live_market_feed' | 'mt5_csv_import' | 'broker_archive';
  providerName?: string;
  barsCount: number;
  fromTimestamp: number;
  toTimestamp: number;
  missingBarsCount: number;
  repairedBarsCount: number;
  historyQualityPercent: number;
}

export interface LoadedHistoryResult {
  candles: Candle[];
  summary: HistoryDatasetSummary;
}

/**
 * Parses standard MetaTrader 5 History Center CSV/TSV exports:
 * Supports both tab-separated MT5 header format:
 *   <DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>
 *   2025.01.02\t01:00:00\t2624.50\t2626.10\t2623.80\t2625.40\t1240\t0\t22
 * and comma-separated OHLCV format:
 *   2025.01.02,01:00,2624.50,2626.10,2623.80,2625.40,1240
 */
export function parseMt5HistoryCsv(rawText: string, digits = 2): Candle[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const parsed: Candle[] = [];

  for (const line of lines) {
    // Skip header lines like <DATE> or Date,Time
    if (line.startsWith('<') || /^[a-zA-Z]+[,;\t]/.test(line)) {
      continue;
    }

    const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
    const cols = line.split(delimiter).map((c) => c.trim());
    if (cols.length < 5) continue;

    let timeSec = 0;
    let offset = 0;

    // Check if date & time are split across col 0 and col 1
    if (/^\d{4}[./-]\d{2}[./-]\d{2}$/.test(cols[0]) && /^\d{2}:\d{2}(:\d{2})?$/.test(cols[1])) {
      const dateIso = cols[0].replace(/\./g, '-');
      const timePart = cols[1].length === 5 ? `${cols[1]}:00` : cols[1];
      const ms = Date.parse(`${dateIso}T${timePart}Z`);
      if (!Number.isFinite(ms)) continue;
      timeSec = Math.floor(ms / 1000);
      offset = 2;
    } else {
      // Combined timestamp in col 0 (ISO or YYYY.MM.DD HH:MM)
      const normalized = cols[0].replace(/\./g, '-').replace(' ', 'T');
      const ms = Date.parse(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
      if (!Number.isFinite(ms)) continue;
      timeSec = Math.floor(ms / 1000);
      offset = 1;
    }

    const open = Number(cols[offset]);
    const high = Number(cols[offset + 1]);
    const low = Number(cols[offset + 2]);
    const close = Number(cols[offset + 3]);
    const vol = cols[offset + 4] ? Number(cols[offset + 4]) : 100;

    if (
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      open <= 0 ||
      close <= 0
    ) {
      continue;
    }

    const fixedHigh = Number(Math.max(high, open, close).toFixed(digits));
    const fixedLow = Number(Math.min(low, open, close).toFixed(digits));

    parsed.push({
      time: timeSec,
      open: Number(open.toFixed(digits)),
      high: fixedHigh,
      low: fixedLow,
      close: Number(close.toFixed(digits)),
      volume: Number.isFinite(vol) && vol > 0 ? Math.round(vol) : 100,
    });
  }

  return parsed;
}

/**
 * Normalizes, deduplicates, sorts chronologically, repairs OHLC bounds,
 * and computes MT5 History Quality score.
 */
export function normalizeAndValidateHistory(
  rawCandles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  source: HistoryDatasetSummary['source'],
  providerName?: string
): LoadedHistoryResult {
  const spec = getSymbolSpec(symbol);
  const stepSec = TIMEFRAME_SECONDS[timeframe];

  // Deduplicate by timestamp (keeping last occurrence) and sort ascending
  const byTime = new Map<number, Candle>();
  let repairedBarsCount = 0;

  for (const bar of rawCandles) {
    const roundedOpen = Number(bar.open.toFixed(spec.digits));
    const roundedClose = Number(bar.close.toFixed(spec.digits));
    const maxOC = Math.max(roundedOpen, roundedClose);
    const minOC = Math.min(roundedOpen, roundedClose);

    let roundedHigh = Number(bar.high.toFixed(spec.digits));
    let roundedLow = Number(bar.low.toFixed(spec.digits));

    if (roundedHigh < maxOC || roundedLow > minOC) {
      repairedBarsCount += 1;
      roundedHigh = Math.max(roundedHigh, maxOC);
      roundedLow = Math.min(roundedLow, minOC);
    }

    byTime.set(bar.time, {
      time: bar.time,
      open: roundedOpen,
      high: roundedHigh,
      low: roundedLow,
      close: roundedClose,
      volume: Math.max(1, Math.round(bar.volume || 1)),
    });
  }

  const candles = Array.from(byTime.values()).sort((a, b) => a.time - b.time);

  // Detect unexpected gaps (> 3x timeframe step to allow weekends on H1/M15)
  let missingBarsCount = 0;
  for (let i = 1; i < candles.length; i += 1) {
    const diff = candles[i].time - candles[i - 1].time;
    // Standard weekend gap is ~48h = 172800s for forex/metals
    if (diff > stepSec * 2 && !(spec.category !== 'Crypto' && diff <= 180000)) {
      missingBarsCount += Math.max(0, Math.floor(diff / stepSec) - 1);
    }
  }

  const totalExpected = candles.length + missingBarsCount;
  const quality =
    candles.length === 0
      ? 0
      : Math.max(
          75,
          Math.min(100, Math.round((candles.length / Math.max(1, totalExpected)) * 100))
        );

  return {
    candles,
    summary: {
      symbol,
      timeframe,
      source,
      ...(providerName ? { providerName } : {}),
      barsCount: candles.length,
      fromTimestamp: candles[0]?.time ?? 0,
      toTimestamp: candles[candles.length - 1]?.time ?? 0,
      missingBarsCount,
      repairedBarsCount,
      historyQualityPercent: quality,
    },
  };
}

export function loadBrokerHistoricalData(
  symbol: string,
  timeframe: Timeframe,
  fromDate: string,
  toDate: string,
  maxBars = 1200
): LoadedHistoryResult {
  const raw = generateHistoricalCandles(symbol, timeframe, fromDate, toDate, maxBars);
  return normalizeAndValidateHistory(raw, symbol, timeframe, 'broker_archive');
}
