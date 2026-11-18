import { NextRequest, NextResponse } from 'next/server';
import { executeKronosPrediction } from '@/lib/mt5/kronosEngine';
import { fetchLiveHistoricalCandles, sanitizeBridgeUrl } from '@/lib/mt5/liveFeed';
import { TIMEFRAME_SECONDS } from '@/lib/mt5/marketData';
import type { Candle, KronosModelVariant, Timeframe } from '@/lib/mt5/types';

function isValidTimeframe(tf: string): tf is Timeframe {
  return tf in TIMEFRAME_SECONDS;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      symbol?: string;
      timeframe?: string;
      modelVariant?: KronosModelVariant;
      lookback?: number;
      predLen?: number;
      temperature?: number;
      topP?: number;
      sampleCount?: number;
      candles?: Candle[];
      bridgeUrl?: string;
      bridgeToken?: string;
      kronosServerUrl?: string;
      preferPythonServer?: boolean;
    };

    const symbol = (body.symbol ?? 'XAUUSD').trim().toUpperCase();
    const tfRaw = body.timeframe ?? 'H1';
    const timeframe: Timeframe = isValidTimeframe(tfRaw) ? tfRaw : 'H1';
    const modelVariant: KronosModelVariant =
      body.modelVariant === 'kronos-mini' ||
      body.modelVariant === 'kronos-base' ||
      body.modelVariant === 'kronos-small'
        ? body.modelVariant
        : 'kronos-small';

    let candles = Array.isArray(body.candles) && body.candles.length >= 32 ? body.candles : null;
    let dataSource = 'Client Active Candles';

    if (!candles) {
      const today = new Date().toISOString().slice(0, 10);
      const loaded = await fetchLiveHistoricalCandles({
        symbol,
        timeframe,
        fromDate: '2026-06-01',
        toDate: today,
        maxBars: Math.max(300, Math.min(2048, Number(body.lookback) || 512)),
        bridgeUrl: body.bridgeUrl,
        bridgeToken: body.bridgeToken,
      });
      candles = loaded.candles;
      dataSource = loaded.summary.providerName ?? loaded.summary.source;
    }

    const result = await executeKronosPrediction({
      candles,
      symbol,
      timeframe,
      dataSource,
      modelVariant,
      lookback: body.lookback,
      predLen: body.predLen,
      temperature: body.temperature,
      topP: body.topP,
      sampleCount: body.sampleCount,
      kronosServerUrl: body.kronosServerUrl,
      preferPythonServer: Boolean(body.preferPythonServer),
    });

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Lỗi chạy mô hình dự báo Kronos AI.',
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const kronosUrl = sanitizeBridgeUrl(searchParams.get('kronosUrl'));
  if (!kronosUrl) {
    return NextResponse.json({
      ok: true,
      mode: 'kronos_local_quant',
      message: 'Kronos AI K-Line Predictor đang sẵn sàng 24/24.',
    });
  }

  try {
    const start = Date.now();
    const res = await fetch(`${kronosUrl}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Kronos Server trả về HTTP ${res.status}` },
        { status: 502 }
      );
    }
    const meta = await res.json();
    return NextResponse.json({ ok: true, mode: 'kronos_python_server', latencyMs, meta });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Không thể kết nối tới máy chủ Kronos Python (kronos_server.py).' },
      { status: 502 }
    );
  }
}
