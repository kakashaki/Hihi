'use client';

import React, { useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Folder,
  LineChart,
  Plus,
  Trash2,
  UserCheck,
  UserRound,
} from 'lucide-react';
import type { CustomBotConfig, IndicatorToggles, Mt5Account } from '@/lib/mt5/types';

interface NavigatorPanelProps {
  accounts: Mt5Account[];
  activeAccount: Mt5Account;
  bots: CustomBotConfig[];
  selectedEa: string;
  indicators: IndicatorToggles;
  onSwitchAccount: (account: Mt5Account) => void;
  onOpenLoginModal: (prefillAccount?: Mt5Account) => void;
  onSelectEa: (eaId: string) => void;
  onOpenAddBotModal: () => void;
  onDeleteCustomBot: (botId: string) => void;
  onToggleIndicator: (key: keyof IndicatorToggles) => void;
}

export function NavigatorPanel({
  accounts,
  activeAccount,
  bots,
  selectedEa,
  indicators,
  onSwitchAccount,
  onOpenLoginModal,
  onSelectEa,
  onOpenAddBotModal,
  onDeleteCustomBot,
  onToggleIndicator,
}: NavigatorPanelProps) {
  const [openGroups, setOpenGroups] = useState({
    accounts: true,
    indicators: true,
    experts: true,
  });

  // Group accounts by serverName like MT5 Navigator
  const grouped = accounts.reduce<Record<string, Mt5Account[]>>((acc, item) => {
    if (!acc[item.serverName]) acc[item.serverName] = [];
    acc[item.serverName].push(item);
    return acc;
  }, {});

  const toggleGroup = (key: keyof typeof openGroups) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section
      aria-label="Navigator - Điều hướng"
      className="flex flex-col bg-white dark:bg-[#161A25] min-h-0 flex-1"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-[#F3F4F6] dark:bg-[#1E222D]">
        <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          Điều hướng (Navigator)
        </h2>
        <button
          type="button"
          onClick={() => onOpenLoginModal()}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap"
        >
          <Plus className="w-3 h-3" />
          <span>Đăng nhập</span>
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-2 space-y-2 text-xs">
        {/* Accounts Tree */}
        <div>
          <button
            type="button"
            onClick={() => toggleGroup('accounts')}
            aria-expanded={openGroups.accounts}
            className="w-full flex items-center gap-1.5 py-1 px-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800/60 font-semibold text-slate-800 dark:text-slate-200 text-left"
          >
            {openGroups.accounts ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            )}
            <Folder className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Tài khoản (Accounts)</span>
          </button>

          {openGroups.accounts && (
            <div className="pl-4 mt-1 space-y-1.5">
              {Object.entries(grouped).map(([serverName, serverAccounts]) => (
                <div key={serverName} className="space-y-0.5">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-1 truncate">
                    {serverName}
                  </div>
                  {serverAccounts.map((acc) => {
                    const isCurrent =
                      acc.login === activeAccount.login &&
                      acc.serverId === activeAccount.serverId;
                    const isReal = acc.accountType === 'real';

                    return (
                      <div key={`${acc.serverId}-${acc.login}`} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (acc.savePassword) {
                              onSwitchAccount(acc);
                            } else {
                              onOpenLoginModal(acc);
                            }
                          }}
                          onDoubleClick={() => onOpenLoginModal(acc)}
                          className={`flex-1 flex items-center justify-between gap-1.5 px-2 py-1 rounded text-left transition-colors ${
                            isCurrent
                              ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 font-semibold'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            {isCurrent ? (
                              <UserCheck
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isReal
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-emerald-600 dark:text-emerald-400'
                                }`}
                              />
                            ) : (
                              <UserRound
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isReal
                                    ? 'text-amber-600/80 dark:text-amber-400/80'
                                    : 'text-emerald-600/80 dark:text-emerald-400/80'
                                }`}
                              />
                            )}
                            <span className="font-mono tabular-nums truncate">
                              {acc.login}
                            </span>
                          </span>
                          <span
                            className={`text-[10px] font-mono uppercase shrink-0 ${
                              isReal
                                ? 'text-amber-700 dark:text-amber-400 font-semibold'
                                : 'text-emerald-700 dark:text-emerald-400 font-semibold'
                            }`}
                          >
                            {isReal ? 'Real' : 'Demo'}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Indicators Tree */}
        <div>
          <button
            type="button"
            onClick={() => toggleGroup('indicators')}
            aria-expanded={openGroups.indicators}
            className="w-full flex items-center gap-1.5 py-1 px-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800/60 font-semibold text-slate-800 dark:text-slate-200 text-left"
          >
            {openGroups.indicators ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            )}
            <Folder className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>Chỉ báo (Indicators)</span>
          </button>

          {openGroups.indicators && (
            <div className="pl-5 mt-1 space-y-0.5">
              <button
                type="button"
                onClick={() => onToggleIndicator('fastEma')}
                className={`w-full flex items-center justify-between px-2 py-1 rounded text-left transition-colors ${
                  indicators.fastEma
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <LineChart className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Moving Average (EMA)</span>
                </span>
                <span className="text-[10px] font-mono">
                  {indicators.fastEma ? 'ON' : 'OFF'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onToggleIndicator('bollinger')}
                className={`w-full flex items-center justify-between px-2 py-1 rounded text-left transition-colors ${
                  indicators.bollinger
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <LineChart className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>Bollinger Bands (20,2)</span>
                </span>
                <span className="text-[10px] font-mono">
                  {indicators.bollinger ? 'ON' : 'OFF'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onToggleIndicator('rsiSubchart')}
                className={`w-full flex items-center justify-between px-2 py-1 rounded text-left transition-colors ${
                  indicators.rsiSubchart
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <LineChart className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                  <span>Relative Strength Index</span>
                </span>
                <span className="text-[10px] font-mono">
                  {indicators.rsiSubchart ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Expert Advisors Tree */}
        <div>
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => toggleGroup('experts')}
              aria-expanded={openGroups.experts}
              className="flex-1 flex items-center gap-1.5 py-1 px-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800/60 font-semibold text-slate-800 dark:text-slate-200 text-left"
            >
              {openGroups.experts ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              )}
              <Folder className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">Expert Advisors (EA)</span>
            </button>
            <button
              type="button"
              onClick={onOpenAddBotModal}
              title="Thêm Bot / Expert Advisor mới"
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 shrink-0 whitespace-nowrap"
            >
              <Plus className="w-3 h-3" />
              <span>Thêm Bot</span>
            </button>
          </div>

          {openGroups.experts && (
            <div className="pl-5 mt-1 space-y-0.5">
              {bots.map((ea) => {
                const isSelected = ea.id === selectedEa;
                return (
                  <div key={ea.id} className="flex items-center gap-1 group">
                    <button
                      type="button"
                      onClick={() => onSelectEa(ea.id)}
                      title={ea.fileName}
                      className={`flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 rounded text-left transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 font-semibold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="truncate">{ea.name}</span>
                    </button>
                    {ea.isCustom && (
                      <button
                        type="button"
                        aria-label={`Xóa bot ${ea.name}`}
                        onClick={() => onDeleteCustomBot(ea.id)}
                        className="p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
