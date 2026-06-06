import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { marked } from 'marked';
import Button, { cn } from '../components/ui/Button';
import { useTheme } from '../context/ThemeContext';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Bot,
  Brain,
  CalendarRange,
  ChevronRight,
  Eye,
  FileJson,
  Flame,
  History,
  Loader2,
  Moon,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  ShoppingBasket,
  Sparkles,
  Star,
  Sprout,
  Sun,
  Target,
  Trash2,
  TrendingUp,
  UserRound,
  Wheat,
  X,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import {
  MATCH_STORAGE_KEYS,
  MATCH_VIEWS,
  RECOMMENDATION_LANES,
  RESERVED_ENDPOINTS,
  buildActionPlan,
  buildBasketComparison,
  buildCheckResult,
  buildHarvestRecord,
  buildProfileSnapshot,
  createDraftBasket,
  formatSalary,
  formatTimeLabel,
  getConfidenceCoefficient,
  getDefaultMatchInput,
  getMatchScore,
  getReportScore,
  getStudentCompetitivenessScore,
  getStudentDisplayName,
  normalizeMatchJobs,
  parseStudentInput,
  syncStudentProfile,
} from './matchWorkspace';

const INITIAL_EVENT_DRAFT = {
  title: '完成 Mini-BFF 项目并同步画像',
  type: 'project',
  summary: '使用 Node.js + Express 搭建中间层，并补充容器化能力。',
  tags: 'Node.js, Docker, Express',
};

function loadJsonStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function createEmptyWorkspace() {
  return {
    generatedAt: null,
    jobsById: {},
    lanes: {
      featured: [],
      featured_safety: [],
      featured_target: [],
      featured_reach: [],
      interest: [],
      switch: [],
    },
    analysis: '',
    analysisMeta: null,
    structuredReport: null,
    hasMore: {},
    totals: {},
    timing: null,
    currentBasket: createDraftBasket([]),
    harvests: [],
    targetJobId: null,
    selectedHarvestId: null,
    selectedReportJobId: null,
    actionPlan: null,
    profileEvents: [],
  };
}

function laneMeta(laneId) {
  return RECOMMENDATION_LANES.find((item) => item.id === laneId) || RECOMMENDATION_LANES[0];
}

function listFromIds(ids = [], jobsById = {}) {
  return ids.map((id) => jobsById[id]).filter(Boolean);
}

function statusToken(status) {
  const mapping = {
    locked: { label: '待核查', className: 'border-teal-border bg-teal-dim text-teal' },
    checking: { label: '核查中', className: 'border-blue-border bg-blue-dim text-blue' },
    pickable: { label: '可采摘', className: 'border-teal-border bg-teal-dim text-teal' },
    rejected: { label: '不可采摘', className: 'border-red-border bg-red-dim text-red' },
    picked: { label: '已入篮', className: 'border-amber-border bg-amber-dim text-amber' },
    ranked: { label: '已排名', className: 'border-amber-border bg-amber-dim text-amber' },
    targeted: { label: '已锁定目标', className: 'border-violet-dim border-violet-border bg-violet-dim text-violet' },
  };
  return mapping[status] || mapping.locked;
}

function progressWidth(value) {
  return `${Math.max(0, Math.min(100, Math.round(value || 0)))}%`;
}

function relativeTagRows(job = {}) {
  const details = job.match_details || {};
  const categories = [
    { key: 'techStack', label: '技术栈', color: 'text-teal' },
    { key: 'techCapabilities', label: '核心能力', color: 'text-blue' },
    { key: 'devTools', label: '开发工具', color: 'text-amber' },
  ];

  const rows = [];
  categories.forEach(({ key, label, color }) => {
    const data = details[key] || {};
    const exact = data.exact || [];
    const fuzzy = data.fuzzy || [];
    const missing = data.missing || [];

        exact.forEach((item) => {
      rows.push({
        cat: label,
        catColor: color,
        name: item.jd_tag,
        isOr: item.jd_tag.includes(' -> '),
        yours: item.best_stu || item.jd_tag,
        gap: '精确命中',
        type: 'pass',
        accuracy: item.base_similarity ? `${Math.round(item.base_similarity * 100)}%` : '100%',
      });
    });

    fuzzy.forEach((item) => {
      rows.push({
        cat: label,
        catColor: color,
        name: item.jd_tag,
        isOr: item.jd_tag.includes(' -> '),
        yours: item.best_stu || '相近能力',
        gap: '近似覆盖',
        type: 'warn',
        accuracy: item.base_similarity ? `${Math.round(item.base_similarity * 100)}%` : '84%+',
      });
    });

    missing.forEach((item) => {
      rows.push({
        cat: label,
        catColor: color,
        name: item.jd_tag,
        yours: '—',
        gap: '缺失',
        type: 'miss',
        accuracy: '0%',
      });
    });
  });

  return rows;
}

function laneAccentClass(accent) {
  const map = {
    emerald: 'from-teal-dim via-bg to-transparent border-teal-border',
    violet: 'from-violet-dim via-bg to-transparent border-violet-border',
    amber: 'from-amber-dim via-bg to-transparent border-amber-border',
    blue: 'from-blue-dim via-bg to-transparent border-blue-border',
  };
  return map[accent] || map.emerald;
}

// 精选三槽元数据
const SLOT_META = {
  safety: {
    key: 'featured_safety',
    label: '保守槽',
    english: 'Safety',
    emoji: '🟢',
    badge: '稳健直投',
    advice: '匹配度高、门槛符合，适合优先投递，快速拿到 Offer 保底。',
    accentCard: 'emerald',
    headerColor: 'text-teal',
    headerBg: 'bg-teal-dim border-teal-border',
  },
  target: {
    key: 'featured_target',
    label: '精准槽',
    english: 'Target',
    emoji: '🎯',
    badge: '主力方向',
    advice: '与你的技术栈高度契合，是本轮求职的主战场，务必重点准备。',
    accentCard: 'blue',
    headerColor: 'text-blue',
    headerBg: 'bg-blue-dim border-blue-border',
  },
  reach: {
    key: 'featured_reach',
    label: '冲刺槽',
    english: 'Reach',
    emoji: '🚀',
    badge: '高薪冲刺',
    advice: '薪资倒排，挑战性强。建议在保底 Offer 到手后再集中冲刺。',
    accentCard: 'amber',
    headerColor: 'text-amber',
    headerBg: 'bg-amber-dim border-amber-border',
    salarySort: true,
  },
};

function reportContribution(job = {}) {
  const contributions = job.score_breakdown?.contributions || job.scoring?.contributions || {};
  return [
    { label: '技术匹配贡献', value: Math.round(contributions.tech_match || (job.score_tech || 0) * 0.9), className: 'bg-teal' },
    { label: '通用素质贡献', value: Math.round(contributions.quality_match || (job.score_quality || 0) * 0.1), className: 'bg-violet' },
  ];
}

const MatchPage = () => {
  const { section = 'explore' } = useParams();
  const navigate = useNavigate();
  const { fetchJson, loading } = useApi();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [generatingInsight, setGeneratingInsight] = useState(false);

  const validView = MATCH_VIEWS.some((item) => item.id === section) ? section : 'explore';

  const [inputJson, setInputJson] = useState(() => localStorage.getItem(MATCH_STORAGE_KEYS.inputDraft) || getDefaultMatchInput());
  const [history, setHistory] = useState(() => loadJsonStorage(MATCH_STORAGE_KEYS.history, []));
  const [workspace, setWorkspace] = useState(() => {
    const saved = loadJsonStorage(MATCH_STORAGE_KEYS.workspace, null);
    const fallback = createEmptyWorkspace();
    if (!saved) return fallback;
    return {
      ...fallback,
      ...saved,
      currentBasket: saved.currentBasket || fallback.currentBasket,
      lanes: saved.lanes || fallback.lanes,
      jobsById: saved.jobsById || fallback.jobsById,
      harvests: saved.harvests || fallback.harvests,
      profileEvents: saved.profileEvents || [],
    };
  });
  const [studentData, setStudentData] = useState(() => {
    try {
      return parseStudentInput(localStorage.getItem(MATCH_STORAGE_KEYS.inputDraft) || getDefaultMatchInput());
    } catch {
      return parseStudentInput(getDefaultMatchInput());
    }
  });
  const [detailJobId, setDetailJobId] = useState(null);
  const [exploreLane, setExploreLane] = useState('featured');
  const [laneOffsets, setLaneOffsets] = useState({ featured: 0, interest: 0, switch: 0 });
  const [eventDraft, setEventDraft] = useState(INITIAL_EVENT_DRAFT);
  const [showSimConsole, setShowSimConsole] = useState(false);

  useEffect(() => {
    if (section !== validView) {
      navigate('/match/explore', { replace: true });
    }
  }, [navigate, section, validView]);

  useEffect(() => {
    try {
      localStorage.setItem(MATCH_STORAGE_KEYS.inputDraft, inputJson);
    } catch (e) {
      console.warn('Storage failed for draft', e);
    }
  }, [inputJson]);

  useEffect(() => {
    try {
      localStorage.setItem(MATCH_STORAGE_KEYS.workspace, JSON.stringify(workspace));
    } catch (e) {
      console.warn('Storage failed for workspace', e);
    }
  }, [workspace]);

  useEffect(() => {
    try {
      localStorage.setItem(MATCH_STORAGE_KEYS.history, JSON.stringify(history));
    } catch (e) {
      console.error('Storage failed for history', e);
      // 如果存不下历史，尝试缩减一条历史
      if (history.length > 1) {
        setHistory(prev => prev.slice(0, -1));
      }
    }
  }, [history]);

  useEffect(() => {
    try {
      setStudentData(parseStudentInput(inputJson));
    } catch {
      // keep last valid profile
    }
  }, [inputJson]);

  useEffect(() => {
    const active = workspace.harvests.some((item) => item.status === 'Queueing' || item.status === 'Ripening');
    if (!active) return undefined;

    const timer = window.setInterval(() => {
      setWorkspace((prev) => {
        let changed = false;
        let selectedHarvestId = prev.selectedHarvestId;
        const jobsById = { ...prev.jobsById };
        const harvests = prev.harvests.map((harvest) => {
          if (harvest.status === 'Queueing') {
            changed = true;
            return {
              ...harvest,
              status: 'Ripening',
              progress: 35,
            };
          }
          if (harvest.status !== 'Ripening') return harvest;

          changed = true;
          const nextProgress = Math.min(100, (harvest.progress || 0) + 18);
          if (nextProgress < 100) {
            return {
              ...harvest,
              progress: nextProgress,
            };
          }

          const completed = buildHarvestRecord(
            { ...harvest, status: 'Harvested', progress: 100 },
            harvest.jobSnapshots || [],
            studentData,
            prev.analysis
          );

          completed.jobSnapshots?.forEach((job) => {
            if (!jobsById[job.stableId]) return;
            jobsById[job.stableId] = {
              ...jobsById[job.stableId],
              workspaceStatus: jobsById[job.stableId].workspaceStatus === 'targeted' ? 'targeted' : 'ranked',
            };
          });
          selectedHarvestId = selectedHarvestId || completed.id;
          return completed;
        });

        if (!changed) return prev;
        return {
          ...prev,
          jobsById,
          harvests,
          selectedHarvestId,
          selectedReportJobId: prev.selectedReportJobId || harvests.find((item) => item.status === 'Harvested')?.bestJobId || null,
        };
      });
    }, 1400);

    return () => window.clearInterval(timer);
  }, [studentData, workspace.harvests]);

  const basketJobs = listFromIds(workspace.currentBasket.jobIds, workspace.jobsById);
  const harvests = workspace.harvests || [];
  const selectedHarvest =
    harvests.find((item) => item.id === workspace.selectedHarvestId) ||
    harvests[0] ||
    null;
  const selectedReportJob =
    selectedHarvest?.jobSnapshots?.find((item) => item.stableId === workspace.selectedReportJobId) ||
    selectedHarvest?.jobSnapshots?.[0] ||
    null;
  const targetJob =
    workspace.jobsById[workspace.targetJobId] ||
    harvests.flatMap((item) => item.jobSnapshots || []).find((item) => item.stableId === workspace.targetJobId) ||
    null;
  const actionPlan = workspace.actionPlan || (targetJob ? buildActionPlan(targetJob, studentData) : null);
  const profileSnapshot = buildProfileSnapshot(studentData, workspace.profileEvents || []);
  const currentViewMeta = MATCH_VIEWS.find((item) => item.id === validView) || MATCH_VIEWS[0];

  const handleMatch = async (overrideOffsets) => {
    let parsed;
    try {
      parsed = parseStudentInput(inputJson);
    } catch (error) {
      showToast(`JSON 校验失败: ${error.message}`, 'error');
      return;
    }

    const offsets = overrideOffsets !== undefined ? overrideOffsets : laneOffsets;

    try {
      const savedConfigs = loadJsonStorage('portrait_builder_configs_v1', []);
      const activeConfig = savedConfigs.find((item) => item.enabled);
      const result = await fetchJson('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: parsed,
          config: activeConfig,
          batch_offsets: offsets,
        }),
      });

      const normalized = normalizeMatchJobs(result, workspace.jobsById);
      const draftBasket = workspace.currentBasket?.jobIds?.length
        ? {
            ...workspace.currentBasket,
            jobIds: workspace.currentBasket.jobIds.filter((id) => normalized.jobsById[id]),
          }
        : workspace.currentBasket;
      const nextWorkspace = {
        ...workspace,
        ...normalized,
        currentBasket: draftBasket || createDraftBasket(workspace.harvests),
      };

      setStudentData(parsed);
      setWorkspace(nextWorkspace);

      // 如果是换一批（有 overrideOffsets）就不切页也不触发 AI 深度分析
      if (overrideOffsets === undefined) {
        setDetailJobId(normalized.lanes.featured[0] || normalized.lanes.interest[0] || null);
        setHistory((prev) => [
          {
            id: Date.now(),
            time: new Date().toISOString(),
            studentName: getStudentDisplayName(parsed),
            studentInput: parsed,
            // 注意：不再存储全量 result 到 localStorage，避免 QuotaExceededError
          },
          ...prev.slice(0, 7),
        ]);
        navigate('/match/explore');

        // 异步背景召回 AI 深度分析报告 (不阻塞岗位列表展示)
        (async () => {
          setGeneratingInsight(true);
          try {
            const insightResult = await fetchJson('/api/match/insight', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                student: parsed,
                config: activeConfig,
                batch_offsets: offsets,
              }),
            });
            setWorkspace(prev => ({
              ...prev,
              structuredReport: insightResult.structured_report,
              analysis: insightResult.analysis,
              analysisMeta: insightResult.analysisMeta,
            }));
          } catch (e) {
            console.error('Failed to generate background insight:', e);
          } finally {
            setGeneratingInsight(false);
          }
        })();
      }
      showToast(overrideOffsets !== undefined ? '已换一批推荐' : '已生成新的果园推荐结果', 'success');
    } catch (error) {
      showToast(`匹配失败: ${error.message}`, 'error');
    }
  };

  // 换一批：增加指定 lane 的 offset 并重新请求
  // 换一批：优先切本地缓存，本地用完了再请求后端
  const handleNextBatch = async (laneId) => {
    const totalInLane = workspace.lanes[laneId]?.length || 0;
    const uiOffset = laneOffsets[laneId] || 0;
    const UI_PAGE_SIZE = 6; // 每次展示 6 个（网格 3x2 或 2x3 效果好）

    // 1. 如果本地还有未展示的岗位（后端一次回了 20 个）
    if (uiOffset + UI_PAGE_SIZE < totalInLane) {
      setLaneOffsets((prev) => ({ ...prev, [laneId]: uiOffset + UI_PAGE_SIZE }));
      showToast('换一批成功（本地）', 'success');
      return;
    }

    // 2. 本地展示完了，检查后端是否还有下一页
    let hasMore = false;
    if (laneId === 'featured_safety' || laneId === 'featured_target' || laneId === 'featured_reach') {
      const slotKey = laneId.replace('featured_', '');
      hasMore = workspace.hasMore?.featured?.[slotKey];
    } else {
      hasMore = workspace.hasMore?.[laneId];
    }

    if (hasMore === false) {
      // 如果本地也没了，后端也没了，回到第一批（循环效果）
      setLaneOffsets((prev) => ({ ...prev, [laneId]: 0 }));
      showToast('已循环回到起始推荐', 'info');
      return;
    }

    // 3. 请求后端更多数据
    const nextBackendOffset = totalInLane; // 假定当前所有都是从 0 开始请求的
    const newOffsets = { ...laneOffsets, [laneId]: nextBackendOffset };
    setLaneOffsets(newOffsets);
    await handleMatch(newOffsets);
  };

  const handleCheckJob = async (jobId) => {
    const job = workspace.jobsById[jobId];
    if (!job) return;
    setWorkspace((prev) => ({
      ...prev,
      jobsById: {
        ...prev.jobsById,
        [jobId]: {
          ...prev.jobsById[jobId],
          workspaceStatus: 'checking',
        },
      },
    }));

    await new Promise((resolve) => window.setTimeout(resolve, 900));
    const result = buildCheckResult(job, studentData);

    setWorkspace((prev) => ({
      ...prev,
      jobsById: {
        ...prev.jobsById,
        [jobId]: {
          ...prev.jobsById[jobId],
          check: result,
          workspaceStatus: result.passed ? 'pickable' : 'rejected',
        },
      },
    }));

    showToast(result.passed ? '岗位核查通过，可加入篮子' : '岗位核查未通过，已标记差距', result.passed ? 'success' : 'info');
  };

  const handlePickJob = (jobId) => {
    const job = workspace.jobsById[jobId];
    if (!job) return;
    if (!['pickable', 'picked'].includes(job.workspaceStatus)) {
      showToast('请先完成岗位核查', 'info');
      return;
    }

    setWorkspace((prev) => {
      const exists = prev.currentBasket.jobIds.includes(jobId);
      if (exists) return prev;
      return {
        ...prev,
        currentBasket: {
          ...prev.currentBasket,
          jobIds: [...prev.currentBasket.jobIds, jobId],
          lastEditedAt: new Date().toISOString(),
        },
        jobsById: {
          ...prev.jobsById,
          [jobId]: {
            ...prev.jobsById[jobId],
            workspaceStatus: 'picked',
            pickedAt: new Date().toISOString(),
          },
        },
      };
    });
    showToast('岗位已加入当前篮子', 'success');
  };

  const handleRemoveFromBasket = (jobId) => {
    setWorkspace((prev) => {
      const nextIds = prev.currentBasket.jobIds.filter((id) => id !== jobId);
      const currentJob = prev.jobsById[jobId];
      return {
        ...prev,
        currentBasket: {
          ...prev.currentBasket,
          jobIds: nextIds,
          lastEditedAt: new Date().toISOString(),
        },
        jobsById: currentJob
          ? {
              ...prev.jobsById,
              [jobId]: {
                ...currentJob,
                workspaceStatus: currentJob.check?.passed ? 'pickable' : 'locked',
              },
            }
          : prev.jobsById,
      };
    });
    showToast('岗位已移出篮子', 'info');
  };

  const handleSubmitBasket = () => {
    if (!basketJobs.length) {
      showToast('篮子为空，先去探索页采摘岗位', 'info');
      return;
    }
    if (!window.confirm(`确认提交当前篮子？本次提交包含 ${basketJobs.length} 个岗位。`)) return;

    setWorkspace((prev) => {
      const draft = prev.currentBasket;
      const queuedHarvest = {
        ...draft,
        status: 'Queueing',
        progress: 18,
        submittedAt: new Date().toISOString(),
        jobSnapshots: listFromIds(draft.jobIds, prev.jobsById),
      };
      const nextDraft = createDraftBasket([queuedHarvest, ...prev.harvests]);
      return {
        ...prev,
        harvests: [queuedHarvest, ...prev.harvests],
        selectedHarvestId: queuedHarvest.id,
        selectedReportJobId: queuedHarvest.jobIds?.[0] || null,
        currentBasket: nextDraft,
      };
    });
    navigate('/match/harvest');
    showToast('篮子已提交，开始进入收割队列', 'success');
  };

  const handleSelectTarget = (job) => {
    if (!job) return;
    setWorkspace((prev) => {
      const jobsById = { ...prev.jobsById };
      if (prev.targetJobId && jobsById[prev.targetJobId]) {
        jobsById[prev.targetJobId] = {
          ...jobsById[prev.targetJobId],
          workspaceStatus: 'ranked',
        };
      }
      if (jobsById[job.stableId]) {
        jobsById[job.stableId] = {
          ...jobsById[job.stableId],
          workspaceStatus: 'targeted',
        };
      }

      return {
        ...prev,
        jobsById,
        targetJobId: job.stableId,
        selectedReportJobId: job.stableId,
        actionPlan: buildActionPlan(job, studentData, prev.actionPlan || {}),
      };
    });
    navigate('/match/action');
    showToast(`已将 ${job.title} 锁定为目标岗位`, 'success');
  };

  const handleAddCheckin = (hours) => {
    if (!targetJob) {
      showToast('请先从收割报告中锁定目标岗位', 'info');
      return;
    }
    setWorkspace((prev) => {
      const currentPlan = prev.actionPlan || buildActionPlan(targetJob, studentData);
      const checkins = currentPlan.checkins.map((item, index) =>
        index === currentPlan.checkins.length - 1 ? { ...item, hours } : item
      );
      const nextPlan = {
        ...currentPlan,
        checkins,
        growth: currentPlan.growth + Math.round(hours * 5),
        streak: hours > 0 ? currentPlan.streak + 1 : currentPlan.streak,
        totalProgress: Math.min(100, currentPlan.totalProgress + Math.round(hours * 1.5)),
      };
      return {
        ...prev,
        actionPlan: nextPlan,
      };
    });
    showToast(`已记录今日 ${hours} 小时学习时长`, 'success');
  };

  const handleSyncEvent = () => {
    const tags = eventDraft.tags.split(',').map((item) => item.trim()).filter(Boolean);
    if (!eventDraft.title.trim() || tags.length === 0) {
      showToast('请输入事件名称并至少选择一个标签', 'error');
      return;
    }

    const synced = syncStudentProfile(studentData, {
      ...eventDraft,
      tags,
    });
    setStudentData(synced);
    setInputJson(JSON.stringify(synced, null, 2));
    setWorkspace((prev) => {
      const currentPlan = prev.actionPlan || (targetJob ? buildActionPlan(targetJob, synced) : null);
      return {
        ...prev,
        profileEvents: [
          {
            title: eventDraft.title,
            type: eventDraft.type,
            tags,
            summary: eventDraft.summary,
            happenedAt: new Date().toISOString(),
          },
          ...(prev.profileEvents || []),
        ].slice(0, 8),
        actionPlan: currentPlan
          ? {
              ...currentPlan,
              growth: currentPlan.growth + 15,
            }
          : currentPlan,
      };
    });
    showToast('事件已写入画像草稿，并同步到侧边测试台 JSON', 'success');
  };

  const handleClearHistory = () => {
    if (!window.confirm('确认清空匹配历史吗？')) return;
    setHistory([]);
    showToast('匹配历史已清空', 'info');
  };

  const handleLoadHistory = (item) => {
    setInputJson(JSON.stringify(item.studentInput, null, 2));
    setStudentData(item.studentInput);
    // 因为历史记录里不再存全量结果，载入后提示用户手动点一次匹配
    navigate('/match/explore');
    showToast(`已载入 ${item.studentName} 的画像数据，点击“开始匹配”以恢复`, 'info', 5000);
  };

  const renderActiveView = () => {
    switch (validView) {
      case 'basket':
        return (
          <BasketView
            basket={workspace.currentBasket}
            basketJobs={basketJobs}
            onRemove={handleRemoveFromBasket}
            onOpenDetail={setDetailJobId}
            onSubmit={handleSubmitBasket}
            onGoExplore={() => navigate('/match/explore')}
          />
        );
      case 'harvest':
        return (
          <HarvestView
            currentBasket={workspace.currentBasket}
            harvests={harvests}
            selectedHarvest={selectedHarvest}
            selectedReportJob={selectedReportJob}
            onSelectHarvest={(id) => setWorkspace((prev) => ({ ...prev, selectedHarvestId: id }))}
            onSelectReportJob={(jobId) => setWorkspace((prev) => ({ ...prev, selectedReportJobId: jobId }))}
            onSelectTarget={handleSelectTarget}
            onOpenDetail={setDetailJobId}
            onGoBasket={() => navigate('/match/basket')}
            onGoExplore={() => navigate('/match/explore')}
          />
        );
      case 'action':
        return (
          <ActionView
            targetJob={targetJob}
            actionPlan={actionPlan}
            eventDraft={eventDraft}
            onEventDraftChange={setEventDraft}
            onSyncEvent={handleSyncEvent}
            onCheckin={handleAddCheckin}
            onGoHarvest={() => navigate('/match/harvest')}
          />
        );
      case 'profile':
        return <ProfileView profile={profileSnapshot} studentData={studentData} />;
      default:
        return (
          <ExploreView
            workspace={workspace}
            exploreLane={exploreLane}
            laneOffsets={laneOffsets}
            generatingInsight={generatingInsight}
            onLaneChange={setExploreLane}
            onOpenDetail={setDetailJobId}
            onCheck={handleCheckJob}
            onPick={handlePickJob}
            onGoBasket={() => navigate('/match/basket')}
            onNextBatch={handleNextBatch}
          />
        );
    }
  };

  const StepIcons = {
    explore: Sprout,
    basket: ShoppingBasket,
    harvest: Wheat,
    profile: UserRound,
    action: Target,
  };

  return (
    <div className="min-h-screen bg-bg relative flex flex-col">
      {/* Standalone App Header */}
      <header className="sticky top-0 z-30 w-full shrink-0 border-b border-border bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/')}
              className="group flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-tx-3 transition-all hover:border-tx-3/20 hover:text-tx-1"
            >
              <ArrowRight size={14} className="rotate-180 transition-transform group-hover:-translate-x-0.5" />
              返回管理后台
            </button>
            <div className="h-4 w-[1px] bg-border" />
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-dim border border-teal-border text-teal">
                <Brain size={18} />
              </div>
              <div className="hidden sm:block">
                <div className="text-[12px] font-black tracking-tight text-tx-1 uppercase">Job system</div>
                <div className="text-[10px] font-medium text-teal/80">Student Flow Simulation</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-surface-3/50 p-1 rounded-2xl border border-border/50">
            {MATCH_VIEWS.map((item) => {
              const Icon = StepIcons[item.id] || Sprout;
              const isActive = validView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id === 'explore' ? '/match' : `/match/${item.id}`)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all duration-300",
                    isActive 
                      ? "bg-teal text-tx-inv shadow-lg shadow-teal/20" 
                      : "text-tx-3 hover:text-tx-1 hover:bg-surface-3"
                  )}
                >
                  <Icon size={15} className={isActive ? "animate-pulse" : ""} />
                  <span className="text-[11px] font-bold tracking-wide">{item.label}</span>
                  {item.id === 'basket' && basketJobs.length > 0 && (
                    <span className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                      isActive ? "bg-tx-inv text-teal" : "bg-teal text-tx-inv"
                    )}>
                      {basketJobs.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            {/* Global Student Stats */}
            <div className="hidden lg:flex items-center gap-4 mr-4 border-r border-border pr-4">
              <div className="flex flex-col items-end">
                <div className="text-[9px] font-bold text-status-pass uppercase tracking-wider">Harvest Profile</div>
                <div className="text-[12px] font-black text-tx-1">收割生成</div>
              </div>
              <div className="flex flex-col items-end">
                <div className="text-[9px] font-bold text-status-warn uppercase tracking-wider">Freshness</div>
                <div className="text-[12px] font-black text-tx-1">100%</div>
              </div>
            </div>

            <button
              onClick={toggleTheme}
              title="切换日/夜间模式"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-2 text-tx-2 transition-all hover:border-tx-3/20 hover:text-tx-1 hover:bg-surface-3"
            >
              {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <div className="hidden lg:flex flex-col items-end">
              <div className="text-[10px] font-bold text-tx-3 uppercase tracking-wider">Current Session</div>
              <div className="text-[11px] font-bold text-tx-1">{getStudentDisplayName(studentData)}</div>
            </div>
            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-teal to-blue flex items-center justify-center text-tx-inv font-bold text-sm shadow-inner">
              {getStudentDisplayName(studentData).slice(0, 1)}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] p-5 lg:p-8 space-y-8 animate-fade-in">
          <WorkspaceHero
            view={currentViewMeta}
            recommendedCount={Object.keys(workspace.jobsById || {}).length}
            basketCount={basketJobs.length}
            harvestCount={harvests.length}
            targetJob={targetJob}
          />
          
          <div className="relative pb-24">
            {renderActiveView()}
          </div>
        </div>
      </main>

      {/* Floating Simulation Controls */}
      <div className={cn(
        "fixed right-0 top-0 h-full bg-surface border-l border-border shadow-2xl transition-all duration-500 z-50",
        showSimConsole ? "w-[400px]" : "w-0 overflow-hidden border-none"
      )}>
        <button 
          onClick={() => setShowSimConsole(false)}
          className="absolute left-[-40px] top-1/2 -translate-y-1/2 h-20 w-10 bg-surface border border-r-0 border-border rounded-l-2xl flex items-center justify-center text-tx-3 hover:text-teal shadow-2xl"
        >
          <X size={20} />
        </button>
        <div className="h-full overflow-y-auto">
          <AdminConsole
            inputJson={inputJson}
            onInputChange={setInputJson}
            onMatch={handleMatch}
            loading={loading}
            analysisMeta={workspace.analysisMeta}
            generatedAt={workspace.generatedAt}
            history={history}
            onLoadHistory={handleLoadHistory}
            onClearHistory={handleClearHistory}
          />
        </div>
      </div>

      {!showSimConsole && (
        <button
          onClick={() => setShowSimConsole(true)}
          className="fixed bottom-8 right-8 flex h-14 w-14 items-center justify-center rounded-full bg-teal text-tx-inv shadow-2xl shadow-teal/30 hover:scale-110 active:scale-95 transition-all z-40 group"
        >
          <Settings size={24} className="group-hover:rotate-90 transition-transform duration-500" />
          <div className="absolute right-full mr-4 px-3 py-1.5 bg-tx-1 text-tx-inv text-[11px] font-bold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all pointer-events-none">
            Simulation Tools
          </div>
        </button>
      )}

      {detailJobId ? (
        <JobDetailDrawer
          job={workspace.jobsById[detailJobId]}
          onClose={() => setDetailJobId(null)}
          onCheck={handleCheckJob}
          onPick={handlePickJob}
          onSelectTarget={handleSelectTarget}
        />
      ) : null}
    </div>
  );
};

const WorkspaceHero = ({ view, recommendedCount, basketCount, harvestCount, targetJob }) => {
  return (
    <section className="relative overflow-hidden rounded-[40px] border border-border bg-surface shadow-xl p-8 transition-all duration-500">
      <div className="absolute -left-12 -top-12 h-40 w-40 rounded-full bg-teal-dim blur-3xl opacity-60" />
      <div className="absolute -bottom-12 -right-12 h-48 w-48 bg-amber-dim rounded-full blur-3xl opacity-40" />
      
      <div className="relative flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-border bg-teal-dim px-4 py-1.5 text-[11px] font-bold text-teal tracking-wide transition-all hover:scale-105">
            <Sprout size={13} className="animate-bounce" />
            Job system · {view.label} {view.english}
          </div>
          <h1 className="mt-5 text-[32px] font-bold tracking-tight text-tx-1 md:text-[40px] leading-[1.1]">
            学生端流程 <span className="text-teal">模拟仿真环境</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-tx-2 font-medium opacity-90">
            Job system 业务流全链路验证：模拟真实学生从岗位探索、核查入篮到收割生成报告及行动计划的完整心智旅程。
          </p>
          {targetJob ? (
            <div className="mt-5 inline-flex items-center gap-2.5 rounded-full border border-violet-border bg-violet-dim px-4 py-1.5 text-[11px] font-bold text-tx-1 shadow-sm">
              <Target size={14} className="text-violet" />
              当前目标：<span className="text-violet">{targetJob.title}</span> @ {targetJob.companyName}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <HeroStat label="推荐岗位" value={recommendedCount} icon={Sparkles} color="teal" />
          <HeroStat label="当前篮子" value={basketCount} icon={ShoppingBasket} color="amber" />
          <HeroStat label="收割记录" value={harvestCount} icon={Wheat} color="blue" />
          <HeroStat label="当前视图" value={view.label} icon={Rocket} color="violet" />
        </div>
      </div>
    </section>
  );
};

const HeroStat = ({ label, value, icon, color = 'teal' }) => {
  const IconComponent = icon;
  const colorMap = {
    teal: 'text-teal bg-teal-dim border-teal-border',
    amber: 'text-amber bg-amber-dim border-amber-border',
    blue: 'text-blue bg-blue-dim border-blue-border',
    violet: 'text-violet bg-violet-dim border-violet-border',
  };
  return (
  <div className={cn('rounded-[28px] border p-4 backdrop-blur-sm shadow-sm transition-all hover:scale-105', colorMap[color] || colorMap.teal)}>
    <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider opacity-80">
      <IconComponent size={13} />
      {label}
    </div>
    <div className="mt-2 text-[26px] font-bold tracking-tighter text-tx-1">{value}</div>
  </div>
  );
};

const ExploreView = ({ workspace, exploreLane, laneOffsets, generatingInsight, onLaneChange, onOpenDetail, onCheck, onPick, onGoBasket, onNextBatch }) => {
  const lane = laneMeta(exploreLane);
  const isFeatured = exploreLane === 'featured';
  const structuredReport = workspace.structuredReport || null;
  const UI_PAGE_SIZE = 6;

  // 统一切片逻辑：从全量 lanes 中取出当前 offset 对应的 6 个
  const getSlice = (lId) => {
    const all = listFromIds(workspace.lanes[lId] || [], workspace.jobsById);
    const offset = laneOffsets[lId] || 0;
    return all.slice(offset, offset + UI_PAGE_SIZE);
  };

  // 非精选赛道数据
  const singleJobs = isFeatured ? [] : getSlice(exploreLane);
  const singleHasMore = isFeatured ? false : (workspace.lanes[exploreLane]?.length > (laneOffsets[exploreLane] || 0) + UI_PAGE_SIZE) || workspace.hasMore?.[exploreLane];

  // 精选三槽数据
  const slotJobs = {
    safety: getSlice('featured_safety'),
    target: getSlice('featured_target'),
    reach: getSlice('featured_reach'),
  };

  // 特殊处理：未达标岗位池（直接取前 12 个展示，不分页，让用户一眼看到）
  const unqualifiedJobs = listFromIds(workspace.lanes['unqualified'] || [], workspace.jobsById).slice(0, 12);

  const featuredHasMore = {
    safety: (workspace.lanes['featured_safety']?.length > (laneOffsets['featured_safety'] || 0) + UI_PAGE_SIZE) || workspace.hasMore?.featured?.safety,
    target: (workspace.lanes['featured_target']?.length > (laneOffsets['featured_target'] || 0) + UI_PAGE_SIZE) || workspace.hasMore?.featured?.target,
    reach: (workspace.lanes['featured_reach']?.length > (laneOffsets['featured_reach'] || 0) + UI_PAGE_SIZE) || workspace.hasMore?.featured?.reach,
  };


  return (
    <section className="space-y-6">
      {/* Tab 栏 */}
      <Panel className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-tx-3">Explore</div>
            <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-tx-1">推荐果园</h2>
            <p className="mt-2 max-w-xl text-[13px] leading-6 text-tx-2">
              先看结论，再看细节。每张岗位卡都支持详情、核查、入篮和后续收割报告链路。
            </p>
          </div>
          <Button variant="accent" className="h-11 rounded-2xl px-5" onClick={onGoBasket}>
            <ShoppingBasket size={15} />
            查看当前篮子
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {RECOMMENDATION_LANES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onLaneChange(item.id)}
              className={cn(
                'min-w-[190px] rounded-[24px] border px-4 py-3 text-left transition-all duration-150',
                exploreLane === item.id
                  ? 'border-border-2 bg-surface-3/50 shadow-[0_18px_30px_rgba(0,0,0,0.12)]'
                  : 'border-border bg-surface-2 hover:border-border-2 hover:bg-surface-3/30'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-tx-1">{item.label}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-tx-3">{item.english}</div>
                </div>
                <span className="rounded-full border border-border-2 bg-surface-3/30 px-2 py-1 text-[10px] text-tx-2">
                  {item.tag}
                </span>
              </div>
              <div className="mt-3 text-[11.5px] leading-5 text-tx-2">{item.description}</div>
            </button>
          ))}
        </div>
      </Panel>

      {/* AI Overview（加载状态或内容） */}
      {generatingInsight ? (
        <Panel className="animate-pulse overflow-hidden p-0 border-teal-border/30">
          <div className="border-b border-border bg-teal-dim/30 px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
              <Loader2 className="animate-spin text-teal" size={16} />
              AI 正在深度分析推荐质量...
            </div>
          </div>
          <div className="space-y-3 px-5 py-6">
            <div className="h-4 w-3/4 rounded bg-surface-3" />
            <div className="h-4 w-1/2 rounded bg-surface-3" />
            <div className="h-32 w-full rounded bg-surface-3/50" />
          </div>
        </Panel>
      ) : workspace.analysis && !isFeatured ? (
        <Panel className="overflow-hidden p-0">
          <div className="border-b border-border bg-[linear-gradient(90deg,rgba(74,222,128,0.16),transparent)] px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
              <Bot size={16} />
              AI Overview
            </div>
          </div>
          <div
            className="prose max-w-none px-5 py-5 text-[13px] leading-7 prose-headings:text-tx-1 prose-p:text-tx-2 prose-strong:text-tx-1"
            dangerouslySetInnerHTML={{ __html: marked.parse(workspace.analysis) }}
          />
        </Panel>
      ) : null}

      {/* ──────── 精选推荐：三列并排 ──────── */}
      {isFeatured ? (
        <>
          {/* 结构化深度报告 */}
          {generatingInsight ? (
             <div className="mb-6 rounded-[32px] border border-dashed border-teal-border/30 bg-teal-dim/5 p-8 text-center">
                <Loader2 className="mx-auto mb-3 animate-spin text-teal" size={24} />
                <div className="text-sm font-medium text-tx-1">AI 正在为当前精选岗位生成面试建议与发展报告...</div>
                <div className="mt-1 text-xs text-tx-3 italic">由于模型处理需要，通常在 5-10 秒内完成。岗位列表已就绪。</div>
             </div>
          ) : structuredReport && (structuredReport.interview_advice?.length > 0 || structuredReport.tenure_growth || structuredReport.future_path) ? (
            <StructuredInsightReport report={structuredReport} jobs={[
              ...slotJobs.safety, ...slotJobs.target, ...slotJobs.reach,
            ]} />
          ) : null}

          <div className="grid gap-5 xl:grid-cols-3">
            {Object.entries(SLOT_META).map(([slotKey, meta]) => (
              <SlotColumn
                key={slotKey}
                meta={meta}
                jobs={slotJobs[slotKey]}
                hasMore={featuredHasMore[slotKey]}
                onOpenDetail={onOpenDetail}
                onCheck={onCheck}
                onPick={onPick}
                onNextBatch={() => onNextBatch(meta.key)}
              />
            ))}
          </div>
        </>
      ) : (
        /* ──────── 猜你喜欢 / 换岗路径：单列 ──────── */
        singleJobs.length === 0 ? (
          <EmptyState
            icon={Search}
            title="暂无推荐结果"
            desc="生成推荐后此处会展示岗位，当前方向岗位库中暂无匹配的跨方向岗位。"
          />
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {singleJobs.map((job) => (
                <JobSlotCard key={job.stableId} job={job} lane={lane} onOpenDetail={onOpenDetail} onCheck={onCheck} onPick={onPick} />
              ))}
            </div>
            <div className="flex items-center justify-center gap-3 mt-2">
              <Button variant="ghost" className="rounded-2xl px-5" onClick={() => onNextBatch(exploreLane)}>
                <RefreshCw size={14} />
                换一批
              </Button>
              {singleHasMore === false && (
                <span className="text-[12px] text-tx-3">已加载全部推荐，没有更多了</span>
              )}
            </div>
          </>
        )
      )}

      {/* ──────── Mismatched Jobs Section ──────── */}
      {unqualifiedJobs.length > 0 && (
        <div className="mt-12 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/50" />
            <div className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-1.5 shadow-sm">
              <ShieldAlert size={15} className="text-tx-3" />
              <span className="text-[12px] font-bold text-tx-2 uppercase tracking-wider">
                Mismatch / 未达标岗位警示
              </span>
            </div>
            <div className="h-px flex-1 bg-border/50" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 opacity-80 grayscale-[0.2]">
            {unqualifiedJobs.map((job) => (
              <JobSlotCard 
                key={job.stableId} 
                job={job} 
                lane={{ accent: 'slate', tag: '不匹配' }} 
                onOpenDetail={onOpenDetail} 
                onCheck={onCheck} 
                onPick={onPick} 
              />
            ))}
          </div>
          <p className="text-center text-[12px] text-tx-3 italic">
            * 以上岗位因硬性门槛（如学历、关键技术栈缺失）或通过率极低，建议暂缓投递，优先补强。
          </p>
        </div>
      )}
    </section>
  );
};

const SlotColumn = ({ meta, jobs, hasMore, onOpenDetail, onCheck, onPick, onNextBatch }) => {
  const lane = { accent: meta.accentCard, tag: meta.badge };
  return (
    <div className="flex flex-col gap-4">
      {/* 槽头部 */}
      <div className={cn('rounded-[24px] border p-4', meta.headerBg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[18px]">{meta.emoji}</span>
            <div>
              <div className={cn('text-[14px] font-bold', meta.headerColor)}>{meta.label}</div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-tx-3">{meta.english}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {meta.salarySort && (
              <span className="rounded-full bg-amber-dim border border-amber-border px-2 py-0.5 text-[9px] font-bold text-amber uppercase tracking-wider">
                薪资↓排
              </span>
            )}
            <span className="rounded-full border border-border-2 bg-surface/60 px-2.5 py-1 text-[11px] font-semibold text-tx-1">
              {jobs.length}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11.5px] leading-5 text-tx-2">{meta.advice}</p>
      </div>

      {/* 岗位卡列表 */}
      {jobs.length === 0 ? (
        <div className="rounded-[24px] border border-border border-dashed bg-surface-2/50 p-8 text-center text-[13px] text-tx-3">
          暂无此类岗位
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {jobs.map((job) => (
            <JobSlotCard key={job.stableId} job={job} lane={lane} onOpenDetail={onOpenDetail} onCheck={onCheck} onPick={onPick} />
          ))}
        </div>
      )}

      {/* 换一批 */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" className="rounded-2xl px-4 text-[12px]" onClick={onNextBatch}>
          <RefreshCw size={12} />
          换一批
        </Button>
        {hasMore === false && (
          <span className="text-[11px] text-tx-3">没有更多了</span>
        )}
      </div>
    </div>
  );
};

const BasketView = ({ basket, basketJobs, onRemove, onOpenDetail, onSubmit, onGoExplore }) => {
  return (
    <section className="space-y-5">
      <Panel className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-tx-3">Basket</div>
            <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-tx-1">当前篮子 {basket.id}</h2>
            <p className="mt-2 text-[13px] leading-6 text-tx-2">
              仅保留一个活跃 Draft 篮子。已通过核查的岗位会汇总在这里，提交后进入收割流程。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <MetricChip label="状态" value={basket.status} />
            <MetricChip label="上次编辑" value={formatTimeLabel(basket.lastEditedAt)} />
            <MetricChip label="岗位数" value={`${basketJobs.length}`} />
          </div>
        </div>
      </Panel>

      {basketJobs.length === 0 ? (
        <EmptyState icon={ShoppingBasket} title="篮子还是空的" desc="去探索页完成岗位核查并 Pick 到篮子后，这里会自动生成对比表与提交入口。">
          <Button variant="accent" className="mt-4 rounded-2xl px-5" onClick={onGoExplore}>
            <ArrowRight size={15} />
            去探索页采摘
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4">
            {basketJobs.map((job) => (
              <Panel key={job.stableId} className="p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status="picked" />
                      <span className="rounded-full border border-status-pass-border bg-status-pass-bg px-2 py-1 text-[10px] text-status-pass">
                        {job.laneLabel}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-tx-1">{job.title}</h3>
                    <div className="mt-1 text-[12px] text-tx-2">
                      {job.companyName} · {formatSalary(job.metadata?.salaryRange)}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {job.previewTags.map((tag) => (
                        <TagPill key={`${job.stableId}-${tag.text}`} tag={tag} />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" className="rounded-2xl px-4" onClick={() => onOpenDetail(job.stableId)}>
                      <Eye size={14} />
                      详情
                    </Button>
                    <Button variant="danger" ghost className="rounded-2xl px-4" onClick={() => onRemove(job.stableId)}>
                      <Trash2 size={14} />
                      移出篮子
                    </Button>
                  </div>
                </div>
              </Panel>
            ))}
          </div>

          <Panel className="overflow-hidden p-0">
            <div className="border-b border-border px-5 py-4">
              <div className="text-sm font-semibold text-tx-1">篮子对比速览</div>
              <div className="mt-1 text-[12px] text-tx-2">用统一口径对比初筛分、技术覆盖与软素质得分。</div>
            </div>
            <div className="overflow-x-auto px-5 py-5">
              <table className="min-w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-border text-tx-3">
                    <th className="px-0 py-3 font-medium">维度</th>
                    {basketJobs.map((job) => (
                      <th key={job.stableId} className="px-4 py-3 font-medium text-tx-1">{job.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buildBasketComparison(basketJobs).map((row) => (
                    <tr key={row.label} className="border-b border-border last:border-none">
                      <td className="px-0 py-4 text-tx-3">{row.label}</td>
                      {row.values.map((value, index) => (
                        <td key={`${row.label}-${index}`} className="px-4 py-4 text-tx-1">{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-tx-3">Next</div>
                <div className="mt-1 text-lg font-semibold text-tx-1">提交篮子，开始生成收割报告</div>
                <div className="mt-1 text-[12px] text-tx-2">提交后当前篮子锁定，系统会自动新建下一个空 Draft 篮子。</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" className="rounded-2xl px-4" onClick={onGoExplore}>
                  <Search size={14} />
                  继续探索
                </Button>
                <Button variant="accent" className="rounded-2xl px-5" onClick={onSubmit}>
                  <Wheat size={15} />
                  提交篮子
                </Button>
              </div>
            </div>
          </Panel>
        </>
      )}
    </section>
  );
};

const HarvestView = ({
  currentBasket,
  harvests,
  selectedHarvest,
  selectedReportJob,
  onSelectHarvest,
  onSelectReportJob,
  onSelectTarget,
  onOpenDetail,
  onGoBasket,
  onGoExplore,
}) => {
  return (
    <section className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-tx-3">Harvest</div>
              <div className="mt-1 text-lg font-semibold text-tx-1">收割记录</div>
            </div>
            <Button variant="ghost" className="rounded-2xl px-3" onClick={onGoBasket}>
              <ShoppingBasket size={14} />
              去篮子
            </Button>
          </div>
          <div className="mt-4 rounded-[24px] border border-status-pass-border bg-status-pass-bg p-4">
            <div className="text-[12px] text-status-pass">当前 Draft</div>
            <div className="mt-1 text-[18px] font-semibold text-tx-1">{currentBasket.id}</div>
            <div className="mt-2 text-[12px] text-tx-2/80">
              最近编辑：{formatTimeLabel(currentBasket.lastEditedAt)} · 已选 {currentBasket.jobIds?.length || 0} 个岗位
            </div>
          </div>
        </Panel>

        {harvests.length === 0 ? (
          <EmptyState icon={History} title="还没有收割记录" desc="提交第一个篮子后，这里会显示排队、成熟和已收割状态。">
            <Button variant="accent" className="mt-4 rounded-2xl px-5" onClick={onGoExplore}>
              <ArrowRight size={14} />
              去探索岗位
            </Button>
          </EmptyState>
        ) : (
          harvests.map((harvest) => (
            <button
              key={harvest.id}
              type="button"
              onClick={() => onSelectHarvest(harvest.id)}
              className={cn(
                'w-full rounded-[26px] border p-4 text-left transition-all duration-150',
                selectedHarvest?.id === harvest.id
                  ? 'border-border-2 bg-surface-3/50'
                  : 'border-border bg-surface-2 hover:border-border-2 hover:bg-surface-3/30'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] font-semibold text-tx-1">{harvest.id}</div>
                <span className={cn(
                  'rounded-full border px-2 py-1 text-[10px]',
                  harvest.status === 'Harvested'
                    ? 'border-status-harvest-border bg-status-harvest-bg text-status-harvest'
                    : harvest.status === 'Ripening'
                      ? 'border-status-warn-border bg-status-warn-bg text-status-warn'
                      : 'border-status-info-border bg-status-info-bg text-status-info'
                )}>
                  {harvest.status}
                </span>
              </div>
              <div className="mt-3 text-[12px] text-tx-2">
                提交：{formatTimeLabel(harvest.submittedAt || harvest.createdAt)} · 岗位 {harvest.jobSnapshots?.length || harvest.jobIds?.length || 0}
              </div>
              {harvest.status !== 'Harvested' ? (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-tx-3">
                    <span>处理进度</span>
                    <span>{Math.round(harvest.progress || 0)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-progress-track">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(251,191,36,0.95),rgba(249,115,22,0.82))]" style={{ width: progressWidth(harvest.progress) }} />
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-[12px] text-tx-2/90">
                  最佳匹配：{harvest.bestJobTitle}
                </div>
              )}
            </button>
          ))
        )}
      </div>

      {!selectedHarvest ? null : selectedHarvest.status !== 'Harvested' ? (
        <Panel className="p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-tx-3">Ripening</div>
          <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-tx-1">报告生成中</h3>
          <p className="mt-3 max-w-xl text-[13px] leading-6 text-tx-2">
            当前篮子已进入收割流程。这里预留给后续 `/api/match/harvest/{'{basketId}'}` 的进度流和逐岗位报告回填。
          </p>
          <div className="mt-6 rounded-[28px] border border-border bg-surface-2 p-6">
            <div className="flex items-center gap-3 text-tx-1">
              <Loader2 className="animate-spin" size={18} />
              正在处理 {selectedHarvest.jobSnapshots?.[0]?.title || '当前岗位'} 等 {selectedHarvest.jobSnapshots?.length || 0} 个岗位
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-progress-track">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(251,191,36,0.95),rgba(249,115,22,0.82))]" style={{ width: progressWidth(selectedHarvest.progress) }} />
            </div>
          </div>
        </Panel>
      ) : (
        <div className="space-y-5">
          <Panel className="overflow-hidden p-0">
            <div className="border-b border-border bg-[linear-gradient(90deg,rgba(251,191,36,0.18),transparent)] px-6 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-tx-3">AI Overview</div>
                  <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-tx-1">
                    {selectedHarvest.id} · 收割报告
                  </h3>
                  <p className="mt-2 max-w-2xl text-[13px] leading-6 text-tx-2/80">
                    {selectedHarvest.overview}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MetricChip label="置信度" value={`${selectedHarvest.confidence || 0}%`} />
                  <MetricChip label="最佳报告分" value={selectedHarvest.rankings?.[0] ? `${getReportScore(selectedHarvest.rankings[0]).toFixed(0)} 分` : '—'} />
                </div>
              </div>
            </div>

            <div className="grid gap-4 px-6 py-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                {selectedHarvest.rankings?.map((item) => (
                  <button
                    key={item.stableId}
                    type="button"
                    onClick={() => onSelectReportJob(item.stableId)}
                    className={cn(
                      'w-full rounded-[24px] border p-4 text-left transition-all duration-150',
                      selectedReportJob?.stableId === item.stableId
                        ? 'border-border-2 bg-surface-3/50'
                        : 'border-border bg-surface-2 hover:border-border-2 hover:bg-surface-3/30'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[12px] text-tx-3">排名 {item.rank}</div>
                        <div className="mt-1 text-lg font-semibold text-tx-1">{item.title}</div>
                        <div className="mt-1 text-[12px] text-tx-2">{item.companyName}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[24px] font-semibold tracking-[-0.03em] text-tx-1">{getReportScore(item).toFixed(0)}</div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-tx-3">Report Score</div>
                        <div className="mt-2 flex justify-end gap-1 text-[10px] font-semibold text-tx-3">
                          <span className="rounded-md border border-border bg-surface-3/30 px-1.5 py-0.5">匹配 {getMatchScore(item).toFixed(0)}</span>
                          <span className="rounded-md border border-border bg-surface-3/30 px-1.5 py-0.5">背景 {getStudentCompetitivenessScore(item).toFixed(0)}</span>
                          <span className="rounded-md border border-border bg-surface-3/30 px-1.5 py-0.5">系数 {getConfidenceCoefficient(item)?.toFixed(3) || '—'}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="rounded-[24px] border border-border bg-surface-2 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
                  <Brain size={16} />
                  下一步
                </div>
                <div className="mt-3 text-[12px] leading-6 text-tx-2">
                  选定一个目标岗位后，系统会按差距自动生成行动计划，并保留打卡和画像同步入口。
                </div>
                <Button
                  variant="accent"
                  className="mt-5 w-full rounded-2xl px-5"
                  onClick={() => onSelectTarget(selectedReportJob)}
                >
                  <Target size={15} />
                  选定目标岗位
                </Button>
              </div>
            </div>
          </Panel>

          {selectedReportJob ? (
            <InsightReport job={selectedReportJob} onSelectTarget={onSelectTarget} onOpenDetail={onOpenDetail} />
          ) : null}
        </div>
      )}
    </section>
  );
};

const ActionView = ({ targetJob, actionPlan, eventDraft, onEventDraftChange, onSyncEvent, onCheckin, onGoHarvest }) => {
  if (!targetJob || !actionPlan) {
    return (
      <EmptyState icon={Target} title="还没有目标岗位" desc="请先在收割报告中选定一个岗位，再进入行动计划。">
        <Button variant="accent" className="mt-4 rounded-2xl px-5" onClick={onGoHarvest}>
          <ArrowRight size={14} />
          去收割记录
        </Button>
      </EmptyState>
    );
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Panel className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-tx-3">Action Plan</div>
              <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-tx-1">
                {targetJob.title} @ {targetJob.companyName}
              </h2>
              <p className="mt-2 text-[13px] leading-6 text-tx-2">
                基于当前岗位差距自动生成提升路线，并保留每日打卡与事件同步入口。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MetricChip label="周预算" value={`${actionPlan.weeklyHours}h`} />
              <MetricChip label="总进度" value={`${actionPlan.totalProgress}%`} />
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-[12px] text-tx-3">
              <span>距投递倒计时</span>
              <span>{actionPlan.countdownDays} 天</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-progress-track">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(248,113,113,0.95),rgba(251,191,36,0.9))]" style={{ width: progressWidth(actionPlan.totalProgress) }} />
            </div>
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
            <Flame size={16} />
            近 30 天打卡热力图
          </div>
          <div className="mt-4 grid grid-cols-10 gap-2">
            {actionPlan.checkins.map((item, index) => (
              <div
                key={`${item.day}-${index}`}
                className={cn(
                  'aspect-square rounded-xl border',
                  item.hours >= 3
                    ? 'border-teal-border bg-teal/30'
                    : item.hours >= 1
                      ? 'border-teal-border bg-teal/15'
                      : 'border-border bg-surface-3/30'
                )}
                title={`${item.hours} 小时`}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-[12px] text-tx-2">
            <span>连续打卡：{actionPlan.streak} 天</span>
            <span>成长值：{actionPlan.growth}</span>
          </div>
        </Panel>

        <div className="space-y-4">
          {actionPlan.tasks.map((task) => (
            <Panel key={task.id} className="p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn(
                      'rounded-full border px-2 py-1 text-[10px]',
                      task.severity === 'missing'
                        ? 'border-status-danger-border bg-status-danger-bg text-status-danger'
                        : 'border-status-warn-border bg-status-warn-bg text-status-warn'
                    )}>
                      {task.severity === 'missing' ? '缺失能力' : '等级差距'}
                    </span>
                    <span className="text-[11px] text-tx-3">预计 {task.estimatedHours} 小时</span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-tx-1">{task.title}</h3>
                  <div className="mt-4 space-y-3">
                    {task.suggestions.map((item) => (
                      <div key={`${task.id}-${item.type}`} className="rounded-[20px] border border-border bg-surface-2 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-tx-3">{item.type}</div>
                        <div className="mt-1 text-[13px] text-tx-1">{item.text}</div>
                        <div className="mt-1 text-[11px] text-tx-3">{item.hours} 小时</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-full md:w-[180px]">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-tx-3">
                    <span>当前进度</span>
                    <span>{task.progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-progress-track">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(74,222,128,0.95),rgba(96,165,250,0.9))]" style={{ width: progressWidth(task.progress) }} />
                  </div>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        <Panel className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
            <CalendarRange size={16} />
            今日打卡
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={() => onCheckin(hours)}
                className="rounded-[18px] border border-border bg-surface-2 px-3 py-3 text-sm text-tx-1 transition-all duration-150 hover:border-border-2 hover:bg-surface-3/50"
              >
                {hours}h
              </button>
            ))}
          </div>
          <div className="mt-4 text-[12px] leading-6 text-tx-2">
            这里预留给后续每日提醒、晚间未打卡通知和成长值滚动动画接口。
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
            <Plus size={16} />
            事件同步画像
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <label className="block">
              <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-tx-3">事件名称</div>
              <input
                value={eventDraft.title}
                onChange={(event) => onEventDraftChange((prev) => ({ ...prev, title: event.target.value }))}
                className="w-full rounded-[18px] border border-border bg-surface-2 px-4 py-3 text-tx-1 outline-none transition-all focus:border-teal-border"
              />
            </label>
            <label className="block">
              <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-tx-3">相关标签</div>
              <input
                value={eventDraft.tags}
                onChange={(event) => onEventDraftChange((prev) => ({ ...prev, tags: event.target.value }))}
                className="w-full rounded-[18px] border border-border bg-surface-2 px-4 py-3 text-tx-1 outline-none transition-all focus:border-teal-border"
              />
            </label>
            <label className="block">
              <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-tx-3">补充说明</div>
              <textarea
                value={eventDraft.summary}
                onChange={(event) => onEventDraftChange((prev) => ({ ...prev, summary: event.target.value }))}
                className="min-h-[116px] w-full rounded-[18px] border border-border bg-surface-2 px-4 py-3 text-tx-1 outline-none transition-all focus:border-teal-border"
              />
            </label>
            <Button variant="accent" className="w-full rounded-2xl px-5" onClick={onSyncEvent}>
              <Send size={15} />
              确认同步画像
            </Button>
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
            <Sparkles size={16} />
            成长中心
          </div>
          <div className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-tx-1">{actionPlan.growth}</div>
          <div className="mt-1 text-[12px] text-tx-2">当前成长值</div>
          <div className="mt-4 space-y-2">
            {actionPlan.badges.map((badge) => (
              <div key={badge.id} className="flex items-center justify-between rounded-[18px] border border-border bg-surface-2 px-4 py-3">
                <span className="text-sm text-tx-1">{badge.label}</span>
                <span className={cn(
                  'rounded-full px-2 py-1 text-[10px]',
                  badge.unlocked ? 'bg-status-pass-bg text-status-pass' : 'bg-surface-3/50 text-tx-3'
                )}>
                  {badge.unlocked ? '已解锁' : '待解锁'}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
};

const ProfileView = ({ profile, studentData }) => {
  return (
    <section className="space-y-5">
      <Panel className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-tx-3">Profile</div>
            <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-tx-1">
              {profile.name} · 我的能力画像
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-tx-2">
              画像数据来自右侧 JSON 测试台与行动计划事件同步，是整个匹配工作流的统一底座。
            </p>
          </div>
          <MetricChip label="画像完整度" value={`${profile.completeness}%`} />
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Panel className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
              <UserRound size={16} />
              基本信息与含金量
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <InfoTile label="学校" value={profile.schoolName} />
              <InfoTile label="专业" value={profile.schoolMajor} />
              <InfoTile label="学历" value={profile.educationLevel} />
              <InfoTile label="毕业年份" value={`${profile.graduationYear}`} />
            </div>
            <div className="mt-5 text-[12px] leading-6 text-tx-2">
              当前兴趣方向：{studentData.direction || '待补充'} · 感兴趣领域 {(studentData.domains || []).slice(0, 3).join('、') || '待补充'}
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
              <BookOpen size={16} />
              技术栈全景
            </div>
            <div className="mt-4 space-y-4">
              {Object.entries(profile.stackGroups).map(([group, rows]) => (
                <div key={group}>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-tx-3">{group}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {rows.map((item) => (
                      <span key={`${group}-${item.name}`} className="rounded-full border border-border bg-surface-2 px-3 py-2 text-[12px] text-tx-1">
                        {item.name} · Lv{item.level}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
              <Brain size={16} />
              三维能力
            </div>
            <div className="mt-4 space-y-4">
              <ProgressMetric label="Engineering" value={profile.dimensions.engineering} />
              <ProgressMetric label="Scene" value={profile.dimensions.scene} />
              <ProgressMetric label="Principle" value={profile.dimensions.principle} />
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
              <Shield size={16} />
              软素质评分
            </div>
            <div className="mt-4 space-y-3">
              {profile.softQualities.map((item) => (
                <div key={item.name}>
                  <div className="mb-1 flex items-center justify-between text-[12px] text-tx-2">
                    <span>{item.name}</span>
                    <span>Lv{item.level}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-progress-track">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(96,165,250,0.95),rgba(74,222,128,0.75))]" style={{ width: progressWidth(item.level * 25) }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
              <RefreshCw size={16} />
              最近变化
            </div>
            {profile.recentChanges.length === 0 ? (
              <div className="mt-4 text-[12px] text-tx-3">行动计划中的事件同步后，这里会自动显示最近 4 条变化。</div>
            ) : (
              <div className="mt-4 space-y-3">
                {profile.recentChanges.map((item) => (
                  <div key={`${item.title}-${item.happenedAt}`} className="rounded-[18px] border border-border bg-surface-2 px-4 py-3">
                    <div className="text-sm text-tx-1">{item.title}</div>
                    <div className="mt-1 text-[11px] text-tx-3">{formatTimeLabel(item.happenedAt)}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.tags?.map((tag) => (
                        <span key={`${item.title}-${tag}`} className="rounded-full border border-status-pass-border bg-status-pass-bg px-2 py-1 text-[10px] text-status-pass">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
};

const AdminConsole = ({
  inputJson,
  onInputChange,
  onMatch,
  loading,
  analysisMeta,
  generatedAt,
  history,
  onLoadHistory,
  onClearHistory,
}) => {
  return (
    <aside className="space-y-5 xl:sticky xl:top-[72px] xl:self-start">
      <Panel className="overflow-hidden p-0">
        <div className="border-b border-border bg-[linear-gradient(90deg,rgba(96,165,250,0.16),transparent)] px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
            <FileJson size={16} />
            Match Test Console
          </div>
          <div className="mt-1 text-[12px] text-tx-2">保留 `/api/match` 联调入口，持续支持 JSON 输入与历史回放。</div>
        </div>
        <div className="px-5 py-5">
          <textarea
            value={inputJson}
            onChange={(event) => onInputChange(event.target.value)}
            spellCheck={false}
            className="min-h-[360px] w-full rounded-[22px] border border-border bg-surface-2 px-4 py-4 font-mono text-[11.5px] leading-6 text-tx-1 outline-none transition-all focus:border-teal-border"
          />
          <Button variant="accent" className="mt-4 h-12 w-full rounded-2xl px-5" onClick={() => onMatch()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            生成果园推荐
          </Button>
        </div>
      </Panel>

      <Panel className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-tx-1">接口接线状态</div>
            <div className="mt-1 text-[12px] text-tx-2">已接真实接口与后续占位接口同时展示。</div>
          </div>
          <span className="rounded-full border border-status-pass-border bg-status-pass-bg px-2 py-1 text-[10px] text-status-pass">
            UTF-8
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {RESERVED_ENDPOINTS.map((item) => (
            <div key={item.id} className="rounded-[18px] border border-border bg-surface-2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] text-tx-2">{item.method} {item.path}</span>
                <span className={cn(
                  'rounded-full px-2 py-1 text-[10px]',
                  item.live ? 'bg-status-pass-bg text-status-pass' : 'bg-surface-3/50 text-tx-3'
                )}>
                  {item.live ? 'LIVE' : 'RESERVED'}
                </span>
              </div>
              <div className="mt-1 text-[12px] text-tx-3">{item.desc}</div>
            </div>
          ))}
        </div>
        {analysisMeta ? (
          <div className="mt-4 rounded-[18px] border border-border bg-surface-2 px-4 py-3 text-[12px] text-tx-2">
            <div>LLM 状态：{analysisMeta.status || 'unknown'}</div>
            <div className="mt-1">模型：{analysisMeta.model || '未配置'}</div>
            <div className="mt-1">最近生成：{formatTimeLabel(generatedAt)}</div>
          </div>
        ) : null}
      </Panel>

      <Panel className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
            <History size={16} />
            匹配历史
          </div>
          <Button variant="ghost" className="rounded-2xl px-3" onClick={onClearHistory}>
            <Trash2 size={14} />
            清空
          </Button>
        </div>
        {history.length === 0 ? (
          <div className="mt-4 text-[12px] text-tx-3">暂无历史记录，生成过一次推荐后会自动存档。</div>
        ) : (
          <div className="mt-4 space-y-3">
            {history.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onLoadHistory(item)}
                className="w-full rounded-[18px] border border-border bg-surface-2 px-4 py-3 text-left transition-all duration-150 hover:border-border-2 hover:bg-surface-3/50"
              >
                <div className="text-sm text-tx-1">{item.studentName}</div>
                <div className="mt-1 text-[11px] text-tx-3">{formatTimeLabel(item.time)}</div>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </aside>
  );
};

const JobSlotCard = ({ job, lane, onOpenDetail, onCheck, onPick }) => {
  const isUnqualified = job.tier?.includes('Unqualified') || job.tier?.includes('未达标');
  return (
    <article className={cn(
      'relative overflow-hidden rounded-[28px] border p-5 shadow-[0_24px_36px_rgba(0,0,0,0.16)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_30px_48px_rgba(0,0,0,0.22)]',
      isUnqualified
        ? 'border-border bg-surface-2/60 opacity-70 grayscale-[0.45]'
        : cn('bg-surface-3/30', laneAccentClass(lane?.accent)),
      job.workspaceStatus === 'rejected' && 'grayscale-[0.3] opacity-75'
    )}>
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/[0.04] to-transparent" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={job.workspaceStatus} />
              {isUnqualified ? (
                <span className="rounded-full border border-border bg-surface-3/50 px-2 py-1 text-[10px] text-tx-4">
                  暂未达标
                </span>
              ) : (
                <span className="rounded-full border border-border-2 bg-surface-3/30 px-2 py-1 text-[10px] text-tx-2">
                  {lane?.tag}
                </span>
              )}
            </div>
            <h3 className="mt-3 text-lg font-semibold leading-tight text-tx-1">{job.title}</h3>
            <div className="mt-2 text-[12px] text-tx-2">
              {job.companyName || '公司信息待补充'} · {formatSalary(job.metadata?.salaryRange)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[28px] font-semibold tracking-[-0.04em] text-tx-1">{getMatchScore(job).toFixed(0)}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-tx-3">原始匹配</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2 rounded-[22px] border border-border bg-surface-2 p-3">
          <MiniStat label="岗位匹配" value={`${Math.round(getMatchScore(job))}`} />
          <MiniStat label="技术分" value={`${Math.round(job.score_tech || 0)}`} />
          <MiniStat label="精确覆盖" value={`${Math.round((job.exact_match_ratio || 0) * 100)}%`} />
          <MiniStat label="通用素质" value={`${Math.round(job.score_quality || 0)}`} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {job.previewTags.map((tag) => (
            <TagPill key={`${job.stableId}-${tag.text}`} tag={tag} />
          ))}
        </div>

        {job.check?.summary ? (
          <div className={cn(
            'mt-4 rounded-[18px] border px-4 py-3 text-[12px] leading-6',
            job.check.passed
              ? 'border-status-pass-border bg-status-pass-bg text-status-pass'
              : 'border-status-danger-border bg-status-danger-bg text-status-danger'
          )}>
            {job.check.summary}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="ghost" className="rounded-2xl px-4" onClick={() => onOpenDetail(job.stableId)}>
            <Eye size={14} />
            详情
          </Button>
          {job.workspaceStatus === 'pickable' || job.workspaceStatus === 'picked' ? (
            <Button variant="accent" className="rounded-2xl px-4" onClick={() => onPick(job.stableId)}>
              <ShoppingBasket size={14} />
              {job.workspaceStatus === 'picked' ? '已在篮子中' : 'Pick 采摘'}
            </Button>
          ) : job.workspaceStatus === 'rejected' ? (
            <Button variant="ghost" className="rounded-2xl px-4" onClick={() => onOpenDetail(job.stableId)}>
              <AlertCircle size={14} />
              查看差距
            </Button>
          ) : (
            <Button variant="blue" className="rounded-2xl px-4" onClick={() => onCheck(job.stableId)}>
              {job.workspaceStatus === 'checking' ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
              {job.workspaceStatus === 'checking' ? '核查中' : 'Check 核查'}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
};

const JobDetailDrawer = ({ job, onClose, onCheck, onPick, onSelectTarget }) => {
  if (!job) return null;
  const contribution = reportContribution(job);
  const rows = relativeTagRows(job);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/45 p-3 backdrop-blur-sm md:p-5">
      <div className="h-full w-full max-w-[720px] overflow-y-auto rounded-[32px] border border-border-2 bg-surface-2 shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface-2/95 px-6 py-5 backdrop-blur">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-tx-3">Slot Detail</div>
            <div className="mt-1 text-xl font-semibold text-tx-1">{job.title}</div>
            <div className="mt-1 text-[12px] text-tx-2">{job.companyName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border-2 bg-surface-3/30 p-2 text-tx-2 transition-all hover:bg-white/[0.06]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          <Panel className="overflow-hidden p-0">
            <div className="grid gap-4 p-5 md:grid-cols-[220px_minmax(0,1fr)]">
              {/* Left Column: Score Radar/Summary */}
              <div className="rounded-[24px] border border-border bg-surface-2 p-5">
                <div className="text-[42px] font-semibold tracking-[-0.05em] text-tx-1">{getMatchScore(job).toFixed(0)}</div>
                <div className="mt-1 text-[12px] text-tx-3">原始匹配分 / 100</div>
                <div className="mt-5 space-y-3">
                  <ProgressMetric label="岗位匹配" value={Math.round(getMatchScore(job))} compact />
                  <ProgressMetric label="技术分" value={Math.round(job.score_tech || 0)} compact />
                  <ProgressMetric label="通用素质" value={Math.round(job.score_quality || 0)} compact />
                </div>
              </div>

              <div className="flex flex-col justify-center">
                <div className="rounded-[24px] border border-border bg-surface-3/30 p-6">
                  <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-tx-3">
                    原始匹配贡献拆解
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {contribution.map((item) => (
                      <div key={item.label} className="rounded-[18px] border border-border bg-surface-2 px-3 py-3">
                        <div className="text-[11px] text-tx-3">{item.label}</div>
                        <div className="mt-1 text-lg font-semibold text-tx-1">+{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-[12px] font-medium text-tx-3 leading-relaxed">
                    采摘前只看 JD 与能力标签匹配；学生背景竞争力会在收割报告阶段单独计算。
                  </div>
                </div>
              </div>
            </div>

            {job.check && (
              <div className={cn(
                'mx-5 mb-5 rounded-[20px] border px-4 py-4 text-[12px] leading-6',
                job.check.passed
                  ? 'border-status-pass-border bg-status-pass-bg text-status-pass'
                  : 'border-status-danger-border bg-status-danger-bg text-status-danger'
              )}>
                <div className="font-semibold">{job.check.title}</div>
                <div className="mt-1">{job.check.tip}</div>
              </div>
            )}
          </Panel>



          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
                <Shield size={16} />
                Tag 对比视图
              </div>
              <div className="flex items-center gap-4 text-[11px] text-tx-4">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-status-pass" />
                  <span>精准 ≥90%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-status-warn" />
                  <span>近似 ≥84%</span>
                </div>
              </div>
            </div>

            {/* Algorithm Policy Help */}
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-border bg-surface-2 p-3 text-[11px]">
              {[
                { label: '技术栈', threshold: '90%', weight: '重要' },
                { label: '核心能力', threshold: '84%', weight: '核心' },
                { label: '开发工具', threshold: '90%', weight: '辅助' },
              ].map((policy) => (
                <div key={policy.label} className="text-center">
                  <div className="text-tx-3">{policy.label}</div>
                  <div className="mt-0.5 font-bold text-tx-1">阈值 {policy.threshold}</div>
                  <div className="text-[9px] text-teal">{policy.weight}权重</div>
                </div>
              ))}
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-border text-tx-3">
                    <th className="px-0 py-3 font-medium">Tag</th>
                    <th className="px-4 py-3 font-medium">分类</th>
                    <th className="px-4 py-3 font-medium">你的能力</th>
                    <th className="px-4 py-3 font-medium">匹配度</th>
                    <th className="px-4 py-3 font-medium text-right">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-0 py-5 text-tx-3">当前岗位暂无可展示的对标细项。</td>
                    </tr>
                  ) : rows.map((row) => (
                    <tr key={`${job.stableId}-${row.name}-${row.cat}`} className="border-b border-border last:border-none">
                      <td className="px-0 py-4">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-tx-1">
                            {row.name.includes(' -> ') ? row.name.split(' -> ').pop() : row.name}
                          </div>
                          {row.isOr && (
                            <span className="bg-blue-dim text-blue text-[9px] px-1.5 py-0.5 rounded-sm border border-blue-border/30 font-bold shrink-0">
                              多选一命中
                            </span>
                          )}
                        </div>
                        {row.name.includes(' -> ') && (
                          <div className="text-[10px] text-tx-4 mt-0.5">
                            来自：{row.name.split(' -> ')[0]}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn('font-mono text-[10px] uppercase', row.catColor)}>{row.cat}</span>
                      </td>
                      <td className="px-4 py-4 text-tx-2">{row.yours}</td>
                      <td className="px-4 py-4 font-mono text-tx-3">{row.accuracy}</td>
                      <td className="px-4 py-4 text-right">
                        <span className={cn(
                          'inline-block rounded-full px-2 py-0.5 text-[10px] font-bold',
                          row.type === 'pass'
                            ? 'bg-status-pass-bg text-status-pass'
                            : row.type === 'warn'
                              ? 'bg-status-warn-bg text-status-warn'
                              : 'bg-status-danger-bg text-status-danger'
                        )}>
                          {row.gap}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex flex-wrap gap-2">
              <Button variant="blue" className="rounded-2xl px-4" onClick={() => onCheck(job.stableId)}>
                <Search size={14} />
                Check 核查
              </Button>
              <Button
                variant="accent"
                className="rounded-2xl px-4"
                onClick={() => onPick(job.stableId)}
                disabled={!['pickable', 'picked', 'targeted', 'ranked'].includes(job.workspaceStatus)}
              >
                <ShoppingBasket size={14} />
                Pick 到篮子
              </Button>
              <Button
                variant="ghost"
                className="rounded-2xl px-4"
                onClick={() => onSelectTarget(job)}
                disabled={!['ranked', 'targeted', 'picked'].includes(job.workspaceStatus)}
              >
                <Target size={14} />
                锁定目标
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};

const StructuredInsightReport = ({ report, jobs = [] }) => {
  if (!report) return null;

  const starCount = (n) => {
    const filled = Math.max(1, Math.min(3, n));
    return (
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3].map((i) => (
          <Star
            key={i}
            size={13}
            className={i <= filled ? 'text-amber fill-amber' : 'text-border'}
            fill={i <= filled ? 'currentColor' : 'none'}
          />
        ))}
      </span>
    );
  };

  const jdStarEntries = Object.entries(report.jd_stars || {});

  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-border bg-[linear-gradient(90deg,rgba(96,165,250,0.16),transparent)] px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
          <Brain size={16} />
          深度分析报告（AI 结构化）
        </div>
        <div className="mt-1 text-[12px] text-tx-2">
          JD 星级由系统确定性计算（≥85分=3星 / 65-84=2星 / &lt;65=1星），面试建议与路径规划由 AI 生成。
        </div>
      </div>

      <div className="grid gap-5 px-5 py-5 xl:grid-cols-3">
        {/* JD 星级评估 */}
        {jdStarEntries.length > 0 && (
          <div className="xl:col-span-1 rounded-[24px] border border-border bg-surface-2 p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-tx-3 flex items-center gap-1.5">
              <Star size={12} />
              JD Split 星级
            </div>
            {jdStarEntries.map(([jobId, stars]) => {
              const job = jobs.find((j) => j.id === jobId || j.stableId === jobId);
              const displayTitle = job?.title || jobId;
              return (
                <div key={jobId} className="flex items-center justify-between rounded-[18px] border border-border bg-surface-3/30 px-3 py-2.5">
                  <span className="text-[12px] text-tx-1 truncate max-w-[140px]" title={displayTitle}>{displayTitle}</span>
                  {starCount(stars)}
                </div>
              );
            })}
          </div>
        )}

        {/* 面试建议 + 职业路径 */}
        <div className={cn('space-y-4', jdStarEntries.length > 0 ? 'xl:col-span-2' : 'xl:col-span-3')}>
          {/* STAR 法则面试建议 */}
          {report.interview_advice?.length > 0 && (
            <div className="rounded-[24px] border border-border bg-surface-2 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-tx-3 flex items-center gap-1.5 mb-3">
                <Bot size={12} />
                面试建议（STAR 法则）
              </div>
              <ol className="space-y-2 list-decimal list-inside">
                {report.interview_advice.map((advice, idx) => (
                  <li key={idx} className="text-[13px] leading-6 text-tx-2">
                    {advice}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* 入职成长路径 */}
            {report.tenure_growth && (
              <div className="rounded-[24px] border border-teal-border bg-teal-dim p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-teal flex items-center gap-1.5 mb-2">
                  <Sprout size={12} />
                  入职成长路径
                </div>
                <p className="text-[13px] leading-6 text-tx-2">{report.tenure_growth}</p>
              </div>
            )}

            {/* 职业发展方向 */}
            {report.future_path && (
              <div className="rounded-[24px] border border-violet-border bg-violet-dim p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-violet flex items-center gap-1.5 mb-2">
                  <ChevronRight size={12} />
                  职业发展方向
                </div>
                <p className="text-[13px] leading-6 text-tx-2">{report.future_path}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
};

const InsightReport = ({ job, onSelectTarget, onOpenDetail }) => {
  const contribution = reportContribution(job);
  const capabilityBreakdown = [
    { label: 'Engineering', value: Math.min(96, Math.round((job.score_tech_capability || 0) * 1.05 || 58)) },
    { label: 'Scene', value: Math.min(96, Math.round((job.score_quality || 0) * 0.9 || 52)) },
    { label: 'Principle', value: Math.min(96, Math.round((job.score_tech || 0) * 0.92 || 64)) },
  ];

  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-border px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.22em] text-tx-3">Insight Report</div>
        <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-tx-1">
          深度报告：{job.title}
        </h3>
        <div className="mt-2 text-[13px] text-tx-2">{job.companyName}</div>
      </div>

      <div className="space-y-5 px-6 py-6">
        <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
          <div className="rounded-[24px] border border-border bg-surface-2 p-5">
            <div className="text-[44px] font-semibold tracking-[-0.05em] text-tx-1">{Math.round(getReportScore(job))}</div>
            <div className="mt-1 text-[12px] text-tx-3">最终报告分</div>
            <div className="mt-5 space-y-3">
              {capabilityBreakdown.map((item) => (
                <ProgressMetric key={item.label} label={item.label} value={item.value} compact />
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <Panel className="p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
                <Bot size={16} />
                为什么适合你
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <ReasonCard title="技术栈高度相关" desc={(job.overflows || []).slice(0, 2).join('；') || '核心技术覆盖充分，能直接承接主要职责。'} />
                <ReasonCard title="需要注意的挑战" desc={(job.missings || []).slice(0, 2).join('；') || '暂无明显致命短板，可重点补强场景经验与工具链。'} />
              </div>
            </Panel>
            <Panel className="p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
                <TrendingUp size={16} />
                构成拆解 (Weight Based)
              </div>
              <div className="mt-4 space-y-3">
                {contribution.map((item) => (
                  <ProgressMetric key={item.label} label={item.label} value={item.value} compact />
                ))}
              </div>
            </Panel>
            
            {job.gold_assessment?.dimensions?.freshness?.level === '应届' && (
              <Panel className="bg-status-pass-bg border-status-pass-border p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold text-status-pass">
                  <Sparkles size={14} className="text-status-pass" />
                  应届身份价值
                </div>
                <div className="mt-2 text-[12px] leading-5 text-status-pass/70">
                  当前处于校招黄金期（毕业前12个月），享有校招渠道红利与专项人才培养计划优先级。
                </div>
              </Panel>
            )}
          </div>
        </div>

        <Panel className="p-5">
          <div className="flex items-center justify-between text-sm font-semibold text-tx-1">
            <div className="flex items-center gap-2">
              <Brain size={16} />
              背景竞争力与置信度
            </div>
            <div className="text-[11px] font-normal text-tx-3">
              Confidence Coefficient = <span className="font-bold text-status-pass">{getConfidenceCoefficient(job) ?? '—'}</span>
            </div>
          </div>
          
          <div className="mt-6 flex flex-col gap-6">
            {/* Education Breakdown */}
            <div>
              <div className="text-[11px] uppercase tracking-wider text-tx-3 mb-3">Academic Foundation (30%)</div>
              <div className="grid gap-3 md:grid-cols-4">
                {job.gold_assessment?.dimensions?.education?.breakdown && Object.entries(job.gold_assessment.dimensions.education.breakdown).map(([key, dim]) => (
                  <div key={`edu-${key}`} className="rounded-[20px] border border-border bg-surface-2 p-4">
                    <div className="text-[10px] uppercase text-tx-3">{key === 'institution' ? '院校层次' : key === 'degree' ? '学历层级' : key === 'major' ? '专业匹配' : '毕业新鲜度'}</div>
                    <div className="mt-2 text-sm font-bold text-tx-1">{dim.level}</div>
                    <div className="mt-1 text-[11px] text-teal">{dim.score}pt</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Experience Breakdown */}
            <div>
              <div className="text-[11px] uppercase tracking-wider text-tx-3 mb-3">Professional Experience (70%)</div>
              <div className="grid gap-3 md:grid-cols-3">
                {job.gold_assessment?.dimensions?.experience?.breakdown && Object.entries(job.gold_assessment.dimensions.experience.breakdown).map(([key, info]) => (
                  <div key={`exp-${key}`} className="rounded-[20px] border border-status-pass-border bg-status-pass-bg p-4">
                    <div className="flex items-center justify-between mb-2">
                       <div className="text-[10px] uppercase text-status-pass/80">{key} ({Math.round(info.weight * 100)}%)</div>
                       <div className="text-[10px] text-status-pass/60">{info.count}项</div>
                    </div>
                    <div className="text-sm font-bold text-tx-1">{info.score}pt</div>
                    <div className="mt-1 text-[11px] text-tx-3">分类子样评估</div>
                  </div>
                ))}
                {job.gold_assessment?.dimensions?.experience?.synergy_bonus > 0 && (
                   <div className="rounded-[20px] border border-status-info-border bg-status-info-bg p-4 flex flex-col justify-center">
                     <div className="text-[10px] uppercase text-status-info">成长协同加分</div>
                     <div className="mt-1 text-sm font-bold text-status-info">+{job.gold_assessment.dimensions.experience.synergy_bonus}pt</div>
                   </div>
                )}
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-tx-1">
            <Brain size={16} />
            Gap 全景图
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <GapList title="待补齐缺口" rows={(job.missings || []).slice(0, 4)} tone="danger" />
            <GapList title="可迁移优势" rows={(job.similars || []).slice(0, 4)} tone="warn" />
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" className="rounded-2xl px-5" onClick={() => onSelectTarget(job)}>
              <Target size={14} />
              选定此岗位为目标
            </Button>
            <Button variant="ghost" className="rounded-2xl px-4" onClick={() => onOpenDetail(job.stableId)}>
              <Eye size={14} />
              查看原始详情
            </Button>
          </div>
        </Panel>
      </div>
    </Panel>
  );
};

const Panel = ({ children, className }) => (
  <div className={cn('rounded-[32px] border border-border bg-surface shadow-sm transition-all duration-300', className)}>
    {children}
  </div>
);

const MetricChip = ({ label, value }) => (
  <div className="rounded-[18px] border border-border bg-surface-2 px-4 py-3">
    <div className="text-[10px] uppercase tracking-[0.18em] text-tx-3">{label}</div>
    <div className="mt-1 text-sm font-semibold text-tx-1">{value}</div>
  </div>
);

const InfoTile = ({ label, value }) => (
  <div className="rounded-[18px] border border-border bg-surface-2 px-4 py-3">
    <div className="text-[10px] uppercase tracking-[0.18em] text-tx-3">{label}</div>
    <div className="mt-1 text-sm text-tx-1">{value}</div>
  </div>
);

const MiniStat = ({ label, value }) => (
  <div>
    <div className="text-[10px] text-tx-3">{label}</div>
    <div className="mt-1 text-[13px] font-semibold text-tx-1">{value}</div>
  </div>
);

const ProgressMetric = ({ label, value, compact = false }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-[12px] text-tx-2">
      <span>{label}</span>
      <span>{value}%</span>
    </div>
    <div className={cn('overflow-hidden rounded-full bg-progress-track', compact ? 'h-2' : 'h-3')}>
      <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(74,222,128,0.95),rgba(96,165,250,0.85))]" style={{ width: progressWidth(value) }} />
    </div>
  </div>
);

const EmptyState = ({ icon, title, desc, children }) => {
  const IconComponent = icon;
  return (
  <Panel className="p-10 text-center">
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface-2 text-tx-2">
      <IconComponent size={28} />
    </div>
    <div className="mt-5 text-lg font-semibold text-tx-1">{title}</div>
    <div className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-tx-2">{desc}</div>
    {children}
  </Panel>
  );
};

const TagPill = ({ tag }) => {
  const style =
    tag.kind === 'plus'
      ? 'border-status-pass-border bg-status-pass-bg text-status-pass'
      : tag.kind === 'sim'
        ? 'border-status-warn-border bg-status-warn-bg text-status-warn'
        : 'border-status-danger-border bg-status-danger-bg text-status-danger';
  return (
    <span className={cn('rounded-full border px-2 py-1 text-[10px]', style)}>
      {tag.text}
    </span>
  );
};

const StatusPill = ({ status }) => {
  const token = statusToken(status);
  return (
    <span className={cn('rounded-full border px-2 py-1 text-[10px]', token.className)}>
      {token.label}
    </span>
  );
};

const ReasonCard = ({ title, desc }) => (
  <div className="rounded-[20px] border border-border bg-surface-2 px-4 py-4">
    <div className="text-sm font-semibold text-tx-1">{title}</div>
    <div className="mt-2 text-[12px] leading-6 text-tx-2">{desc}</div>
  </div>
);

const GapList = ({ title, rows, tone }) => (
  <div className="rounded-[20px] border border-border bg-surface-2 px-4 py-4">
    <div className="text-sm font-semibold text-tx-1">{title}</div>
    {rows.length === 0 ? (
      <div className="mt-3 text-[12px] text-tx-3">暂无可展示项</div>
    ) : (
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={`${title}-${row}`} className={cn(
            'rounded-[16px] border px-3 py-2 text-[12px]',
            tone === 'danger'
              ? 'border-status-danger-border bg-status-danger-bg text-status-danger'
              : 'border-status-warn-border bg-status-warn-bg text-status-warn'
          )}>
            {row}
          </div>
        ))}
      </div>
    )}
  </div>
);

export default MatchPage;
