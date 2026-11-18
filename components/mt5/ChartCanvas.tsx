'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FastForward,
  Pause,
  Play,
  SkipForward,
  Square,
} from 'lucide-react';
import {
  calculateBollingerBands,
  calculateEMA,
  calculateRSI,
} from '@/lib/mt5/indicators';
import {
  formatMt5DateTime,
  formatPrice,
  getSymbolSpec,
} from '@/lib/mt5/marketData';
import type {
  Candle,
  ChartStyle,
  EaInputParams,
  IndicatorToggles,
  KronosForecastResult,
  LiveQuote,
  OpenPosition,
  Timeframe,
  TradeDeal,
} from '@/lib/mt5/types';

interface ChartCanvasProps {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  visibleEndIndex: number; // In visual mode, slices up to this bar index
  chartStyle: ChartStyle;
  indicators: IndicatorToggles;
  inputs: EaInputParams;
  deals: TradeDeal[];
  openPosition: OpenPosition | null;
  liveQuote?: LiveQuote | null;
  kronosForecast?: KronosForecastResult | null;
  showKronosOverlay?: boolean;
  showCrosshair: boolean;
  showOneClick: boolean;
  autoScroll: boolean;
  darkMode: boolean;
  barsOnScreen: number;
  rightOffsetBars: number;
  onChangeBarsOnScreen: (next: number | ((prev: number) => number)) => void;
  onChangeRightOffsetBars: (next: number) => void;
  isVisualRunning: boolean;
  isVisualPaused: boolean;
  visualSpeed: number;
  oneClickLot: number;
  onChangeOneClickLot: (lot: number) => void;
  onOneClickOrder: (side: 'buy' | 'sell') => void;
  onToggleVisualPause: () => void;
  onStepVisualBar: () => void;
  onStopVisual: () => void;
  onChangeVisualSpeed: (speed: number) => void;
}

export function ChartCanvas({
  symbol,
  timeframe,
  candles,
  visibleEndIndex,
  chartStyle,
  indicators,
  inputs,
  deals,
  openPosition,
  liveQuote = null,
  kronosForecast = null,
  showKronosOverlay = false,
  showCrosshair,
  showOneClick,
  autoScroll,
  darkMode,
  barsOnScreen,
  rightOffsetBars,
  onChangeBarsOnScreen,
  onChangeRightOffsetBars,
  isVisualRunning,
  isVisualPaused,
  visualSpeed,
  oneClickLot,
  onChangeOneClickLot,
  onOneClickOrder,
  onToggleVisualPause,
  onStepVisualBar,
  onStopVisual,
  onChangeVisualSpeed,
}: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    barIndex: number;
    price: number;
  } | null>(null);

  const dragRef = useRef<{ active: boolean; startX: number; startOffset: number }>({
    active: false,
    startX: 0,
    startOffset: 0,
  });

  const spec = getSymbolSpec(symbol);

  const activeCandles = useMemo(() => {
    const end = Math.max(1, Math.min(candles.length, visibleEndIndex));
    return candles.slice(0, end);
  }, [candles, visibleEndIndex]);

  const fastEma = useMemo(
    () => (indicators.fastEma ? calculateEMA(activeCandles, inputs.fastMaPeriod) : []),
    [activeCandles, indicators.fastEma, inputs.fastMaPeriod]
  );

  const slowEma = useMemo(
    () => (indicators.fastEma ? calculateEMA(activeCandles, inputs.slowMaPeriod) : []),
    [activeCandles, indicators.fastEma, inputs.slowMaPeriod]
  );

  const bollinger = useMemo(
    () => (indicators.bollinger ? calculateBollingerBands(activeCandles, 20, 2) : []),
    [activeCandles, indicators.bollinger]
  );

  const rsi = useMemo(
    () => (indicators.rsiSubchart ? calculateRSI(activeCandles, inputs.rsiPeriod) : []),
    [activeCandles, indicators.rsiSubchart, inputs.rsiPeriod]
  );

  const effectiveRightOffset = autoScroll && isVisualRunning ? 0 : rightOffsetBars;

  // Draw chart on canvas
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(300, Math.floor(rect.width));
    const height = Math.max(220, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Classic MT5 Black Chart vs Modern MT5 Dark Chart
    const bg = darkMode ? '#131722' : '#000000';
    const gridColor = darkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.18)';
    const axisBorder = darkMode ? '#2A2E39' : '#334155';
    const textMuted = darkMode ? '#94A3B8' : '#CBD5E1';
    const bullColor = darkMode ? '#26A69A' : '#00D26A';
    const bearColor = darkMode ? '#EF5350' : '#FFFFFF';
    const bearFill = darkMode ? '#EF5350' : '#EF4444';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const priceAxisW = width < 480 ? 58 : 72;
    const timeAxisH = 24;
    const rsiHeight = indicators.rsiSubchart ? (height < 360 ? 64 : 88) : 0;
    const plotW = Math.max(100, width - priceAxisW);
    const plotH = Math.max(100, height - timeAxisH - rsiHeight);

    const total = activeCandles.length;
    if (total === 0) {
      ctx.restore();
      return;
    }

    const count = Math.min(total, Math.max(16, barsOnScreen));
    const clampedOffset = Math.max(0, Math.min(Math.max(0, total - count), effectiveRightOffset));
    const forecastList =
      showKronosOverlay &&
      kronosForecast &&
      kronosForecast.symbol === symbol &&
      !isVisualRunning &&
      clampedOffset === 0
        ? kronosForecast.forecastCandles.slice(0, Math.max(6, Math.floor(count * 0.25)))
        : [];
    const futureCount = forecastList.length;
    const histCount = Math.max(12, count - futureCount);
    const endIdx = total - clampedOffset;
    const startIdx = Math.max(0, endIdx - histCount);
    const slice = activeCandles.slice(startIdx, endIdx);
    const totalPlottedBars = Math.max(1, slice.length + futureCount);

    // Compute min/max price in visible window (plus Kronos future cone if active)
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (let k = 0; k < slice.length; k += 1) {
      const c = slice[k];
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      const idx = startIdx + k;
      if (indicators.bollinger && bollinger[idx]) {
        const b = bollinger[idx]!;
        if (b.lower < minPrice) minPrice = b.lower;
        if (b.upper > maxPrice) maxPrice = b.upper;
      }
    }
    for (const fc of forecastList) {
      if (fc.low < minPrice) minPrice = fc.low;
      if (fc.high > maxPrice) maxPrice = fc.high;
      if (fc.p10 < minPrice) minPrice = fc.p10;
      if (fc.p90 > maxPrice) maxPrice = fc.p90;
    }

    // Include open position SL/TP if nearby
    if (openPosition && openPosition.symbol === symbol) {
      if (openPosition.sl > 0 && Math.abs(openPosition.sl - minPrice) < (maxPrice - minPrice) * 1.4) {
        minPrice = Math.min(minPrice, openPosition.sl);
        maxPrice = Math.max(maxPrice, openPosition.sl);
      }
      if (openPosition.tp > 0 && Math.abs(openPosition.tp - maxPrice) < (maxPrice - minPrice) * 1.4) {
        minPrice = Math.min(minPrice, openPosition.tp);
        maxPrice = Math.max(maxPrice, openPosition.tp);
      }
    }

    const pad = Math.max(spec.point * 10, (maxPrice - minPrice) * 0.09);
    minPrice -= pad;
    maxPrice += pad;
    const priceRange = Math.max(spec.point, maxPrice - minPrice);

    const yForPrice = (p: number) =>
      plotH - ((p - minPrice) / priceRange) * (plotH - 16) - 8;
    const barStep = plotW / totalPlottedBars;
    const xForLocalIdx = (k: number) => k * barStep + barStep * 0.5;

    // Draw horizontal & vertical MT5 grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    const priceSteps = 6;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = textMuted;

    for (let s = 0; s <= priceSteps; s += 1) {
      const p = minPrice + (priceRange * s) / priceSteps;
      const y = Math.round(yForPrice(p)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();

      ctx.fillText(formatPrice(p, spec.digits), plotW + 6, y + 3.5);
    }

    const desiredLabels = Math.max(3, Math.floor(plotW / (width < 520 ? 96 : 115)));
    const vStep = Math.max(4, Math.ceil(slice.length / desiredLabels));
    let lastLabelRightEdge = -100;
    for (let k = 0; k < slice.length; k += vStep) {
      const x = Math.round(xForLocalIdx(k)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, plotH + rsiHeight);
      ctx.stroke();

      const label = formatMt5DateTime(slice[k].time).slice(5); // MM.DD HH:MM
      const labelW = ctx.measureText(label).width;
      const drawX = Math.max(4, x - labelW / 2);
      if (drawX > lastLabelRightEdge + 10 && drawX + labelW < plotW - 4) {
        ctx.fillText(label, drawX, plotH + rsiHeight + 16);
        lastLabelRightEdge = drawX + labelW;
      }
    }
    ctx.setLineDash([]);

    // Axis separator lines
    ctx.strokeStyle = axisBorder;
    ctx.beginPath();
    ctx.moveTo(plotW + 0.5, 0);
    ctx.lineTo(plotW + 0.5, height);
    ctx.moveTo(0, plotH + 0.5);
    ctx.lineTo(width, plotH + 0.5);
    ctx.stroke();

    // Bollinger Bands overlay
    if (indicators.bollinger) {
      const drawBandLine = (getter: (idx: number) => number | null, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let started = false;
        for (let k = 0; k < slice.length; k += 1) {
          const val = getter(startIdx + k);
          if (val === null) continue;
          const x = xForLocalIdx(k);
          const y = yForPrice(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      };
      drawBandLine((idx) => bollinger[idx]?.upper ?? null, '#6366F1');
      drawBandLine((idx) => bollinger[idx]?.middle ?? null, 'rgba(99, 102, 241, 0.55)');
      drawBandLine((idx) => bollinger[idx]?.lower ?? null, '#6366F1');
    }

    // Draw Candlesticks / Bars / Line
    const candleW = Math.max(2, Math.min(14, barStep * 0.66));

    if (chartStyle === 'line') {
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      slice.forEach((c, k) => {
        const x = xForLocalIdx(k);
        const y = yForPrice(c.close);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else {
      for (let k = 0; k < slice.length; k += 1) {
        const c = slice[k];
        const x = xForLocalIdx(k);
        const yOpen = yForPrice(c.open);
        const yClose = yForPrice(c.close);
        const yHigh = yForPrice(c.high);
        const yLow = yForPrice(c.low);
        const isBull = c.close >= c.open;

        if (chartStyle === 'bars') {
          ctx.strokeStyle = isBull ? bullColor : bearColor;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x, yHigh);
          ctx.lineTo(x, yLow);
          ctx.moveTo(x - candleW * 0.45, yOpen);
          ctx.lineTo(x, yOpen);
          ctx.moveTo(x, yClose);
          ctx.lineTo(x + candleW * 0.45, yClose);
          ctx.stroke();
        } else {
          // Candlesticks
          const color = isBull ? bullColor : bearFill;
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.lineWidth = 1;

          // Wick
          ctx.beginPath();
          ctx.moveTo(Math.round(x) + 0.5, yHigh);
          ctx.lineTo(Math.round(x) + 0.5, yLow);
          ctx.stroke();

          // Body
          const bodyTop = Math.min(yOpen, yClose);
          const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
          ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
        }
      }
    }

    // EMA Fast & Slow overlays
    if (indicators.fastEma) {
      const drawEma = (series: Array<number | null>, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        let started = false;
        for (let k = 0; k < slice.length; k += 1) {
          const val = series[startIdx + k];
          if (val === null || val === undefined) continue;
          const x = xForLocalIdx(k);
          const y = yForPrice(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      };
      drawEma(fastEma, '#F59E0B');
      drawEma(slowEma, '#EC4899');
    }

    // Historical Deals Arrows & Dotted Trade Connectors (MT5 signature visual!)
    for (const deal of deals) {
      if (deal.symbol !== symbol) continue;
      const inRangeOpen = deal.openBarIndex >= startIdx && deal.openBarIndex < endIdx;
      const inRangeClose = deal.closeBarIndex >= startIdx && deal.closeBarIndex < endIdx;
      if (!inRangeOpen && !inRangeClose) continue;

      const x1 = xForLocalIdx(deal.openBarIndex - startIdx);
      const y1 = yForPrice(deal.openPrice);
      const x2 = xForLocalIdx(deal.closeBarIndex - startIdx);
      const y2 = yForPrice(deal.closePrice);

      // Dotted connector line
      ctx.save();
      ctx.strokeStyle = deal.type === 'buy' ? '#3B82F6' : '#EF4444';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();

      // Entry arrow
      if (inRangeOpen) {
        ctx.fillStyle = deal.type === 'buy' ? '#3B82F6' : '#EF4444';
        ctx.beginPath();
        if (deal.type === 'buy') {
          ctx.moveTo(x1, y1 + 3);
          ctx.lineTo(x1 - 5, y1 + 11);
          ctx.lineTo(x1 + 5, y1 + 11);
        } else {
          ctx.moveTo(x1, y1 - 3);
          ctx.lineTo(x1 - 5, y1 - 11);
          ctx.lineTo(x1 + 5, y1 - 11);
        }
        ctx.closePath();
        ctx.fill();
      }

      // Exit triangle marker
      if (inRangeClose) {
        ctx.fillStyle = deal.netProfit >= 0 ? '#10B981' : '#F43F5E';
        ctx.beginPath();
        ctx.arc(x2, y2, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Active Open Position Entry / SL / TP horizontal lines
    if (openPosition && openPosition.symbol === symbol) {
      const drawOrderLine = (price: number, color: string, label: string) => {
        if (price <= 0) return;
        const y = Math.round(yForPrice(price)) + 0.5;
        if (y < 0 || y > plotH) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(plotW, y);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(label, 8, y - 4);
        ctx.restore();
      };

      drawOrderLine(
        openPosition.openPrice,
        '#38BDF8',
        `#${openPosition.ticket} ${openPosition.type.toUpperCase()} ${openPosition.volume}`
      );
      drawOrderLine(openPosition.sl, '#EF4444', `SL ${formatPrice(openPosition.sl, spec.digits)}`);
      drawOrderLine(openPosition.tp, '#10B981', `TP ${formatPrice(openPosition.tp, spec.digits)}`);
    }

    // Kronos AI Forecast Overlay (Predicted K-Lines + P10-P90 Monte Carlo Cone)
    if (futureCount > 0) {
      const dividerX = Math.round(slice.length * barStep) + 0.5;
      ctx.save();
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(dividerX, 0);
      ctx.lineTo(dividerX, plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, Math.max(40, plotW - 4), plotH);
      ctx.clip();
      ctx.fillStyle = '#C4B5FD';
      ctx.font = '10px "JetBrains Mono", monospace';
      const labelTxt = `KRONOS (${kronosForecast?.modelVariant ?? 'AI'})`;
      const txtW = ctx.measureText(labelTxt).width;
      const labelX = Math.max(6, Math.min(plotW - txtW - 8, dividerX + 6));
      ctx.fillText(labelTxt, labelX, 14);
      ctx.restore();

      // P10-P90 Shaded Confidence Band
      ctx.fillStyle = 'rgba(139, 92, 246, 0.14)';
      ctx.beginPath();
      const firstX = xForLocalIdx(slice.length - 1);
      const lastHistY = yForPrice(slice[slice.length - 1].close);
      ctx.moveTo(firstX, lastHistY);
      forecastList.forEach((fc, fIdx) => {
        ctx.lineTo(xForLocalIdx(slice.length + fIdx), yForPrice(fc.p90));
      });
      for (let fIdx = forecastList.length - 1; fIdx >= 0; fIdx -= 1) {
        ctx.lineTo(xForLocalIdx(slice.length + fIdx), yForPrice(forecastList[fIdx].p10));
      }
      ctx.closePath();
      ctx.fill();

      // Forecast Candlesticks
      forecastList.forEach((fc, fIdx) => {
        const fx = xForLocalIdx(slice.length + fIdx);
        const yO = yForPrice(fc.open);
        const yC = yForPrice(fc.close);
        const yH = yForPrice(fc.high);
        const yL = yForPrice(fc.low);
        const bullFc = fc.close >= fc.open;
        const strokeCol = bullFc ? '#38BDF8' : '#A855F7';
        const fillCol = bullFc ? 'rgba(56, 189, 248, 0.65)' : 'rgba(168, 85, 247, 0.65)';

        ctx.strokeStyle = strokeCol;
        ctx.fillStyle = fillCol;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(fx) + 0.5, yH);
        ctx.lineTo(Math.round(fx) + 0.5, yL);
        ctx.stroke();

        const bTop = Math.min(yO, yC);
        const bH = Math.max(1.5, Math.abs(yC - yO));
        ctx.fillRect(fx - candleW / 2, bTop, candleW, bH);
      });

      // Predicted Target Price Tag on Axis
      const targetP = forecastList[forecastList.length - 1].close;
      const targetY = Math.round(yForPrice(targetP)) + 0.5;
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.6)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(dividerX, targetY);
      ctx.lineTo(plotW, targetY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#7C3AED';
      ctx.fillRect(plotW + 2, targetY - 9, priceAxisW - 4, 18);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(formatPrice(targetP, spec.digits), plotW + 6, targetY + 3.5);
      ctx.restore();
    }

    // Current Bid & Ask Price Lines
    const lastBar = activeCandles[activeCandles.length - 1];
    const hasLiveCloseMatch =
      !isVisualRunning &&
      liveQuote &&
      Math.abs(liveQuote.bid - lastBar.close) / Math.max(1e-6, lastBar.close) < 0.04;
    const bid = hasLiveCloseMatch && liveQuote ? liveQuote.bid : lastBar.close;
    const ask =
      hasLiveCloseMatch && liveQuote ? liveQuote.ask : bid + spec.spreadPoints * spec.point;
    const bidY = Math.round(yForPrice(bid)) + 0.5;
    const askY = Math.round(yForPrice(ask)) + 0.5;

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, bidY);
    ctx.lineTo(plotW, bidY);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
    ctx.beginPath();
    ctx.moveTo(0, askY);
    ctx.lineTo(plotW, askY);
    ctx.stroke();

    // Bid price tag on axis
    ctx.fillStyle = '#2563EB';
    ctx.fillRect(plotW + 2, bidY - 9, priceAxisW - 4, 18);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(formatPrice(bid, spec.digits), plotW + 6, bidY + 3.5);

    // RSI Subchart
    if (indicators.rsiSubchart && rsiHeight > 0) {
      const rsiTop = plotH + 4;
      const rsiBottom = plotH + rsiHeight - 4;
      const yRsi = (val: number) =>
        rsiBottom - (Math.max(0, Math.min(100, val)) / 100) * (rsiBottom - rsiTop);

      ctx.strokeStyle = axisBorder;
      ctx.beginPath();
      ctx.moveTo(0, plotH + rsiHeight + 0.5);
      ctx.lineTo(width, plotH + rsiHeight + 0.5);
      ctx.stroke();

      // 70 / 30 lines
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.setLineDash([3, 3]);
      [30, 70].forEach((lvl) => {
        const y = Math.round(yRsi(lvl)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(plotW, y);
        ctx.stroke();
        ctx.fillStyle = textMuted;
        ctx.fillText(String(lvl), plotW + 6, y + 3.5);
      });
      ctx.setLineDash([]);

      ctx.strokeStyle = '#A78BFA';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      for (let k = 0; k < slice.length; k += 1) {
        const r = rsi[startIdx + k];
        if (r === null || r === undefined) continue;
        const x = xForLocalIdx(k);
        const y = yRsi(r);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      ctx.fillStyle = '#A78BFA';
      ctx.font = '10px "JetBrains Mono", monospace';
      const lastRsi = rsi[endIdx - 1];
      ctx.fillText(
        `RSI(${inputs.rsiPeriod}) ${lastRsi !== null && lastRsi !== undefined ? lastRsi.toFixed(2) : '--'}`,
        8,
        rsiTop + 11
      );
    }

    // Crosshair
    if (showCrosshair && hoverInfo && hoverInfo.x <= plotW && hoverInfo.y <= plotH + rsiHeight) {
      ctx.save();
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hoverInfo.x, 0);
      ctx.lineTo(hoverInfo.x, plotH + rsiHeight);
      ctx.moveTo(0, hoverInfo.y);
      ctx.lineTo(plotW, hoverInfo.y);
      ctx.stroke();
      ctx.restore();

      if (hoverInfo.y <= plotH) {
        const hoveredPrice =
          minPrice + ((plotH - 8 - hoverInfo.y) / Math.max(1, plotH - 16)) * priceRange;
        ctx.fillStyle = '#334155';
        ctx.fillRect(plotW + 2, hoverInfo.y - 9, priceAxisW - 4, 18);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillText(formatPrice(hoveredPrice, spec.digits), plotW + 6, hoverInfo.y + 3.5);
      }

      const bar = activeCandles[hoverInfo.barIndex];
      if (bar) {
        const dt = formatMt5DateTime(bar.time);
        ctx.fillStyle = '#334155';
        const tagW = 112;
        const tagX = Math.max(4, Math.min(plotW - tagW, hoverInfo.x - tagW / 2));
        ctx.fillRect(tagX, plotH + rsiHeight + 2, tagW, 18);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(dt, tagX + 6, plotH + rsiHeight + 14);
      }
    }

    ctx.restore();
  }, [
    activeCandles,
    barsOnScreen,
    bollinger,
    chartStyle,
    darkMode,
    deals,
    fastEma,
    hoverInfo,
    indicators.bollinger,
    indicators.fastEma,
    indicators.rsiSubchart,
    inputs.rsiPeriod,
    isVisualRunning,
    kronosForecast,
    openPosition,
    liveQuote,
    effectiveRightOffset,
    rsi,
    showCrosshair,
    showKronosOverlay,
    slowEma,
    spec.digits,
    spec.point,
    spec.spreadPoints,
    symbol,
  ]);

  useEffect(() => {
    drawChart();
  }, [drawChart]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => drawChart());
    ro.observe(container);
    return () => ro.disconnect();
  }, [drawChart]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const axisW = rect.width < 480 ? 58 : 72;
    if (dragRef.current.active) {
      const dx = e.clientX - dragRef.current.startX;
      const plotW = Math.max(100, rect.width - axisW);
      const barStep = plotW / Math.max(1, barsOnScreen);
      const barDelta = Math.round(dx / Math.max(2, barStep));
      const maxOffset = Math.max(0, activeCandles.length - barsOnScreen);
      onChangeRightOffsetBars(
        Math.max(0, Math.min(maxOffset, dragRef.current.startOffset + barDelta))
      );
    }

    const total = activeCandles.length;
    const count = Math.min(total, Math.max(16, barsOnScreen));
    const clampedOffset = Math.max(0, Math.min(Math.max(0, total - count), effectiveRightOffset));
    const futureCount =
      showKronosOverlay &&
      kronosForecast &&
      kronosForecast.symbol === symbol &&
      !isVisualRunning &&
      clampedOffset === 0
        ? Math.min(kronosForecast.forecastCandles.length, Math.max(6, Math.floor(count * 0.25)))
        : 0;
    const histCount = Math.max(12, count - futureCount);
    const endIdx = total - clampedOffset;
    const startIdx = Math.max(0, endIdx - histCount);
    const totalPlottedBars = Math.max(1, endIdx - startIdx + futureCount);
    const plotW = Math.max(100, rect.width - axisW);
    const localIdx = Math.max(0, Math.min(histCount - 1, Math.floor((x / plotW) * totalPlottedBars)));
    setHoverInfo({
      x,
      y,
      barIndex: Math.min(total - 1, startIdx + localIdx),
      price: 0,
    });
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      onChangeBarsOnScreen((prev) => Math.max(24, Math.round(prev * 0.88)));
    } else {
      onChangeBarsOnScreen((prev) => Math.min(600, Math.round(prev * 1.12)));
    }
  };

  const lastBar = activeCandles[activeCandles.length - 1];
  const displayBar =
    hoverInfo && activeCandles[hoverInfo.barIndex]
      ? activeCandles[hoverInfo.barIndex]
      : lastBar;

  const hasLiveBtnMatch =
    !isVisualRunning &&
    liveQuote &&
    lastBar &&
    Math.abs(liveQuote.bid - lastBar.close) / Math.max(1e-6, lastBar.close) < 0.04;
  const bidPrice = hasLiveBtnMatch && liveQuote ? liveQuote.bid : lastBar ? lastBar.close : spec.basePrice;
  const askPrice =
    hasLiveBtnMatch && liveQuote ? liveQuote.ask : bidPrice + spec.spreadPoints * spec.point;

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 1) return;
    dragRef.current = {
      active: true,
      startX: e.touches[0].clientX,
      startOffset: effectiveRightOffset,
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active || e.touches.length !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.touches[0].clientX - dragRef.current.startX;
    const axisW = rect.width < 480 ? 58 : 72;
    const plotW = Math.max(100, rect.width - axisW);
    const barStep = plotW / Math.max(1, barsOnScreen);
    const barDelta = Math.round(dx / Math.max(2, barStep));
    const maxOffset = Math.max(0, activeCandles.length - barsOnScreen);
    onChangeRightOffsetBars(
      Math.max(0, Math.min(maxOffset, dragRef.current.startOffset + barDelta))
    );
  };

  const handleTouchEnd = () => {
    dragRef.current.active = false;
  };

  return (
    <div
      ref={containerRef}
      data-testid="mt5-chart-viewport"
      className="relative w-full h-full min-h-[200px] overflow-hidden bg-black dark:bg-[#131722]"
    >
      <canvas
        ref={canvasRef}
        onMouseDown={(e) => {
          dragRef.current = {
            active: true,
            startX: e.clientX,
            startOffset: effectiveRightOffset,
          };
        }}
        onMouseUp={() => {
          dragRef.current.active = false;
        }}
        onMouseLeave={() => {
          dragRef.current.active = false;
          setHoverInfo(null);
        }}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        className={`block w-full h-full touch-none ${showCrosshair ? 'cursor-crosshair' : 'cursor-grab'}`}
      />

      {/* Top-Left OHLC Header + Optional One-Click Trading Widget */}
      <div className="absolute top-2 left-2.5 flex flex-col items-start gap-2 pointer-events-none max-w-[calc(100%-68px)]">
        <div className="self-start flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] sm:text-[11px] font-mono tabular-nums text-slate-200 bg-black/70 px-2 py-1 rounded">
          <span className="font-semibold text-white">
            {symbol},{timeframe}
          </span>
          {displayBar && (
            <>
              <span>O:{formatPrice(displayBar.open, spec.digits)}</span>
              <span>H:{formatPrice(displayBar.high, spec.digits)}</span>
              <span>L:{formatPrice(displayBar.low, spec.digits)}</span>
              <span>C:{formatPrice(displayBar.close, spec.digits)}</span>
            </>
          )}
        </div>

        {showOneClick && (
          <div className="pointer-events-auto self-start inline-flex w-fit items-stretch rounded border border-slate-600/80 bg-[#1E222D]/95 text-white shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => onOneClickOrder('sell')}
              className="px-2 sm:px-2.5 py-1 bg-[#B91C1C] hover:bg-[#DC2626] transition-colors text-left min-w-[66px] sm:min-w-[78px]"
            >
              <div className="text-[9px] uppercase tracking-wider text-red-100">SELL</div>
              <div className="text-[11px] sm:text-xs font-mono font-bold tabular-nums">
                {formatPrice(bidPrice, spec.digits)}
              </div>
            </button>
            <div className="flex items-center px-1.5 bg-[#131722] border-x border-slate-700">
              <label htmlFor="one-click-lot" className="sr-only">
                Khối lượng Lot
              </label>
              <input
                id="one-click-lot"
                type="number"
                step="0.01"
                min="0.01"
                max="50"
                value={oneClickLot}
                onChange={(e) => onChangeOneClickLot(Math.max(0.01, Number(e.target.value) || 0.01))}
                className="w-12 text-center text-xs font-mono tabular-nums bg-transparent text-white focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => onOneClickOrder('buy')}
              className="px-2 sm:px-2.5 py-1 bg-[#1D4ED8] hover:bg-[#2563EB] transition-colors text-right min-w-[66px] sm:min-w-[78px]"
            >
              <div className="text-[9px] uppercase tracking-wider text-blue-100">BUY</div>
              <div className="text-[11px] sm:text-xs font-mono font-bold tabular-nums">
                {formatPrice(askPrice, spec.digits)}
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Visual Backtest Replay Controls HUD */}
      {isVisualRunning && (
        <div className="absolute top-2 right-20 flex items-center gap-1.5 bg-[#1E222D]/95 border border-slate-600 text-slate-100 px-2.5 py-1 rounded text-xs shadow-sm">
          <span className="font-mono tabular-nums text-[11px] text-emerald-400 font-semibold mr-1">
            Visual {visibleEndIndex}/{candles.length}
          </span>
          <button
            type="button"
            onClick={onToggleVisualPause}
            aria-label={isVisualPaused ? 'Tiếp tục chạy Visual Backtest' : 'Tạm dừng Visual Backtest'}
            className="p-1 rounded hover:bg-slate-700 transition-colors"
          >
            {isVisualPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onStepVisualBar}
            aria-label="Tiến 1 nến (F12)"
            title="Tiến 1 nến (F12)"
            className="p-1 rounded hover:bg-slate-700 transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              onChangeVisualSpeed(visualSpeed >= 32 ? 1 : visualSpeed * 2)
            }
            aria-label="Tốc độ phát Visual Backtest"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 font-mono text-[11px] tabular-nums"
          >
            <FastForward className="w-3 h-3" />
            <span>{visualSpeed}x</span>
          </button>
          <button
            type="button"
            onClick={onStopVisual}
            aria-label="Dừng Visual Backtest"
            className="p-1 rounded hover:bg-red-700 text-red-400 hover:text-white transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
