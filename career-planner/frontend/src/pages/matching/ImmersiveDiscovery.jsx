import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Maximize2,
  Search,
  Sparkles,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import Button from '../../components/ui/Button';
import ImmersiveCard from './components/ImmersiveCard';
import JobDetailDrawer from './components/JobDetailDrawer';
import { CheckDrawer } from './components/ExploreView';
import {
  buildLocalCheckFallback,
  getMatchScore,
  jobNeedsRemoteCheck,
  normalizeCheckResult,
} from '../../services/matchWorkspace';

const ImmersiveDiscovery = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    matchWorkspace,
    performMatchCheck,
    saveWorkspace,
    syncActiveBasket,
    studentData,
  } = useData();

  const [immersiveIndex, setImmersiveIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [detailJob, setDetailJob] = useState(null);
  const [checkingJob, setCheckingJob] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const [checkLoading, setCheckLoading] = useState(false);

  const returnTo = location.state?.returnTo || '/matching/explore';
  const sourceLabel = location.state?.sourceLabel || '全部岗位';
  const requestedJobIds = location.state?.jobIds;

  const immersiveJobPool = useMemo(() => {
    const jobsById = matchWorkspace?.jobsById || {};
    const routedJobIds = Array.isArray(requestedJobIds)
      ? Array.from(new Set(requestedJobIds)).filter((jobId) => jobsById[jobId])
      : [];

    if (routedJobIds.length) return routedJobIds;

    return Object.keys(jobsById).sort((a, b) => (
      getMatchScore(jobsById[b]) - getMatchScore(jobsById[a])
    ));
  }, [matchWorkspace?.jobsById, requestedJobIds]);

  useEffect(() => {
    setImmersiveIndex((prev) => {
      if (!immersiveJobPool.length) return 0;
      return Math.min(prev, immersiveJobPool.length - 1);
    });
  }, [immersiveJobPool.length]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') {
        if (immersiveIndex < immersiveJobPool.length - 1) {
          setDirection(1);
          setImmersiveIndex((prev) => prev + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (immersiveIndex > 0) {
          setDirection(-1);
          setImmersiveIndex((prev) => prev - 1);
        }
      } else if (e.key === 'Escape') {
        navigate(returnTo);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [immersiveIndex, immersiveJobPool.length, navigate, returnTo]);

  const persistCheckResult = async (job, result) => {
    const nextJobsById = { ...matchWorkspace.jobsById };
    const nextBasket = { ...(matchWorkspace.currentBasket || { jobIds: [] }) };
    const jobInWorkspace = nextJobsById[job.stableId] || { ...job };
    const isPicked = nextBasket.jobIds?.includes(job.stableId);

    jobInWorkspace.check = result;
    jobInWorkspace.workspaceStatus = isPicked ? 'picked' : (result.passed ? 'checked' : 'failed');
    nextJobsById[job.stableId] = jobInWorkspace;

    await saveWorkspace({
      ...matchWorkspace,
      jobsById: nextJobsById,
      currentBasket: nextBasket,
    });

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

  if (!immersiveJobPool.length) {
    return (
      <div className="flex h-dvh min-h-dvh w-screen flex-col items-center justify-center gap-6 bg-slate-50 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200 text-slate-400">
          <Search size={32} />
        </div>
        <div>
          <h3 className="text-lg font-black text-slate-900">未发现可浏览岗位</h3>
          <p className="mt-1 text-sm font-bold text-slate-500">请先在匹配园地生成推荐结果</p>
        </div>
        <Button
          variant="default"
          onClick={() => navigate(returnTo)}
          className="h-12 rounded-2xl px-8"
        >
          返回匹配页
        </Button>
      </div>
    );
  }

  const activeJob = matchWorkspace.jobsById[immersiveJobPool[immersiveIndex]];

  return (
    <div className="flex h-dvh min-h-dvh w-screen select-none flex-col overflow-hidden bg-slate-50">
      <header className="z-50 flex shrink-0 flex-col gap-3 border-b border-slate-200/60 bg-white/85 px-4 py-3 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xl shadow-blue-100">
            <Maximize2 size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-black leading-tight tracking-tight text-slate-900">
              沉浸式岗位发现模式
            </h2>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <span className="truncate text-[10px] font-black uppercase leading-tight tracking-widest text-slate-400">
                {sourceLabel} · 第 {immersiveIndex + 1} / {immersiveJobPool.length} 个岗位
              </span>
              <span className="h-1 w-1 shrink-0 rounded-full bg-slate-300" />
              <Sparkles size={10} className="shrink-0 animate-pulse text-blue-500" />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-1.5 rounded-xl border border-slate-200/50 bg-slate-100/50 px-4 py-2 md:flex">
            <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-500 shadow-sm">←</kbd>
            <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-500 shadow-sm">→</kbd>
            <span className="ml-1 text-[10px] font-bold text-slate-400">翻页</span>
          </div>
          <Button
            variant="default"
            className="h-10 rounded-xl border-slate-200 bg-white px-4 text-xs font-black shadow-sm transition-all hover:scale-[1.02] hover:bg-slate-50 sm:h-11 sm:px-5 sm:text-sm"
            onClick={() => navigate(returnTo)}
          >
            <ArrowLeft size={16} />
            返回发现园
          </Button>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 py-3 sm:px-6 sm:py-5">
        <ImmersiveCard
          job={activeJob}
          index={immersiveIndex}
          total={immersiveJobPool.length}
          direction={direction}
          isPicked={matchWorkspace.currentBasket?.jobIds?.includes(activeJob.stableId)}
          onNext={() => {
            setDirection(1);
            setImmersiveIndex((prev) => Math.min(prev + 1, immersiveJobPool.length - 1));
          }}
          onPrev={() => {
            setDirection(-1);
            setImmersiveIndex((prev) => Math.max(prev - 1, 0));
          }}
          onCheck={handleCheck}
          onPick={handlePick}
          onViewDetails={(job) => setDetailJob(job)}
        />
      </main>

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

export default ImmersiveDiscovery;
