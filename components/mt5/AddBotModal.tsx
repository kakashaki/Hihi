'use client';

import React, { useRef, useState } from 'react';
import { Bot, Upload, X } from 'lucide-react';
import type { CustomBotConfig, EaStrategyId } from '@/lib/mt5/types';

interface AddBotModalProps {
  open: boolean;
  onClose: () => void;
  onAddBot: (bot: CustomBotConfig) => void;
}

type BaseStrategy = Exclude<EaStrategyId, 'manual_replay'>;

const BASE_STRATEGY_OPTIONS: Array<{ value: BaseStrategy; label: string }> = [
  { value: 'scalping_pro', label: 'Scalping Stop-Order Momentum (High Frequency)' },
  { value: 'ma_cross', label: 'EMA Crossover Trend Following' },
  { value: 'rsi_reversion', label: 'RSI Mean Reversion Oscillator' },
  { value: 'donchian_breakout', label: 'Donchian Channel Breakout' },
];

export function AddBotModal({ open, onClose, onAddBot }: AddBotModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState('');
  const [fileName, setFileName] = useState('Experts\\Custom\\MyBot_MT5.ex5');
  const [baseStrategy, setBaseStrategy] = useState<BaseStrategy>('scalping_pro');
  const [description, setDescription] = useState(
    'Expert Advisor MT5 tùy chỉnh cấu hình tự động giao dịch.'
  );
  const [lotSize, setLotSize] = useState(0.1);
  const [stopLossPoints, setStopLossPoints] = useState(200);
  const [takeProfitPoints, setTakeProfitPoints] = useState(300);
  const [trailingStopPoints, setTrailingStopPoints] = useState(80);
  const [stopOrderOffsetPoints, setStopOrderOffsetPoints] = useState(35);
  const [slippagePoints, setSlippagePoints] = useState(14);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleFileUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const cleanBase = file.name.replace(/\.[^.]+$/, '');
    if (!name.trim()) {
      setName(cleanBase);
    }
    setFileName(`Experts\\Custom\\${file.name}`);

    if (ext === 'json') {
      try {
        const parsed = JSON.parse(await file.text()) as Partial<CustomBotConfig>;
        if (parsed.name) setName(parsed.name);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.baseStrategy) setBaseStrategy(parsed.baseStrategy);
        if (parsed.defaultInputs) {
          if (typeof parsed.defaultInputs.lotSize === 'number') setLotSize(parsed.defaultInputs.lotSize);
          if (typeof parsed.defaultInputs.stopLossPoints === 'number')
            setStopLossPoints(parsed.defaultInputs.stopLossPoints);
          if (typeof parsed.defaultInputs.takeProfitPoints === 'number')
            setTakeProfitPoints(parsed.defaultInputs.takeProfitPoints);
          if (typeof parsed.defaultInputs.trailingStopPoints === 'number')
            setTrailingStopPoints(parsed.defaultInputs.trailingStopPoints);
          if (typeof parsed.defaultInputs.stopOrderOffsetPoints === 'number')
            setStopOrderOffsetPoints(parsed.defaultInputs.stopOrderOffsetPoints);
          if (typeof parsed.defaultInputs.slippagePoints === 'number')
            setSlippagePoints(parsed.defaultInputs.slippagePoints);
        }
      } catch {
        setError('File JSON không hợp lệ, sử dụng tên file và tham số mặc định.');
      }
    } else if (ext === 'mq5' || ext === 'txt') {
      try {
        const source = await file.text();
        const lotMatch = source.match(/input\s+double\s+\w*Lot\w*\s*=\s*([0-9.]+)/i);
        const slMatch = source.match(/input\s+int\s+\w*(?:SL|StopLoss)\w*\s*=\s*(\d+)/i);
        const tpMatch = source.match(/input\s+int\s+\w*(?:TP|TakeProfit)\w*\s*=\s*(\d+)/i);
        if (lotMatch) setLotSize(Math.max(0.01, Number(lotMatch[1]) || 0.1));
        if (slMatch) setStopLossPoints(Math.max(0, Number(slMatch[1]) || 200));
        if (tpMatch) setTakeProfitPoints(Math.max(0, Number(tpMatch[1]) || 300));
      } catch {
        // Fallback silently to defaults
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Vui lòng nhập tên Bot / Expert Advisor (tối thiểu 2 ký tự).');
      return;
    }

    const slug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24);
    const id = `custom_${slug || 'bot'}_${Date.now().toString(36)}`;

    const newBot: CustomBotConfig = {
      id,
      name: trimmedName,
      fileName: fileName.trim() || `Experts\\Custom\\${trimmedName}.ex5`,
      baseStrategy,
      description: description.trim() || 'Expert Advisor MT5 tùy chỉnh.',
      defaultInputs: {
        lotSize,
        stopLossPoints,
        takeProfitPoints,
        trailingStopPoints,
        stopOrderOffsetPoints,
        slippagePoints,
      },
      isCustom: true,
    };

    onAddBot(newBot);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-bot-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-4"
    >
      <div className="w-full max-w-lg rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E222D] text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0055A5] text-white">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4" />
            <h2 id="add-bot-modal-title" className="text-sm font-semibold">
              Thêm Bot / Expert Advisor (.ex5 / .mq5 / .json)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            className="p-1 rounded hover:bg-white/15"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 text-xs">
          {/* File upload drop button */}
          <div className="flex items-center justify-between gap-2 p-2.5 rounded border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#131722]">
            <div className="min-w-0">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Nạp file Bot MT5 có sẵn (tuỳ chọn)
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Hỗ trợ đọc cấu hình từ file .ex5, .mq5 hoặc .json
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ex5,.mq5,.json,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Chọn file Bot</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bot-name-input" className="block font-medium mb-1">
                Tên Bot / EA
              </label>
              <input
                id="bot-name-input"
                type="text"
                required
                placeholder="VD: Scalping Robot Pro V2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722]"
              />
            </div>

            <div>
              <label htmlFor="bot-file-input" className="block font-medium mb-1">
                Đường dẫn File (.ex5)
              </label>
              <input
                id="bot-file-input"
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722] font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="bot-strategy-select" className="block font-medium mb-1">
              Lõi thuật toán thực thi (Core Logic)
            </label>
            <select
              id="bot-strategy-select"
              value={baseStrategy}
              onChange={(e) => setBaseStrategy(e.target.value as BaseStrategy)}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722]"
            >
              {BASE_STRATEGY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bot-desc-input" className="block font-medium mb-1">
              Mô tả chiến lược
            </label>
            <input
              id="bot-desc-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722]"
            />
          </div>

          {/* Default Parameters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 font-mono tabular-nums">
            <div>
              <label htmlFor="bot-lot-input" className="block font-sans text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                LotSize mặc định
              </label>
              <input
                id="bot-lot-input"
                type="number"
                step={0.01}
                min={0.01}
                value={lotSize}
                onChange={(e) => setLotSize(Math.max(0.01, Number(e.target.value) || 0.01))}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722]"
              />
            </div>
            <div>
              <label htmlFor="bot-sl-input" className="block font-sans text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                StopLoss (Points)
              </label>
              <input
                id="bot-sl-input"
                type="number"
                step={10}
                min={0}
                value={stopLossPoints}
                onChange={(e) => setStopLossPoints(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722]"
              />
            </div>
            <div>
              <label htmlFor="bot-tp-input" className="block font-sans text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                TakeProfit (Points)
              </label>
              <input
                id="bot-tp-input"
                type="number"
                step={10}
                min={0}
                value={takeProfitPoints}
                onChange={(e) => setTakeProfitPoints(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722]"
              />
            </div>
            <div>
              <label htmlFor="bot-trail-input" className="block font-sans text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                Trailing Stop (Pts)
              </label>
              <input
                id="bot-trail-input"
                type="number"
                step={10}
                min={0}
                value={trailingStopPoints}
                onChange={(e) => setTrailingStopPoints(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722]"
              />
            </div>
            <div>
              <label htmlFor="bot-offset-input" className="block font-sans text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                Stop Offset (Pts)
              </label>
              <input
                id="bot-offset-input"
                type="number"
                step={5}
                min={0}
                value={stopOrderOffsetPoints}
                onChange={(e) => setStopOrderOffsetPoints(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722]"
              />
            </div>
            <div>
              <label htmlFor="bot-slip-input" className="block font-sans text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                Slippage (Pts)
              </label>
              <input
                id="bot-slip-input"
                type="number"
                step={1}
                min={0}
                value={slippagePoints}
                onChange={(e) => setSlippagePoints(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131722]"
              />
            </div>
          </div>

          {error && (
            <div className="px-3 py-1.5 rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-[#0055A5] hover:bg-[#004486] text-white font-semibold"
            >
              Thêm Bot vào MT5
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
