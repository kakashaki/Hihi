import { NextRequest, NextResponse } from 'next/server';
import { AI_CORS_HEADERS, buildOpenApiSpec } from '@/lib/mt5/externalApi';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: AI_CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const origin =
    process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
      ? process.env.APP_URL.replace(/\/$/, '')
      : req.nextUrl.origin;

  return NextResponse.json(buildOpenApiSpec(origin), { headers: AI_CORS_HEADERS });
}
