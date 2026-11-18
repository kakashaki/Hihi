import { NextRequest, NextResponse } from 'next/server';
import {
  AI_CORS_HEADERS,
  executeExternalAiBacktestLive,
  executeExternalAiSweepLive,
  type ExternalBacktestRequest,
  type ExternalSweepRequest,
  MCP_TOOLS_DEFINITION,
  verifyExternalApiAuth,
} from '@/lib/mt5/externalApi';
import { executeKronosPrediction } from '@/lib/mt5/kronosEngine';
import { fetchLiveHistoricalCandles } from '@/lib/mt5/liveFeed';
import type { KronosModelVariant, Timeframe } from '@/lib/mt5/types';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: AI_CORS_HEADERS });
}

export async function GET() {
  return NextResponse.json(
    {
      protocol: 'mcp-http-jsonrpc-2.0',
      serverName: 'mt5-backtest-24x7',
      version: '1.0.0',
      tools: MCP_TOOLS_DEFINITION,
    },
    { headers: AI_CORS_HEADERS }
  );
}

export async function POST(req: NextRequest) {
  const auth = verifyExternalApiAuth(req.headers);
  if (!auth.authorized) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: auth.error } },
      { status: 401, headers: AI_CORS_HEADERS }
    );
  }

  try {
    const rpc = (await req.json()) as {
      jsonrpc?: string;
      id?: string | number | null;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    const id = rpc.id ?? null;

    if (rpc.method === 'initialize') {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'mt5-backtest-24x7', version: '1.0.0' },
          },
        },
        { headers: AI_CORS_HEADERS }
      );
    }

    if (rpc.method === 'tools/list') {
      return NextResponse.json(
        { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS_DEFINITION } },
        { headers: AI_CORS_HEADERS }
      );
    }

    if (rpc.method === 'tools/call') {
      const toolName = rpc.params?.name;
      const args = (rpc.params?.arguments ?? {}) as Record<string, unknown>;

      let payload: unknown;
      if (toolName === 'mt5_run_backtest') {
        payload = await executeExternalAiBacktestLive(args as ExternalBacktestRequest);
      } else if (toolName === 'mt5_optimize_parameters') {
        payload = await executeExternalAiSweepLive(args as unknown as ExternalSweepRequest);
      } else if (toolName === 'mt5_get_market_history') {
        const symbol = typeof args.symbol === 'string' ? args.symbol : 'XAUUSD';
        const timeframe = (typeof args.timeframe === 'string' ? args.timeframe : 'H1') as Timeframe;
        const fromDate = typeof args.fromDate === 'string' ? args.fromDate : '2026-06-01';
        const toDate = typeof args.toDate === 'string' ? args.toDate : new Date().toISOString().slice(0, 10);
        const maxBars = typeof args.maxBars === 'number' ? args.maxBars : 400;
        payload = await fetchLiveHistoricalCandles({
          symbol,
          timeframe,
          fromDate,
          toDate,
          maxBars,
          bridgeUrl: typeof args.bridgeUrl === 'string' ? args.bridgeUrl : undefined,
        });
      } else if (toolName === 'kronos_predict_kline') {
        const symbol = typeof args.symbol === 'string' ? args.symbol.toUpperCase() : 'XAUUSD';
        const timeframe = (typeof args.timeframe === 'string' ? args.timeframe : 'H1') as Timeframe;
        const lookback = typeof args.lookback === 'number' ? args.lookback : 256;
        const loaded = await fetchLiveHistoricalCandles({
          symbol,
          timeframe,
          fromDate: '2026-06-01',
          toDate: new Date().toISOString().slice(0, 10),
          maxBars: Math.max(300, lookback),
          bridgeUrl: typeof args.bridgeUrl === 'string' ? args.bridgeUrl : undefined,
        });
        payload = await executeKronosPrediction({
          candles: loaded.candles,
          symbol,
          timeframe,
          dataSource: loaded.summary.providerName ?? loaded.summary.source,
          modelVariant: (typeof args.modelVariant === 'string'
            ? args.modelVariant
            : 'kronos-small') as KronosModelVariant,
          lookback,
          predLen: typeof args.predLen === 'number' ? args.predLen : 24,
          temperature: typeof args.temperature === 'number' ? args.temperature : 1.0,
          topP: typeof args.topP === 'number' ? args.topP : 0.9,
          sampleCount: typeof args.sampleCount === 'number' ? args.sampleCount : 7,
          kronosServerUrl:
            typeof args.kronosServerUrl === 'string' ? args.kronosServerUrl : undefined,
        });
      } else {
        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Unknown MCP tool: ${String(toolName)}` },
          },
          { status: 400, headers: AI_CORS_HEADERS }
        );
      }

      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(payload) }],
            structuredContent: payload,
          },
        },
        { headers: AI_CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unsupported MCP method: ${String(rpc.method)}` },
      },
      { status: 400, headers: AI_CORS_HEADERS }
    );
  } catch {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: Invalid JSON-RPC payload.' },
      },
      { status: 400, headers: AI_CORS_HEADERS }
    );
  }
}
