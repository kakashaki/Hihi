import { NextRequest, NextResponse } from 'next/server';
import { AI_CORS_HEADERS, verifyExternalApiAuth } from '@/lib/mt5/externalApi';
import { executeKronosPrediction } from '@/lib/mt5/kronosEngine';
import { fetchLiveHistoricalCandles } from '@/lib/mt5/liveFeed';
import { TIMEFRAME_SECONDS } from '@/lib/mt5/marketData';
import type { KronosModelVariant, Timeframe } from '@/lib/mt5/types';

function isValidTimeframe(tf: string): tf is Timeframe {
  return tf in TIMEFRAME_SECONDS;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: AI_CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const auth = verifyExternalApiAuth(req.headers);
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: 401, headers: AI_CORS_HEADERS }
    );
  }

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

    const forecast = await executeKronosPrediction({
      candles: loaded.candles,
      symbol,
      timeframe,
      dataSource: loaded.summary.providerName ?? loaded.summary.source,
      modelVariant,
      lookback: body.lookback,
      predLen: body.predLen,
      temperature: body.temperature,
      topP: body.topP,
      sampleCount: body.sampleCount,
      kronosServerUrl: body.kronosServerUrl,
      preferPythonServer: Boolean(body.preferPythonServer),
    });

    return NextResponse.json(forecast, { headers: AI_CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Kronos External AI API execution error.',
      },
      { status: 400, headers: AI_CORS_HEADERS }
    );
  }
}
