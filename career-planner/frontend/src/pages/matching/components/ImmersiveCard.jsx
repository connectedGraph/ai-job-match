import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  LockKeyhole, 
  AlertTriangle, 
  CheckCircle2, 
  ShoppingBasket
} from 'lucide-react';
import Button, { cn } from '../../../components/ui/Button';
import {
  formatSalary,
  getLaneDisplayMeta,
  getMatchScore,
  previewTags as buildPreviewTags,
} from '../../../services/matchWorkspace';

const toneMap = {
  emerald: {
    bg: 'from-emerald-50 to-white',
    border: 'border-emerald-200',
    rail: 'bg-emerald-500',
    icon: 'text-emerald-500',
    glow: 'shadow-[0_20px_60px_rgba(20,184,166,0.15)]'
  },
  sky: {
    bg: 'from-sky-50 to-white',
    border: 'border-sky-200',
    rail: 'bg-sky-500',
    icon: 'text-sky-500',
    glow: 'shadow-[0_20px_60px_rgba(14,165,233,0.15)]'
  },
  violet: {
    bg: 'from-violet-50 to-white',
    border: 'border-violet-200',
    rail: 'bg-violet-500',
    icon: 'text-violet-500',
    glow: 'shadow-[0_20px_60px_rgba(139,92,246,0.15)]'
  },
  amber: {
    bg: 'from-amber-50 to-white',
    border: 'border-amber-200',
    rail: 'bg-amber-500',
    icon: 'text-amber-500',
    glow: 'shadow-[0_20px_60px_rgba(245,158,11,0.15)]'
  }
};

const variants = {
  enter: (direction) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
    scale: 0.95
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
    scale: 1
  },
  exit: (direction) => ({
    zIndex: 0,
    x: direction > 0 ? -300 : 300,
    opacity: 0,
    scale: 0.95
  })
};

function getJobType(job = {}) {
  return String(job.metadata?.jobType ?? job.metadata?.job_type ?? job.jobType ?? job.job_type ?? '').trim();
}

const ImmersiveCard = ({ 
  job, 
  onNext, 
  onPrev, 
  onCheck, 
  onPick, 
  onViewDetails, 
  isPicked,
  index,
  total,
  direction = 0
}) => {
  if (!job) return null;

  const status = job.workspaceStatus || 'locked';
  const laneMeta = getLaneDisplayMeta(job.lane);
  const tone = toneMap[laneMeta.accent] || toneMap.emerald;
  const previewTags = buildPreviewTags(job);
  const jobType = getJobType(job);

  return (
    <div className="mx-auto grid h-full min-h-0 w-full max-w-[calc(100vw-1rem)] grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center justify-center gap-2 sm:max-w-5xl sm:grid-cols-[3.25rem_minmax(0,44rem)_3.25rem] sm:gap-4 lg:max-w-6xl lg:grid-cols-[3.5rem_minmax(0,46rem)_3.5rem]">
      <div className="flex min-w-0 justify-center">
        <button
          type="button"
          aria-label="上一份岗位"
          onClick={(e) => {
            e.stopPropagation();
            onPrev?.();
          }}
          disabled={index === 0}
          className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/90 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:border-blue-300 hover:bg-white disabled:opacity-30 disabled:hover:scale-100 sm:h-12 sm:w-12 md:h-14 md:w-14"
        >
          <ChevronLeft size={28} className="text-slate-400 group-hover:text-blue-600" />
        </button>
      </div>

      <div className="relative h-full w-full min-w-0">
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          <motion.div
            key={job.stableId}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ 
              x: { type: "spring", stiffness: 350, damping: 40 },
              opacity: { duration: 0.25 }
            }}
            className={cn(
              "relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[24px] border bg-gradient-to-br shadow-2xl sm:rounded-[32px]",
              tone.bg,
              tone.border,
              tone.glow
            )}
          >
            <div className={cn("absolute inset-x-0 top-0 h-1.5", tone.rail)} />

            {/* Scrollable Body */}
            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 md:p-8">
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={cn("inline-flex h-7 items-center rounded-full border px-3 text-[10px] font-black uppercase tracking-widest", 
                    laneMeta.accent === 'emerald' ? 'border-emerald-200 bg-white text-emerald-600' :
                    laneMeta.accent === 'sky' ? 'border-sky-200 bg-white text-sky-600' :
                    laneMeta.accent === 'violet' ? 'border-violet-200 bg-white text-violet-600' :
                    'border-amber-200 bg-white text-amber-600'
                  )}>
                    {laneMeta.label}
                  </span>
                  {jobType && (
                    <span className="inline-flex h-7 items-center rounded-full border border-blue-200 bg-white px-3 text-[10px] font-black tracking-widest text-blue-600">
                      {jobType}
                    </span>
                  )}
                  <span className="text-[10px] font-black tracking-widest text-slate-400 opacity-50">ID {job.id || job.stableId}</span>
                </div>

                <div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl leading-tight">{job.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm font-bold text-slate-500">
                    <span className="text-slate-900 underline underline-offset-4 decoration-blue-100 decoration-2">{job.companyName}</span>
                    <span className="h-1 w-1 rounded-full bg-slate-200" />
                    <span>{job.city}</span>
                    <span className="h-1 w-1 rounded-full bg-slate-200" />
                    <span>{job.direction}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-100 bg-white/60 p-5 backdrop-blur-sm">
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">薪资标准</div>
                    <div className="text-xl font-black text-slate-900">{formatSalary(job.metadata?.salaryRange)}</div>
                  </div>
                  <div className="space-y-0.5 text-right">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">原始匹配分</div>
                    <div className="text-3xl font-black text-blue-600">{Math.round(getMatchScore(job))}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {previewTags.map((tag, i) => (
                    <span key={i} className={cn(
                      "inline-flex h-7 items-center rounded-lg border px-2.5 text-[10px] font-bold",
                      tag.kind === 'plus' ? 'border-emerald-100 bg-emerald-50 text-emerald-600' :
                      tag.kind === 'sim' ? 'border-sky-100 bg-sky-50 text-sky-600' :
                      'border-slate-100 bg-slate-50 text-slate-500'
                    )}>
                      {tag.text}
                    </span>
                  ))}
                </div>

                <div className="rounded-xl border border-slate-100 bg-white/40 p-4 italic text-xs text-slate-500 leading-6">
                  {job.check?.summary || "沉浸式浏览模式：点击采摘入篮，或退出返回网格视图查看全局。"}
                </div>
              </div>
            </div>

            {/* Footer Actions - Sticky */}
            <div className="shrink-0 border-t border-slate-100 bg-white/40 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-400 underline underline-offset-4 decoration-2 decoration-slate-200">
                    {index + 1} / {total}
                  </span>
                </div>
              
                <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-10 min-w-0 justify-center rounded-xl border-slate-200 px-2 text-[11px] font-black shadow-md transition-all hover:bg-slate-50 sm:h-11 sm:px-4 sm:text-xs"
                    onClick={() => onViewDetails?.(job)}
                  >
                    <Eye size={16} />
                    <span className="hidden sm:inline">详情</span>
                  </Button>
                
                  <Button
                    variant="default"
                    size="sm"
                    className={cn(
                      "h-10 min-w-0 justify-center rounded-xl px-2 text-[11px] font-black shadow-md transition-all sm:h-11 sm:px-4 sm:text-xs",
                      status === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100' :
                      status === 'checked' || status === 'picked' ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100' :
                      'border-slate-200 bg-white hover:bg-slate-50'
                    )}
                    onClick={() => onCheck?.(job)}
                  >
                    {status === 'failed' ? <AlertTriangle size={16} /> : 
                     status === 'checked' || status === 'picked' ? <CheckCircle2 size={16} /> : 
                     <LockKeyhole size={16} />}
                    <span className="hidden sm:inline">
                      {status === 'failed' ? '未通过' : status === 'checked' || status === 'picked' ? '准入已过' : '核查'}
                    </span>
                  </Button>

                  <Button
                    variant={isPicked ? 'accent' : 'default'}
                    size="sm"
                    className={cn(
                      "h-10 min-w-0 justify-center rounded-xl px-2 text-[11px] font-black shadow-lg transition-all sm:h-11 sm:px-6 sm:text-xs",
                      isPicked ? "bg-amber-600 border-amber-600 text-white hover:bg-amber-700" : "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"
                    )}
                    onClick={() => onPick?.(job)}
                    disabled={!isPicked && (status === 'locked' || status === 'failed')}
                  >
                    <ShoppingBasket size={16} />
                    <span className="hidden sm:inline">{isPicked ? '移除' : '采摘入篮'}</span>
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex min-w-0 justify-center">
        <button
          type="button"
          aria-label="下一份岗位"
          onClick={(e) => {
            e.stopPropagation();
            onNext?.();
          }}
          disabled={index === total - 1}
          className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/90 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:border-blue-300 hover:bg-white disabled:opacity-30 disabled:hover:scale-100 sm:h-12 sm:w-12 md:h-14 md:w-14"
        >
          <ChevronRight size={28} className="text-slate-400 group-hover:text-blue-600" />
        </button>
      </div>
    </div>
  );
};

export default ImmersiveCard;
