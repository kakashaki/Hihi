import { NextRequest, NextResponse } from 'next/server';
import { AI_CORS_HEADERS, verifyExternalApiAuth } from '@/lib/mt5/externalApi';
import { BROKER_SERVERS, EA_STRATEGIES, MT5_SYMBOLS } from '@/lib/mt5/marketData';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: AI_CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const auth = verifyExternalApiAuth(req.headers);
  return NextResponse.json(
    {
      ok: true,
      service: 'MT5 24/24 Backtest & Quant API',
      status: 'online',
      timestamp: new Date().toISOString(),
      authMode: auth.authMode,
      authorized: auth.authorized,
      capabilities: {
        symbols: MT5_SYMBOLS.map((s) => ({
          symbol: s.symbol,
          description: s.description,
          category: s.category,
          digits: s.digits,
          spreadPoints: s.spreadPoints,
        })),
        timeframes: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'],
        strategies: EA_STRATEGIES.filter((s) => s.id !== 'manual_replay').map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
        })),
        modelingModes: ['every_tick', 'real_ticks_slippage', 'ohlc_m1', 'open_prices'],
        servers: BROKER_SERVERS.map((s) => ({
          id: s.id,
          name: s.name,
          accountType: s.accountType,
          commissionPerLot: s.commissionPerLot,
        })),
      },
      endpoints: {
        backtest: '/api/v1/ai/backtest',
        sweep: '/api/v1/ai/sweep',
        kronos: '/api/v1/ai/kronos',
        openapi: '/api/v1/ai/openapi.json',
        mcp: '/api/v1/ai/mcp',
        history: '/api/mt5/history',
      },
    },
    { headers: AI_CORS_HEADERS }
  );
}
