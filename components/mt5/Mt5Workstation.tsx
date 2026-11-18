'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CandlestickChart,
  ListOrdered,
  SlidersHorizontal,
  Terminal,
  Wifi,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  calculateProfitUsd,
  calculateRequiredMargin,
  closePositionToDeal,
  computeBacktestMetrics,
  evaluatePositionBar,
  evaluateScalpingSignal,
  openPositionFromBar,
} from '@/lib/mt5/backtestEngine';
import type { HistoryDatasetSummary } from '@/lib/mt5/historyLoader';
import { calculateDonchian, calculateEMA, calculateRSI } from '@/lib/mt5/indicators';
import {
  evaluateKronosBarSignal,
} from '@/lib/mt5/kronosEngine';
import {
  DEFAULT_ACCOUNTS,
  DEFAULT_EA_INPUTS,
  EA_STRATEGIES,
  formatMt5DateTime,
  formatPrice,
  getBrokerServer,
  getSymbolSpec,
  MT5_SYMBOLS,
} from '@/lib/mt5/marketData';
import type {
  BacktestReport,
  BacktestSettings,
  Candle,
  ChartStyle,
  CustomBotConfig,
  EaInputParams,
  EquityPoint,
  IndicatorToggles,
  JournalEntry,
  KronosForecastResult,
  KronosModelVariant,
  LiveQuote,
  Mt5Account,
  OpenPosition,
  TradeDeal,
} from '@/lib/mt5/types';
import { AddBotModal } from './AddBotModal';
import { AiApiConsolePanel } from './AiApiConsolePanel';
import { ChartCanvas } from './ChartCanvas';
import { LoginAccountModal } from './LoginAccountModal';
import { MarketWatch } from './MarketWatch';
import { Mt5BridgeModal } from './Mt5BridgeModal';
import { NavigatorPanel } from './NavigatorPanel';
import { NewOrderModal } from './NewOrderModal';
import { StrategyTesterDock, type DockTabId } from './StrategyTesterDock';
import { TopToolbar } from './TopToolbar';

const STORAGE_ACCOUNTS_KEY = 'mt5_workstation_accounts_v1';
const STORAGE_ACTIVE_KEY = 'mt5_workstation_active_v1';
const STORAGE_THEME_KEY = 'mt5_workstation_dark_v1';
const STORAGE_CUSTOM_BOTS_KEY = 'mt5_workstation_custom_bots_v1';
const STORAGE_BRIDGE_KEY = 'mt5_workstation_bridge_v1';

function createJournalTimestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

export function Mt5Workstation() {
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<'quotes' | 'chart' | 'tester' | 'navigator' | 'api'>('chart');
  const [accounts, setAccounts] = useState<Mt5Account[]>(DEFAULT_ACCOUNTS);
  const [activeAccount, setActiveAccount] = useState<Mt5Account>(DEFAULT_ACCOUNTS[0]);
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [settings, setSettings] = useState<BacktestSettings>({
    eaId: 'ma_cross',
    symbol: 'XAUUSD',
    timeframe: 'H1',
    fromDate: '2026-06-01',
    toDate: '2026-11-18',
    modeling: 'every_tick',
    delayMs: 0,
    initialDeposit: DEFAULT_ACCOUNTS[0].balance,
    leverage: DEFAULT_ACCOUNTS[0].leverage,
    visualMode: false,
    visualSpeed: 8,
  });

  const [inputs, setInputs] = useState<EaInputParams>(DEFAULT_EA_INPUTS);
  const [chartStyle, setChartStyle] = useState<ChartStyle>('candles');
  const [indicators, setIndicators] = useState<IndicatorToggles>({
    fastEma: true,
    slowEma: true,
    bollinger: false,
    rsiSubchart: false,
  });
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showOneClick, setShowOneClick] = useState(true);
  const [algoTrading, setAlgoTrading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);

  const [barsOnScreen, setBarsOnScreen] = useState(110);
  const [rightOffsetBars, setRightOffsetBars] = useState(0);

  // Market & Historical Data
  const [candles, setCandles] = useState<Candle[]>([]);
  const [historySummary, setHistorySummary] = useState<HistoryDatasetSummary | null>(null);
  const [customCsvCandles, setCustomCsvCandles] = useState<Candle[] | null>(null);

  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>(() => {
    const initial: Record<string, LiveQuote> = {};
    for (const s of MT5_SYMBOLS) {
      initial[s.symbol] = {
        symbol: s.symbol,
        bid: s.basePrice,
        ask: Number((s.basePrice + s.spreadPoints * s.point).toFixed(s.digits)),
        spreadPoints: s.spreadPoints,
        direction: 'flat',
        time: Date.now(),
      };
    }
    return initial;
  });

  // Strategy Tester & Visual Mode State
  const [activeDockTab, setActiveDockTab] = useState<DockTabId>('settings');
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);

  // Visual Mode & Manual Replay State
  const [isVisualRunning, setIsVisualRunning] = useState(false);
  const [isVisualPaused, setIsVisualPaused] = useState(false);
  const [visualBarIndex, setVisualBarIndex] = useState(120);
  const [visualDeals, setVisualDeals] = useState<TradeDeal[]>([]);
  const [visualOpenPos, setVisualOpenPos] = useState<OpenPosition | null>(null);
  const [visualBalance, setVisualBalance] = useState(DEFAULT_ACCOUNTS[0].balance);
  const [visualEquityCurve, setVisualEquityCurve] = useState<EquityPoint[]>([]);
  const [oneClickLot, setOneClickLot] = useState(0.1);
  const ticketCounterRef = useRef(2005100);

  // Modals, MT5 Live Bridge & Kronos AI State
  const [customBots, setCustomBots] = useState<CustomBotConfig[]>([]);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginPrefillAccount, setLoginPrefillAccount] = useState<Mt5Account | null>(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [addBotModalOpen, setAddBotModalOpen] = useState(false);
  const [bridgeModalOpen, setBridgeModalOpen] = useState(false);
  const [bridgeUrl, setBridgeUrl] = useState('');
  const [bridgeToken, setBridgeToken] = useState('');
  const [bridgeRefreshNonce, setBridgeRefreshNonce] = useState(0);
  const [liveFeedSource, setLiveFeedSource] = useState<
    'mt5_bridge' | 'live_broker_feed' | 'fallback_reference'
  >('live_broker_feed');
  const [liveFeedLabel, setLiveFeedLabel] = useState('Live Market Feed');
  const [kronosForecast, setKronosForecast] = useState<KronosForecastResult | null>(null);
  const [showKronosOverlay, setShowKronosOverlay] = useState(true);
  const [isKronosPredicting, setIsKronosPredicting] = useState(false);
  const [kronosError, setKronosError] = useState<string | null>(null);

  const [journal, setJournal] = useState<JournalEntry[]>([
    {
      id: 'init-1',
      timestamp: createJournalTimestamp(),
      source: 'System',
      level: 'info',
      message: 'MetaTrader 5 Strategy Tester initialized (Build 4620)',
    },
    {
      id: 'init-2',
      timestamp: createJournalTimestamp(),
      source: 'Accounts',
      level: 'success',
      message: `'${DEFAULT_ACCOUNTS[0].login}': authorized on ${DEFAULT_ACCOUNTS[0].serverName} (DEMO)`,
    },
  ]);

  const appendJournal = useCallback(
    (source: JournalEntry['source'], level: JournalEntry['level'], message: string) => {
      setJournal((prev) => [
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: createJournalTimestamp(),
          source,
          level,
          message,
        },
        ...prev.slice(0, 149),
      ]);
    },
    []
  );

  // Hydrate persisted accounts & theme asynchronously to prevent hydration mismatch and cascading renders
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const savedTheme = localStorage.getItem(STORAGE_THEME_KEY);
        if (savedTheme === 'true') {
          setDarkMode(true);
          document.documentElement.classList.add('dark');
        }

        const rawAccs = localStorage.getItem(STORAGE_ACCOUNTS_KEY);
        const rawActive = localStorage.getItem(STORAGE_ACTIVE_KEY);
        if (rawAccs) {
          const parsedAccs = JSON.parse(rawAccs) as Mt5Account[];
          if (Array.isArray(parsedAccs) && parsedAccs.length > 0) {
            setAccounts(parsedAccs);
            if (rawActive) {
              const activeMeta = JSON.parse(rawActive) as { login: string; serverId: string };
              const found = parsedAccs.find(
                (a) => a.login === activeMeta.login && a.serverId === activeMeta.serverId
              );
              if (found) {
                setActiveAccount(found);
                setVisualBalance(found.balance);
                setSettings((prev) => ({
                  ...prev,
                  initialDeposit: found.balance,
                  leverage: found.leverage,
                }));
              }
            }
          }
        }
        const rawBots = localStorage.getItem(STORAGE_CUSTOM_BOTS_KEY);
        if (rawBots) {
          const parsedBots = JSON.parse(rawBots) as CustomBotConfig[];
          if (Array.isArray(parsedBots)) {
            setCustomBots(parsedBots.map((b) => ({ ...b, isCustom: true })));
          }
        }
        const rawBridge = localStorage.getItem(STORAGE_BRIDGE_KEY);
        if (rawBridge) {
          const parsedBridge = JSON.parse(rawBridge) as { bridgeUrl?: string; bridgeToken?: string };
          if (parsedBridge.bridgeUrl) setBridgeUrl(parsedBridge.bridgeUrl);
          if (parsedBridge.bridgeToken) setBridgeToken(parsedBridge.bridgeToken);
        }
      } catch {
        // Ignore storage read errors
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const allBots = useMemo(() => [...EA_STRATEGIES, ...customBots], [customBots]);

  const persistCustomBots = useCallback((nextBots: CustomBotConfig[]) => {
    try {
      localStorage.setItem(STORAGE_CUSTOM_BOTS_KEY, JSON.stringify(nextBots));
    } catch {
      // Ignore
    }
  }, []);

  const handleSelectEa = useCallback(
    (eaId: string) => {
      setSettings((prev) => ({ ...prev, eaId }));
      const matched = allBots.find((b) => b.id === eaId);
      if (matched) {
        setInputs({ ...DEFAULT_EA_INPUTS, ...matched.defaultInputs });
      }
    },
    [allBots]
  );

  // Sync dark class on <html>
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_THEME_KEY, String(darkMode));
    } catch {
      // Ignore
    }
  }, [darkMode]);

  const persistAccountState = useCallback((nextAccs: Mt5Account[], nextActive: Mt5Account) => {
    try {
      localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(nextAccs));
      localStorage.setItem(
        STORAGE_ACTIVE_KEY,
        JSON.stringify({ login: nextActive.login, serverId: nextActive.serverId })
      );
    } catch {
      // Ignore
    }
  }, []);

  // Load historical candles from /api/mt5/history strictly honoring configured [fromDate..toDate]
  useEffect(() => {
    if (customCsvCandles) return;
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const params = new URLSearchParams({
          symbol: settings.symbol,
          timeframe: settings.timeframe,
          fromDate: settings.fromDate,
          toDate: settings.toDate,
          maxBars: '4500',
        });
        if (bridgeUrl.trim()) {
          params.set('bridgeUrl', bridgeUrl.trim());
        }
        const headers: Record<string, string> = {};
        if (bridgeToken.trim()) {
          headers['x-mt5-bridge-token'] = bridgeToken.trim();
        }
        const res = await fetch(`/api/mt5/history?${params.toString()}`, {
          headers,
          cache: 'no-store',
        });
        const data = await res.json();
        if (!cancelled && data.ok && Array.isArray(data.candles)) {
          setCandles(data.candles);
          setHistorySummary(data.summary);
          setIsVisualRunning(false);
          setVisualBarIndex(data.candles.length);
          setRightOffsetBars(0);
          setKronosForecast(null);
          setShowKronosOverlay(false);
          appendJournal(
            'Tester',
            'info',
            `History loaded: ${settings.symbol},${settings.timeframe} (${data.summary.barsCount} bars · ${formatMt5DateTime(
              data.summary.fromTimestamp
            ).slice(0, 10)} → ${formatMt5DateTime(data.summary.toTimestamp).slice(0, 10)} · ${
              data.summary.providerName ?? data.summary.source
            })`
          );
        }
      } catch {
        if (!cancelled) {
          appendJournal('Network', 'error', 'Không thể tải dữ liệu lịch sử từ API MT5.');
        }
      }
    };

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [
    settings.symbol,
    settings.timeframe,
    settings.fromDate,
    settings.toDate,
    bridgeUrl,
    bridgeToken,
    bridgeRefreshNonce,
    customCsvCandles,
    appendJournal,
  ]);

  // Real Live MT5 / Broker Feed Polling (replaces synthetic jitter)
  const toDateRef = useRef(settings.toDate);
  const activeSymbolRef = useRef(settings.symbol);
  const isCustomCsvRef = useRef(Boolean(customCsvCandles));
  const isVisualRunningRef = useRef(isVisualRunning);
  useEffect(() => {
    toDateRef.current = settings.toDate;
    activeSymbolRef.current = settings.symbol;
    isCustomCsvRef.current = Boolean(customCsvCandles);
    isVisualRunningRef.current = isVisualRunning;
  }, [settings.toDate, settings.symbol, customCsvCandles, isVisualRunning]);

  useEffect(() => {
    let active = true;

    const pollLiveQuotes = async () => {
      try {
        const params = new URLSearchParams();
        if (bridgeUrl.trim()) params.set('bridgeUrl', bridgeUrl.trim());
        const headers: Record<string, string> = {};
        if (bridgeToken.trim()) headers['x-mt5-bridge-token'] = bridgeToken.trim();

        const qs = params.toString();
        const res = await fetch(`/api/mt5/live${qs ? `?${qs}` : ''}`, {
          headers,
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !data?.ok || !data.quotes) return;

        setLiveFeedSource(data.source);
        setLiveFeedLabel(data.serverLabel);
        setQuotes((prev) => {
          const next: Record<string, LiveQuote> = {};
          for (const spec of MT5_SYMBOLS) {
            const incoming = data.quotes[spec.symbol] as LiveQuote | undefined;
            const prevQ = prev[spec.symbol];
            if (!incoming) {
              if (prevQ) next[spec.symbol] = prevQ;
              continue;
            }
            next[spec.symbol] = {
              ...incoming,
              direction: prevQ
                ? incoming.bid > prevQ.bid
                  ? 'up'
                  : incoming.bid < prevQ.bid
                  ? 'down'
                  : prevQ.direction
                : 'flat',
            };
          }
          return next;
        });

        // Synchronize live tip bar ONLY when setup toDate includes the current live market edge
        const toMs = Date.parse(`${toDateRef.current}T23:59:59Z`);
        const includesLiveEdge = !Number.isFinite(toMs) || toMs >= Date.now() - 86400_000 * 2;
        const liveSymQuote = data.quotes[activeSymbolRef.current] as LiveQuote | undefined;

        if (
          includesLiveEdge &&
          liveSymQuote &&
          !isCustomCsvRef.current &&
          !isVisualRunningRef.current
        ) {
          const symSpec = getSymbolSpec(activeSymbolRef.current);
          setCandles((prevCandles) => {
            if (prevCandles.length === 0) return prevCandles;
            const last = prevCandles[prevCandles.length - 1];
            const relDiff = Math.abs(liveSymQuote.bid - last.close) / Math.max(1e-6, last.close);
            if (relDiff > 0.04 || liveSymQuote.bid === last.close) return prevCandles;
            const updatedLast: Candle = {
              ...last,
              close: Number(liveSymQuote.bid.toFixed(symSpec.digits)),
              high: Number(Math.max(last.high, liveSymQuote.bid).toFixed(symSpec.digits)),
              low: Number(Math.min(last.low, liveSymQuote.bid).toFixed(symSpec.digits)),
            };
            const copy = prevCandles.slice();
            copy[copy.length - 1] = updatedLast;
            return copy;
          });
        }
      } catch {
        // Silent transient network skip until next live poll tick
      }
    };

    pollLiveQuotes();
    const timer = setInterval(pollLiveQuotes, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [bridgeUrl, bridgeToken, bridgeRefreshNonce]);

  // Compute indicators once for Visual Mode EA signals
  const visualIndicators = useMemo(() => {
    if (!isVisualRunning || candles.length === 0) return null;
    return {
      fastEma: calculateEMA(candles, inputs.fastMaPeriod),
      slowEma: calculateEMA(candles, inputs.slowMaPeriod),
      rsi: calculateRSI(candles, inputs.rsiPeriod),
      donchian: calculateDonchian(candles, inputs.donchianPeriod),
    };
  }, [
    isVisualRunning,
    candles,
    inputs.fastMaPeriod,
    inputs.slowMaPeriod,
    inputs.rsiPeriod,
    inputs.donchianPeriod,
  ]);

  // Step 1 bar forward in Visual Mode
  const stepOneVisualBar = useCallback(() => {
    if (!isVisualRunning || candles.length === 0) return;

    setVisualBarIndex((prevIdx) => {
      if (prevIdx >= candles.length) {
        setIsVisualRunning(false);
        setIsVisualPaused(false);
        return prevIdx;
      }

      const nextIdx = prevIdx + 1;
      const bar = candles[nextIdx - 1];
      const spec = getSymbolSpec(settings.symbol);
      const server = getBrokerServer(activeAccount.serverId);
      const spreadPrice = spec.spreadPoints * spec.point;

      let currentBal = visualBalance;
      let currentPos = visualOpenPos;
      const newDeals = [...visualDeals];

      if (currentPos) {
        const evaluated = evaluatePositionBar(
          currentPos,
          bar,
          nextIdx - 1,
          spec,
          inputs.trailingStopPoints
        );
        currentPos = evaluated.updatedPosition;
        if (evaluated.closedReason && evaluated.closePrice !== null) {
          const closed = closePositionToDeal(
            currentPos,
            nextIdx - 1,
            bar.time,
            evaluated.closePrice,
            evaluated.closedReason,
            spec,
            currentBal
          );
          newDeals.push(closed.deal);
          currentBal = closed.newBalance;
          currentPos = null;
          appendJournal(
            'Trades',
            closed.deal.netProfit >= 0 ? 'success' : 'warning',
            `#${closed.deal.ticket} closed (${closed.deal.closeReason}) @ ${closed.deal.closePrice} · Net: $${closed.deal.netProfit.toFixed(2)}`
          );
        }
      }

      // EA auto signal during visual mode if not manual_replay & algoTrading enabled
      if (
        settings.eaId !== 'manual_replay' &&
        algoTrading &&
        visualIndicators &&
        nextIdx - 1 >= 30
      ) {
        const i = nextIdx - 1;
        let signal: 'buy' | 'sell' | null = null;
        const botDef = allBots.find((b) => b.id === settings.eaId);
        const resolvedStrategy =
          settings.eaId === 'manual_replay'
            ? 'manual_replay'
            : botDef?.baseStrategy ?? 'ma_cross';

        if (resolvedStrategy === 'ma_cross') {
          const fp = visualIndicators.fastEma[i - 1];
          const sp = visualIndicators.slowEma[i - 1];
          const fc = visualIndicators.fastEma[i];
          const sc = visualIndicators.slowEma[i];
          if (fp !== null && sp !== null && fc !== null && sc !== null) {
            if (fp <= sp && fc > sc) signal = 'buy';
            else if (fp >= sp && fc < sc) signal = 'sell';
          }
        } else if (resolvedStrategy === 'rsi_reversion') {
          const rp = visualIndicators.rsi[i - 1];
          const rc = visualIndicators.rsi[i];
          if (rp !== null && rc !== null) {
            if (rp <= inputs.rsiOversold && rc > inputs.rsiOversold) signal = 'buy';
            else if (rp >= inputs.rsiOverbought && rc < inputs.rsiOverbought) signal = 'sell';
          }
        } else if (resolvedStrategy === 'donchian_breakout') {
          const dc = visualIndicators.donchian[i];
          if (dc) {
            if (bar.close > dc.upper) signal = 'buy';
            else if (bar.close < dc.lower) signal = 'sell';
          }
        } else if (resolvedStrategy === 'scalping_pro') {
          signal = evaluateScalpingSignal(candles, i, spec, inputs);
        } else if (resolvedStrategy === 'kronos_forecast') {
          signal = evaluateKronosBarSignal(candles, i, spec, 48);
        }

        if (signal) {
          if (currentPos && currentPos.type !== signal) {
            const exitPrice = currentPos.type === 'buy' ? bar.close : bar.close + spreadPrice;
            const closed = closePositionToDeal(
              currentPos,
              i,
              bar.time,
              exitPrice,
              'signal',
              spec,
              currentBal
            );
            newDeals.push(closed.deal);
            currentBal = closed.newBalance;
            currentPos = null;
          }
          if (!currentPos) {
            ticketCounterRef.current += 1;
            currentPos = openPositionFromBar(
              ticketCounterRef.current,
              spec,
              server,
              signal,
              inputs.lotSize,
              i,
              bar,
              inputs.stopLossPoints,
              inputs.takeProfitPoints,
              settings.eaId
            );
          }
        }
      }

      const unrealized = currentPos
        ? currentPos.unrealizedProfit + currentPos.commission + currentPos.swap
        : 0;
      const equity = Number((currentBal + unrealized).toFixed(2));
      const margin = currentPos
        ? calculateRequiredMargin(spec, currentPos.volume, bar.close, settings.leverage)
        : 0;

      const nextCurve = [
        ...visualEquityCurve,
        {
          barIndex: nextIdx - 1,
          time: bar.time,
          balance: Number(currentBal.toFixed(2)),
          equity,
          marginLoadPercent: equity > 0 ? Number(((margin / equity) * 100).toFixed(2)) : 0,
        },
      ];

      setVisualOpenPos(currentPos);
      setVisualBalance(currentBal);
      setVisualDeals(newDeals);
      setVisualEquityCurve(nextCurve);

      const pct = Math.round((nextIdx / candles.length) * 100);
      setProgressPercent(pct);

      // Build live report snapshot
      const metrics = computeBacktestMetrics(
        settings.initialDeposit,
        newDeals,
        nextCurve,
        nextIdx,
        nextIdx * 12,
        0
      );
      setReport({
        id: 'visual_live',
        runAt: Date.now(),
        accountLogin: activeAccount.login,
        accountType: activeAccount.accountType,
        serverName: activeAccount.serverName,
        settings,
        inputs,
        metrics,
        deals: newDeals,
        equityCurve: nextCurve,
      });

      if (nextIdx >= candles.length) {
        setIsVisualRunning(false);
        setIsVisualPaused(false);
        appendJournal(
          'Tester',
          'success',
          `Visual Backtest hoàn tất (${candles.length} bars, ${newDeals.length} lệnh).`
        );
      }

      return nextIdx;
    });
  }, [
    isVisualRunning,
    candles,
    settings,
    activeAccount,
    visualBalance,
    visualOpenPos,
    visualDeals,
    visualEquityCurve,
    inputs,
    algoTrading,
    visualIndicators,
    allBots,
    appendJournal,
  ]);

  // Visual Mode Playback Timer
  useEffect(() => {
    if (!isVisualRunning || isVisualPaused) return;
    const intervalMs = Math.max(45, Math.round(650 / settings.visualSpeed));
    const timer = setTimeout(() => {
      stepOneVisualBar();
    }, intervalMs);
    return () => clearTimeout(timer);
  }, [isVisualRunning, isVisualPaused, settings.visualSpeed, visualBarIndex, stepOneVisualBar]);

  // Start Backtest (Fast Server API or Visual Mode)
  const handleStartBacktest = async () => {
    if (candles.length < 30) {
      appendJournal('Tester', 'error', 'Dữ liệu lịch sử chưa đủ để chạy Backtest.');
      return;
    }

    if (settings.visualMode || settings.eaId === 'manual_replay') {
      const startBar = Math.min(80, Math.floor(candles.length * 0.2));
      setIsVisualRunning(true);
      setIsVisualPaused(settings.eaId === 'manual_replay');
      setVisualBarIndex(startBar);
      setVisualDeals([]);
      setVisualOpenPos(null);
      setVisualBalance(settings.initialDeposit);
      setVisualEquityCurve([
        {
          barIndex: startBar - 1,
          time: candles[startBar - 1].time,
          balance: settings.initialDeposit,
          equity: settings.initialDeposit,
          marginLoadPercent: 0,
        },
      ]);
      setProgressPercent(Math.round((startBar / candles.length) * 100));
      setActiveDockTab(settings.eaId === 'manual_replay' ? 'trade' : 'graph');
      appendJournal(
        'Tester',
        'info',
        `Bắt đầu Visual Mode (${settings.eaId}) trên ${settings.symbol},${settings.timeframe} với vốn $${settings.initialDeposit}`
      );
      return;
    }

    // Fast Automated Backtest via /api/mt5/backtest
    setIsRunning(true);
    setProgressPercent(25);
    appendJournal(
      'Tester',
      'info',
      `Running ${settings.eaId} on ${settings.symbol},${settings.timeframe} (${activeAccount.accountType.toUpperCase()} · ${activeAccount.serverName})...`
    );

    try {
      const matchedBot = allBots.find((b) => b.id === settings.eaId);
      const res = await fetch('/api/mt5/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings,
          inputs,
          account: activeAccount,
          customCandles: customCsvCandles,
          baseStrategy: matchedBot?.baseStrategy,
          bridgeUrl: bridgeUrl.trim() || undefined,
          bridgeToken: bridgeToken.trim() || undefined,
        }),
      });
      const data = await res.json();
      setProgressPercent(100);
      if (res.ok && data.ok && data.report) {
        setReport(data.report);
        setActiveDockTab('backtest');
        appendJournal(
          'Tester',
          'success',
          `Backtest finished: ${data.report.metrics.totalTrades} deals, Net Profit $${data.report.metrics.totalNetProfit.toFixed(
            2
          )}, PF ${data.report.metrics.profitFactor.toFixed(2)} (${data.report.metrics.executionTimeMs} ms)`
        );
      } else {
        appendJournal('Tester', 'error', data.error ?? 'Lỗi chạy Strategy Tester.');
      }
    } catch {
      appendJournal('Tester', 'error', 'Không thể kết nối API Strategy Tester.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleStopBacktest = () => {
    setIsRunning(false);
    setIsVisualRunning(false);
    setIsVisualPaused(false);
    appendJournal('Tester', 'warning', 'Người dùng đã dừng Strategy Tester.');
  };

  const handleRunKronosForecast = async (config: {
    modelVariant: KronosModelVariant;
    lookback: number;
    predLen: number;
    temperature: number;
    topP: number;
    sampleCount: number;
    kronosServerUrl: string;
    preferPythonServer: boolean;
  }) => {
    setIsKronosPredicting(true);
    setKronosError(null);
    try {
      const res = await fetch('/api/mt5/kronos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: settings.symbol,
          timeframe: settings.timeframe,
          candles: candles.length >= 32 ? candles : undefined,
          bridgeUrl: bridgeUrl.trim() || undefined,
          bridgeToken: bridgeToken.trim() || undefined,
          ...config,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const msg = json.error ?? 'Không thể chạy dự báo Kronos AI.';
        setKronosError(msg);
        appendJournal('Tester', 'error', msg);
        return;
      }
      setKronosForecast(json as KronosForecastResult);
      setShowKronosOverlay(true);
      setRightOffsetBars(0);
      appendJournal(
        'Tester',
        'success',
        `Kronos AI (${json.modelVariant}): ${json.symbol},${json.timeframe} -> Target ${json.targetPrice} (${json.bias.toUpperCase()}, ${json.expectedMovePercent >= 0 ? '+' : ''}${json.expectedMovePercent}%)`
      );
    } catch {
      const msg = 'Lỗi kết nối API Kronos AI.';
      setKronosError(msg);
      appendJournal('Network', 'error', msg);
    } finally {
      setIsKronosPredicting(false);
    }
  };

  const handleRunKronosBacktest = async () => {
    handleSelectEa('kronos_forecast');
    setActiveDockTab('settings');
    if (candles.length < 30) return;

    setIsRunning(true);
    setProgressPercent(25);
    const kronosSettings: BacktestSettings = {
      ...settings,
      eaId: 'kronos_forecast',
      visualMode: false,
    };
    const kronosInputs: EaInputParams = {
      ...DEFAULT_EA_INPUTS,
      ...(EA_STRATEGIES.find((s) => s.id === 'kronos_forecast')?.defaultInputs ?? {}),
    };

    try {
      const res = await fetch('/api/mt5/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: kronosSettings,
          inputs: kronosInputs,
          account: activeAccount,
          customCandles: customCsvCandles,
          baseStrategy: 'kronos_forecast',
          bridgeUrl: bridgeUrl.trim() || undefined,
          bridgeToken: bridgeToken.trim() || undefined,
        }),
      });
      const data = await res.json();
      setProgressPercent(100);
      if (res.ok && data.ok && data.report) {
        setReport(data.report);
        setActiveDockTab('backtest');
        appendJournal(
          'Tester',
          'success',
          `Kronos AI EA Backtest: ${data.report.metrics.totalTrades} deals, Net $${data.report.metrics.totalNetProfit.toFixed(
            2
          )}, PF ${data.report.metrics.profitFactor.toFixed(2)}`
        );
      }
    } finally {
      setIsRunning(false);
    }
  };

  // Manual Order Execution (from One-Click panel or F9 Modal)
  const executeManualOrder = useCallback(
    (order: {
      symbol: string;
      side: 'buy' | 'sell';
      volume: number;
      slPrice: number;
      tpPrice: number;
      comment: string;
    }) => {
      const barIdx = Math.max(0, Math.min(candles.length - 1, visualBarIndex - 1));
      const bar = candles[barIdx];
      if (!bar) return;

      const spec = getSymbolSpec(order.symbol);
      const server = getBrokerServer(activeAccount.serverId);
      const liveQ = !isVisualRunning ? quotes[order.symbol] : undefined;
      const spreadPrice = (liveQ?.spreadPoints ?? spec.spreadPoints) * spec.point;
      const refBid = liveQ ? liveQ.bid : bar.close;
      const refAsk = liveQ ? liveQ.ask : bar.close + spreadPrice;

      // Close existing position if open
      let nextBal = visualBalance;
      const nextDeals = [...visualDeals];
      if (visualOpenPos) {
        const closePx = visualOpenPos.type === 'buy' ? refBid : refAsk;
        const closed = closePositionToDeal(
          visualOpenPos,
          barIdx,
          bar.time,
          closePx,
          'manual',
          spec,
          nextBal
        );
        nextDeals.push(closed.deal);
        nextBal = closed.newBalance;
      }

      ticketCounterRef.current += 1;
      const openPrice =
        order.side === 'buy'
          ? Number(refAsk.toFixed(spec.digits))
          : Number(refBid.toFixed(spec.digits));

      const sl =
        order.slPrice > 0
          ? order.slPrice
          : inputs.stopLossPoints > 0
          ? Number(
              (order.side === 'buy'
                ? openPrice - inputs.stopLossPoints * spec.point
                : openPrice + inputs.stopLossPoints * spec.point
              ).toFixed(spec.digits)
            )
          : 0;

      const tp =
        order.tpPrice > 0
          ? order.tpPrice
          : inputs.takeProfitPoints > 0
          ? Number(
              (order.side === 'buy'
                ? openPrice + inputs.takeProfitPoints * spec.point
                : openPrice - inputs.takeProfitPoints * spec.point
              ).toFixed(spec.digits)
            )
          : 0;

      const pos: OpenPosition = {
        ticket: ticketCounterRef.current,
        symbol: order.symbol,
        type: order.side,
        volume: order.volume,
        openTime: bar.time,
        openBarIndex: barIdx,
        openPrice,
        sl,
        tp,
        commission: Number((-server.commissionPerLot * order.volume).toFixed(2)),
        swap: 0,
        comment: order.comment,
        unrealizedProfit: 0,
      };

      setVisualBalance(nextBal);
      setVisualDeals(nextDeals);
      setVisualOpenPos(pos);
      setActiveDockTab('trade');
      appendJournal(
        'Trades',
        'info',
        `#${pos.ticket} ${pos.type.toUpperCase()} ${pos.volume} ${pos.symbol} @ ${formatPrice(
          pos.openPrice,
          spec.digits
        )} (SL: ${pos.sl}, TP: ${pos.tp})`
      );
    },
    [
      candles,
      visualBarIndex,
      activeAccount.serverId,
      isVisualRunning,
      quotes,
      visualBalance,
      visualDeals,
      visualOpenPos,
      inputs.stopLossPoints,
      inputs.takeProfitPoints,
      appendJournal,
    ]
  );

  const handleCloseOpenPosition = () => {
    if (!visualOpenPos || candles.length === 0) return;
    const barIdx = Math.max(0, Math.min(candles.length - 1, visualBarIndex - 1));
    const bar = candles[barIdx];
    const spec = getSymbolSpec(visualOpenPos.symbol);
    const spreadPrice = spec.spreadPoints * spec.point;
    const closePx = visualOpenPos.type === 'buy' ? bar.close : bar.close + spreadPrice;

    const closed = closePositionToDeal(
      visualOpenPos,
      barIdx,
      bar.time,
      closePx,
      'manual',
      spec,
      visualBalance
    );
    const nextDeals = [...visualDeals, closed.deal];
    setVisualDeals(nextDeals);
    setVisualBalance(closed.newBalance);
    setVisualOpenPos(null);

    appendJournal(
      'Trades',
      closed.deal.netProfit >= 0 ? 'success' : 'warning',
      `Đóng thủ công #${closed.deal.ticket} @ ${closed.deal.closePrice} · Net: $${closed.deal.netProfit.toFixed(2)}`
    );
  };

  // Import MT5 CSV History file
  const handleImportCsvFile = async (file: File) => {
    try {
      const csvText = await file.text();
      const res = await fetch('/api/mt5/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: settings.symbol,
          timeframe: settings.timeframe,
          csvText,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        appendJournal('Tester', 'error', data.error ?? 'Không thể đọc file CSV MT5.');
        return;
      }
      setCustomCsvCandles(data.candles);
      setCandles(data.candles);
      setHistorySummary(data.summary);
      setVisualBarIndex(data.candles.length);
      appendJournal(
        'Tester',
        'success',
        `Đã nạp ${data.summary.barsCount} nến từ file '${file.name}' (Quality ${data.summary.historyQualityPercent}%)`
      );
    } catch {
      appendJournal('Tester', 'error', 'Lỗi đọc file CSV lịch sử MT5.');
    }
  };

  // Export CSV Backtest Report
  const handleExportCsv = () => {
    const activeDeals = report?.deals ?? visualDeals;
    if (activeDeals.length === 0) {
      appendJournal('System', 'warning', 'Chưa có lịch sử lệnh để xuất CSV.');
      return;
    }
    const header = [
      'Ticket',
      'Symbol',
      'Type',
      'Volume',
      'OpenTime',
      'OpenPrice',
      'SL',
      'TP',
      'CloseTime',
      'ClosePrice',
      'Commission',
      'Swap',
      'NetProfit',
      'BalanceAfter',
      'CloseReason',
    ].join(',');
    const rows = activeDeals.map((d) =>
      [
        d.ticket,
        d.symbol,
        d.type,
        d.volume,
        d.openTime,
        d.openPrice,
        d.sl,
        d.tp,
        d.closeTime,
        d.closePrice,
        d.commission,
        d.swap,
        d.netProfit,
        d.balanceAfter,
        d.closeReason,
      ].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MT5_Report_${settings.symbol}_${settings.timeframe}_${activeAccount.login}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    appendJournal('System', 'success', `Đã xuất báo cáo CSV (${activeDeals.length} lệnh).`);
  };

  // Demo account balance reset
  const handleResetDemoBalance = async (amount: number) => {
    try {
      const res = await fetch('/api/mt5/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset_demo',
          account: activeAccount,
          newBalance: amount,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        appendJournal('Accounts', 'error', data.error ?? 'Không thể nạp tiền Demo.');
        return;
      }
      const updated = data.account as Mt5Account;
      const nextList = accounts.map((a) =>
        a.login === updated.login && a.serverId === updated.serverId ? updated : a
      );
      setAccounts(nextList);
      setActiveAccount(updated);
      setVisualBalance(updated.balance);
      setSettings((prev) => ({ ...prev, initialDeposit: updated.balance }));
      persistAccountState(nextList, updated);
      appendJournal(
        'Accounts',
        'success',
        `Đã nạp lại số dư Demo cho #${updated.login}: $${updated.balance.toLocaleString('en-US')}`
      );
    } catch {
      appendJournal('Accounts', 'error', 'Lỗi khi cập nhật số dư Demo.');
    }
  };

  // Keyboard shortcuts (F9 New Order, F12 Step 1 Bar)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'F9') {
        e.preventDefault();
        setOrderModalOpen(true);
      } else if (e.key === 'F12' && isVisualRunning) {
        e.preventDefault();
        stepOneVisualBar();
      } else if (e.code === 'Space' && isVisualRunning) {
        e.preventDefault();
        setIsVisualPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isVisualRunning, stepOneVisualBar]);

  const activeSpec = getSymbolSpec(settings.symbol);
  const currentBarIdx = Math.max(0, Math.min(candles.length - 1, visualBarIndex - 1));
  const currentBar = candles[currentBarIdx];
  const currentBid = currentBar ? currentBar.close : quotes[settings.symbol]?.bid ?? activeSpec.basePrice;

  const manualEquity = useMemo(() => {
    if (!visualOpenPos) return visualBalance;
    const profit = calculateProfitUsd(
      getSymbolSpec(visualOpenPos.symbol),
      visualOpenPos.type,
      visualOpenPos.volume,
      visualOpenPos.openPrice,
      currentBid
    );
    return Number((visualBalance + profit + visualOpenPos.commission + visualOpenPos.swap).toFixed(2));
  }, [visualBalance, visualOpenPos, currentBid]);

  const manualMargin = useMemo(() => {
    if (!visualOpenPos) return 0;
    return calculateRequiredMargin(
      getSymbolSpec(visualOpenPos.symbol),
      visualOpenPos.volume,
      visualOpenPos.openPrice,
      settings.leverage
    );
  }, [visualOpenPos, settings.leverage]);

  const displayedDeals = isVisualRunning
    ? visualDeals
    : report?.settings.symbol === settings.symbol
    ? report.deals
    : [];

  const activeServer = getBrokerServer(activeAccount.serverId);

  const syncedQuotes = useMemo(() => {
    const activeQuote = quotes[settings.symbol];
    if (!activeQuote) return quotes;
    // Sync Market Watch active price to replay candle ONLY during Visual Mode replay;
    // otherwise Market Watch strictly reflects real-time live market quotes!
    if (!isVisualRunning || !currentBar) return quotes;
    const spec = getSymbolSpec(settings.symbol);
    const bid = Number(currentBar.close.toFixed(spec.digits));
    const ask = Number((bid + activeQuote.spreadPoints * spec.point).toFixed(spec.digits));
    return {
      ...quotes,
      [settings.symbol]: {
        ...activeQuote,
        bid,
        ask,
        direction: bid > activeQuote.bid ? 'up' : bid < activeQuote.bid ? 'down' : activeQuote.direction,
      },
    };
  }, [quotes, settings.symbol, currentBar, isVisualRunning]);

  return (
    <div className="h-dvh w-screen flex flex-col overflow-hidden bg-[#E5E7EB] dark:bg-[#0F131D] text-slate-900 dark:text-slate-100">
      <TopToolbar
        activeAccount={activeAccount}
        activeSymbol={settings.symbol}
        timeframe={settings.timeframe}
        chartStyle={chartStyle}
        indicators={indicators}
        showCrosshair={showCrosshair}
        showOneClick={showOneClick}
        algoTrading={algoTrading}
        autoScroll={autoScroll}
        darkMode={darkMode}
        sidebarOpen={sidebarOpen}
        liveFeedSource={liveFeedSource}
        liveFeedLabel={liveFeedLabel}
        showChartToolbarOnMobile={mobileTab === 'chart'}
        onSelectTimeframe={(tf) => setSettings((prev) => ({ ...prev, timeframe: tf }))}
        onSelectChartStyle={setChartStyle}
        onToggleIndicator={(key) =>
          setIndicators((prev) => ({ ...prev, [key]: !prev[key] }))
        }
        onToggleCrosshair={() => setShowCrosshair((p) => !p)}
        onToggleOneClick={() => setShowOneClick((p) => !p)}
        onToggleAlgoTrading={() => setAlgoTrading((p) => !p)}
        onToggleAutoScroll={() => setAutoScroll((p) => !p)}
        onZoomIn={() =>
          setBarsOnScreen((prev) => Math.max(24, Math.round(prev * 0.78)))
        }
        onZoomOut={() =>
          setBarsOnScreen((prev) => Math.min(600, Math.round(prev * 1.25)))
        }
        onOpenNewOrder={() => setOrderModalOpen(true)}
        onOpenLoginModal={() => {
          setLoginPrefillAccount(null);
          setLoginModalOpen(true);
        }}
        onOpenBridgeModal={() => setBridgeModalOpen(true)}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        onToggleSidebar={() => setSidebarOpen((s) => !s)}
        onJumpToTester={() => {
          setActiveDockTab('settings');
          if (isMobile) setMobileTab('tester');
        }}
        onJumpToAiApi={() => {
          setActiveDockTab('api');
          if (isMobile) setMobileTab('api');
        }}
        onJumpToKronos={() => {
          setActiveDockTab('kronos');
          if (isMobile) setMobileTab('tester');
        }}
        onExportCsv={handleExportCsv}
      />

      {isMobile ? (
        <>
          {/* Mobile Portrait Workspace */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {mobileTab === 'quotes' && (
              <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-[#161A25]">
                <MarketWatch
                  quotes={syncedQuotes}
                  activeSymbol={settings.symbol}
                  onSelectSymbol={(sym) => {
                    setCustomCsvCandles(null);
                    setSettings((prev) => ({ ...prev, symbol: sym }));
                  }}
                  onOpenOrderForSymbol={(sym) => {
                    setSettings((prev) => ({ ...prev, symbol: sym }));
                    setOrderModalOpen(true);
                  }}
                />
                <div className="shrink-0 p-2.5 border-t border-slate-200 dark:border-slate-800 bg-[#F3F4F6] dark:bg-[#1E222D] flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-semibold truncate">
                    {settings.symbol} · {settings.timeframe}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setOrderModalOpen(true)}
                      className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
                    >
                      Đặt lệnh
                    </button>
                    <button
                      type="button"
                      onClick={() => setMobileTab('chart')}
                      className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                    >
                      Mở Biểu đồ
                    </button>
                  </div>
                </div>
              </div>
            )}

            {mobileTab === 'chart' && (
              <main className="flex-1 min-h-0 flex flex-col">
                <ChartCanvas
                  symbol={settings.symbol}
                  timeframe={settings.timeframe}
                  candles={candles}
                  visibleEndIndex={isVisualRunning ? visualBarIndex : candles.length}
                  chartStyle={chartStyle}
                  indicators={indicators}
                  inputs={inputs}
                  deals={displayedDeals}
                  openPosition={visualOpenPos}
                  liveQuote={quotes[settings.symbol] ?? null}
                  kronosForecast={kronosForecast}
                  showKronosOverlay={showKronosOverlay}
                  showCrosshair={showCrosshair}
                  showOneClick={showOneClick}
                  autoScroll={autoScroll}
                  darkMode={darkMode}
                  barsOnScreen={barsOnScreen}
                  rightOffsetBars={rightOffsetBars}
                  onChangeBarsOnScreen={setBarsOnScreen}
                  onChangeRightOffsetBars={setRightOffsetBars}
                  isVisualRunning={isVisualRunning}
                  isVisualPaused={isVisualPaused}
                  visualSpeed={settings.visualSpeed}
                  oneClickLot={oneClickLot}
                  onChangeOneClickLot={setOneClickLot}
                  onOneClickOrder={(side) =>
                    executeManualOrder({
                      symbol: settings.symbol,
                      side,
                      volume: oneClickLot,
                      slPrice: 0,
                      tpPrice: 0,
                      comment: 'One-Click Backtest',
                    })
                  }
                  onToggleVisualPause={() => setIsVisualPaused((p) => !p)}
                  onStepVisualBar={stepOneVisualBar}
                  onStopVisual={handleStopBacktest}
                  onChangeVisualSpeed={(spd) =>
                    setSettings((prev) => ({ ...prev, visualSpeed: spd }))
                  }
                />
              </main>
            )}

            {mobileTab === 'tester' && (
              <StrategyTesterDock
                mobileFullHeight
                activeTab={activeDockTab}
                onChangeTab={setActiveDockTab}
                account={activeAccount}
                bots={allBots}
                settings={settings}
                inputs={inputs}
                report={report}
                historySummary={historySummary}
                openPosition={visualOpenPos}
                manualBalance={visualBalance}
                manualEquity={manualEquity}
                manualMargin={manualMargin}
                journal={journal}
                isRunning={isRunning}
                isVisualRunning={isVisualRunning}
                progressPercent={progressPercent}
                kronosForecast={kronosForecast}
                showKronosOverlay={showKronosOverlay}
                isKronosPredicting={isKronosPredicting}
                kronosError={kronosError}
                onToggleKronosOverlay={() => setShowKronosOverlay((v) => !v)}
                onRunKronosForecast={handleRunKronosForecast}
                onRunKronosBacktest={handleRunKronosBacktest}
                onExecuteKronosTrade={(order) =>
                  executeManualOrder({
                    symbol: settings.symbol,
                    side: order.action === 'BUY' ? 'buy' : 'sell',
                    volume: order.lotSize,
                    slPrice: order.stopLoss,
                    tpPrice: order.takeProfit,
                    comment: `Kronos AI (${kronosForecast?.modelVariant ?? 'kronos-small'})`,
                  })
                }
                onSelectEa={handleSelectEa}
                onOpenAddBotModal={() => setAddBotModalOpen(true)}
                onChangeSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
                onChangeInputs={(patch) => setInputs((prev) => ({ ...prev, ...patch }))}
                onResetInputs={() => {
                  const matched = allBots.find((b) => b.id === settings.eaId);
                  setInputs({ ...DEFAULT_EA_INPUTS, ...(matched?.defaultInputs ?? {}) });
                }}
                onStartBacktest={handleStartBacktest}
                onStopBacktest={handleStopBacktest}
                onImportCsvFile={handleImportCsvFile}
                onResetBrokerHistory={() => setCustomCsvCandles(null)}
                onJumpToBar={(barIdx) => {
                  const total = isVisualRunning ? visualBarIndex : candles.length;
                  if (total === 0) return;
                  const targetEnd = Math.min(total - 1, barIdx + Math.floor(barsOnScreen / 2));
                  setRightOffsetBars(Math.max(0, total - 1 - targetEnd));
                  setMobileTab('chart');
                }}
                onCloseOpenPosition={handleCloseOpenPosition}
                onResetDemoBalance={handleResetDemoBalance}
                onExportCsv={handleExportCsv}
              />
            )}

            {mobileTab === 'navigator' && (
              <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-[#161A25]">
                <NavigatorPanel
                  accounts={accounts}
                  activeAccount={activeAccount}
                  bots={allBots}
                  selectedEa={settings.eaId}
                  indicators={indicators}
                  onSwitchAccount={(acc) => {
                    setActiveAccount(acc);
                    setVisualBalance(acc.balance);
                    setSettings((prev) => ({
                      ...prev,
                      initialDeposit: acc.balance,
                      leverage: acc.leverage,
                    }));
                    persistAccountState(accounts, acc);
                    appendJournal(
                      'Accounts',
                      'success',
                      `'${acc.login}': switched account on ${acc.serverName} (${acc.accountType.toUpperCase()})`
                    );
                  }}
                  onOpenLoginModal={(acc) => {
                    setLoginPrefillAccount(acc ?? null);
                    setLoginModalOpen(true);
                  }}
                  onSelectEa={(eaId) => {
                    handleSelectEa(eaId);
                    setActiveDockTab('settings');
                    setMobileTab('tester');
                  }}
                  onOpenAddBotModal={() => setAddBotModalOpen(true)}
                  onDeleteCustomBot={(botId) => {
                    const nextBots = customBots.filter((b) => b.id !== botId);
                    setCustomBots(nextBots);
                    persistCustomBots(nextBots);
                    if (settings.eaId === botId) {
                      handleSelectEa('ma_cross');
                    }
                    appendJournal('Tester', 'info', `Đã gỡ bỏ Bot tùy chỉnh '${botId}'.`);
                  }}
                  onToggleIndicator={(key) =>
                    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                />
              </div>
            )}

            {mobileTab === 'api' && (
              <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-[#161A25]">
                <AiApiConsolePanel />
              </div>
            )}
          </div>

          {/* Mobile Portrait Bottom Tab Bar */}
          <nav
            aria-label="Điều hướng Mobile MT5"
            className="shrink-0 grid grid-cols-5 border-t border-slate-300 dark:border-slate-800 bg-[#F3F4F6] dark:bg-[#1E222D] pb-[env(safe-area-inset-bottom)]"
          >
            {(
              [
                { id: 'quotes', label: 'Bảng giá', Icon: ListOrdered },
                { id: 'chart', label: 'Biểu đồ', Icon: CandlestickChart },
                { id: 'tester', label: 'Backtest', Icon: SlidersHorizontal },
                { id: 'navigator', label: 'Bot & TK', Icon: Bot },
                { id: 'api', label: 'AI API', Icon: Terminal },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = mobileTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMobileTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[10px] font-medium transition-colors ${
                    active
                      ? 'text-blue-700 dark:text-blue-400 bg-white/80 dark:bg-[#161A25]'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>
        </>
      ) : (
        <>
          {/* Middle Split: Left Dock (Market Watch + Navigator) + Center Chart */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {sidebarOpen && (
              <aside
                aria-label="Thanh công cụ trái MT5"
                className="w-[248px] xl:w-[272px] shrink-0 border-r border-slate-300 dark:border-slate-800 flex flex-col min-h-0 bg-white dark:bg-[#161A25]"
              >
                <MarketWatch
                  quotes={syncedQuotes}
                  activeSymbol={settings.symbol}
                  onSelectSymbol={(sym) => {
                    setCustomCsvCandles(null);
                    setSettings((prev) => ({ ...prev, symbol: sym }));
                  }}
                  onOpenOrderForSymbol={(sym) => {
                    setSettings((prev) => ({ ...prev, symbol: sym }));
                    setOrderModalOpen(true);
                  }}
                />
                <NavigatorPanel
                  accounts={accounts}
                  activeAccount={activeAccount}
                  bots={allBots}
                  selectedEa={settings.eaId}
                  indicators={indicators}
                  onSwitchAccount={(acc) => {
                    setActiveAccount(acc);
                    setVisualBalance(acc.balance);
                    setSettings((prev) => ({
                      ...prev,
                      initialDeposit: acc.balance,
                      leverage: acc.leverage,
                    }));
                    persistAccountState(accounts, acc);
                    appendJournal(
                      'Accounts',
                      'success',
                      `'${acc.login}': switched account on ${acc.serverName} (${acc.accountType.toUpperCase()})`
                    );
                  }}
                  onOpenLoginModal={(acc) => {
                    setLoginPrefillAccount(acc ?? null);
                    setLoginModalOpen(true);
                  }}
                  onSelectEa={(eaId) => {
                    handleSelectEa(eaId);
                    setActiveDockTab('settings');
                  }}
                  onOpenAddBotModal={() => setAddBotModalOpen(true)}
                  onDeleteCustomBot={(botId) => {
                    const nextBots = customBots.filter((b) => b.id !== botId);
                    setCustomBots(nextBots);
                    persistCustomBots(nextBots);
                    if (settings.eaId === botId) {
                      handleSelectEa('ma_cross');
                    }
                    appendJournal('Tester', 'info', `Đã gỡ bỏ Bot tùy chỉnh '${botId}'.`);
                  }}
                  onToggleIndicator={(key) =>
                    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                />
              </aside>
            )}

            <main className="flex-1 min-w-0 min-h-0 flex flex-col">
              <ChartCanvas
                symbol={settings.symbol}
                timeframe={settings.timeframe}
                candles={candles}
                visibleEndIndex={isVisualRunning ? visualBarIndex : candles.length}
                chartStyle={chartStyle}
                indicators={indicators}
                inputs={inputs}
                deals={displayedDeals}
                openPosition={visualOpenPos}
                liveQuote={quotes[settings.symbol] ?? null}
                kronosForecast={kronosForecast}
                showKronosOverlay={showKronosOverlay}
                showCrosshair={showCrosshair}
                showOneClick={showOneClick}
                autoScroll={autoScroll}
                darkMode={darkMode}
                barsOnScreen={barsOnScreen}
                rightOffsetBars={rightOffsetBars}
                onChangeBarsOnScreen={setBarsOnScreen}
                onChangeRightOffsetBars={setRightOffsetBars}
                isVisualRunning={isVisualRunning}
                isVisualPaused={isVisualPaused}
                visualSpeed={settings.visualSpeed}
                oneClickLot={oneClickLot}
                onChangeOneClickLot={setOneClickLot}
                onOneClickOrder={(side) =>
                  executeManualOrder({
                    symbol: settings.symbol,
                    side,
                    volume: oneClickLot,
                    slPrice: 0,
                    tpPrice: 0,
                    comment: 'One-Click Backtest',
                  })
                }
                onToggleVisualPause={() => setIsVisualPaused((p) => !p)}
                onStepVisualBar={stepOneVisualBar}
                onStopVisual={handleStopBacktest}
                onChangeVisualSpeed={(spd) =>
                  setSettings((prev) => ({ ...prev, visualSpeed: spd }))
                }
              />
            </main>
          </div>

          {/* Bottom Dock: Strategy Tester & Terminal */}
          <StrategyTesterDock
            activeTab={activeDockTab}
            onChangeTab={setActiveDockTab}
            account={activeAccount}
            bots={allBots}
            settings={settings}
            inputs={inputs}
            report={report}
            historySummary={historySummary}
            openPosition={visualOpenPos}
            manualBalance={visualBalance}
            manualEquity={manualEquity}
            manualMargin={manualMargin}
            journal={journal}
            isRunning={isRunning}
            isVisualRunning={isVisualRunning}
            progressPercent={progressPercent}
            kronosForecast={kronosForecast}
            showKronosOverlay={showKronosOverlay}
            isKronosPredicting={isKronosPredicting}
            kronosError={kronosError}
            onToggleKronosOverlay={() => setShowKronosOverlay((v) => !v)}
            onRunKronosForecast={handleRunKronosForecast}
            onRunKronosBacktest={handleRunKronosBacktest}
            onExecuteKronosTrade={(order) =>
              executeManualOrder({
                symbol: settings.symbol,
                side: order.action === 'BUY' ? 'buy' : 'sell',
                volume: order.lotSize,
                slPrice: order.stopLoss,
                tpPrice: order.takeProfit,
                comment: `Kronos AI (${kronosForecast?.modelVariant ?? 'kronos-small'})`,
              })
            }
            onSelectEa={handleSelectEa}
            onOpenAddBotModal={() => setAddBotModalOpen(true)}
            onChangeSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
            onChangeInputs={(patch) => setInputs((prev) => ({ ...prev, ...patch }))}
            onResetInputs={() => {
              const matched = allBots.find((b) => b.id === settings.eaId);
              setInputs({ ...DEFAULT_EA_INPUTS, ...(matched?.defaultInputs ?? {}) });
            }}
            onStartBacktest={handleStartBacktest}
            onStopBacktest={handleStopBacktest}
            onImportCsvFile={handleImportCsvFile}
            onResetBrokerHistory={() => setCustomCsvCandles(null)}
            onJumpToBar={(barIdx) => {
              const total = isVisualRunning ? visualBarIndex : candles.length;
              if (total === 0) return;
              const targetEnd = Math.min(total - 1, barIdx + Math.floor(barsOnScreen / 2));
              setRightOffsetBars(Math.max(0, total - 1 - targetEnd));
            }}
            onCloseOpenPosition={handleCloseOpenPosition}
            onResetDemoBalance={handleResetDemoBalance}
            onExportCsv={handleExportCsv}
          />

          {/* MT5 Bottom Connection Status Bar */}
          <footer className="h-6 px-3 border-t border-slate-300 dark:border-slate-800 bg-[#F3F4F6] dark:bg-[#1E222D] text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 truncate">
              <span>
                {activeAccount.login} · {activeAccount.holderName} ·{' '}
                <strong
                  className={
                    activeAccount.accountType === 'real'
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }
                >
                  {activeAccount.accountType.toUpperCase()}
                </strong>
              </span>
              <span className="hidden sm:inline">· 1:{settings.leverage}</span>
              <span className="hidden xl:inline text-slate-500 dark:text-slate-400 truncate">
                · {liveFeedLabel}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden md:inline">
                {historySummary
                  ? `${historySummary.barsCount} bars (${formatMt5DateTime(
                      historySummary.fromTimestamp
                    ).slice(0, 10)} → ${formatMt5DateTime(historySummary.toTimestamp).slice(
                      0,
                      10
                    )}) · ${historySummary.historyQualityPercent}%`
                  : 'Loading history...'}
              </span>
              <button
                type="button"
                onClick={() => setBridgeModalOpen(true)}
                className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                <Wifi className="w-3 h-3" />
                <span>
                  {activeAccount.serverName} · {activeServer.pingMs} ms
                </span>
              </button>
            </div>
          </footer>
        </>
      )}

      {/* Modals */}
      {loginModalOpen && (
        <LoginAccountModal
          key={loginPrefillAccount ? `${loginPrefillAccount.serverId}-${loginPrefillAccount.login}` : 'new-login'}
          open={loginModalOpen}
          prefillAccount={loginPrefillAccount}
          accounts={accounts}
          onClose={() => setLoginModalOpen(false)}
          onSuccess={(loggedAccount, updatedList, logMsg) => {
            setAccounts(updatedList);
            setActiveAccount(loggedAccount);
            setVisualBalance(loggedAccount.balance);
            setSettings((prev) => ({
              ...prev,
              initialDeposit: loggedAccount.balance,
              leverage: loggedAccount.leverage,
            }));
            persistAccountState(updatedList, loggedAccount);
            appendJournal('Accounts', 'success', logMsg);
          }}
          onErrorLog={(err) => appendJournal('Accounts', 'error', err)}
        />
      )}

      {orderModalOpen && (
        <NewOrderModal
          key={`order-${settings.symbol}`}
          open={orderModalOpen}
          symbol={settings.symbol}
          currentBid={currentBid}
          onClose={() => setOrderModalOpen(false)}
          onExecuteOrder={executeManualOrder}
        />
      )}

      {addBotModalOpen && (
        <AddBotModal
          open={addBotModalOpen}
          onClose={() => setAddBotModalOpen(false)}
          onAddBot={(newBot) => {
            const nextBots = [...customBots, newBot];
            setCustomBots(nextBots);
            persistCustomBots(nextBots);
            setSettings((prev) => ({ ...prev, eaId: newBot.id }));
            setInputs({ ...DEFAULT_EA_INPUTS, ...newBot.defaultInputs });
            setActiveDockTab('settings');
            appendJournal(
              'Tester',
              'success',
              `Đã thêm Bot EA mới: '${newBot.name}' (${newBot.fileName}) · Logic: ${newBot.baseStrategy}`
            );
          }}
        />
      )}

      {bridgeModalOpen && (
        <Mt5BridgeModal
          open={bridgeModalOpen}
          bridgeUrl={bridgeUrl}
          bridgeToken={bridgeToken}
          liveFeedSource={liveFeedSource}
          liveFeedLabel={liveFeedLabel}
          quotes={syncedQuotes}
          onClose={() => setBridgeModalOpen(false)}
          onApplyBridge={(nextUrl, nextToken) => {
            setBridgeUrl(nextUrl);
            setBridgeToken(nextToken);
            setCustomCsvCandles(null);
            setBridgeRefreshNonce((n) => n + 1);
            try {
              localStorage.setItem(
                STORAGE_BRIDGE_KEY,
                JSON.stringify({ bridgeUrl: nextUrl, bridgeToken: nextToken })
              );
            } catch {
              // Ignore
            }
            appendJournal('Network', 'success', `Đã kết nối MT5 Terminal Bridge: ${nextUrl}`);
          }}
          onResetBridge={() => {
            setBridgeUrl('');
            setBridgeToken('');
            setBridgeRefreshNonce((n) => n + 1);
            try {
              localStorage.removeItem(STORAGE_BRIDGE_KEY);
            } catch {
              // Ignore
            }
            appendJournal('Network', 'info', 'Đã chuyển về Live Market Feed mặc định.');
          }}
        />
      )}
    </div>
  );
}
