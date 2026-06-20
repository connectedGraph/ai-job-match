import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ChevronDown,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
  LayoutGrid,
  Maximize2
} from 'lucide-react';
import { useData } from '../../../context/DataContext';
import Button, { cn } from '../../../components/ui/Button';
import JobCard from './JobCard';
import JobDetailDrawer from './JobDetailDrawer';
import {
  FEATURED_LANE_SECTIONS,
  MATCH_EXPLORE_TABS,
  buildLocalCheckFallback,
  getLaneDisplayMeta,
  jobNeedsRemoteCheck,
  normalizeCheckResult,
} from '../../../services/matchWorkspace';

const TONE_IDLE = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  sky: 'border-sky-200 bg-sky-50 text-sky-700',
};

const TONE_ACTIVE = {
  emerald: 'border-emerald-500 bg-emerald-500 text-white',
  violet: 'border-violet-500 bg-violet-500 text-white',
  amber: 'border-amber-500 bg-amber-500 text-white',
  featured: 'border-[var(--teal)] bg-[var(--teal)] text-white',
};

const FEATURED_PAGE_SIZE = 3;
const TAB_PAGE_SIZE = 6;
const initialLaneCursor = {
  featured_safety: 0,
  featured_target: 0,
  featured_reach: 0,
  interest: 0,
  switch: 0,
};

function formatGeneratedAt(value) {
  if (!value) return '尚未生成';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function rotateCursorMap(previous, laneIds, lanes, pageSize) {
  const next = { ...previous };
  laneIds.forEach((laneId) => {
    const jobs = lanes?.[laneId] || [];
    if (jobs.length <= pageSize) {
      next[laneId] = 0;
      return;
    }
    const current = Number(next[laneId] || 0);
    const candidate = current + pageSize;
    next[laneId] = candidate >= jobs.length ? 0 : candidate;
  });
  return next;
}

function FeaturedSection({
  section,
  jobs,
  jobsById,
  collapsed,
  cursor,
  pageSize,
  onToggle,
  onRotate,
  onViewDetails,
  onCheck,
  onPick,
  currentBasket,
}) {
  const visibleJobs = jobs.slice(cursor, cursor + pageSize);
  const canRotate = jobs.length > pageSize;
  const windowStart = jobs.length ? cursor + 1 : 0;
  const windowEnd = Math.min(cursor + pageSize, jobs.length);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-start md:justify-between">
        <button
          onClick={() => onToggle(section.id)}
          className="group flex min-w-0 flex-1 items-center justify-between gap-6 text-left transition-all duration-300"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex h-8 items-center rounded-md border px-2.5 text-[11px] font-semibold', TONE_IDLE[section.accent] || TONE_IDLE.emerald)}>
                {section.label}
              </span>
              <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{section.english}</span>
              <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-500">
                {jobs.length} 个岗位
              </span>
              {jobs.length > 0 && (
                <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-500">
                  当前 {windowStart}-{windowEnd}
                </span>
              )}
            </div>
            <div className="mt-3 text-sm leading-6 text-slate-600">{section.description}</div>
            <div className="mt-2 text-[12px] uppercase tracking-[0.16em] text-slate-400">排序：薪资上限优先</div>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-all duration-300 group-hover:border-blue-200 group-hover:bg-blue-50 group-hover:text-blue-500">
            <ChevronDown size={20} className={cn('transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1)', collapsed && '-rotate-180')} />
          </span>
        </button>
        <Button
          variant="default"
          size="sm"
          className={cn(
            'h-10 shrink-0 justify-center px-4 text-[12px]',
            !canRotate && jobs.length > 0 && 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700',
          )}
          onClick={() => onRotate?.(section.id)}
          disabled={!jobs.length}
          title={canRotate ? '查看下一组岗位' : '当前槽位已展示全部岗位'}
        >
          <RefreshCw size={14} />
          换一换
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden border-t border-slate-100"
          >
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              {visibleJobs.length ? visibleJobs.map((jobId, i) => {
                const job = jobsById[jobId];
                if (!job) return null;
                return (
                  <JobCard
                    key={jobId}
                    job={job}
                    accent={section.accent}
                    index={i}
                    isPicked={currentBasket?.jobIds?.includes(jobId)}
                    onViewDetails={onViewDetails}
                    onCheck={onCheck}
                    onPick={onPick}
                  />
                );
              }) : (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-sm text-slate-400 font-medium italic">
                  当前没有可展示的 {section.label} 岗位。
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function CheckDrawer({ job, result, loading, onClose, onPick, onRetry, isPicked }) {
  const canPick = Boolean(result?.passed) && result?.sourceMeta?.mode !== 'degraded_local';

  return (
    <AnimatePresence>
      {job && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[110] bg-slate-950/30 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed inset-y-0 right-0 z-[111] flex w-full max-w-[460px] flex-col border-l border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)]"
          >
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    <ShieldAlert size={14} />
                    Match Check
                  </div>
                  <h3 className="mt-2 text-xl font-black text-slate-900">准入核查</h3>
                  <div className="mt-2 text-sm font-medium text-slate-500">{job.title}</div>
                </div>
                <button
                  onClick={onClose}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                  aria-label="关闭核查面板"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {loading && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-4 text-sm text-[var(--tx-2)]">
                  正在核查岗位准入要求，请稍候。
                </div>
              )}

              {!loading && result && (
                <div className="space-y-4">
                  <div className={cn(
                    'rounded-2xl border px-4 py-4',
                    result.passed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50',
                  )}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn(
                        'inline-flex h-8 items-center rounded-md border px-2.5 text-[11px] font-semibold',
                        result.passed ? 'border-emerald-200 bg-white text-emerald-700' : 'border-amber-200 bg-white text-amber-700',
                      )}>
                        {result.passed ? '已通过' : '未通过'}
                      </span>
                      {result.sourceMeta?.sourceLabel && (
                        <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-500">
                          {result.sourceMeta.sourceLabel}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 text-base font-bold text-slate-900">{result.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{result.summary}</p>
                    {result.sourceMeta?.mode === 'degraded_local' && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-white px-3 py-2 text-[12px] leading-5 text-amber-700">
                        API 核查失败，当前结果已降级为本地规则，仅供参考。
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {(result.checklist || []).map((item, index) => (
                      <div key={`${item.label}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{item.label}</span>
                          <span className={cn(
                            'inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-semibold',
                            item.pass ? 'border-emerald-200 bg-white text-emerald-700' : 'border-amber-200 bg-white text-amber-700',
                          )}>
                            {item.pass ? '[✅]' : '[❌]'}
                          </span>
                          {item.source && (
                            <span className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] text-slate-500">
                              {item.source}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</div>
                      </div>
                    ))}
                  </div>

                  {result.tip && (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
                      {result.tip}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 border-t border-slate-200 px-6 py-5">
              <Button
                variant="default"
                className="h-11 justify-center text-sm"
                onClick={() => onRetry?.(job)}
                disabled={loading}
              >
                重新核查
              </Button>
              <Button
                variant={isPicked ? 'accent' : 'default'}
                className={cn('h-11 justify-center text-sm', isPicked && 'bg-amber-600 border-amber-600 shadow-none hover:brightness-100')}
                onClick={() => onPick?.(job)}
                disabled={loading || (!isPicked && !canPick)}
              >
                {isPicked ? '移出篮子' : '加入篮子'}
              </Button>
              <Button
                variant="default"
                className="h-11 justify-center text-sm"
                onClick={onClose}
              >
                关闭
              </Button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

const ExploreView = () => {
  const navigate = useNavigate();
  const {
    studentData,
    matchWorkspace,
    performMatch,
    performMatchCheck,
    saveWorkspace,
    syncActiveBasket,
    matching,
  } = useData();

  const [activeTab, setActiveTab] = useState('featured');
  const [collapsedSections, setCollapsedSections] = useState({
    featured_safety: false,
    featured_target: false,
    featured_reach: false,
  });
  const [laneCursor, setLaneCursor] = useState(initialLaneCursor);
  const [detailJob, setDetailJob] = useState(null);
  const [checkingJob, setCheckingJob] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [autoTriggered, setAutoTriggered] = useState(false);

  const activeTabMeta = useMemo(
    () => MATCH_EXPLORE_TABS.find((item) => item.id === activeTab) || MATCH_EXPLORE_TABS[0],
    [activeTab],
  );
  const generatedAtLabel = formatGeneratedAt(matchWorkspace.generatedAt);

  useEffect(() => {
    setLaneCursor(initialLaneCursor);
  }, [matchWorkspace.generatedAt]);

  useEffect(() => {
    if (!matchWorkspace.generatedAt) return;
    setAutoTriggered(true);
  }, [matchWorkspace.generatedAt]);

  useEffect(() => {
    if (!studentData?.orientated || autoTriggered || matching || matchWorkspace.generatedAt) return;
    setAutoTriggered(true);
    performMatch().catch((error) => {
      console.error('Auto match failed:', error);
      setRefreshError(error.message || '自动匹配失败，请稍后重试。');
    });
  }, [autoTriggered, matchWorkspace.generatedAt, matching, performMatch, studentData?.orientated]);

  const visibleJobs = useMemo(() => {
    if (activeTab === 'featured') return [];
    const laneJobs = matchWorkspace.lanes?.[activeTab] || [];
    const start = laneCursor[activeTab] || 0;
    return laneJobs.slice(start, start + TAB_PAGE_SIZE);
  }, [activeTab, laneCursor, matchWorkspace.lanes]);

  const rotateLanes = (laneIds, pageSize) => {
    setLaneCursor((prev) => rotateCursorMap(prev, laneIds, matchWorkspace.lanes || {}, pageSize));
  };

  const immersiveJobPool = useMemo(() => {
    if (activeTab === 'featured') {
      // For featured, combine current page of all 3 tiers
      const safety = (matchWorkspace.lanes?.['featured_safety'] || []).slice(laneCursor['featured_safety'] || 0, (laneCursor['featured_safety'] || 0) + FEATURED_PAGE_SIZE);
      const target = (matchWorkspace.lanes?.['featured_target'] || []).slice(laneCursor['featured_target'] || 0, (laneCursor['featured_target'] || 0) + FEATURED_PAGE_SIZE);
      const reach = (matchWorkspace.lanes?.['featured_reach'] || []).slice(laneCursor['featured_reach'] || 0, (laneCursor['featured_reach'] || 0) + FEATURED_PAGE_SIZE);
      return [...safety, ...target, ...reach];
    }
    return matchWorkspace.lanes?.[activeTab] || [];
  }, [activeTab, laneCursor, matchWorkspace.lanes]);

  const openImmersiveMode = () => {
    navigate('/matching/immersive', {
      state: {
        jobIds: immersiveJobPool,
        sourceLabel: activeTabMeta.label,
        returnTo: '/matching/explore',
      },
    });
  };

  const handleRegenerate = async () => {
    setRefreshError('');
    try {
      await performMatch();
    } catch (error) {
      setRefreshError(error.message || '重新生成推荐失败，请稍后重试。');
    }
  };

  const persistCheckResult = async (job, result) => {
    const nextJobsById = { ...matchWorkspace.jobsById };
    const nextBasket = { ...(matchWorkspace.currentBasket || { jobIds: [] }) };
    const jobInWorkspace = nextJobsById[job.stableId] || { ...job };
    const isPicked = nextBasket.jobIds?.includes(job.stableId);

    jobInWorkspace.check = result;
    jobInWorkspace.workspaceStatus = isPicked ? 'picked' : (result.passed ? 'checked' : 'failed');
    nextJobsById[job.stableId] = jobInWorkspace;

    const nextWorkspace = {
      ...matchWorkspace,
      jobsById: nextJobsById,
      currentBasket: nextBasket,
    };

    await saveWorkspace(nextWorkspace);
    setCheckingJob(jobInWorkspace);
    setCheckResult(result);
    return jobInWorkspace;
  };

  const handleCheck = async (job) => {
    setDetailJob(null);
    setCheckingJob(job);
    setCheckResult(job.check || null);
    setCheckLoading(true);

    try {
      let result;
      if (jobNeedsRemoteCheck(job)) {
        try {
          const response = await performMatchCheck(job);
          result = normalizeCheckResult(response);
        } catch (error) {
          result = buildLocalCheckFallback(job, studentData, {
            degraded: true,
            errorMessage: error.message || '核查接口暂时不可用',
          });
        }
      } else {
        result = buildLocalCheckFallback(job, studentData);
      }
      await persistCheckResult(job, result);
    } finally {
      setCheckLoading(false);
    }
  };

  const handleViewDetails = (job) => {
    setDetailJob(job);
  };

  const handlePick = async (job) => {
    const nextJobsById = { ...matchWorkspace.jobsById };
    const existingBasket = matchWorkspace.currentBasket || { id: 'basket-001', jobIds: [] };
    const nextBasket = {
      ...existingBasket,
      jobIds: [...(existingBasket.jobIds || [])],
      lastEditedAt: new Date().toISOString(),
    };
    const jobInWorkspace = nextJobsById[job.stableId] || { ...job };
    const isCurrentlyPicked = nextBasket.jobIds.includes(job.stableId);

    if (isCurrentlyPicked) {
      nextBasket.jobIds = nextBasket.jobIds.filter((item) => item !== job.stableId);
      jobInWorkspace.workspaceStatus = jobInWorkspace.check?.passed ? 'checked' : 'locked';
    } else {
      if (!jobInWorkspace.check?.passed || jobInWorkspace.check?.sourceMeta?.mode === 'degraded_local') return;
      nextBasket.jobIds = [...nextBasket.jobIds, job.stableId];
      jobInWorkspace.workspaceStatus = 'picked';
      jobInWorkspace.pickedAt = new Date().toISOString();
    }

    nextJobsById[job.stableId] = jobInWorkspace;
    const nextWorkspace = {
      ...matchWorkspace,
      jobsById: nextJobsById,
      currentBasket: nextBasket,
    };

    await saveWorkspace(nextWorkspace);
    try {
      await syncActiveBasket({ basket: nextBasket, jobsById: nextJobsById });
    } catch (error) {
      console.error('Sync basket failed:', error);
    }

    if (checkingJob?.stableId === job.stableId) {
      setCheckingJob(jobInWorkspace);
      setCheckResult(jobInWorkspace.check || null);
    }
    if (detailJob?.stableId === job.stableId) {
      setDetailJob(jobInWorkspace);
    }
  };

  const activeLaneTotal = (matchWorkspace.lanes?.[activeTab] || []).length;
  const activeLaneStart = activeLaneTotal ? (laneCursor[activeTab] || 0) + 1 : 0;
  const activeLaneEnd = Math.min((laneCursor[activeTab] || 0) + TAB_PAGE_SIZE, activeLaneTotal);

  return (
    <div className="space-y-8 pb-20">
      <div className="rounded-[32px] border border-[var(--border)] bg-gradient-to-br from-slate-50 via-white to-blue-50/30 px-6 py-7 shadow-[0_24px_60px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                <Sparkles size={14} className="text-teal-400 animate-pulse" />
                Career Orchard
              </div>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900">
                岗位发现园
                <span className="text-sm font-medium text-slate-400 ml-3 uppercase tracking-widest">Discovery Garden</span>
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
                欢迎来到您的专属职业果园。基于 AI 画像深度分析，为您精准匹配了三个层梯度的优质岗位机会。
              </p>
            </div>

            <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur xl:items-stretch">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">生成时间</div>
                <div className="mt-1 text-sm font-black text-slate-900">{generatedAtLabel}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  AI 画像更新后，可在这里直接重新生成推荐，不必回到原始提交入口。
                </div>
              </div>
              <Button
                variant="accent"
                onClick={handleRegenerate}
                disabled={matching}
                className="h-11 justify-center bg-emerald-700 px-5 text-sm text-white shadow-none hover:bg-emerald-800"
              >
                <RefreshCw size={16} className={cn(matching && 'animate-spin')} />
                重新生成推荐
              </Button>
            </div>

          </div>

          <div className="mt-8 flex flex-col gap-4 border-t border-slate-100 pt-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {MATCH_EXPLORE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'rounded-xl border px-5 py-2.5 text-sm font-bold transition-all duration-300',
                    activeTab === tab.id
                    ? TONE_ACTIVE[tab.id] || TONE_ACTIVE.emerald
                      : 'border-slate-100 bg-white/60 text-slate-500 hover:border-slate-300 hover:bg-white',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-2xl border border-slate-100 bg-slate-50/50 p-1.5 backdrop-blur-sm">
              <span
                className="hidden h-9 items-center gap-2 rounded-xl px-3 text-xs font-black text-slate-400 sm:flex"
              >
                <LayoutGrid size={14} />
                网格模型
              </span>
              <button
                onClick={openImmersiveMode}
                disabled={!immersiveJobPool.length}
                className="flex h-9 items-center gap-2 rounded-xl bg-white px-4 text-xs font-black text-blue-600 shadow-sm transition-all hover:scale-[1.02] hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                <Maximize2 size={14} />
                沉浸模式
              </button>
            </div>
          </div>
        </div>

      {matching && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--tx-2)]">
          正在根据最新画像自动生成匹配结果，请稍候。
        </div>
      )}

      {refreshError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {refreshError}
        </div>
      )}

      {activeTab === 'featured' ? (
        <div className="space-y-5">
          {FEATURED_LANE_SECTIONS.map((section) => (
            <FeaturedSection
              key={section.id}
              section={section}
              jobs={matchWorkspace.lanes?.[section.id] || []}
              jobsById={matchWorkspace.jobsById || {}}
              collapsed={collapsedSections[section.id]}
              cursor={laneCursor[section.id] || 0}
              pageSize={FEATURED_PAGE_SIZE}
              onToggle={(id) => setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }))}
              onRotate={(laneId) => rotateLanes([laneId], FEATURED_PAGE_SIZE)}
              onViewDetails={handleViewDetails}
              onCheck={handleCheck}
              onPick={handlePick}
              currentBasket={matchWorkspace.currentBasket}
            />
          ))}
        </div>
      ) : (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={cn('inline-flex h-8 items-center rounded-md border px-2.5 text-[11px] font-semibold', TONE_IDLE[activeTabMeta.accent] || TONE_IDLE.emerald)}>
                  {activeTabMeta.label}
                </span>
                <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{activeTabMeta.english}</span>
                {activeLaneTotal > 0 && (
                  <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-500">
                    当前 {activeLaneStart}-{activeLaneEnd} / {activeLaneTotal}
                  </span>
                )}
              </div>
              <div className="mt-3 text-sm leading-6 text-slate-600">{activeTabMeta.description}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[12px] uppercase tracking-[0.16em] text-slate-400">
                {activeTab === 'interest' ? '排序：薪资上限优先' : '排序：技术迁移可行性优先'}
              </div>
              {activeLaneTotal > TAB_PAGE_SIZE && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-10 justify-center px-4 text-[12px]"
                  onClick={() => rotateLanes([activeTab], TAB_PAGE_SIZE)}
                >
                  <RefreshCw size={14} />
                  换一换
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleJobs.length ? visibleJobs.map((jobId, i) => {
              const job = matchWorkspace.jobsById?.[jobId];
              if (!job) return null;
              const meta = getLaneDisplayMeta(job.lane);
              return (
                <JobCard
                  key={jobId}
                  job={job}
                  accent={meta.accent}
                  index={i}
                  isPicked={matchWorkspace.currentBasket?.jobIds?.includes(jobId)}
                  onViewDetails={handleViewDetails}
                  onCheck={handleCheck}
                  onPick={handlePick}
                />
              );
            }) : (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-300 px-5 py-12 text-sm text-slate-500">
                当前没有可展示的 {activeTabMeta.label} 岗位。
              </div>
            )}
          </div>
        </section>
      )}

      <JobDetailDrawer
        job={detailJob}
        student={studentData}
        isPicked={detailJob ? matchWorkspace.currentBasket?.jobIds?.includes(detailJob.stableId) : false}
        onClose={() => setDetailJob(null)}
        onCheck={handleCheck}
        onPick={handlePick}
      />

      <CheckDrawer
        job={checkingJob}
        result={checkResult}
        loading={checkLoading}
        onClose={() => {
          setCheckingJob(null);
          setCheckResult(null);
        }}
        onRetry={handleCheck}
        onPick={handlePick}
        isPicked={checkingJob ? matchWorkspace.currentBasket?.jobIds?.includes(checkingJob.stableId) : false}
      />
    </div>
  );
};

export default ExploreView;
