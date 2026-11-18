import { NextRequest, NextResponse } from 'next/server';
import { fetchLiveMt5Quotes, sanitizeBridgeUrl } from '@/lib/mt5/liveFeed';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bridgeUrl = searchParams.get('bridgeUrl') ?? req.headers.get('x-mt5-bridge-url');
  const bridgeToken = req.headers.get('x-mt5-bridge-token');

  const feed = await fetchLiveMt5Quotes({ bridgeUrl, bridgeToken });
  return NextResponse.json(feed, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      bridgeUrl?: string;
      bridgeToken?: string;
    };
    const safeUrl = sanitizeBridgeUrl(body?.bridgeUrl);
    if (!safeUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: 'URL cầu nối MT5 không hợp lệ (cần bắt đầu bằng http:// hoặc https://).',
        },
        { status: 400 }
      );
    }

    const start = Date.now();
    const headers: Record<string, string> = {};
    if (body?.bridgeToken?.trim()) {
      headers.Authorization = `Bearer ${body.bridgeToken.trim()}`;
    }

    let accountMeta: { login?: number; server?: string; balance?: number } | null = null;
    try {
      const healthRes = await fetch(`${safeUrl}/health`, {
        cache: 'no-store',
        headers,
        signal: AbortSignal.timeout(4000),
      });
      if (healthRes.ok) {
        accountMeta = await healthRes.json();
      }
    } catch {
      // Optional /health endpoint; continue checking /ticks
    }

    const feed = await fetchLiveMt5Quotes({
      bridgeUrl: safeUrl,
      bridgeToken: body?.bridgeToken,
    });
    const latencyMs = Date.now() - start;

    if (feed.source !== 'mt5_bridge') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Không thể kết nối tới MT5 Bridge tại địa chỉ này. Hãy đảm bảo script mt5_bridge.py đang chạy và mở cổng/tunnel HTTPS.',
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      latencyMs,
      serverLabel: feed.serverLabel,
      accountMeta,
      sampleQuotes: {
        XAUUSD: feed.quotes.XAUUSD,
        EURUSD: feed.quotes.EURUSD,
        BTCUSD: feed.quotes.BTCUSD,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Lỗi kiểm tra kết nối MT5 Terminal Bridge.' },
      { status: 400 }
    );
  }
}
