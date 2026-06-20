import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import api from '../../services/api';

const TREND_DESCRIPTIONS = {
  rising:        '快速上升，市场热度强劲',
  stable_growth: '持续增长，需求稳步提升',
  stable:        '市场需求稳定',
  declining:     '需求下滑，建议关注替代技术',
  cold:          '市场冷门，谨慎投入学习',
};

const TREND_COLORS = {
  rising:        'bg-emerald-100 text-emerald-700',
  stable_growth: 'bg-sky-100 text-sky-700',
  stable:        'bg-gray-100 text-gray-600',
  declining:     'bg-amber-100 text-amber-700',
  cold:          'bg-rose-100 text-rose-600',
};

const TREND_LABELS = {
  rising: '🔥 Rising',
  stable_growth: '📈 Stable Growth',
  stable: '— Stable',
  declining: '📉 Declining',
  cold: '💀 Cold',
};

function Sparkline({ data }) {
  if (!data || data.length < 2) return null;
  const W = 200, H = 60, pad = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (W - pad * 2));
  const ys = data.map(v => H - pad - ((v - min) / range) * (H - pad * 2));
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline points={pts} fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="3" fill="var(--teal)" />)}
    </svg>
  );
}

const TagTrendPanel = ({ tag, onClose }) => {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);

  const handleAsk = async () => {
    if (!query.trim()) return;
    setAsking(true);
    setAnswer('');
    try {
      const res = await api.post('/api/agent/tag-query', { query, context: { tag: tag?.displayName } });
      setAnswer(res.answer || '');
    } catch {
      setAnswer('请求失败，请稍后重试。');
    } finally {
      setAsking(false);
    }
  };

  const growth = tag?.growth_rate ?? 0;
  const growthText = `${growth >= 0 ? '+' : ''}${(growth * 100).toFixed(0)}% over 6 weeks`;

  return (
    <AnimatePresence>
      {tag && (
        <>
          <motion.div
            className="fixed inset-0 z-[102] bg-slate-950/35 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 z-[103] h-full w-[420px] bg-[var(--surface-1)] border-l border-[var(--border)] flex flex-col overflow-hidden"
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { type: 'spring', damping: 28, stiffness: 260 } }}
            exit={{ x: '100%', transition: { type: 'spring', damping: 32, stiffness: 280 } }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <span className="font-bold text-[var(--tx-1)] text-lg">{tag.displayName}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TREND_COLORS[tag.trend_type] || TREND_COLORS.stable}`}>
                  {TREND_LABELS[tag.trend_type] || tag.trend_type}
                </span>
              </div>
              <button onClick={onClose} className="text-[var(--tx-3)] hover:text-[var(--tx-1)] transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              {/* Sparkline */}
              <div>
                <div className="text-xs text-[var(--tx-3)] mb-2 font-medium">近6周趋势</div>
                <Sparkline data={tag.weekly_data} />
                <div className="mt-2 text-sm font-semibold text-[var(--tx-1)]">{growthText}</div>
                <div className="mt-1 text-xs text-[var(--tx-2)]">{TREND_DESCRIPTIONS[tag.trend_type]}</div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                  <div className="text-[10px] text-[var(--tx-3)] font-bold uppercase tracking-wider">岗位引用数</div>
                  <div className="mt-1 text-xl font-bold text-[var(--tx-1)]">{tag.jobCount}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                  <div className="text-[10px] text-[var(--tx-3)] font-bold uppercase tracking-wider">引用率</div>
                  <div className="mt-1 text-xl font-bold text-[var(--tx-1)]">{(tag.jobRatio * 100).toFixed(0)}%</div>
                </div>
              </div>

              {/* Agent query */}
              <div>
                <div className="text-xs text-[var(--tx-3)] mb-2 font-medium">问 AI 关于此标签</div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--tx-1)] placeholder:text-[var(--tx-4)] outline-none focus:border-[var(--teal)]"
                    placeholder={`关于 ${tag.displayName} 的市场前景…`}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAsk()}
                  />
                  <button
                    onClick={handleAsk}
                    disabled={asking || !query.trim()}
                    className="px-3 py-2 rounded-lg bg-[var(--teal)] text-white text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
                  >
                    {asking ? '…' : '问 AI'}
                  </button>
                </div>
                {answer && (
                  <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--tx-2)] leading-relaxed">
                    {answer}
                  </div>
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default TagTrendPanel;
