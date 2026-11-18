import {
  calculateDonchian,
  calculateEMA,
  calculateRSI,
} from './indicators';
import { evaluateKronosBarSignal } from './kronosEngine';
import { getBrokerServer, getSymbolSpec } from './marketData';
import type {
  BacktestMetrics,
  BacktestReport,
  BacktestSettings,
  BrokerServer,
  Candle,
  EaInputParams,
  EquityPoint,
  Mt5Account,
  Mt5Symbol,
  OpenPosition,
  TradeDeal,
} from './types';

export function calculateProfitUsd(
  spec: Mt5Symbol,
  type: 'buy' | 'sell',
  volume: number,
  openPrice: number,
  closePrice: number
): number {
  const priceDiff = type === 'buy' ? closePrice - openPrice : openPrice - closePrice;
  const rawQuoteProfit = priceDiff * spec.contractSize * volume;

  // Convert quote currency to USD for USD-base pairs (e.g. USDJPY)
  if (spec.symbol.startsWith('USD') && closePrice > 0) {
    return Number((rawQuoteProfit / closePrice).toFixed(2));
  }
  return Number(rawQuoteProfit.toFixed(2));
}

export function calculateRequiredMargin(
  spec: Mt5Symbol,
  volume: number,
  price: number,
  leverage: number
): number {
  const safeLeverage = Math.max(1, leverage);
  const notionalUsd = spec.symbol.startsWith('USD')
    ? spec.contractSize * volume
    : price * spec.contractSize * volume;
  return Number((notionalUsd / safeLeverage).toFixed(2));
}

export function evaluatePositionBar(
  position: OpenPosition,
  candle: Candle,
  barIndex: number,
  spec: Mt5Symbol,
  trailingStopPoints: number,
  effectiveSpreadPoints = spec.spreadPoints,
  slippagePoints = 0
): {
  updatedPosition: OpenPosition;
  closedReason: TradeDeal['closeReason'] | null;
  closePrice: number | null;
} {
  const spreadPrice = effectiveSpreadPoints * spec.point;
  const slippagePrice = slippagePoints * spec.point;
  let pos = { ...position };

  // Check Stop Loss and Take Profit intrabar
  if (pos.type === 'buy') {
    const slHit = pos.sl > 0 && candle.low <= pos.sl;
    const tpHit = pos.tp > 0 && candle.high >= pos.tp;

    if (slHit) {
      return {
        updatedPosition: pos,
        closedReason: 'sl',
        closePrice: Number((pos.sl - slippagePrice).toFixed(spec.digits)),
      };
    }
    if (tpHit) {
      return { updatedPosition: pos, closedReason: 'tp', closePrice: pos.tp };
    }

    // Trailing Stop adjustment for Buy
    if (trailingStopPoints > 0) {
      const trailDist = trailingStopPoints * spec.point;
      const candidateSl = Number((candle.close - trailDist).toFixed(spec.digits));
      if (candle.close - pos.openPrice > trailDist && (pos.sl === 0 || candidateSl > pos.sl)) {
        pos.sl = candidateSl;
      }
    }

    pos.unrealizedProfit = calculateProfitUsd(spec, 'buy', pos.volume, pos.openPrice, candle.close);
  } else {
    // Sell closes at Ask = Bid + spread
    const askHigh = candle.high + spreadPrice;
    const askLow = candle.low + spreadPrice;
    const askClose = candle.close + spreadPrice;

    const slHit = pos.sl > 0 && askHigh >= pos.sl;
    const tpHit = pos.tp > 0 && askLow <= pos.tp;

    if (slHit) {
      return {
        updatedPosition: pos,
        closedReason: 'sl',
        closePrice: Number((pos.sl + slippagePrice).toFixed(spec.digits)),
      };
    }
    if (tpHit) {
      return { updatedPosition: pos, closedReason: 'tp', closePrice: pos.tp };
    }

    if (trailingStopPoints > 0) {
      const trailDist = trailingStopPoints * spec.point;
      const candidateSl = Number((askClose + trailDist).toFixed(spec.digits));
      if (pos.openPrice - askClose > trailDist && (pos.sl === 0 || candidateSl < pos.sl)) {
        pos.sl = candidateSl;
      }
    }

    pos.unrealizedProfit = calculateProfitUsd(spec, 'sell', pos.volume, pos.openPrice, askClose);
  }

  // Overnight swap simulation every ~24h (rough bar index check)
  if (barIndex > pos.openBarIndex && (barIndex - pos.openBarIndex) % 24 === 0) {
    const dailySwap = pos.type === 'buy' ? spec.swapLong : spec.swapShort;
    pos.swap = Number((pos.swap + dailySwap * pos.volume * 0.1).toFixed(2));
  }

  return { updatedPosition: pos, closedReason: null, closePrice: null };
}

export function openPositionFromBar(
  ticket: number,
  spec: Mt5Symbol,
  server: BrokerServer,
  type: 'buy' | 'sell',
  volume: number,
  barIndex: number,
  candle: Candle,
  stopLossPoints: number,
  takeProfitPoints: number,
  comment: string,
  effectiveSpreadPoints = spec.spreadPoints,
  slippagePoints = 0
): OpenPosition {
  const spreadPrice = effectiveSpreadPoints * spec.point;
  const slippagePrice = slippagePoints * spec.point;
  const openPrice =
    type === 'buy'
      ? Number((candle.close + spreadPrice + slippagePrice).toFixed(spec.digits))
      : Number((candle.close - slippagePrice).toFixed(spec.digits));

  const sl =
    stopLossPoints > 0
      ? Number(
          (type === 'buy'
            ? openPrice - stopLossPoints * spec.point
            : openPrice + stopLossPoints * spec.point
          ).toFixed(spec.digits)
        )
      : 0;

  const tp =
    takeProfitPoints > 0
      ? Number(
          (type === 'buy'
            ? openPrice + takeProfitPoints * spec.point
            : openPrice - takeProfitPoints * spec.point
          ).toFixed(spec.digits)
        )
      : 0;

  const commission = Number((-server.commissionPerLot * volume).toFixed(2));

  return {
    ticket,
    symbol: spec.symbol,
    type,
    volume,
    openTime: candle.time,
    openBarIndex: barIndex,
    openPrice,
    sl,
    tp,
    commission,
    swap: 0,
    comment,
    unrealizedProfit: 0,
  };
}

export function evaluateScalpingSignal(
  candles: Candle[],
  i: number,
  spec: Mt5Symbol,
  inputs: EaInputParams
): 'buy' | 'sell' | null {
  if (i < 4) return null;
  const curr = candles[i];
  const prev1 = candles[i - 1];
  const prev2 = candles[i - 2];
  const prev3 = candles[i - 3];

  const recentHigh = Math.max(prev1.high, prev2.high, prev3.high);
  const recentLow = Math.min(prev1.low, prev2.low, prev3.low);
  const offset = Math.max(0, inputs.stopOrderOffsetPoints) * spec.point;

  // Deterministic Stop-Order impulse trigger across local 3-bar bracket
  if (curr.close > recentHigh + offset * 0.15 && curr.close > curr.open) {
    return 'buy';
  }
  if (curr.close < recentLow - offset * 0.15 && curr.close < curr.open) {
    return 'sell';
  }
  return null;
}

export function closePositionToDeal(
  pos: OpenPosition,
  closeBarIndex: number,
  closeTime: number,
  closePrice: number,
  closeReason: TradeDeal['closeReason'],
  spec: Mt5Symbol,
  currentBalance: number
): { deal: TradeDeal; newBalance: number } {
  const profit = calculateProfitUsd(spec, pos.type, pos.volume, pos.openPrice, closePrice);
  const netProfit = Number((profit + pos.commission + pos.swap).toFixed(2));
  const newBalance = Number((currentBalance + netProfit).toFixed(2));

  return {
    deal: {
      ticket: pos.ticket,
      symbol: pos.symbol,
      type: pos.type,
      volume: pos.volume,
      openTime: pos.openTime,
      openBarIndex: pos.openBarIndex,
      openPrice: pos.openPrice,
      closeTime,
      closeBarIndex,
      closePrice: Number(closePrice.toFixed(spec.digits)),
      sl: pos.sl,
      tp: pos.tp,
      commission: pos.commission,
      swap: pos.swap,
      profit,
      netProfit,
      balanceAfter: newBalance,
      closeReason,
      comment: pos.comment,
    },
    newBalance,
  };
}

export function computeBacktestMetrics(
  initialDeposit: number,
  deals: TradeDeal[],
  equityCurve: EquityPoint[],
  barsCount: number,
  ticksModeled: number,
  executionTimeMs: number
): BacktestMetrics {
  let grossProfit = 0;
  let grossLoss = 0;
  let profitTrades = 0;
  let lossTrades = 0;
  let shortTrades = 0;
  let shortWon = 0;
  let longTrades = 0;
  let longWon = 0;
  let largestProfitTrade = 0;
  let largestLossTrade = 0;

  let curWins = 0;
  let curLosses = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;

  let peakBalance = initialDeposit;
  let balanceDrawdownAbs = 0;
  let balanceDrawdownPercent = 0;

  for (const deal of deals) {
    if (deal.type === 'buy') {
      longTrades += 1;
      if (deal.netProfit > 0) longWon += 1;
    } else {
      shortTrades += 1;
      if (deal.netProfit > 0) shortWon += 1;
    }

    if (deal.netProfit >= 0) {
      grossProfit += deal.netProfit;
      profitTrades += 1;
      if (deal.netProfit > largestProfitTrade) largestProfitTrade = deal.netProfit;
      curWins += 1;
      curLosses = 0;
      if (curWins > maxConsecutiveWins) maxConsecutiveWins = curWins;
    } else {
      grossLoss += deal.netProfit; // negative value
      lossTrades += 1;
      if (deal.netProfit < largestLossTrade) largestLossTrade = deal.netProfit;
      curLosses += 1;
      curWins = 0;
      if (curLosses > maxConsecutiveLosses) maxConsecutiveLosses = curLosses;
    }

    if (deal.balanceAfter > peakBalance) {
      peakBalance = deal.balanceAfter;
    }
    const ddAbs = peakBalance - deal.balanceAfter;
    const ddPct = peakBalance > 0 ? (ddAbs / peakBalance) * 100 : 0;
    if (ddAbs > balanceDrawdownAbs) balanceDrawdownAbs = ddAbs;
    if (ddPct > balanceDrawdownPercent) balanceDrawdownPercent = ddPct;
  }

  let peakEquity = initialDeposit;
  let equityDrawdownAbs = 0;
  let equityDrawdownPercent = 0;

  for (const pt of equityCurve) {
    if (pt.equity > peakEquity) peakEquity = pt.equity;
    const ddAbs = peakEquity - pt.equity;
    const ddPct = peakEquity > 0 ? (ddAbs / peakEquity) * 100 : 0;
    if (ddAbs > equityDrawdownAbs) equityDrawdownAbs = ddAbs;
    if (ddPct > equityDrawdownPercent) equityDrawdownPercent = ddPct;
  }

  const finalBalance =
    deals.length > 0 ? deals[deals.length - 1].balanceAfter : initialDeposit;
  const totalNetProfit = Number((finalBalance - initialDeposit).toFixed(2));
  const absGrossLoss = Math.abs(grossLoss);
  const profitFactor =
    absGrossLoss > 0
      ? Number((grossProfit / absGrossLoss).toFixed(2))
      : grossProfit > 0
      ? 99.99
      : 0;

  const totalTrades = deals.length;
  const expectedPayoff =
    totalTrades > 0 ? Number((totalNetProfit / totalTrades).toFixed(2)) : 0;

  const recoveryFactor =
    equityDrawdownAbs > 0
      ? Number((totalNetProfit / equityDrawdownAbs).toFixed(2))
      : totalNetProfit > 0
      ? 10.0
      : 0;

  // Compute trade return Sharpe Ratio
  let sharpeRatio = 0;
  if (deals.length > 2) {
    const returns = deals.map((d) => d.netProfit / Math.max(1, initialDeposit));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1);
    const std = Math.sqrt(variance);
    sharpeRatio = std > 0 ? Number(((mean / std) * Math.sqrt(returns.length)).toFixed(2)) : 0;
  }

  return {
    initialDeposit,
    finalBalance,
    totalNetProfit,
    grossProfit: Number(grossProfit.toFixed(2)),
    grossLoss: Number(grossLoss.toFixed(2)),
    profitFactor,
    expectedPayoff,
    recoveryFactor,
    sharpeRatio,
    balanceDrawdownAbs: Number(balanceDrawdownAbs.toFixed(2)),
    balanceDrawdownPercent: Number(balanceDrawdownPercent.toFixed(2)),
    equityDrawdownAbs: Number(equityDrawdownAbs.toFixed(2)),
    equityDrawdownPercent: Number(equityDrawdownPercent.toFixed(2)),
    totalTrades,
    shortTrades,
    shortWon,
    shortWonPercent: shortTrades > 0 ? Number(((shortWon / shortTrades) * 100).toFixed(2)) : 0,
    longTrades,
    longWon,
    longWonPercent: longTrades > 0 ? Number(((longWon / longTrades) * 100).toFixed(2)) : 0,
    profitTrades,
    profitTradesPercent:
      totalTrades > 0 ? Number(((profitTrades / totalTrades) * 100).toFixed(2)) : 0,
    lossTrades,
    lossTradesPercent:
      totalTrades > 0 ? Number(((lossTrades / totalTrades) * 100).toFixed(2)) : 0,
    largestProfitTrade: Number(largestProfitTrade.toFixed(2)),
    largestLossTrade: Number(largestLossTrade.toFixed(2)),
    averageProfitTrade:
      profitTrades > 0 ? Number((grossProfit / profitTrades).toFixed(2)) : 0,
    averageLossTrade:
      lossTrades > 0 ? Number((grossLoss / lossTrades).toFixed(2)) : 0,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    historyQualityPercent: 100,
    barsCount,
    ticksModeled,
    executionTimeMs,
  };
}

export function runAutomatedBacktest(
  candles: Candle[],
  settings: BacktestSettings,
  inputs: EaInputParams,
  account: Mt5Account,
  baseStrategyOverride?:
    | 'ma_cross'
    | 'rsi_reversion'
    | 'donchian_breakout'
    | 'scalping_pro'
    | 'kronos_forecast'
): BacktestReport {
  const startMs = Date.now();
  const spec = getSymbolSpec(settings.symbol);
  const server = getBrokerServer(account.serverId);

  const resolvedStrategy =
    settings.eaId === 'manual_replay'
      ? 'manual_replay'
      : baseStrategyOverride ??
        (settings.eaId === 'ma_cross' ||
        settings.eaId === 'rsi_reversion' ||
        settings.eaId === 'donchian_breakout' ||
        settings.eaId === 'scalping_pro' ||
        settings.eaId === 'kronos_forecast'
          ? settings.eaId
          : 'ma_cross');

  const fastEma = calculateEMA(candles, inputs.fastMaPeriod);
  const slowEma = calculateEMA(candles, inputs.slowMaPeriod);
  const rsi = calculateRSI(candles, inputs.rsiPeriod);
  const donchian = calculateDonchian(candles, inputs.donchianPeriod);

  // Compute baseline candle range for dynamic variable spread under Real Ticks mode
  const avgBarRange =
    candles.length > 0
      ? candles.reduce((acc, c) => acc + Math.max(spec.point, c.high - c.low), 0) / candles.length
      : spec.volatility;
  const isRealTickFriction = settings.modeling === 'real_ticks_slippage';

  let balance = settings.initialDeposit;
  let activePosition: OpenPosition | null = null;
  let ticketCounter = 1004501;

  const deals: TradeDeal[] = [];
  const equityCurve: EquityPoint[] = [];

  const warmup =
    resolvedStrategy === 'scalping_pro'
      ? 12
      : resolvedStrategy === 'kronos_forecast'
      ? 48
      : Math.max(inputs.slowMaPeriod + 2, inputs.rsiPeriod + 2, inputs.donchianPeriod + 2, 30);

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    const barRange = Math.max(spec.point, candle.high - candle.low);
    const volRatio = avgBarRange > 0 ? barRange / avgBarRange : 1;

    const effectiveSpreadPoints = isRealTickFriction
      ? Math.round(spec.spreadPoints * Math.min(2.8, Math.max(1.5, 1.35 + volRatio * 0.65)))
      : spec.spreadPoints;
    const effectiveSlippagePoints = isRealTickFriction
      ? Math.max(0, Math.round(inputs.slippagePoints * (volRatio > 1.25 ? 1.35 : 1.0)))
      : 0;
    const spreadPrice = effectiveSpreadPoints * spec.point;

    // 1. Evaluate open position against current candle
    if (activePosition) {
      const evaluated = evaluatePositionBar(
        activePosition,
        candle,
        i,
        spec,
        inputs.trailingStopPoints,
        effectiveSpreadPoints,
        effectiveSlippagePoints
      );
      activePosition = evaluated.updatedPosition;

      if (evaluated.closedReason && evaluated.closePrice !== null) {
        const closed = closePositionToDeal(
          activePosition,
          i,
          candle.time,
          evaluated.closePrice,
          evaluated.closedReason,
          spec,
          balance
        );
        deals.push(closed.deal);
        balance = closed.newBalance;
        activePosition = null;
      } else {
        // Check Stop Out
        const margin = calculateRequiredMargin(
          spec,
          activePosition.volume,
          candle.close,
          settings.leverage
        );
        const equity =
          balance + activePosition.unrealizedProfit + activePosition.commission + activePosition.swap;
        const marginLevel = margin > 0 ? (equity / margin) * 100 : 9999;

        if (server.stopOutPercent > 0 && marginLevel < server.stopOutPercent) {
          const closePrice =
            activePosition.type === 'buy'
              ? candle.close
              : candle.close + spreadPrice;
          const closed = closePositionToDeal(
            activePosition,
            i,
            candle.time,
            closePrice,
            'stop_out',
            spec,
            balance
          );
          deals.push(closed.deal);
          balance = closed.newBalance;
          activePosition = null;
        }
      }
    }

    // 2. Generate EA signal after warmup
    const effectiveMaxSpread =
      spec.category === 'Crypto' ? inputs.maxSpreadPoints * 50 : inputs.maxSpreadPoints;
    if (
      i >= warmup &&
      resolvedStrategy !== 'manual_replay' &&
      spec.spreadPoints <= effectiveMaxSpread
    ) {
      let signal: 'buy' | 'sell' | null = null;

      if (resolvedStrategy === 'ma_cross') {
        const fPrev = fastEma[i - 1];
        const sPrev = slowEma[i - 1];
        const fCurr = fastEma[i];
        const sCurr = slowEma[i];
        if (fPrev !== null && sPrev !== null && fCurr !== null && sCurr !== null) {
          if (fPrev <= sPrev && fCurr > sCurr) signal = 'buy';
          else if (fPrev >= sPrev && fCurr < sCurr) signal = 'sell';
        }
      } else if (resolvedStrategy === 'rsi_reversion') {
        const rPrev = rsi[i - 1];
        const rCurr = rsi[i];
        if (rPrev !== null && rCurr !== null) {
          if (rPrev <= inputs.rsiOversold && rCurr > inputs.rsiOversold) signal = 'buy';
          else if (rPrev >= inputs.rsiOverbought && rCurr < inputs.rsiOverbought) signal = 'sell';
        }
      } else if (resolvedStrategy === 'donchian_breakout') {
        const dc = donchian[i];
        if (dc) {
          if (candle.close > dc.upper) signal = 'buy';
          else if (candle.close < dc.lower) signal = 'sell';
        }
      } else if (resolvedStrategy === 'scalping_pro') {
        signal = evaluateScalpingSignal(candles, i, spec, inputs);
      } else if (resolvedStrategy === 'kronos_forecast') {
        signal = evaluateKronosBarSignal(candles, i, spec, 48);
      }

      if (signal) {
        // Close opposite signal position
        if (activePosition && activePosition.type !== signal) {
          const slipOffset = effectiveSlippagePoints * spec.point;
          const exitPrice =
            activePosition.type === 'buy'
              ? candle.close - slipOffset
              : candle.close + spreadPrice + slipOffset;
          const closed = closePositionToDeal(
            activePosition,
            i,
            candle.time,
            exitPrice,
            'signal',
            spec,
            balance
          );
          deals.push(closed.deal);
          balance = closed.newBalance;
          activePosition = null;
        }

        // Open new position if flat and sufficient free margin
        if (!activePosition) {
          const requiredMargin = calculateRequiredMargin(
            spec,
            inputs.lotSize,
            candle.close,
            settings.leverage
          );
          if (balance >= requiredMargin && requiredMargin > 0) {
            ticketCounter += 1;
            activePosition = openPositionFromBar(
              ticketCounter,
              spec,
              server,
              signal,
              inputs.lotSize,
              i,
              candle,
              inputs.stopLossPoints,
              inputs.takeProfitPoints,
              `${settings.eaId}`,
              effectiveSpreadPoints,
              effectiveSlippagePoints
            );
          }
        }
      }
    }

    // 3. Record Equity point
    const unrealized = activePosition
      ? activePosition.unrealizedProfit + activePosition.commission + activePosition.swap
      : 0;
    const equity = Number((balance + unrealized).toFixed(2));
    const margin = activePosition
      ? calculateRequiredMargin(spec, activePosition.volume, candle.close, settings.leverage)
      : 0;
    const marginLoadPercent = equity > 0 ? Number(((margin / equity) * 100).toFixed(2)) : 0;

    equityCurve.push({
      barIndex: i,
      time: candle.time,
      balance: Number(balance.toFixed(2)),
      equity,
      marginLoadPercent,
    });
  }

  // Close remaining open position at end of test
  if (activePosition && candles.length > 0) {
    const lastIdx = candles.length - 1;
    const lastCandle = candles[lastIdx];
    const spreadPrice = spec.spreadPoints * spec.point;
    const exitPrice =
      activePosition.type === 'buy'
        ? lastCandle.close
        : lastCandle.close + spreadPrice;
    const closed = closePositionToDeal(
      activePosition,
      lastIdx,
      lastCandle.time,
      exitPrice,
      'end_of_test',
      spec,
      balance
    );
    deals.push(closed.deal);
    balance = closed.newBalance;
    if (equityCurve.length > 0) {
      equityCurve[equityCurve.length - 1] = {
        ...equityCurve[equityCurve.length - 1],
        balance,
        equity: balance,
        marginLoadPercent: 0,
      };
    }
  }

  const executionTimeMs = Math.max(12, Date.now() - startMs);
  const ticksMultiplier =
    settings.modeling === 'real_ticks_slippage'
      ? 48
      : settings.modeling === 'every_tick'
      ? 38
      : settings.modeling === 'ohlc_m1'
      ? 12
      : 1;
  const ticksModeled = candles.length * ticksMultiplier;

  const metrics = computeBacktestMetrics(
    settings.initialDeposit,
    deals,
    equityCurve,
    candles.length,
    ticksModeled,
    executionTimeMs
  );

  return {
    id: `bt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    runAt: Date.now(),
    accountLogin: account.login,
    accountType: account.accountType,
    serverName: account.serverName,
    settings,
    inputs,
    metrics,
    deals,
    equityCurve,
  };
}
