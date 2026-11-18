'use client';

import React from 'react';
import {
  Activity,
  BarChart2,
  BrainCircuit,
  CandlestickChart,
  Crosshair,
  FileSpreadsheet,
  KeyRound,
  LineChart,
  Moon,
  PanelLeft,
  Play,
  PlusSquare,
  SlidersHorizontal,
  Sun,
  Wifi,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  ChartStyle,
  IndicatorToggles,
  Mt5Account,
  Timeframe,
} from '@/lib/mt5/types';

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

interface TopToolbarProps {
  activeAccount: Mt5Account;
  activeSymbol: string;
  timeframe: Timeframe;
  chartStyle: ChartStyle;
  indicators: IndicatorToggles;
  showCrosshair: boolean;
  showOneClick: boolean;
  algoTrading: boolean;
  autoScroll: boolean;
  darkMode: boolean;
  sidebarOpen: boolean;
  onSelectTimeframe: (tf: Timeframe) => void;
  onSelectChartStyle: (style: ChartStyle) => void;
  onToggleIndicator: (key: keyof IndicatorToggles) => void;
  onToggleCrosshair: () => void;
  onToggleOneClick: () => void;
  onToggleAlgoTrading: () => void;
  onToggleAutoScroll: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenNewOrder: () => void;
  onOpenLoginModal: () => void;
  onOpenBridgeModal?: () => void;
  onToggleDarkMode: () => void;
  onToggleSidebar: () => void;
  onJumpToTester: () => void;
  onJumpToAiApi: () => void;
  onJumpToKronos?: () => void;
  onExportCsv: () => void;
  liveFeedSource?: 'mt5_bridge' | 'live_broker_feed' | 'fallback_reference';
  liveFeedLabel?: string;
  showChartToolbarOnMobile?: boolean;
}

export function TopToolbar({
  activeAccount,
  activeSymbol,
  timeframe,
  chartStyle,
  indicators,
  showCrosshair,
  showOneClick,
  algoTrading,
  autoScroll,
  darkMode,
  sidebarOpen,
  onSelectTimeframe,
  onSelectChartStyle,
  onToggleIndicator,
  onToggleCrosshair,
  onToggleOneClick,
  onToggleAlgoTrading,
  onToggleAutoScroll,
  onZoomIn,
  onZoomOut,
  onOpenNewOrder,
  onOpenLoginModal,
  onOpenBridgeModal,
  onToggleDarkMode,
  onToggleSidebar,
  onJumpToTester,
  onJumpToAiApi,
  onJumpToKronos,
  onExportCsv,
  liveFeedSource = 'live_broker_feed',
  liveFeedLabel = 'Live Market',
  showChartToolbarOnMobile = true,
}: TopToolbarProps) {
  return (
    <header className="w-full border-b border-slate-300 dark:border-slate-800 bg-[#F3F4F6] dark:bg-[#1E222D] text-slate-900 dark:text-slate-100 shrink-0">
      {/* Row 1: Classic MT5 Menu Bar + Account Connection Header */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 px-2 sm:px-3 h-9 border-b border-slate-300/80 dark:border-slate-800 bg-[#E5E7EB] dark:bg-[#171B26]">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-700 text-white text-[10px] font-bold tracking-tight">
              MT5
            </span>
            <span className="hidden sm:inline text-xs font-semibold tracking-tight whitespace-nowrap">
              MetaTrader 5
            </span>
          </div>

          <nav
            aria-label="Menu chính"
            className="hidden lg:flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300"
          >
            <button
              type="button"
              onClick={onOpenLoginModal}
              className="px-2 py-1 rounded hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap shrink-0"
            >
              Đăng nhập Tài khoản
            </button>
            <button
              type="button"
              onClick={onToggleSidebar}
              className="px-2 py-1 rounded hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap shrink-0"
            >
              {sidebarOpen ? 'Ẩn Bảng giá' : 'Hiện Bảng giá'}
            </button>
            <button
              type="button"
              onClick={onJumpToTester}
              className="px-2 py-1 rounded hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap shrink-0"
            >
              Strategy Tester
            </button>
            <button
              type="button"
              onClick={onOpenNewOrder}
              className="px-2 py-1 rounded hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap shrink-0"
            >
              Đặt lệnh (F9)
            </button>
            <button
              type="button"
              onClick={onExportCsv}
              className="px-2 py-1 rounded hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap shrink-0"
            >
              Xuất Báo cáo
            </button>
            <button
              type="button"
              onClick={onJumpToAiApi}
              className="px-2 py-1 rounded hover:bg-slate-300/60 dark:hover:bg-slate-700/60 text-blue-700 dark:text-blue-400 font-medium transition-colors whitespace-nowrap shrink-0"
            >
              AI API 24/24
            </button>
            {onJumpToKronos && (
              <button
                type="button"
                onClick={onJumpToKronos}
                className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-violet-200/70 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <BrainCircuit className="w-3.5 h-3.5" />
                <span>Kronos AI</span>
              </button>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
            <span
              className={
                activeAccount.accountType === 'real'
                  ? 'font-bold text-amber-700 dark:text-amber-400'
                  : 'font-bold text-emerald-700 dark:text-emerald-400'
              }
            >
              {activeAccount.accountType === 'real' ? 'REAL' : 'DEMO'}
            </span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{activeAccount.login}</span>
            <span aria-hidden="true" className="hidden md:inline">
              ·
            </span>
            <span className="hidden md:inline text-slate-600 dark:text-slate-400">
              {activeAccount.serverName}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              ${activeAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {onOpenBridgeModal && (
            <button
              type="button"
              onClick={onOpenBridgeModal}
              title={liveFeedLabel}
              className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] sm:text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                liveFeedSource === 'mt5_bridge'
                  ? 'border-blue-500/60 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300'
                  : liveFeedSource === 'live_broker_feed'
                  ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                  : 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
              }`}
            >
              <Wifi className="w-3 h-3" />
              <span className="hidden sm:inline">
                {liveFeedSource === 'mt5_bridge' ? 'MT5 Bridge' : 'MT5 Live'}
              </span>
              <span className="sm:hidden">Live</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenLoginModal}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded bg-blue-700 hover:bg-blue-800 text-white transition-colors whitespace-nowrap shrink-0"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Tài khoản</span>
          </button>

          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={darkMode ? 'Chuyển giao diện Sáng chuẩn MT5' : 'Chuyển giao diện Tối'}
            title={darkMode ? 'Giao diện Sáng (Classic MT5)' : 'Giao diện Tối (MT5 Dark)'}
            className="p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shrink-0"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Row 2: MT5 Standard + Chart + Timeframes Toolbar */}
      <div
        className={`${
          showChartToolbarOnMobile ? 'flex flex-col md:flex-row' : 'hidden md:flex'
        } md:items-center md:justify-between gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5`}
      >
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Bật tắt thanh Market Watch và Navigator"
            title="Market Watch / Navigator"
            className={`hidden md:inline-flex p-1.5 rounded border transition-colors shrink-0 ${
              sidebarOpen
                ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-blue-700 dark:text-blue-400'
                : 'border-transparent hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenNewOrder}
            className="inline-flex items-center gap-1 px-2 md:px-2.5 py-1 text-[11px] md:text-xs font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            <PlusSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Lệnh mới</span>
          </button>

          <button
            type="button"
            onClick={onToggleAlgoTrading}
            className={`inline-flex items-center gap-1 px-2 md:px-2.5 py-1 text-[11px] md:text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
              algoTrading
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500/60 text-emerald-800 dark:text-emerald-300'
                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Play className="w-3 h-3" />
            <span className="hidden sm:inline">Algo Trading</span>
            <span className="sm:hidden">Algo</span>
          </button>

          {/* Chart Style */}
          <div className="flex items-center gap-0.5 bg-slate-200/70 dark:bg-slate-800/80 p-0.5 rounded shrink-0">
            <button
              type="button"
              onClick={() => onSelectChartStyle('bars')}
              aria-label="Biểu đồ thanh (Bars)"
              title="Biểu đồ Thanh (Bar Chart)"
              className={`p-1 rounded transition-colors ${
                chartStyle === 'bars'
                  ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSelectChartStyle('candles')}
              aria-label="Biểu đồ nến Nhật (Candlesticks)"
              title="Biểu đồ Nến Nhật (Candlesticks)"
              className={`p-1 rounded transition-colors ${
                chartStyle === 'candles'
                  ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CandlestickChart className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSelectChartStyle('line')}
              aria-label="Biểu đồ đường (Line)"
              title="Biểu đồ Đường (Line Chart)"
              className={`p-1 rounded transition-colors ${
                chartStyle === 'line'
                  ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LineChart className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onZoomIn}
            aria-label="Phóng to biểu đồ"
            title="Phóng to (+)"
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors shrink-0"
          >
            <ZoomIn className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
          <button
            type="button"
            onClick={onZoomOut}
            aria-label="Thu nhỏ biểu đồ"
            title="Thu nhỏ (-)"
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors shrink-0"
          >
            <ZoomOut className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleCrosshair}
            aria-label="Bật tắt thước ngắm (Crosshair)"
            title="Thước ngắm (Crosshair)"
            className={`p-1.5 rounded transition-colors shrink-0 ${
              showCrosshair
                ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleAutoScroll}
            className={`hidden sm:inline-flex px-2 py-1 text-xs rounded border transition-colors whitespace-nowrap shrink-0 ${
              autoScroll
                ? 'bg-white dark:bg-slate-800 border-blue-500/60 text-blue-700 dark:text-blue-300'
                : 'border-transparent hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            Cuộn tự động
          </button>

          <button
            type="button"
            onClick={onToggleOneClick}
            className={`px-2 py-1 text-[11px] md:text-xs rounded border transition-colors whitespace-nowrap shrink-0 ${
              showOneClick
                ? 'bg-white dark:bg-slate-800 border-blue-500/60 text-blue-700 dark:text-blue-300'
                : 'border-transparent hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            <span className="hidden sm:inline">Đặt lệnh nhanh</span>
            <span className="sm:hidden">1-Click</span>
          </button>

          <div className="hidden md:block w-px h-5 bg-slate-300 dark:bg-slate-700 mx-1" aria-hidden="true" />

          {/* Quick Indicator Toggles */}
          <button
            type="button"
            onClick={() => onToggleIndicator('fastEma')}
            className={`inline-flex items-center gap-1 px-1.5 md:px-2 py-1 text-[11px] md:text-xs font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
              indicators.fastEma || indicators.slowEma
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500/50 text-amber-800 dark:text-amber-300'
                : 'border-transparent hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Activity className="w-3 h-3" />
            <span>EMA</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleIndicator('bollinger')}
            className={`px-1.5 md:px-2 py-1 text-[11px] md:text-xs font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
              indicators.bollinger
                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500/50 text-indigo-800 dark:text-indigo-300'
                : 'border-transparent hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            BB
          </button>
          <button
            type="button"
            onClick={() => onToggleIndicator('rsiSubchart')}
            className={`px-1.5 md:px-2 py-1 text-[11px] md:text-xs font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
              indicators.rsiSubchart
                ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-500/50 text-violet-800 dark:text-violet-300'
                : 'border-transparent hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            RSI
          </button>
        </div>

        {/* Timeframes Strip (Full-width compact row on mobile, inline right on md+) */}
        <div className="flex items-center justify-between md:justify-end gap-1 shrink-0 pt-0.5 md:pt-0 border-t border-slate-200/80 dark:border-slate-800/80 md:border-t-0">
          <span className="text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300 mr-1 md:hidden xl:inline">
            {activeSymbol}
          </span>
          <div
            role="group"
            aria-label="Khung thời gian biểu đồ"
            className="flex flex-1 md:flex-initial items-center justify-between md:justify-start gap-0.5 bg-slate-200/80 dark:bg-slate-800/90 p-0.5 rounded"
          >
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onSelectTimeframe(tf)}
                className={`flex-1 md:flex-initial px-1.5 md:px-2 py-1 text-[11px] md:text-xs font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 text-center ${
                  timeframe === tf
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onExportCsv}
            aria-label="Xuất báo cáo CSV"
            title="Xuất báo cáo CSV"
            className="hidden sm:inline-flex p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onJumpToTester}
            aria-label="Mở cài đặt Strategy Tester"
            title="Strategy Tester"
            className="hidden sm:inline-flex p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
