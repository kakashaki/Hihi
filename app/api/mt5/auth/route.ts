import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateMt5Account,
  createNewMt5Account,
  resetDemoAccountBalance,
} from '@/lib/mt5/auth';
import { BROKER_SERVERS, DEFAULT_ACCOUNTS } from '@/lib/mt5/marketData';
import type { AccountType, Mt5Account } from '@/lib/mt5/types';

export async function GET() {
  return NextResponse.json({
    servers: BROKER_SERVERS,
    bridgeConfigured: Boolean(process.env.MT5_BRIDGE_URL),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action ?? 'login');
    const existingAccounts: Mt5Account[] = Array.isArray(body.existingAccounts)
      ? body.existingAccounts
      : DEFAULT_ACCOUNTS;

    // Optional external MT5 bridge passthrough if configured
    const bridgeUrl = process.env.MT5_BRIDGE_URL;
    if (bridgeUrl && action === 'login') {
      try {
        const bridgeRes = await fetch(`${bridgeUrl.replace(/\/$/, '')}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            login: body.login,
            password: body.password,
            server: body.serverId,
          }),
          signal: AbortSignal.timeout(4000),
        });
        if (bridgeRes.ok) {
          const bridgeData = await bridgeRes.json();
          return NextResponse.json(bridgeData);
        }
      } catch {
        // Fallback to local broker session handler if external bridge is unreachable
      }
    }

    if (action === 'register') {
      const result = createNewMt5Account(existingAccounts, {
        holderName: String(body.holderName ?? ''),
        serverId: String(body.serverId ?? 'metaquotes-demo'),
        accountType: (body.accountType === 'real' ? 'real' : 'demo') as AccountType,
        initialDeposit: Number(body.initialDeposit ?? 10000),
        leverage: Number(body.leverage ?? 500),
        password: String(body.password ?? ''),
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        account: result.account,
        accounts: result.accounts,
      });
    }

    if (action === 'reset_demo') {
      const targetAccount = body.account as Mt5Account | undefined;
      if (!targetAccount) {
        return NextResponse.json(
          { ok: false, error: 'Thiếu thông tin tài khoản.' },
          { status: 400 }
        );
      }
      const res = resetDemoAccountBalance(targetAccount, Number(body.newBalance ?? 10000));
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, account: res.account });
    }

    // Default: login
    const result = authenticateMt5Account(existingAccounts, {
      login: String(body.login ?? ''),
      password: String(body.password ?? ''),
      serverId: String(body.serverId ?? ''),
      savePassword: Boolean(body.savePassword ?? true),
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      account: result.account,
      accounts: result.accounts,
      sessionToken: `mt5_${result.account?.accountType}_${result.account?.login}_${Date.now()}`,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Yêu cầu kết nối MT5 không hợp lệ.' },
      { status: 400 }
    );
  }
}
