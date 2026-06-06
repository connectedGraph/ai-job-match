import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wheat,
  Calendar,
  BarChart3,
  Bot,
  Brain,
  Target,
  ArrowRight,
  Sparkles,
  Trash2,
  Eye,
  Bookmark,
  BookmarkCheck,
  X
} from 'lucide-react';
import { useData } from '../../../context/DataContext';
import Button, { cn } from '../../../components/ui/Button';
import api from '../../../services/api';
import CareerReportDetail from '../../../components/reports/CareerReportDetail';
import {
  buildCareerReportSnapshot,
  careerReportId,
  findSavedReport,
  removeSavedReport,
  upsertSavedReport,
} from '../../../services/careerReports';
import {
  buildActionPlan,
  formatTimeLabel,
  getConfidenceCoefficient,
  getJdStarScore,
  getMatchScore,
  getPreConfidenceScore,
  getReportScore,
  getStudentCompetitivenessScore,
  getTagMatchScore,
  renderStars,
} from '../../../services/matchWorkspace';

function harvestMatchesId(record, harvestId) {
  if (!record || !harvestId) return false;
  return String(record.id || record.harvestId || '') === String(harvestId);
}

function formatScore(value) {
  if (value === null || value === undefined || value === '') return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return String(Math.round(Math.max(0, Math.min(100, numeric))));
}

function formatCoefficient(value) {
  if (value === null || value === undefined || value === '') return '--';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(3) : '--';
}

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatFormulaNumber(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return Number(numeric.toFixed(digits)).toString();
}

function cleanReasonText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .replace(/基于当前标签匹配结果的本地降级评估。?/g, '基于当前画像标签、命中项与缺口列表的系统评估。')
    .replace(/本地降级结果/g, '系统辅助评估结果')
    .replace(/降级评估/g, '系统评估');
}

function firstCleanText(...values) {
  return values.map(cleanReasonText).find(Boolean) || '';
}

function assessmentReasonRows(items = [], predicate) {
  return items
    .filter((item) => item && predicate(Number(item.stars || 0), item))
    .map((item) => ({
      label: item.label || renderStars(item.stars),
      text: cleanReasonText(item.reason || item.evidence || item.text),
    }))
    .filter((item) => item.text);
}

function buildConfidenceExplanation(harvest = {}, rank = {}) {
  const formula = rank.scoreFormula || {};
  const jdWeight = finiteNumber(formula.jdStarWeight ?? formula.jd_star_weight, 0.6);
  const tagWeight = finiteNumber(formula.tagMatchWeight ?? formula.tag_match_weight, 0.4);
  const jdScore = finiteNumber(formula.jdStarScore ?? formula.jd_star_score, getJdStarScore(rank));
  const tagScore = finiteNumber(
    formula.tagMatchScore ?? formula.tag_match_score,
    getTagMatchScore(rank) || getMatchScore(rank),
  );
  const calculatedComposite = jdScore * jdWeight + tagScore * tagWeight;
  const rawCompositeScore = formula.preConfidenceScore
    ?? formula.pre_confidence_score
    ?? rank.preConfidenceScore
    ?? rank.pre_confidence_score;
  const compositeScore = finiteNumber(
    rawCompositeScore,
    calculatedComposite,
  );
  const confidenceCoefficient = getConfidenceCoefficient(rank) ?? getConfidenceCoefficient(harvest);
  const rawReportScore = formula.reportScore
    ?? formula.report_score
    ?? rank.reportScore
    ?? rank.report_score
    ?? rank.finalReportScore
    ?? rank.final_report_score;
  const reportScore = finiteNumber(
    rawReportScore,
    Number.isFinite(Number(confidenceCoefficient))
      ? compositeScore * Number(confidenceCoefficient)
      : getReportScore(rank),
  );
  const items = Array.isArray(rank.jdSplitAssessment) ? rank.jdSplitAssessment : [];

  return {
    title: rank.title || '未命名岗位',
    companyName: rank.companyName || '未知公司',
    jdWeight,
    tagWeight,
    jdScore,
    tagScore,
    calculatedComposite,
    compositeScore,
    confidenceCoefficient,
    reportScore,
    explicitReason: firstCleanText(
      formula.reasoning,
      formula.explanation,
      formula.reason,
      rank.preConfidenceReasoning,
      rank.confidenceReasoning,
      rank.reasoning,
      rank.explanation,
      rank.analysis,
      harvest.overview,
    ),
    supportReasons: assessmentReasonRows(items, (stars) => stars >= 2).slice(0, 3),
    riskReasons: assessmentReasonRows(items, (stars) => stars > 0 && stars <= 1).slice(0, 2),
  };
}

const ConfidenceExplanationModal = ({ detail, onClose }) => {
  if (!detail) return null;

  const explanation = buildConfidenceExplanation(detail.harvest, detail.rank);
  const hasReasonRows = explanation.supportReasons.length > 0 || explanation.riskReasons.length > 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[130] bg-slate-950/35 backdrop-blur-sm"
      />
      <motion.section
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="fixed left-1/2 top-1/2 z-[131] max-h-[86vh] w-[calc(100vw-32px)] max-w-[720px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500">Composite Confidence</div>
            <h3 className="mt-1 text-lg font-black text-slate-950">合成置信度计算过程</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {explanation.title} @ {explanation.companyName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
            aria-label="关闭合成置信度说明"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-blue-600">计算公式</div>
            <div className="mt-3 rounded-xl bg-white px-4 py-3 font-mono text-[12px] font-bold leading-6 text-slate-700">
              <div>合成置信度 = JD 星级分 x {formatFormulaNumber(explanation.jdWeight)} + 技能匹配分 x {formatFormulaNumber(explanation.tagWeight)}</div>
              <div className="mt-1 text-blue-600">
                {formatFormulaNumber(explanation.jdScore)} x {formatFormulaNumber(explanation.jdWeight)}
                {' + '}
                {formatFormulaNumber(explanation.tagScore)} x {formatFormulaNumber(explanation.tagWeight)}
                {' = '}
                {formatFormulaNumber(explanation.compositeScore)}
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-5 text-blue-700">
              JD 星级分来自“岗位要求/加分项”的逐条 AI 评估；技能匹配分来自当前画像标签与 JD 标签的匹配结果。
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">最终分联动</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white px-2 py-3">
                <div className="text-lg font-black text-blue-500">{formatScore(explanation.compositeScore)}</div>
                <div className="mt-1 text-[9px] font-bold text-slate-400">合成</div>
              </div>
              <div className="rounded-xl bg-white px-2 py-3">
                <div className="text-lg font-black text-slate-900">{formatCoefficient(explanation.confidenceCoefficient)}</div>
                <div className="mt-1 text-[9px] font-bold text-slate-400">系数</div>
              </div>
              <div className="rounded-xl bg-white px-2 py-3">
                <div className="text-lg font-black text-orange-500">{formatScore(explanation.reportScore)}</div>
                <div className="mt-1 text-[9px] font-bold text-slate-400">最终</div>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-5 text-slate-500">
              最终报告分 = 合成置信度 x 置信度系数。
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-black text-slate-900">
            <Sparkles size={16} className="text-orange-500" />
            AI 生成的可解释理由
          </div>
          <p className="mt-2 text-[12px] leading-5 text-slate-600">
            {explanation.explicitReason || '本次收割未返回独立的合成置信度说明，以下依据 AI 逐条 JD 评估摘录展示主要影响项。'}
          </p>

          {hasReasonRows && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-emerald-50/70 p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600">支撑项</div>
                <ul className="mt-3 space-y-2">
                  {(explanation.supportReasons.length ? explanation.supportReasons : [{ label: '暂无', text: '当前没有明显支撑项摘录。' }]).map((item, index) => (
                    <li key={`support-${index}`} className="text-[12px] leading-5 text-emerald-800">
                      <span className="font-black">{item.label}：</span>{item.text}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl bg-rose-50/70 p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-rose-500">不确定项</div>
                <ul className="mt-3 space-y-2">
                  {(explanation.riskReasons.length ? explanation.riskReasons : [{ label: '暂无', text: '当前没有明显扣分项摘录。' }]).map((item, index) => (
                    <li key={`risk-${index}`} className="text-[12px] leading-5 text-rose-800">
                      <span className="font-black">{item.label}：</span>{item.text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </motion.section>
    </>
  );
};

function studentCompetitivenessFromHarvest(harvest = {}) {
  const value = harvest.studentCompetitiveness?.total_score
    ?? harvest.studentCompetitivenessScore
    ?? harvest.goldScore;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

const JdAssessmentPreview = ({ rank, onOpenPreview }) => {
  const items = Array.isArray(rank.jdSplitAssessment) ? rank.jdSplitAssessment : [];
  const counts = rank.jdStarCounts || {};
  if (!items.length && !Object.keys(counts).length) return null;

  return (
    <button
      type="button"
      onClick={onOpenPreview}
      className="w-full rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-3 text-left transition hover:border-orange-200 hover:bg-orange-50/50"
    >
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-gray-500">
        <span>岗位要求/加分项逐条评分</span>
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">星级均分 {renderStars(getJdStarScore(rank))}</span>
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-600">达到 {counts.three || 0}</span>
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-600">部分 {counts.two || 0}</span>
        <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-600">未达 {counts.one || 0}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-orange-500">
          <Eye size={12} />
          预览详情
        </span>
      </div>
      <p className="mt-2 line-clamp-1 text-[10px] text-gray-400">
        已折叠 {items.length} 条逐项解释，点击查看完整预览。
      </p>
    </button>
  );
};

function deleteHarvestLocally(workspace, harvestId) {
  const harvests = workspace.harvests || [];
  const deletedHarvest = harvests.find((item) => harvestMatchesId(item, harvestId)) || {};
  const deletedJobIds = new Set([
    ...(deletedHarvest.jobIds || []),
    ...(deletedHarvest.rankings || []).map((rank) => rank.stableId || rank.id).filter(Boolean),
  ].map(String));
  const nextHarvests = harvests.filter((item) => !harvestMatchesId(item, harvestId));
  const nextBasketHistory = (workspace.basketHistory || []).filter((item) => !harvestMatchesId(item, harvestId));
  const nextSelectedHarvestId = workspace.selectedHarvestId === harvestId
    ? nextHarvests[0]?.id || null
    : workspace.selectedHarvestId;
  const shouldClearTarget = workspace.targetJobId && deletedJobIds.has(String(workspace.targetJobId));

  return {
    ...workspace,
    harvests: nextHarvests,
    basketHistory: nextBasketHistory,
    selectedHarvestId: nextSelectedHarvestId,
    ...(shouldClearTarget ? { targetJobId: null, targetHarvestId: null, actionPlan: null } : {}),
  };
}

const HarvestView = () => {
  const { matchWorkspace, saveWorkspace, studentData } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [localSelectedId, setLocalSelectedId] = useState(null);
  const [previewReport, setPreviewReport] = useState(null);
  const [confidenceDetail, setConfidenceDetail] = useState(null);

  const harvests = matchWorkspace.harvests || [];
  const savedReports = matchWorkspace.savedReports || [];
  const selectedId = searchParams.get('harvest') || localSelectedId || matchWorkspace.selectedHarvestId || null;
  const selectedHarvest = harvests.find(h => h.id === selectedId) || (harvests.length > 0 ? harvests[0] : null);
  const activeHarvestId = selectedHarvest?.id || null;
  const selectedHarvestStudentScore = studentCompetitivenessFromHarvest(selectedHarvest || {})
    ?? getStudentCompetitivenessScore(selectedHarvest?.rankings?.[0] || {});
  const selectedHarvestCoefficient = selectedHarvest?.confidenceCoefficient
    ?? getConfidenceCoefficient(selectedHarvest?.rankings?.[0] || {});

  const buildReportForRank = (rank) => {
    const reportId = careerReportId(selectedHarvest || {}, rank || {});
    const saved = findSavedReport(matchWorkspace, reportId);
    return buildCareerReportSnapshot(selectedHarvest || {}, rank || {}, studentData || {}, saved);
  };

  const handleOpenReportPreview = (rank) => {
    setPreviewReport(buildReportForRank(rank));
  };

  const handleToggleReportFavorite = async (event, rank) => {
    event.stopPropagation();
    const report = buildReportForRank(rank);
    const exists = Boolean(findSavedReport(matchWorkspace, report.id));
    const nextWorkspace = exists
      ? removeSavedReport(matchWorkspace, report.id)
      : upsertSavedReport(matchWorkspace, report);
    await saveWorkspace(nextWorkspace, true);
    if (previewReport?.id === report.id) {
      setPreviewReport(exists ? report : { ...report, savedAt: report.savedAt || new Date().toISOString() });
    }
  };

  const handleSelectHarvest = async (harvestId) => {
    setLocalSelectedId(harvestId);
    setSearchParams({ harvest: harvestId });
    if (matchWorkspace.selectedHarvestId !== harvestId) {
      await saveWorkspace({
        ...matchWorkspace,
        selectedHarvestId: harvestId,
      }, true);
    }
  };

  const handleSelectTarget = async (jobId) => {
    const job = matchWorkspace.jobsById[jobId];
    if (!job) return;

    const isSwitchingTarget = Boolean(matchWorkspace.targetJobId && matchWorkspace.targetJobId !== jobId);
    if (isSwitchingTarget && matchWorkspace.actionPlan) {
      const confirmed = window.confirm('切换主攻目标会覆盖当前行动计划进度。要继续并重新生成目标计划吗？');
      if (!confirmed) return;
    }

    const now = new Date().toISOString();
    const actionPlan = {
      ...buildActionPlan(job, studentData, isSwitchingTarget ? {} : matchWorkspace.actionPlan || {}),
      sourceHarvestId: activeHarvestId,
      createdAt: isSwitchingTarget ? now : matchWorkspace.actionPlan?.createdAt || now,
      updatedAt: now,
    };

    await saveWorkspace({
      ...matchWorkspace,
      targetJobId: jobId,
      targetHarvestId: activeHarvestId,
      actionPlan,
    }, true);
  };

  const handleDeleteHarvest = async (event, harvestId) => {
    event.stopPropagation();
    const harvest = harvests.find((item) => item.id === harvestId);
    const harvestJobIds = new Set([
      ...(harvest?.jobIds || []),
      ...(harvest?.rankings || []).map((rank) => rank.stableId || rank.id).filter(Boolean),
    ].map(String));
    const clearsCurrentTarget = matchWorkspace.targetJobId && harvestJobIds.has(String(matchWorkspace.targetJobId));
    const confirmed = window.confirm(
      `${clearsCurrentTarget ? '这条收割记录包含当前主攻目标，删除后会清空当前行动计划。\n' : ''}删除这次收割记录后无法恢复：${harvest?.bestJobTitle || harvestId}。继续吗？`
    );
    if (!confirmed) return;

    try {
      const response = await api.delete(`/api/match/harvest/${encodeURIComponent(harvestId)}`);
      const nextWorkspace = response?.workspace || deleteHarvestLocally(matchWorkspace, harvestId);
      const nextSelectedId = nextWorkspace.selectedHarvestId || nextWorkspace.harvests?.[0]?.id || null;
      setLocalSelectedId(nextSelectedId);
      if (nextSelectedId) {
        setSearchParams({ harvest: nextSelectedId });
      } else {
        setSearchParams({});
      }
      await saveWorkspace(nextWorkspace);
    } catch (error) {
      console.error('Delete harvest failed, applying local fallback:', error);
      const nextWorkspace = deleteHarvestLocally(matchWorkspace, harvestId);
      const nextSelectedId = nextWorkspace.selectedHarvestId || nextWorkspace.harvests?.[0]?.id || null;
      setLocalSelectedId(nextSelectedId);
      if (nextSelectedId) {
        setSearchParams({ harvest: nextSelectedId });
      } else {
        setSearchParams({});
      }
      await saveWorkspace(nextWorkspace, true);
    }
  };

  if (harvests.length === 0) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6 border border-gray-100 text-gray-400">
          <Wheat size={32} />
        </div>
        <h3 className="text-xl font-bold mb-2">尚无收割记录</h3>
        <p className="text-gray-500 max-w-xs text-sm">
          提交采摘篮并完成「催熟」后，您的深度横评报告将出现在这里。
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 pb-20">
        {/* Sidebar: History List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">收割历史</h3>
            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{harvests.length}</span>
          </div>
          <div className="space-y-2">
            {harvests.map(harvest => (
              <div
                key={harvest.id}
                className={cn(
                  "group rounded-sm border transition-all duration-200",
                  activeHarvestId === harvest.id
                    ? "bg-orange-500/10 border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
                    : "bg-gray-50 border-gray-100 hover:bg-gray-100 hover:border-gray-200"
                )}
              >
                <button
                  type="button"
                  onClick={() => handleSelectHarvest(harvest.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-bold text-orange-400">#{harvest.id.replace('basket-', '')}</span>
                    <span className="text-[10px] text-gray-600">{formatTimeLabel(harvest.completedAt || harvest.submittedAt)}</span>
                  </div>
                  <div className="text-[11px] font-medium truncate mb-2">{harvest.bestJobTitle}</div>
                  <div className="mb-3 text-[10px] text-gray-500">
                    {(harvest.jobIds?.length || harvest.rankings?.length || 0)} 个岗位 · {harvest.status || 'Harvested'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1 flex-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500" style={{ width: `${harvest.confidence || 0}%` }} />
                    </div>
                    <span className="text-[9px] font-bold text-gray-500">{harvest.confidence || 0}%</span>
                  </div>
                </button>
                <div className="flex justify-end border-t border-gray-100 px-3 py-2">
                  <button
                    type="button"
                    onClick={(event) => handleDeleteHarvest(event, harvest.id)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                    title="删除这次收割记录"
                  >
                    <Trash2 size={12} />
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content: Report View */}
        <div className="lg:col-span-3 space-y-8">
          <AnimatePresence mode="wait">
            {selectedHarvest ? (
              <motion.div
                key={selectedHarvest.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Report Hero */}
                <div className="bg-white border border-orange-100 rounded-3xl p-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50/50 rounded-full -mr-16 -mt-16 -z-10" />
                  
                  <div className="flex flex-col md:flex-row gap-8 items-start md:items-center relative z-10">
                    <div className="w-20 h-20 bg-orange-50 rounded-2xl flex items-center justify-center border border-orange-100 shrink-0">
                      <BarChart3 size={32} className="text-orange-400" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 bg-orange-500 text-white text-[10px] font-black rounded-sm uppercase tracking-wider">Report Summary</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ID: {selectedHarvest.id}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={12} />
                          {formatTimeLabel(selectedHarvest.completedAt || selectedHarvest.submittedAt)}
                        </span>
                        <span>{selectedHarvest.jobIds?.length || selectedHarvest.rankings?.length || 0} POSITIONS ANALYZED</span>
                      </div>
                      <h2 className="text-xl font-black tracking-tight leading-tight text-slate-900">
                        岗位评分分析概要
                        <span className="mx-2 text-slate-300 font-normal">|</span>
                        <span className="text-orange-500 block md:inline text-lg">{selectedHarvest.bestJobTitle} 表现突出</span>
                      </h2>
                      <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
                        {selectedHarvest.overview}
                      </p>
                    </div>
                    <div className="grid min-w-[220px] grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-orange-50 bg-orange-50/20 p-3 text-center">
                        <div className="mb-1 text-[9px] font-black uppercase text-orange-400 tracking-wider">报告置信度</div>
                        <div className="text-lg font-black text-orange-500">{selectedHarvest.confidence || 0}%</div>
                      </div>
                      <div className="rounded-2xl border border-slate-50 bg-slate-50/50 p-3 text-center">
                        <div className="mb-1 text-[9px] font-black uppercase text-slate-400 tracking-wider">背景竞争力</div>
                        <div className="text-lg font-black text-slate-900">
                          {formatScore(selectedHarvestStudentScore)}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-50 bg-slate-50/50 p-3 text-center">
                        <div className="mb-1 text-[9px] font-black uppercase text-slate-400 tracking-wider">置信度系数</div>
                        <div className="text-lg font-black text-slate-900">
                          {formatCoefficient(selectedHarvestCoefficient)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ranking Grid */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-black flex items-center gap-2">
                      <BarChart3 size={18} className="text-orange-400" />
                      采摘果实最终报告分排行
                    </h3>
                    <p className="mt-1 text-[11px] leading-5 text-gray-500">
                      最终报告分 =（岗位要求/加分项逐条星级分 × 0.6 + 标签匹配分 × 0.4）× 置信度系数；工作内容不参与星级评分。
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-6">
                    {selectedHarvest.rankings?.map((rank) => {
                      const isSaved = savedReports.some((report) => report.id === careerReportId(selectedHarvest, rank));
                      const isTarget = matchWorkspace.targetJobId === rank.stableId;
                      
                      return (
                        <div key={rank.stableId} className={cn(
                          "bg-white border rounded-3xl transition-all duration-300 overflow-hidden",
                          isTarget ? "border-red-200 shadow-sm shadow-red-50" : "border-slate-100 hover:border-orange-200 hover:shadow-lg hover:shadow-orange-500/5",
                          isSaved && "ring-1 ring-orange-200"
                        )}>
                          {/* Card Content Wrapper */}
                          <div className="p-6 space-y-5">
                            {/* Top Row: Info & Actions */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="flex items-start gap-4 min-w-0">
                                {/* Global Rank Badge */}
                                <div className={cn(
                                  "w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center font-black text-lg border",
                                  rank.rank === 1 
                                    ? "bg-orange-500 border-orange-600 text-white shadow-lg shadow-orange-500/20" 
                                    : "bg-slate-50 border-slate-100 text-slate-400"
                                )}>
                                  {rank.rank}
                                </div>
                                
                                {/* Labels & Company */}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <h4 className="text-base font-black text-slate-900 tracking-tight leading-snug">
                                      {rank.title}
                                    </h4>
                                    {isTarget && (
                                      <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-wider">Target</span>
                                    )}
                                    {rank.rank === 1 && (
                                      <span className="bg-orange-50 text-orange-600 text-[9px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-wider border border-orange-100">Top Match</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-slate-400 font-medium font-mono uppercase tracking-widest">
                                    <span className="text-slate-500">{rank.companyName}</span>
                                    <span className="h-1 w-1 rounded-full bg-slate-200" />
                                    <span>ID-{rank.stableId?.slice(-6) || 'N/A'}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Action Buttons Row */}
                              <div className="flex items-center gap-2 sm:self-start bg-slate-50/50 p-1 rounded-2xl border border-slate-100/50">
                                <button
                                  type="button"
                                  onClick={() => handleOpenReportPreview(rank)}
                                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-400 transition hover:bg-orange-50 hover:text-orange-500 border border-slate-100"
                                  title="预览完整报告"
                                >
                                  <Eye size={18} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => handleToggleReportFavorite(event, rank)}
                                  className={cn(
                                    "flex h-10 w-10 items-center justify-center rounded-xl transition border",
                                    isSaved
                                      ? "bg-orange-500 border-orange-600 text-white shadow-md shadow-orange-500/20"
                                      : "bg-white border-slate-100 text-slate-400 hover:bg-orange-50 hover:text-orange-500"
                                  )}
                                  title={isSaved ? "取消收藏" : "收藏报告"}
                                >
                                  {isSaved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
                                </button>
                                <button 
                                  onClick={() => handleSelectTarget(rank.stableId)}
                                  className={cn(
                                    "flex items-center gap-2 h-10 px-4 rounded-xl transition-all font-black text-[10px] uppercase tracking-wider border",
                                    isTarget 
                                      ? "bg-red-500 border-red-600 text-white shadow-md shadow-red-500/20" 
                                      : "bg-white border-slate-100 text-slate-400 hover:border-red-200 hover:text-red-500"
                                  )}
                                >
                                  <Target size={16} />
                                  {isTarget ? 'Target Set' : 'Set as Target'}
                                </button>
                              </div>
                            </div>

                            {/* Metric Strip Section */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
                              <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">最终报告分</div>
                                <div className="text-xl font-black text-orange-500">{formatScore(getReportScore(rank))}</div>
                              </div>
                              <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">JD 星级均分</div>
                                <div className="text-sm font-black text-orange-500">{renderStars(getJdStarScore(rank))}</div>
                              </div>
                              <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">技能匹配分</div>
                                <div className="text-xl font-black text-slate-900">{formatScore(getTagMatchScore(rank) || getMatchScore(rank))}</div>
                              </div>
                              <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">合成置信度</div>
                                  <button
                                    type="button"
                                    onClick={() => setConfidenceDetail({ harvest: selectedHarvest, rank })}
                                    className="flex h-5 w-5 items-center justify-center rounded-full border border-blue-100 bg-white text-[10px] font-black text-blue-500 transition hover:border-blue-300 hover:bg-blue-50"
                                    aria-label={`查看 ${rank.title || '岗位'} 的合成置信度计算过程`}
                                    title="查看计算过程和 AI 理由"
                                  >
                                    ?
                                  </button>
                                </div>
                                <div className="text-xl font-black text-blue-500">{formatScore(getPreConfidenceScore(rank))}</div>
                              </div>
                              <div className="col-span-2 md:col-span-1 bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">系数 Calibration</div>
                                <div className="text-xl font-black text-slate-900">{formatCoefficient(getConfidenceCoefficient(rank))}</div>
                              </div>
                            </div>

                            {/* Bottom Context Area */}
                            <JdAssessmentPreview rank={rank} onOpenPreview={() => handleOpenReportPreview(rank)} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* AI Insight Section */}
                <div className="orchard-card !p-0 overflow-hidden border-teal-500/20">
                  <div className="bg-teal-500/10 px-6 py-4 flex items-center justify-between border-b border-teal-500/20">
                    <div className="flex items-center gap-2">
                      <Bot size={20} className="text-teal-400" />
                      <span className="text-sm font-black tracking-tight text-teal-400 uppercase">AI 深度背景收割报告 (摘要)</span>
                    </div>
                    <Sparkles size={16} className="text-teal-400/50" />
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="flex gap-6 items-start">
                      <div className="w-12 h-12 rounded-xl bg-teal-500/20 flex items-center justify-center shrink-0">
                        <Brain size={24} className="text-teal-400" />
                      </div>
                      <div className="space-y-4">
                        <p className="text-sm text-[var(--tx-2)] leading-relaxed">
                          基于岗位库中 <span className="text-[var(--tx-1)] font-bold">1200+</span> 历史面试沉淀与当前画像 (<span className="text-[var(--tx-1)]">工程能力 {matchWorkspace.generatedAt ? 'v2' : 'v1'}</span>)，
                          AI 认为您在 <span className="text-teal-400 font-bold">{selectedHarvest.bestJobTitle}</span> 上具备显著的差异化竞争力。
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                          <div className="space-y-3">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                              <span className="w-1 h-3 bg-teal-500 rounded-full" />
                              面试核心切入点
                            </h4>
                            <ul className="space-y-2">
                              {['展示在嵌入式系统中的并发处理能力', '强调对通信协议栈的深度理解', '利用项目经验证明解决复杂 Bug 的闭环思维'].map((item, i) => (
                                <li key={i} className="text-xs text-tx-2 flex items-start gap-2">
                                  <span className="text-teal-500 mt-0.5">•</span>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                              <span className="w-1 h-3 bg-red-500 rounded-full" />
                              近期需规避短板
                            </h4>
                            <ul className="space-y-2">
                              {['缺乏在 10w+ QPS 环境下的真实压测经验', '对分布式协议细节的掌握尚停留在理论层面'].map((item, i) => (
                                <li key={i} className="text-xs text-tx-2 flex items-start gap-2">
                                  <span className="text-red-400 mt-0.5">•</span>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center pt-4">
                  <Button
                    className="h-12 px-8 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm"
                    variant="default"
                    onClick={() => handleSelectTarget(selectedHarvest.bestJobId)}
                  >
                    设为主攻目标岗位
                    <ArrowRight size={16} className="ml-2" />
                  </Button>
                </div>

              </motion.div>
            ) : (
              <div className="h-[50vh] flex items-center justify-center text-gray-600 italic">
                请从左侧选择一个收割记录进行查看
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {previewReport && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewReport(null)}
              className="fixed inset-0 z-[120] bg-slate-950/40 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 right-0 z-[121] flex w-full max-w-[980px] flex-col border-l border-slate-200 bg-[#f8f4ed] shadow-[0_24px_90px_rgba(15,23,42,0.22)]"
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">Report Preview</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">收藏前后都可查看完整报告</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewReport(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                  aria-label="关闭预览"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <CareerReportDetail report={previewReport} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confidenceDetail && (
          <ConfidenceExplanationModal
            detail={confidenceDetail}
            onClose={() => setConfidenceDetail(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default HarvestView;
