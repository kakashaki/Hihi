import { NextRequest, NextResponse } from 'next/server';
import { runAutomatedBacktest } from '@/lib/mt5/backtestEngine';
import { normalizeAndValidateHistory } from '@/lib/mt5/historyLoader';
import { fetchLiveHistoricalCandles } from '@/lib/mt5/liveFeed';
import { DEFAULT_ACCOUNTS, DEFAULT_EA_INPUTS } from '@/lib/mt5/marketData';
import type { BacktestSettings, Candle, EaInputParams, Mt5Account } from '@/lib/mt5/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const settings = body.settings as BacktestSettings | undefined;
    const inputs = (body.inputs as EaInputParams | undefined) ?? DEFAULT_EA_INPUTS;
    const account = (body.account as Mt5Account | undefined) ?? DEFAULT_ACCOUNTS[0];
    const customCandles = Array.isArray(body.customCandles)
      ? (body.customCandles as Candle[])
      : null;
    const bridgeUrl = typeof body.bridgeUrl === 'string' ? body.bridgeUrl : req.headers.get('x-mt5-bridge-url');
    const bridgeToken = typeof body.bridgeToken === 'string' ? body.bridgeToken : req.headers.get('x-mt5-bridge-token');
    const baseStrategy =
      typeof body.baseStrategy === 'string'
        ? (body.baseStrategy as
            | 'ma_cross'
            | 'rsi_reversion'
            | 'donchian_breakout'
            | 'scalping_pro'
            | 'kronos_forecast')
        : undefined;

    if (!settings || !settings.symbol || !settings.timeframe) {
      return NextResponse.json(
        { ok: false, error: 'Thiếu cấu hình Backtest (Symbol / Timeframe).' },
        { status: 400 }
      );
    }

    const loaded =
      customCandles && customCandles.length >= 30
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
            maxBars: 4500,
            bridgeUrl,
            bridgeToken,
          });

    const report = runAutomatedBacktest(loaded.candles, settings, inputs, account, baseStrategy);

    return NextResponse.json({
      ok: true,
      report,
      historySummary: loaded.summary,
      candlesCount: loaded.candles.length,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Lỗi thực thi Strategy Tester trên máy chủ.' },
      { status: 500 }
    );
  }
}
