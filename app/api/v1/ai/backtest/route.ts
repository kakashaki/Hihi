import { NextRequest, NextResponse } from 'next/server';
import {
  AI_CORS_HEADERS,
  executeExternalAiBacktestLive,
  type ExternalBacktestRequest,
  verifyExternalApiAuth,
} from '@/lib/mt5/externalApi';

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
    const body = (await req.json()) as ExternalBacktestRequest;
    const result = await executeExternalAiBacktestLive(body ?? {});
    return NextResponse.json(result, { headers: AI_CORS_HEADERS });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON payload or backtest execution error.' },
      { status: 400, headers: AI_CORS_HEADERS }
    );
  }
}
