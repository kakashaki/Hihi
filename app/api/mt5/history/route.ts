import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeAndValidateHistory,
  parseMt5HistoryCsv,
} from '@/lib/mt5/historyLoader';
import { fetchLiveHistoricalCandles } from '@/lib/mt5/liveFeed';
import { getSymbolSpec, TIMEFRAME_SECONDS } from '@/lib/mt5/marketData';
import type { Timeframe } from '@/lib/mt5/types';

function isValidTimeframe(tf: string): tf is Timeframe {
  return tf in TIMEFRAME_SECONDS;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol') ?? 'XAUUSD';
  const tfRaw = searchParams.get('timeframe') ?? 'H1';
  const timeframe: Timeframe = isValidTimeframe(tfRaw) ? tfRaw : 'H1';
  const fromDate = searchParams.get('fromDate') ?? '2026-06-01';
  const toDate = searchParams.get('toDate') ?? new Date().toISOString().slice(0, 10);
  const maxBars = Math.min(8000, Math.max(120, Number(searchParams.get('maxBars') ?? 4500)));
  const bridgeUrl = searchParams.get('bridgeUrl') ?? req.headers.get('x-mt5-bridge-url');
  const bridgeToken = req.headers.get('x-mt5-bridge-token');

  const loaded = await fetchLiveHistoricalCandles({
    symbol,
    timeframe,
    fromDate,
    toDate,
    maxBars,
    bridgeUrl,
    bridgeToken,
  });
  return NextResponse.json({ ok: true, ...loaded }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = String(body.symbol ?? 'XAUUSD');
    const tfRaw = String(body.timeframe ?? 'H1');
    const timeframe: Timeframe = isValidTimeframe(tfRaw) ? tfRaw : 'H1';
    const csvText = String(body.csvText ?? '');

    if (!csvText.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Dữ liệu CSV lịch sử MT5 trống.' },
        { status: 400 }
      );
    }

    const spec = getSymbolSpec(symbol);
    const parsed = parseMt5HistoryCsv(csvText, spec.digits);

    if (parsed.length < 30) {
      return NextResponse.json(
        {
          ok: false,
          error: `Chỉ đọc được ${parsed.length} nến hợp lệ. Cần tối thiểu 30 nến chuẩn định dạng MT5 (DATE, TIME, OPEN, HIGH, LOW, CLOSE).`,
        },
        { status: 400 }
      );
    }

    const normalized = normalizeAndValidateHistory(parsed, symbol, timeframe, 'mt5_csv_import');
    return NextResponse.json({ ok: true, ...normalized });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Không thể xử lý dữ liệu lịch sử MT5.' },
      { status: 400 }
    );
  }
}
