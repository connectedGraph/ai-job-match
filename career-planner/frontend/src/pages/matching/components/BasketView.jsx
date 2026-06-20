import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  History,
  Loader2,
  ShoppingBasket,
  Trash2,
  Wheat,
  Zap,
} from 'lucide-react';
import { useData } from '../../../context/DataContext';
import Button, { cn } from '../../../components/ui/Button';
import JobDetailDrawer from './JobDetailDrawer';
import { CheckDrawer } from './ExploreView';
import {
  asArray,
  buildBasketHistoryRecord,
  buildHarvestRecord,
  buildLocalCheckFallback,
  createDraftBasket,
  formatSalary,
  formatTimeLabel,
  getConfidenceCoefficient,
  getGoldScore,
  getMatchScore,
  getReportScore,
  isBasketHarvesting,
  jobNeedsRemoteCheck,
  normalizeCheckResult,
} from '../../../services/matchWorkspace';

const BasketHistoryList = ({ baskets = [] }) => {
  if (!baskets.length) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <History size={20} className="text-amber-500" />
            篮子历史记录
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            已收割的篮子会保留在这里，方便回看当时放入的岗位组合。
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
          {baskets.length} 条
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {baskets.map((basket) => (
          <article key={basket.id} className="rounded-2xl border border-[var(--border)] bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-500">
                  {basket.id}
                </div>
                <h3 className="mt-1 truncate text-sm font-bold text-slate-900">
                  {basket.bestJobTitle || '已收割篮子'}
                </h3>
                <p className="mt-1 text-[11px] text-slate-400">
                  收割于 {formatTimeLabel(basket.completedAt)} · {basket.jobIds?.length || 0} 个岗位
                </p>
              </div>

              {basket.confidence && (
                <div className="rounded-xl bg-orange-50 px-2.5 py-2 text-center">
                  <div className="text-lg font-black text-orange-500">{basket.confidence}%</div>
                  <div className="text-[9px] font-bold text-orange-300">置信度</div>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {(basket.jobSnapshots || []).slice(0, 4).map((job) => (
                <div key={job.stableId} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-slate-700">{job.title}</div>
                    <div className="truncate text-[10px] text-slate-400">{job.companyName}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] font-black text-slate-600">{Math.round(getReportScore(job))} 分</div>
                    <div className="mt-1 flex gap-1 text-[9px] font-bold text-slate-400">
                      <span>匹配 {Math.round(getMatchScore(job))}</span>
                      <span>系数 {getConfidenceCoefficient(job)?.toFixed(3) || '--'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {basket.harvestId && (
              <Link
                to={`/matching/harvest?harvest=${encodeURIComponent(basket.harvestId)}`}
                className="mt-4 inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700 hover:bg-orange-100"
              >
                查看对应收割分析
              </Link>
            )}
          </article>
        ))}
      </div>
    </section>
  );
};

const fallbackBasketHistoryFromHarvests = (harvests = []) =>
  harvests.map((harvest) => ({
    id: harvest.id,
    status: 'Harvested',
    completedAt: harvest.completedAt,
    harvestId: harvest.id,
    jobIds: harvest.jobIds || (harvest.rankings || []).map((rank) => rank.stableId).filter(Boolean),
    jobSnapshots: (harvest.rankings || []).map((rank) => ({
      stableId: rank.stableId,
      title: rank.title,
      companyName: rank.companyName,
      reportScore: getReportScore(rank),
      matchScore: getMatchScore(rank),
      goldScore: getGoldScore(rank),
      confidenceCoefficient: getConfidenceCoefficient(rank),
    })),
    bestJobId: harvest.bestJobId,
    bestJobTitle: harvest.bestJobTitle,
    confidence: harvest.confidence,
  }));

const BasketView = () => {
  const {
    matchWorkspace,
    saveWorkspace,
    studentData,
    performMatchCheck,
    ripeningStatus,
    triggerHarvest,
  } = useData();
  const [detailJob, setDetailJob] = useState(null);
  const [checkingJob, setCheckingJob] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const basketHistory = (matchWorkspace.basketHistory || []).length
    ? matchWorkspace.basketHistory
    : fallbackBasketHistoryFromHarvests(matchWorkspace.harvests || []);

  const basketJobs = (matchWorkspace.currentBasket?.jobIds || [])
    .map((id) => matchWorkspace.jobsById[id])
    .filter(Boolean);

  const basketHarvesting = ripeningStatus.isRipening || isBasketHarvesting(matchWorkspace.currentBasket);
  const harvestProgress = ripeningStatus.isRipening
    ? ripeningStatus.progress
    : Math.max(35, Number(matchWorkspace.currentBasket?.progress || 0) || 0);

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
    if (basketHarvesting) return;
    // This handles both add and remove, but in basket we mostly care about sync
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
    if (checkingJob?.stableId === job.stableId) {
      setCheckingJob(jobInWorkspace);
      setCheckResult(jobInWorkspace.check || null);
    }
    if (detailJob?.stableId === job.stableId) {
      setDetailJob(jobInWorkspace);
    }
  };

  const handleRemove = async (jobId) => {
    if (basketHarvesting) return;
    const nextJobsById = { ...matchWorkspace.jobsById };
    if (nextJobsById[jobId]) {
      nextJobsById[jobId].workspaceStatus = 'checked';
    }

    const nextBasket = {
      ...matchWorkspace.currentBasket,
      jobIds: matchWorkspace.currentBasket.jobIds.filter((id) => id !== jobId),
      lastEditedAt: new Date().toISOString(),
    };

    await saveWorkspace({
      ...matchWorkspace,
      jobsById: nextJobsById,
      currentBasket: nextBasket,
    }, true);
  };

  const handleHarvest = async () => {
    if (basketJobs.length === 0 || basketHarvesting) return;

    await triggerHarvest({
      basket: matchWorkspace.currentBasket,
      basketJobs,
      buildHarvestRecord,
      buildBasketHistoryRecord,
      createDraftBasket,
    });
  };

  if (basketJobs.length === 0) {
    return (
      <div className="space-y-10 pb-24">
        <div className="min-h-[38vh] flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6 border border-gray-100 text-gray-400">
            <ShoppingBasket size={32} />
          </div>
          <h3 className="text-xl font-bold mb-2">空的采摘篮</h3>
          <p className="text-gray-500 max-w-xs text-sm">
            去「探索」页采摘几个符合门槛的岗位进入篮子；历史篮子会保留在下方，方便回看。
          </p>
        </div>
        <BasketHistoryList baskets={basketHistory} />
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2 flex items-center gap-3">
            <ShoppingBasket className="text-amber-400" size={32} />
            当前篮子
            <span className="text-sm font-medium text-gray-500 ml-2">Active Basket</span>
          </h1>
          <p className="text-tx-2 max-w-2xl text-sm leading-relaxed">
            已采摘 <span className="text-amber-400 font-bold">{basketJobs.length}</span> 个岗位。收割后会同时生成收割分析，并把本次篮子保存为历史记录。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {basketJobs.length > 0 && (
            <div className="space-y-4">
              {basketJobs.map((job, idx) => (
                <article
                  key={job.stableId}
                  className="group relative transition-all hover:translate-x-1 cursor-pointer"
                  onClick={() => setDetailJob(job)}
                >
                  <div className="orchard-card !p-5 flex flex-col sm:flex-row sm:items-center gap-6 bg-white hover:border-blue-200 hover:shadow-md">
                    {/* Basic Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-black text-white shadow-sm shadow-blue-100">
                          {idx + 1}
                        </span>
                        <h3 className="text-base font-black text-slate-900 truncate" title={job.title}>{job.title}</h3>
                      </div>
                      <div className="text-sm font-bold text-slate-500 mb-1">{job.companyName}</div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium">
                        <span>{job.city || '不限地点'}</span>
                        <span className="h-1 w-1 rounded-full bg-slate-200" />
                        <span>{formatSalary(job.metadata?.salaryRange)}</span>
                      </div>
                    </div>

                    {/* Analysis Metrics */}
                    <div className="flex flex-wrap items-center gap-4 sm:gap-8 shrink-0">
                      <div className="text-center sm:text-right min-w-[64px]">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">报告分</div>
                        <div className="text-xl font-black text-blue-600">{Math.round(getReportScore(job))}</div>
                      </div>
                      
                      <div className="h-8 w-px bg-slate-100 hidden sm:block" />

                      <div className="grid grid-cols-2 sm:flex sm:flex-row gap-x-6 gap-y-2">
                        <div className="min-w-[70px]">
                          <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">匹配度</div>
                          <div className="text-sm font-black text-slate-700">{Math.round(getMatchScore(job))}</div>
                        </div>
                        <div className="min-w-[70px]">
                          <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">技术匹配</div>
                          <div className="text-sm font-black text-emerald-600">
                            {asArray(job.match_details?.techStack?.exact).length} / {Math.max(1, asArray(job.match_details?.techStack?.exact).length + asArray(job.match_details?.techStack?.fuzzy).length + asArray(job.match_details?.techStack?.missing).length)}
                          </div>
                        </div>
                        <div className="min-w-[70px]">
                          <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">精确覆盖</div>
                          <div className="text-sm font-black text-slate-700">{Math.round((job.exact_match_ratio || 0) * 100)}%</div>
                        </div>
                        <div className="min-w-[70px]">
                          <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">硬门槛</div>
                          <div className={cn("text-sm font-black", job.check?.passed ? "text-emerald-500" : "text-rose-500")}>
                            {job.check?.passed ? "通过" : "预警"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(job.stableId);
                      }}
                      className="absolute -right-3 -top-3 sm:relative sm:right-0 sm:top-0 h-8 w-8 flex items-center justify-center rounded-full bg-slate-50 border border-slate-100 text-slate-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-50 hover:text-rose-500 hover:border-rose-100 shadow-sm"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <div className="flex items-start gap-4 text-slate-500">
              <Zap size={18} className="mt-1 flex-shrink-0 text-amber-500" />
              <div>
                <h4 className="text-sm font-bold mb-1 text-slate-900">篮子状态提示</h4>
                <p className="text-xs leading-relaxed text-slate-500">
                  当前篮子中共有 {basketJobs.length} 个岗位。正式收割会逐条评估岗位要求与加分项，不计入工作内容。最终报告分 =（逐条星级分 × 0.6 + 标签匹配分 × 0.4）× 置信度系数。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-slate-100 rounded-3xl flex flex-col items-center text-center p-8 space-y-6 shadow-sm">
            <div
              className={cn(
                'w-24 h-24 rounded-full border-4 flex items-center justify-center transition-all duration-500',
                basketHarvesting ? 'border-amber-500 animate-ripening' : 'border-slate-50',
              )}
            >
              <div
                className={cn(
                  'w-16 h-16 rounded-full flex items-center justify-center',
                  basketHarvesting ? 'bg-amber-500 shadow-xl shadow-amber-200' : 'bg-slate-50',
                )}
              >
                {basketHarvesting ? (
                  <Wheat size={32} className="text-white animate-pulse" />
                ) : (
                  <ShoppingBasket size={32} className="text-blue-600" />
                )}
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900">{basketHarvesting ? '正在生成收割报告...' : '收割篮子'}</h3>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Harvest Process</p>
            </div>

            {basketHarvesting && (
              <div className="w-full space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400">
                  <span>Ripening</span>
                  <span className="text-amber-600">{harvestProgress}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all duration-150 ease-linear rounded-full shadow-sm"
                    style={{ width: `${harvestProgress}%` }}
                  />
                </div>
              </div>
            )}

            <Button
              className="w-full h-12 rounded-2xl font-black text-sm shadow-lg shadow-blue-100 transition-all active:scale-95"
              variant="default"
              disabled={basketHarvesting}
              onClick={handleHarvest}
            >
              {basketHarvesting ? <Loader2 size={18} className="animate-spin mr-2" /> : <Wheat size={18} className="mr-2" />}
              {basketHarvesting ? '正在生成收割报告' : '开始收割并保存历史'}
            </Button>

            <div className="text-[10px] text-slate-400 leading-relaxed italic px-2">
              收割后，当前篮子会进入「篮子历史记录」；分析报告会生成在「收割记录」中。
            </div>
          </div>
        </div>
      </div>

      <BasketHistoryList baskets={basketHistory} />

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

export default BasketView;
