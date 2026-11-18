'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck, UserPlus, X } from 'lucide-react';
import { BROKER_SERVERS } from '@/lib/mt5/marketData';
import type { AccountType, Mt5Account } from '@/lib/mt5/types';

interface LoginAccountModalProps {
  open: boolean;
  prefillAccount?: Mt5Account | null;
  accounts: Mt5Account[];
  onClose: () => void;
  onSuccess: (account: Mt5Account, updatedAccounts: Mt5Account[], logMsg: string) => void;
  onErrorLog: (msg: string) => void;
}

export function LoginAccountModal({
  open,
  prefillAccount,
  accounts,
  onClose,
  onSuccess,
  onErrorLog,
}: LoginAccountModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [accountTypeFilter, setAccountTypeFilter] = useState<AccountType>(
    prefillAccount?.accountType ?? 'demo'
  );

  // Login fields
  const [login, setLogin] = useState(prefillAccount?.login ?? '50192834');
  const [password, setPassword] = useState(
    prefillAccount ? (prefillAccount.savePassword ? prefillAccount.password : '') : 'demo1234'
  );
  const [serverId, setServerId] = useState(prefillAccount?.serverId ?? 'metaquotes-demo');
  const [savePassword, setSavePassword] = useState(prefillAccount?.savePassword ?? true);
  const [showPassword, setShowPassword] = useState(false);

  // Register fields
  const [holderName, setHolderName] = useState('');
  const [regType, setRegType] = useState<AccountType>('demo');
  const [regServerId, setRegServerId] = useState('metaquotes-demo');
  const [initialDeposit, setInitialDeposit] = useState(10000);
  const [leverage, setLeverage] = useState(500);
  const [regPassword, setRegPassword] = useState('mt5pass123');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  const filteredServers = BROKER_SERVERS.filter((s) => s.accountType === accountTypeFilter);
  const regServers = BROKER_SERVERS.filter((s) => s.accountType === regType);

  const handleSelectAccountTypeTab = (type: AccountType) => {
    setAccountTypeFilter(type);
    setErrorMsg(null);
    const matchingAcc = accounts.find((a) => a.accountType === type);
    if (matchingAcc) {
      setLogin(matchingAcc.login);
      setPassword(matchingAcc.savePassword ? matchingAcc.password : '');
      setServerId(matchingAcc.serverId);
    } else {
      const matchingServer = BROKER_SERVERS.find((s) => s.accountType === type);
      if (matchingServer) setServerId(matchingServer.id);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/mt5/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          login,
          password,
          serverId,
          savePassword,
          existingAccounts: accounts,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const msg = data.error ?? 'Đăng nhập MT5 thất bại.';
        setErrorMsg(msg);
        onErrorLog(msg);
        return;
      }
      onSuccess(
        data.account,
        data.accounts,
        `'${data.account.login}': authorized on ${data.account.serverName} (${data.account.accountType.toUpperCase()})`
      );
      onClose();
    } catch {
      setErrorMsg('Không thể kết nối tới máy chủ xác thực MT5.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/mt5/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          holderName,
          accountType: regType,
          serverId: regServerId,
          initialDeposit,
          leverage,
          password: regPassword,
          existingAccounts: accounts,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? 'Không thể mở tài khoản MT5.');
        return;
      }
      onSuccess(
        data.account,
        data.accounts,
        `Mở tài khoản ${data.account.accountType.toUpperCase()} mới '${data.account.login}' trên ${data.account.serverName} ($${data.account.balance.toLocaleString()})`
      );
      onClose();
    } catch {
      setErrorMsg('Lỗi kết nối khi mở tài khoản mới.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mt5-login-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded border border-slate-300 dark:border-slate-700 bg-[#F8FAFC] dark:bg-[#1E222D] text-slate-900 dark:text-slate-100 shadow-xl overflow-hidden">
        {/* Classic MT5 Dialog Title Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#E5E7EB] dark:bg-[#171B26] border-b border-slate-300 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <h2 id="mt5-login-title" className="text-sm font-semibold">
              {mode === 'login'
                ? 'Đăng nhập vào Tài khoản Giao dịch'
                : 'Mở Tài khoản MT5 Mới'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại đăng nhập"
            className="p-1 rounded hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A25] text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2.5 px-3 border-b-2 transition-colors ${
              mode === 'login'
                ? 'border-blue-700 text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Đăng nhập Tài khoản có sẵn
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2.5 px-3 border-b-2 transition-colors inline-flex items-center justify-center gap-1.5 ${
              mode === 'register'
                ? 'border-blue-700 text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Mở Tài khoản Demo / Real</span>
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="p-4 space-y-3.5 text-xs">
            {/* Real vs Demo Server Selector */}
            <div>
              <span className="block text-slate-600 dark:text-slate-400 font-medium mb-1.5">
                Loại máy chủ giao dịch
              </span>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded bg-slate-200 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => handleSelectAccountTypeTab('demo')}
                  className={`py-1.5 px-2 rounded text-xs font-semibold transition-colors ${
                    accountTypeFilter === 'demo'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700'
                  }`}
                >
                  Tài khoản DEMO
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAccountTypeTab('real')}
                  className={`py-1.5 px-2 rounded text-xs font-semibold transition-colors ${
                    accountTypeFilter === 'real'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700'
                  }`}
                >
                  Tài khoản REAL
                </button>
              </div>
            </div>

            {/* Quick sample credentials hint for selected type */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
              <span>Mẫu nhanh:</span>
              {accounts
                .filter((a) => a.accountType === accountTypeFilter)
                .slice(0, 2)
                .map((sample) => (
                  <button
                    key={sample.login}
                    type="button"
                    onClick={() => {
                      setLogin(sample.login);
                      setPassword(sample.password);
                      setServerId(sample.serverId);
                      setErrorMsg(null);
                    }}
                    className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 font-mono tabular-nums text-slate-800 dark:text-slate-200"
                  >
                    {sample.login} ({sample.serverName})
                  </button>
                ))}
            </div>

            <div>
              <label htmlFor="mt5-login-id" className="block font-medium mb-1">
                Số tài khoản (Login)
              </label>
              <input
                id="mt5-login-id"
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="VD: 88204195 hoặc 50192834"
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono tabular-nums focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="mt5-login-password" className="block font-medium mb-1">
                Mật khẩu (Password)
              </label>
              <div className="relative">
                <input
                  id="mt5-login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu giao dịch"
                  className="w-full px-2.5 py-1.5 pr-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono focus:outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 dark:hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="mt5-login-server" className="block font-medium mb-1">
                Máy chủ (Server)
              </label>
              <select
                id="mt5-login-server"
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] focus:outline-none focus:border-blue-600"
              >
                {filteredServers.map((srv) => (
                  <option key={srv.id} value={srv.id}>
                    {srv.name} · {srv.company} ({srv.pingMs} ms)
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={savePassword}
                onChange={(e) => setSavePassword(e.target.checked)}
                className="rounded border-slate-400"
              />
              <span>Lưu mật khẩu (Save password)</span>
            </label>

            {errorMsg && (
              <div
                role="alert"
                className="p-2 rounded border border-red-400 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs"
              >
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 rounded bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold"
              >
                {submitting ? 'Đang kết nối...' : 'Đăng nhập (OK)'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded bg-slate-200 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => {
                  setRegType('demo');
                  const first = BROKER_SERVERS.find((s) => s.accountType === 'demo');
                  if (first) setRegServerId(first.id);
                }}
                className={`py-1.5 px-2 rounded font-semibold transition-colors ${
                  regType === 'demo'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                Tạo tài khoản DEMO
              </button>
              <button
                type="button"
                onClick={() => {
                  setRegType('real');
                  const first = BROKER_SERVERS.find((s) => s.accountType === 'real');
                  if (first) setRegServerId(first.id);
                }}
                className={`py-1.5 px-2 rounded font-semibold transition-colors ${
                  regType === 'real'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                Liên kết tài khoản REAL
              </button>
            </div>

            <div>
              <label htmlFor="mt5-reg-name" className="block font-medium mb-1">
                Họ tên chủ tài khoản
              </label>
              <input
                id="mt5-reg-name"
                type="text"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                placeholder="VD: Nguyen Van A"
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="mt5-reg-server" className="block font-medium mb-1">
                Sàn / Máy chủ (Broker Server)
              </label>
              <select
                id="mt5-reg-server"
                value={regServerId}
                onChange={(e) => setRegServerId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] focus:outline-none focus:border-blue-600"
              >
                {regServers.map((srv) => (
                  <option key={srv.id} value={srv.id}>
                    {srv.name} · Comm ${srv.commissionPerLot}/lot
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="mt5-reg-deposit" className="block font-medium mb-1">
                  Tiền nạp (USD)
                </label>
                <input
                  id="mt5-reg-deposit"
                  type="number"
                  min={100}
                  step={100}
                  value={initialDeposit}
                  onChange={(e) => setInitialDeposit(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono tabular-nums focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label htmlFor="mt5-reg-leverage" className="block font-medium mb-1">
                  Đòn bẩy (Leverage)
                </label>
                <select
                  id="mt5-reg-leverage"
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono focus:outline-none focus:border-blue-600"
                >
                  <option value={100}>1:100</option>
                  <option value={200}>1:200</option>
                  <option value={500}>1:500</option>
                  <option value={1000}>1:1000</option>
                  <option value={2000}>1:2000</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="mt5-reg-pass" className="block font-medium mb-1">
                Mật khẩu giao dịch
              </label>
              <input
                id="mt5-reg-pass"
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono focus:outline-none focus:border-blue-600"
              />
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="p-2 rounded border border-red-400 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
              >
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tự động cấp mã MT5 ID</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold"
                >
                  {submitting ? 'Đang tạo...' : 'Mở Tài khoản'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
