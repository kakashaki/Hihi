import type { Candle } from './types';

export function calculateSMA(candles: Candle[], period: number): Array<number | null> {
  const result: Array<number | null> = new Array(candles.length).fill(null);
  if (period <= 0 || candles.length === 0) return result;

  let sum = 0;
  for (let i = 0; i < candles.length; i += 1) {
    sum += candles[i].close;
    if (i >= period) {
      sum -= candles[i - period].close;
    }
    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }
  return result;
}

export function calculateEMA(candles: Candle[], period: number): Array<number | null> {
  const result: Array<number | null> = new Array(candles.length).fill(null);
  if (period <= 0 || candles.length < period) return result;

  const k = 2 / (period + 1);
  let seedSum = 0;
  for (let i = 0; i < period; i += 1) {
    seedSum += candles[i].close;
  }
  let ema = seedSum / period;
  result[period - 1] = ema;

  for (let i = period; i < candles.length; i += 1) {
    ema = candles[i].close * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

export function calculateRSI(candles: Candle[], period = 14): Array<number | null> {
  const result: Array<number | null> = new Array(candles.length).fill(null);
  if (period <= 0 || candles.length <= period) return result;

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i += 1) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const computeRsi = (g: number, l: number) => {
    if (l === 0 && g === 0) return 50;
    if (l === 0) return 100;
    const rs = g / l;
    return 100 - 100 / (1 + rs);
  };

  result[period] = computeRsi(avgGain, avgLoss);

  for (let i = period + 1; i < candles.length; i += 1) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = computeRsi(avgGain, avgLoss);
  }

  return result;
}

export interface BollingerBandPoint {
  upper: number;
  middle: number;
  lower: number;
}

export function calculateBollingerBands(
  candles: Candle[],
  period = 20,
  stdDevMultiplier = 2
): Array<BollingerBandPoint | null> {
  const result: Array<BollingerBandPoint | null> = new Array(candles.length).fill(null);
  if (period <= 1 || candles.length < period) return result;

  for (let i = period - 1; i < candles.length; i += 1) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      sum += candles[j].close;
    }
    const mean = sum / period;

    let sqDiff = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      const diff = candles[j].close - mean;
      sqDiff += diff * diff;
    }
    const stdDev = Math.sqrt(sqDiff / period);
    result[i] = {
      upper: mean + stdDevMultiplier * stdDev,
      middle: mean,
      lower: mean - stdDevMultiplier * stdDev,
    };
  }
  return result;
}

export interface DonchianPoint {
  upper: number;
  lower: number;
}

export function calculateDonchian(
  candles: Candle[],
  period = 20
): Array<DonchianPoint | null> {
  const result: Array<DonchianPoint | null> = new Array(candles.length).fill(null);
  if (period <= 1 || candles.length < period) return result;

  for (let i = period; i < candles.length; i += 1) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - period; j < i; j += 1) {
      if (candles[j].high > highest) highest = candles[j].high;
      if (candles[j].low < lowest) lowest = candles[j].low;
    }
    result[i] = { upper: highest, lower: lowest };
  }
  return result;
}
