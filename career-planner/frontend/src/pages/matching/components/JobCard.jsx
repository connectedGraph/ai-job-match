import React from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  LockKeyhole,
  ShoppingBasket,
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
    rail: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    border: 'border-emerald-100/60 hover:border-emerald-400/30',
    shadow: 'hover:shadow-[0_20px_40px_rgba(20,184,166,0.08)]',
  },
  sky: {
    rail: 'bg-sky-500',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    border: 'border-sky-100/60 hover:border-sky-400/30',
    shadow: 'hover:shadow-[0_20px_40px_rgba(14,165,233,0.08)]',
  },
  violet: {
    rail: 'bg-violet-500',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    border: 'border-violet-100/60 hover:border-violet-400/30',
    shadow: 'hover:shadow-[0_20px_40px_rgba(139,92,246,0.08)]',
  },
  amber: {
    rail: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    border: 'border-amber-100/60 hover:border-amber-400/30',
    shadow: 'hover:shadow-[0_20px_40px_rgba(245,158,11,0.08)]',
  },
};

function previewTone(kind) {
  if (kind === 'plus') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (kind === 'sim') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function statusCopy(status, check) {
  if (status === 'picked') return { label: '已采摘', tone: 'accent' };
  if (status === 'checked') return { label: '已通过', tone: 'pass' };
  if (status === 'failed') return { label: '未通过', tone: 'fail', summary: check?.summary };
  return { label: '待核查', tone: 'locked' };
}

function getJobDisplayId(job = {}) {
  return String(job.id ?? job.jobId ?? job.job_id ?? job.stableId ?? 'unknown');
}

function getJobType(job = {}) {
  return String(job.metadata?.jobType ?? job.metadata?.job_type ?? job.jobType ?? job.job_type ?? '').trim();
}

function clampScore(value) {
  const numeric = Number(value || 0);
  return Math.round(Math.max(0, Math.min(100, Number.isFinite(numeric) ? numeric : 0)));
}

function clampPercent(value) {
  const numeric = Number(value || 0);
  return Math.round(Math.max(0, Math.min(1, Number.isFinite(numeric) ? numeric : 0)) * 100);
}

const JobCard = ({
  job,
  onPick,
  onCheck,
  onViewDetails,
  isPicked,
  accent = 'emerald',
  index = 0,
}) => {
  const status = job.workspaceStatus || 'locked';
  const meta = toneMap[accent] || toneMap.emerald;
  const laneMeta = getLaneDisplayMeta(job.lane);
  const currentStatus = statusCopy(status, job.check);
  const sourceLabel = job.check?.sourceMeta?.sourceLabel;
  const previewRows = buildPreviewTags(job);
  const jobDisplayId = getJobDisplayId(job);
  const jobType = getJobType(job);
  const duplicateCount = Number(job.dedupeMeta?.duplicateCount || 1);

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ y: -5 }}
      className={cn(
        'relative flex min-h-[290px] flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)] transition-all duration-300',
        meta.border,
        meta.shadow,
        isPicked && 'border-amber-300 bg-amber-50/30',
        status === 'failed' && 'border-amber-300 bg-amber-50/40',
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-1.5', meta.rail)} />

      <div className="flex flex-1 flex-col px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-semibold', meta.badge)}>
                {laneMeta.label}
              </span>
              {jobType && (
                <span className="inline-flex h-7 items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-700">
                  {jobType}
                </span>
              )}
              <span className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-600">
                {currentStatus.label}
              </span>
              {sourceLabel && (
                <span className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-500">
                  {sourceLabel}
                </span>
              )}
              <span
                className="inline-flex h-7 max-w-[220px] items-center truncate rounded-md border border-slate-200 bg-white px-2.5 font-mono text-[10px] font-semibold text-slate-500"
                title={`stableId: ${job.stableId || jobDisplayId}`}
              >
                ID {jobDisplayId}
              </span>
              {duplicateCount > 1 && (
                <span
                  className="inline-flex h-7 items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 text-[10px] font-semibold text-amber-700"
                  title={(job.dedupeMeta?.duplicateJobIds || []).join(', ')}
                >
                  已折叠 {duplicateCount} 条
                </span>
              )}
            </div>

            <h3 className="truncate text-[17px] font-black tracking-tight text-slate-900">
              {job.title || '未命名岗位'}
            </h3>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span className="max-w-[180px] truncate font-medium text-slate-700">{job.companyName || '未知公司'}</span>
              <span>{job.city || '不限城市'}</span>
              <span>{job.direction || '未标方向'}</span>
            </div>
          </div>

          <div className="min-w-[106px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">匹配分</div>
            <div className="text-2xl font-black text-slate-900">{clampScore(getMatchScore(job))}</div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-center text-[10px] font-bold text-slate-500">
              <span className="rounded-md bg-white px-1 py-0.5">技术 {clampScore(job.score_tech)}</span>
              <span className="rounded-md bg-white px-1 py-0.5">通用 {clampScore(job.score_quality)}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto] items-end gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">薪资范围</div>
            <div className="truncate text-lg font-black text-slate-900">
              {formatSalary(job.metadata?.salaryRange)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">精确覆盖</div>
            <div className="text-base font-bold text-slate-700">
              {clampPercent(job.exact_match_ratio)}%
            </div>
          </div>
        </div>

        <div className="mt-4 flex min-h-[72px] flex-wrap content-start gap-2">
          {previewRows.slice(0, 4).map((tag, index) => (
            <span
              key={`${job.stableId}-preview-${index}`}
              className={cn('inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-medium', previewTone(tag.kind))}
            >
              {tag.text}
            </span>
          ))}
        </div>

        <div className="mt-4 min-h-[44px] rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] leading-5 text-slate-600">
          {status === 'failed' && currentStatus.summary
            ? currentStatus.summary
            : job.check?.summary || '先看详情，再发起核查，确认通过后再采摘到篮子。'}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-4">
        <Button
          size="sm"
          variant="default"
          className="h-10 justify-center px-3 text-[12px]"
          onClick={() => onViewDetails?.(job)}
        >
          <Eye size={14} />
          详情
        </Button>

        <Button
          size="sm"
          variant={status === 'failed' ? 'danger' : 'default'}
          className="h-10 justify-center px-3 text-[12px]"
          onClick={() => onCheck?.(job)}
        >
          {status === 'failed' ? <AlertTriangle size={14} /> : status === 'checked' || status === 'picked' ? <CheckCircle2 size={14} /> : <LockKeyhole size={14} />}
          {status === 'failed' ? '未通过' : status === 'checked' || status === 'picked' ? '已通过' : '核查'}
        </Button>

        <Button
          size="sm"
          variant={isPicked ? 'accent' : 'default'}
          className={cn('h-10 justify-center px-3 text-[12px]', isPicked && 'bg-amber-600 border-amber-600 shadow-none hover:brightness-100')}
          onClick={() => onPick?.(job)}
          disabled={!isPicked && (status === 'locked' || status === 'failed')}
        >
          <ShoppingBasket size={14} />
          {isPicked ? '已在篮子' : '采摘'}
        </Button>
      </div>
    </motion.article>
  );
};

export default JobCard;
