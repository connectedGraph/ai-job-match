import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Bot, 
  PieChart, 
  UserRoundCheck, 
  BrainCircuit, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  Plus, 
  Trash2, 
  Zap, 
  Eye, 
  ShieldCheck,
  Lock,
  ArrowRight
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  applySkillcheckChanges,
  buildSkillTaskPayload,
  resolveSkillcheckResult,
} from '../utils/skillcheck';

const CAT_LABEL = {
  techStack: "技术栈",
  techCapability: "技术能力",
  techCapabilities: "技术能力",
  devTools: "开发工具",
};

const OP_META = {
  delete: {
    label: "建议删除",
    icon: Trash2,
    panel: "bg-red-50/50 border-red-100",
    badge: "bg-red-100 text-red-700 border-red-200",
  },
  add: {
    label: "建议补充",
    icon: Plus,
    panel: "bg-emerald-50/50 border-emerald-100",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
};

const TYPE_LABEL = {
  engineering: '工程能力',
  scene: '场景能力',
  principle: '原理能力',
};

const typeClass = (type) => {
  if (type === 'scene') return 'bg-blue-50 text-blue-600 border-blue-100';
  if (type === 'principle') return 'bg-emerald-50 text-emerald-600 border-emerald-100';
  return 'bg-amber-50 text-amber-600 border-amber-100';
};

const AI_TASKS = ['completeness', 'skillcheck', 'infer'];

const TASK_LABEL = {
  completeness: '画像完整度分析',
  skillcheck: '技能声明核查',
  infer: '掌握深度智能推断',
};

const GRADE_SCORE_BANDS = {
  S: [92, 98],
  A: [80, 86],
  B: [62, 70],
  C: [42, 52],
  D: [22, 34],
};

const clampScore = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const safeParse = (value, fallback = null) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const stableHash = (value) => {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

const reportFingerprint = (result = {}) => (
  result.completedAt
  || result.generatedAt
  || result.resolvedAt
  || result.appliedAt
  || String(stableHash(JSON.stringify(result || {})))
);

const reportTimestamp = (result = {}) => (
  result.completedAt
  || result.generatedAt
  || result.resolvedAt
  || result.appliedAt
  || null
);

const formatReportTime = (value) => {
  if (!value) return '未知时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const taskStorageKey = (userKey, taskType, kind) => `cp_ai_eval_${kind}_${userKey}_${taskType}`;

const readTaskEntry = (userKey, taskType, kind) => {
  if (!userKey || typeof localStorage === 'undefined') return null;
  return safeParse(localStorage.getItem(taskStorageKey(userKey, taskType, kind)));
};

const writeTaskEntry = (userKey, taskType, kind, entry) => {
  if (!userKey || typeof localStorage === 'undefined') return;
  localStorage.setItem(taskStorageKey(userKey, taskType, kind), JSON.stringify(entry));
};

const jitterDimensionScore = (dim = {}, seed = '') => {
  const grade = String(dim.grade || '').toUpperCase();
  const [minScore, maxScore] = GRADE_SCORE_BANDS[grade] || [
    Math.max(0, clampScore(dim.score) - 3),
    Math.min(100, clampScore(dim.score) + 3),
  ];
  const span = Math.max(1, maxScore - minScore + 1);
  return minScore + (stableHash(`${seed}:${dim.name}:${grade}`) % span);
};

const gradeToneClass = (grade) => {
  const value = String(grade || '').toUpperCase();
  if (value === 'S') return 'border-blue-100 bg-blue-50 text-blue-700';
  if (value === 'A') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (value === 'B') return 'border-amber-100 bg-amber-50 text-amber-700';
  if (value === 'C') return 'border-orange-100 bg-orange-50 text-orange-700';
  return 'border-red-100 bg-red-50 text-red-700';
};

const buildCompletenessDisplayResult = (result = {}, previousEntry = null) => {
  const sourceKey = reportFingerprint(result);
  const previousDims = new Map(
    (previousEntry?.displayResult?.dimensions || [])
      .map((dim) => [dim.name, dim])
      .filter(([name]) => name)
  );
  const dimensions = (result.dimensions || []).map((dim) => {
    const previousDim = previousDims.get(dim.name);
    const sameGrade = previousDim && String(previousDim.grade || '').toUpperCase() === String(dim.grade || '').toUpperCase();
    const displayScore = sameGrade && Number.isFinite(Number(previousDim.score))
      ? clampScore(previousDim.score)
      : jitterDimensionScore(dim, sourceKey);
    return {
      ...dim,
      score: displayScore,
      displayScore,
      rawScoreFromBackend: dim.score,
      previousGrade: previousDim?.grade || null,
      gradeChanged: Boolean(previousDim?.grade && String(previousDim.grade || '') !== String(dim.grade || '')),
    };
  });
  const totalScore = dimensions.length
    ? Math.round(dimensions.reduce((sum, item) => sum + clampScore(item.score), 0) / dimensions.length)
    : clampScore(result.totalScore);
  return {
    ...result,
    totalScore,
    dimensions,
    _display: {
      sourceKey,
      generatedAt: reportTimestamp(result) || new Date().toISOString(),
    },
  };
};

const summarizeCompletenessChange = (previousEntry, displayResult) => {
  if (!previousEntry?.displayResult) return '首次生成，已建立本地对照。';
  const previousDims = new Map((previousEntry.displayResult.dimensions || []).map((dim) => [dim.name, dim]));
  const changes = (displayResult.dimensions || [])
    .map((dim) => {
      const previous = previousDims.get(dim.name);
      if (!previous) return `${dim.label} 新增`;
      if (String(previous.grade || '') === String(dim.grade || '')) return null;
      return `${dim.label} ${previous.grade || '-'}→${dim.grade || '-'}`;
    })
    .filter(Boolean);
  if (!changes.length) return '评级稳定，展示分维持上次结果。';
  return `评级变化：${changes.slice(0, 3).join('，')}${changes.length > 3 ? '…' : ''}`;
};

const skillcheckMetrics = (result = {}) => {
  const changes = Array.isArray(result.changes) ? result.changes : [];
  return {
    total: changes.length,
    add: changes.filter((item) => item.op === 'add').length,
    delete: changes.filter((item) => item.op === 'delete').length,
  };
};

const inferMetrics = (result = {}) => {
  const inferences = Array.isArray(result.inferences) ? result.inferences : [];
  return {
    total: inferences.length,
    uncertain: inferences.filter((item) => item.inferredLevel == null).length,
    changed: inferences.filter((item) => Number.isFinite(Number(item.inferredLevel))).length,
  };
};

const summarizeMetricChange = (previousResult, currentResult, metricFn, labels) => {
  if (!previousResult) return '首次生成，已保存本地时间戳。';
  const before = metricFn(previousResult);
  const after = metricFn(currentResult);
  const parts = labels
    .map(([key, label]) => before[key] === after[key] ? null : `${label} ${before[key]}→${after[key]}`)
    .filter(Boolean);
  return parts.length ? parts.join('，') : '结构稳定，本次结果与上次基本一致。';
};

const displayCompletenessDimension = (dim = {}) => {
  if (dim.name !== 'preference') return dim;
  return {
    ...dim,
    label: '画像证据链',
    comment: '旧版“求职偏好”维度已废弃，请重新生成完整性评估以查看证据链结果。',
  };
};

const AiEval = () => {
  const { studentData, aiResults, saveData, profileAiTasks, updateProfileAiTask } = useData();
  const { user } = useAuth();
  const location = useLocation();
  const studentDataRef = useRef(studentData);
  const aiResultsRef = useRef(aiResults);
  const autoRunRef = useRef('');
  const userKey = String(user?.dbId || user?.id || 'guest');
  const [localTaskMeta, setLocalTaskMeta] = useState({});

  useEffect(() => {
    studentDataRef.current = studentData;
  }, [studentData]);

  useEffect(() => {
    aiResultsRef.current = aiResults;
  }, [aiResults]);

  useEffect(() => {
    const next = {};
    AI_TASKS.forEach((taskType) => {
      next[taskType] = {
        previous: readTaskEntry(userKey, taskType, 'previous'),
        current: readTaskEntry(userKey, taskType, 'current'),
      };
    });
    setLocalTaskMeta(next);
  }, [userKey]);

  const getCompletenessDisplay = useCallback((result, previousEntry = null) => {
    if (!result) return null;
    const currentEntry = readTaskEntry(userKey, 'completeness', 'current');
    if (currentEntry?.displayResult?._display?.sourceKey === reportFingerprint(result)) {
      return currentEntry.displayResult;
    }
    return buildCompletenessDisplayResult(result, previousEntry || readTaskEntry(userKey, 'completeness', 'previous'));
  }, [userKey]);

  const cacheCurrentReportAsPrevious = useCallback((taskType) => {
    const currentReport = aiResultsRef.current?.[taskType];
    if (!currentReport) return readTaskEntry(userKey, taskType, 'previous');
    const previousEntry = {
      taskType,
      generatedAt: reportTimestamp(currentReport) || new Date().toISOString(),
      cachedAt: new Date().toISOString(),
      report: currentReport,
      displayResult: taskType === 'completeness'
        ? getCompletenessDisplay(currentReport)
        : null,
    };
    writeTaskEntry(userKey, taskType, 'previous', previousEntry);
    setLocalTaskMeta((prev) => ({
      ...prev,
      [taskType]: {
        ...(prev[taskType] || {}),
        previous: previousEntry,
      },
    }));
    return previousEntry;
  }, [getCompletenessDisplay, userKey]);

  const beginAiTask = useCallback((taskType) => {
    const previous = cacheCurrentReportAsPrevious(taskType);
    updateProfileAiTask(taskType, {
      loading: true,
      error: null,
      previous,
      changeText: null,
      startedAt: new Date().toISOString(),
    });
    return previous;
  }, [cacheCurrentReportAsPrevious, updateProfileAiTask]);

  const finishAiTask = useCallback((taskType, result, previous, changeText, displayResult = null) => {
    const entry = {
      taskType,
      generatedAt: reportTimestamp(result) || new Date().toISOString(),
      report: result,
      displayResult,
      changeText,
    };
    writeTaskEntry(userKey, taskType, 'current', entry);
    setLocalTaskMeta((prev) => ({
      ...prev,
      [taskType]: {
        ...(prev[taskType] || {}),
        current: entry,
        previous,
        changeText,
      },
    }));
    updateProfileAiTask(taskType, {
      loading: false,
      error: null,
      previous,
      changeText,
      completedAt: entry.generatedAt,
    });
  }, [updateProfileAiTask, userKey]);

  const runCompleteness = useCallback(async () => {
    const previous = beginAiTask('completeness');
    try {
      const res = await api.post('/api/ai/profile/completeness', { studentProfile: studentDataRef.current });
      const completed = { ...res, completedAt: new Date().toISOString() };
      const displayResult = buildCompletenessDisplayResult(completed, previous);
      const changeText = summarizeCompletenessChange(previous, displayResult);
      const nextAiResults = { ...aiResultsRef.current, completeness: completed };
      aiResultsRef.current = nextAiResults;
      await saveData(studentDataRef.current, { aiResults: nextAiResults, syncServer: true });
      finishAiTask('completeness', completed, previous, changeText, displayResult);
    } catch (err) {
      updateProfileAiTask('completeness', { loading: false, error: err.message });
      throw err;
    }
  }, [beginAiTask, finishAiTask, saveData, updateProfileAiTask]);

  const runSkillcheck = useCallback(async () => {
    const previous = beginAiTask('skillcheck');
    try {
      const res = await api.post('/api/ai/profile/skillcheck', buildSkillTaskPayload(studentDataRef.current, aiResultsRef.current));
      const result = await resolveSkillcheckResult(api, res);
      const completed = { ...result, completedAt: new Date().toISOString() };
      const changeText = summarizeMetricChange(
        previous?.report,
        completed,
        skillcheckMetrics,
        [['total', '建议项'], ['add', '补充'], ['delete', '删除']]
      );
      const nextAiResults = {
        ...aiResultsRef.current,
        skillcheck: completed,
      };
      aiResultsRef.current = nextAiResults;
      await saveData(studentDataRef.current, { aiResults: nextAiResults, syncServer: true });
      finishAiTask('skillcheck', completed, previous, changeText);
    } catch (err) {
      updateProfileAiTask('skillcheck', { loading: false, error: err.message });
      throw err;
    }
  }, [beginAiTask, finishAiTask, saveData, updateProfileAiTask]);

  const runInfer = useCallback(async () => {
    const previous = beginAiTask('infer');
    try {
      const res = await api.post('/api/ai/profile/infer-levels', buildSkillTaskPayload(studentDataRef.current, aiResultsRef.current));
      const completed = { ...res, completedAt: new Date().toISOString() };
      const changeText = summarizeMetricChange(
        previous?.report,
        completed,
        inferMetrics,
        [['total', '推断项'], ['changed', '有效等级'], ['uncertain', '证据不足']]
      );
      const nextAiResults = { ...aiResultsRef.current, infer: completed };
      aiResultsRef.current = nextAiResults;
      await saveData(studentDataRef.current, { aiResults: nextAiResults, syncServer: true });
      finishAiTask('infer', completed, previous, changeText);
    } catch (err) {
      updateProfileAiTask('infer', { loading: false, error: err.message });
      throw err;
    }
  }, [beginAiTask, finishAiTask, saveData, updateProfileAiTask]);

  const inferLocked = !aiResults?.skillcheck?.completedAt;
  const completenessTask = profileAiTasks.completeness || {};
  const skillcheckTask = profileAiTasks.skillcheck || {};
  const inferTask = profileAiTasks.infer || {};
  const completenessDisplay = aiResults?.completeness
    ? getCompletenessDisplay(aiResults.completeness, completenessTask.previous || localTaskMeta.completeness?.previous)
    : null;

  useEffect(() => {
    const autoRunKey = String(location.state?.autorunAt || '');
    if (!autoRunKey || autoRunRef.current === autoRunKey) return;

    autoRunRef.current = autoRunKey;
    let cancelled = false;

    const runAutoFlow = async () => {
      const results = await Promise.allSettled([
        runCompleteness(),
        runSkillcheck(),
      ]);

      if (cancelled) return;

      const firstError = results.find((result) => result.status === 'rejected');
      if (firstError?.reason) {
        console.error('Auto AI eval flow failed:', firstError.reason);
      }
    };

    runAutoFlow();

    return () => {
      cancelled = true;
    };
  }, [location.state, runCompleteness, runSkillcheck]);

  return (
    <div className="py-8 px-4 md:px-8 max-w-6xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
          <Bot size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">AI 画像智能评估</h2>
          <p className="text-sm text-gray-500 mt-1 font-medium">画像完整度评分、技能核实与掌握深度推断三阶段流程</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Step 0: Completeness */}
        <EvalCard 
          title="画像完整度分析"
          desc="基于规则与 LLM 的画像质量评估，生成评分报告。建议补充关键维度缺失内容。"
          icon={PieChart}
          onRun={runCompleteness}
          loading={completenessTask.loading}
          error={completenessTask.error}
          active={!!aiResults?.completeness}
          buttonText="生成完整性评估"
          previousReport={completenessTask.previous || localTaskMeta.completeness?.previous}
          changeText={completenessTask.changeText || localTaskMeta.completeness?.changeText || localTaskMeta.completeness?.current?.changeText}
        >
          {completenessDisplay && <CompletenessView result={completenessDisplay} />}
        </EvalCard>

        {/* Step 1: Skill Check */}
        <EvalCard 
          title="技能声明核查"
          desc="AI 会分析你的经历，核查技能列表的真实性与遗漏项。第一阶段：校正技能库。"
          icon={UserRoundCheck}
          onRun={runSkillcheck}
          loading={skillcheckTask.loading}
          error={skillcheckTask.error}
          active={!!aiResults?.skillcheck}
          buttonText="Step 1：开始技能核查"
          previousReport={skillcheckTask.previous || localTaskMeta.skillcheck?.previous}
          changeText={skillcheckTask.changeText || localTaskMeta.skillcheck?.changeText || localTaskMeta.skillcheck?.current?.changeText}
        >
          {aiResults?.skillcheck && (
            <SkillcheckView
              studentData={studentData}
              aiResults={aiResults}
              result={aiResults.skillcheck}
              saveData={saveData}
            />
          )}
        </EvalCard>

        {/* Step 2: Level Infer */}
        <EvalCard 
          title="掌握深度智能推断"
          desc="基于具体经历项目反向推断技能成熟度。第二阶段：对齐技能等级。"
          icon={BrainCircuit}
          onRun={runInfer}
          loading={inferTask.loading}
          error={inferTask.error}
          active={!!aiResults?.infer}
          disabled={inferLocked}
          buttonText={inferLocked ? "请先完成 Step 1" : "Step 2：推断技能等级"}
          previousReport={inferTask.previous || localTaskMeta.infer?.previous}
          changeText={inferTask.changeText || localTaskMeta.infer?.changeText || localTaskMeta.infer?.current?.changeText}
        >
          {inferLocked ? (
            <div className="mt-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100 flex items-center gap-3 text-amber-800 text-xs font-bold animate-pulse">
              <Lock size={14} /> 请先运行并确认「技能声明核查」，确认技能库后再进行等级推断。
            </div>
          ) : (
             aiResults?.infer && (
               <InferView
                 studentData={studentData}
                 aiResults={aiResults}
                 result={aiResults.infer}
                 saveData={saveData}
               />
             )
          )}
        </EvalCard>
      </div>
    </div>
  );
};

// --- Sub-Components ---

const GeneratingNotice = ({ title, previousReport }) => (
  <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50/70 px-5 py-4">
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-xl bg-white p-2 text-amber-600 shadow-sm">
        <Loader2 size={18} className="animate-spin" />
      </div>
      <div>
        <div className="text-sm font-black text-amber-900">正在重新生成「{title}」</div>
        <p className="mt-1 text-xs font-medium leading-5 text-amber-700">
          已隐藏上一次生成结果，避免新旧报告同时出现造成误读。完成后会自动展示新结果。
        </p>
        <p className="mt-2 text-[11px] font-bold text-amber-600/80">
          {previousReport?.generatedAt
            ? `本地已保留上次报告：${formatReportTime(previousReport.generatedAt)}，本次完成后会显示变化摘要。`
            : '这是首次生成，完成后会建立本地时间戳对照。'}
        </p>
      </div>
    </div>
  </div>
);

const EvalCard = ({ title, desc, icon: Icon, onRun, loading, error, active, disabled, buttonText, previousReport, changeText, children }) => {
  const helperText = loading
    ? '生成中：旧报告已隐藏，稍后展示最新结果。'
    : changeText
      ? `较上次：${changeText}`
      : desc;

  return (
    <div className={`bg-white rounded-2xl border ${active ? 'border-blue-200' : 'border-gray-100 shadow-sm'} p-6 transition-all`}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div className="flex gap-3 items-center">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? 'bg-primary text-white shadow-md shadow-blue-100' : 'bg-gray-50 text-gray-400 border border-gray-100'}`}>
            <Icon size={20} />
          </div>
          <div>
            <h3 className="text-lg font-black text-gray-800 tracking-tight">{title}</h3>
            <p className={`text-xs mt-1 font-medium ${loading ? 'text-amber-600' : changeText ? 'text-blue-500' : 'text-gray-400'}`}>
              {helperText}
            </p>
          </div>
        </div>
        <button 
          onClick={onRun}
          disabled={loading || disabled}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg ${
            loading || disabled 
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' 
            : 'bg-gray-900 text-white hover:bg-black active:scale-[0.98]'
          }`}
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Icon size={16} />}
          {loading ? '处理中...' : buttonText}
        </button>
      </div>
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-xs font-bold">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {loading ? (
        <GeneratingNotice title={title} previousReport={previousReport} />
      ) : (
        children && <div className="mt-6 border-t border-gray-50 pt-6">{children}</div>
      )}
    </div>
  );
};

const CompletenessView = ({ result }) => {
  const navigate = useNavigate();
  const getScoreColor = (s) => s >= 80 ? 'text-emerald-500' : s >= 60 ? 'text-orange-500' : 'text-red-500';
  const getProgressColor = (s) => s >= 80 ? 'bg-emerald-500' : s >= 60 ? 'bg-orange-500' : 'bg-red-500';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row gap-8 items-center bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
        {/* Circular Score */}
        <div className="relative w-32 h-32 flex-shrink-0">
          <svg className="w-full h-full transform -rotate-90">
             <circle cx="64" cy="64" r="58" stroke="#f3f4f6" strokeWidth="10" fill="none" />
             <circle 
              cx="64" cy="64" r="58" 
              stroke="currentColor" strokeWidth="10" fill="none" 
              strokeDasharray={2 * Math.PI * 58} 
              strokeDashoffset={2 * Math.PI * 58 * (1 - result.totalScore / 100)}
              className={`${getScoreColor(result.totalScore)} transition-all duration-1000 ease-out`}
              strokeLinecap="round"
             />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-black text-gray-800">{result.totalScore}</span>
            <span className="text-[10px] font-black text-gray-400 tracking-[0.2em] transform translate-y-[-2px]">SCORE</span>
          </div>
        </div>

        {/* Dimension Grid */}
        <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          {result.dimensions?.map((rawDim, i) => {
            const dim = displayCompletenessDimension(rawDim);
            return (
            <div key={i} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[11px] font-bold text-gray-700">{dim.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${dim.score < 60 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {dim.score} 分
                  </span>
                  <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-black ${gradeToneClass(dim.grade)}`}>
                    {dim.grade || '-'}
                  </span>
                  {dim.gradeChanged && (
                    <span className="inline-flex items-center rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-700">
                      {dim.previousGrade || '-'}→{dim.grade || '-'}
                    </span>
                  )}
                </div>
              </div>
              <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${dim.score}%` }}
                  className={`h-full ${getProgressColor(dim.score)}`}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-2 leading-tight">{dim.comment}</p>
            </div>
            );
          })}
        </div>
      </div>

      <div className="bg-primary p-4 rounded-xl text-white shadow-lg shadow-blue-100 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3 items-start">
          <Zap size={20} className="flex-shrink-0 mt-0.5 animate-pulse" />
          <div>
            <span className="text-xs font-black uppercase tracking-widest opacity-70 block mb-1">最优先补充建议</span>
            <p className="text-sm font-bold leading-relaxed">{result.topSuggestion || "画像基本完整，请继续保持。"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-primary shadow-lg shadow-blue-950/10 transition-all hover:bg-blue-50 active:scale-[0.98]"
        >
          去完善
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};

const SkillcheckView = ({ studentData, aiResults, result, saveData }) => {
  const pending = (result.changes || [])
    .map((item, originalIndex) => ({ ...item, originalIndex }))
    .filter((item) => !item._applied);
  const pendingKey = pending
    .map((item) => [item.originalIndex, item.op, item.category, item.name, item.originalName, item.type].join(':'))
    .concat(result.resolvedAt || result.completedAt || '')
    .join('|');
  const pendingCount = pending.length;
  const [selected, setSelected] = useState({});
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');

  useEffect(() => {
    const next = {};
    for (let idx = 0; idx < pendingCount; idx += 1) {
      next[idx] = true;
    }
    setSelected(next);
    setApplyError('');
  }, [pendingKey, pendingCount]);

  const selectedCount = pending.filter((_, idx) => selected[idx]).length;
  const allSelected = pending.length > 0 && selectedCount === pending.length;

  const toggleAll = () => {
    const next = {};
    pending.forEach((_, idx) => {
      next[idx] = !allSelected;
    });
    setSelected(next);
  };

  const applySelected = async () => {
    const indices = pending.map((_, idx) => idx).filter((idx) => selected[idx]);
    if (!indices.length) return;
    setApplying(true);
    setApplyError('');
    try {
      const next = applySkillcheckChanges({ studentData, aiResults, indices });
      if (next.applied > 0) {
        await saveData(next.studentData, { aiResults: next.aiResults, syncServer: true });
      }
    } catch (error) {
      setApplyError(error.message || '应用技能建议失败');
    } finally {
      setApplying(false);
    }
  };

  if (pending.length === 0) {
    return (
      <div className="py-12 flex flex-col items-center gap-3 bg-emerald-50/50 rounded-2xl border border-emerald-100">
        <CheckCircle2 size={40} className="text-emerald-500" />
        <p className="font-black text-emerald-700 text-sm">当前没有待处理的技能变更建议</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div className="text-xs font-bold text-gray-500 flex items-center gap-2">
          <Info size={14} className="text-primary" /> 请勾选你认可的变更并应用
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs bg-white text-gray-500 font-black px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 transition-all"
          >
            {allSelected ? '取消全选' : '全选'}
          </button>
          <button
            type="button"
            onClick={applySelected}
            disabled={applying || selectedCount === 0}
            className={`text-xs font-black px-4 py-2 rounded-lg shadow-md transition-all flex items-center gap-1.5 ${
              applying || selectedCount === 0
                ? 'bg-gray-100 text-gray-400 shadow-none cursor-not-allowed'
                : 'bg-primary text-white hover:bg-blue-700'
            }`}
          >
            {applying ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            应用选中建议
          </button>
        </div>
      </div>

      {applyError && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-xs font-bold">
          <AlertCircle size={14} /> {applyError}
        </div>
      )}

      <div className="space-y-3">
        {pending.map((item, idx) => {
          const meta = OP_META[item.op] || OP_META.add;
          const Icon = meta.icon;
          const originalDiff = item.originalName && item.originalName !== item.name;
          const matchScore = Number(item.match?.rankScore ?? item.match?.similarity);
          const matchText = item.op === 'add'
            ? item.match?.matched
              ? `Tag Center${Number.isFinite(matchScore) ? ` ${Math.round(matchScore * 100)}%` : ''}`
              : '未命中，按原名添加'
            : '';
          return (
            <label key={item.originalIndex} className={`group flex items-start gap-4 p-4 rounded-2xl border ${meta.panel} cursor-pointer hover:shadow-md transition-all active:scale-[0.99]`}>
              <input
                type="checkbox"
                checked={!!selected[idx]}
                onChange={() => setSelected((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                className="mt-1 w-5 h-5 rounded-lg accent-primary border-gray-200"
              />
              <div className="flex-grow min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${meta.badge}`}>
                    <Icon size={10} /> {meta.label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-gray-800 truncate">{item.name}</p>
                    {originalDiff && (
                      <p className="text-[10px] text-gray-400 font-medium mt-0.5">原始: {item.originalName}</p>
                    )}
                  </div>
                  <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-gray-100 text-gray-400 font-bold uppercase tracking-wider">
                    {CAT_LABEL[item.category] || item.category}
                  </span>
                  {item.category === 'techCapability' && item.type && (
                    <span className={`text-[10px] px-2 py-0.5 rounded border font-black ${typeClass(item.type)}`}>
                      {TYPE_LABEL[item.type] || item.type}
                    </span>
                  )}
                  {item.op === 'add' && (
                    <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-gray-100 text-gray-500 font-bold">
                      L{item.levelRequired || 1}
                    </span>
                  )}
                  {matchText && (
                    <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${
                      item.match?.matched
                        ? 'bg-blue-50 text-blue-600 border-blue-100'
                        : 'bg-gray-50 text-gray-400 border-gray-100'
                    }`}>
                      {matchText}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">{item.reasoning}</p>
                {item.inference && item.inference !== item.reasoning && (
                  <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">{item.inference}</p>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
};

const normalizeSkillToken = (value) => String(value || '').trim().toLowerCase();

const inferCategoryKey = (category) => {
  if (category === 'techCapabilities') return 'techCapability';
  return category || 'techCapability';
};

const isValidLevel = (value) => {
  const level = Number(value);
  return Number.isFinite(level) && level >= 1 && level <= 4;
};

const getStudentSkill = (studentData, item) => {
  const category = inferCategoryKey(item.category);
  const skillName = normalizeSkillToken(item.skillName);
  return studentData[category]?.find((skill) => (
    normalizeSkillToken(skill.name || skill.skill || skill.normalizedTag) === skillName
  ));
};

const applyInferChanges = ({ studentData, aiResults, result, indices }) => {
  const nextStudentData = { ...studentData };
  const sourceInferences = Array.isArray(result?.inferences) ? result.inferences : [];
  const targetIndices = new Set(indices);
  let applied = 0;

  const nextInferences = sourceInferences.map((item, idx) => {
    if (!targetIndices.has(idx) || !isValidLevel(item.inferredLevel)) return item;

    const category = inferCategoryKey(item.category);
    const skillName = normalizeSkillToken(item.skillName);
    const list = Array.isArray(nextStudentData[category]) ? [...nextStudentData[category]] : [];
    const skillIndex = list.findIndex((skill) => (
      normalizeSkillToken(skill.name || skill.skill || skill.normalizedTag) === skillName
    ));

    if (skillIndex < 0) return item;

    const nextLevel = Math.max(1, Math.min(4, Math.round(Number(item.inferredLevel))));
    list[skillIndex] = {
      ...list[skillIndex],
      levelRequired: nextLevel,
    };
    nextStudentData[category] = list;
    if (category === 'techCapability') {
      nextStudentData.techCapabilities = list.map((skill) => ({ ...skill }));
    }
    applied += 1;
    return {
      ...item,
      _applied: true,
      appliedLevel: nextLevel,
      appliedAt: new Date().toISOString(),
    };
  });

  return {
    applied,
    studentData: nextStudentData,
    aiResults: {
      ...aiResults,
      infer: {
        ...result,
        inferences: nextInferences,
        appliedAt: applied > 0 ? new Date().toISOString() : result?.appliedAt,
      },
    },
  };
};

const InferView = ({ studentData, aiResults, result, saveData }) => {
  const [expanded, setExpanded] = useState({});
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  const inferences = Array.isArray(result?.inferences) ? result.inferences : [];
  const actionableIndices = inferences
    .map((item, idx) => {
      const currentLevel = getStudentSkill(studentData, item)?.levelRequired || 1;
      const inferredLevel = Number(item.inferredLevel);
      const appliedLevel = Number(item.appliedLevel || item.inferredLevel);
      const alreadyApplied = Boolean(item._applied) && appliedLevel === Number(currentLevel);
      const canApply = isValidLevel(inferredLevel) && inferredLevel !== Number(currentLevel) && !alreadyApplied;
      return canApply ? idx : null;
    })
    .filter((idx) => idx !== null);

  const applyIndices = async (indices) => {
    if (!indices.length || applying) return;
    setApplying(true);
    setApplyError('');
    try {
      const next = applyInferChanges({ studentData, aiResults, result, indices });
      if (next.applied > 0) {
        await saveData(next.studentData, { aiResults: next.aiResults, syncServer: true });
      }
    } catch (error) {
      setApplyError(error.message || '应用推断等级失败，请稍后重试');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 animate-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-slate-900">掌握深度推断结果</div>
          <div className="mt-1 text-xs font-medium text-slate-500">
            可应用 {actionableIndices.length} 条等级调整，应用后会写回技能画像并同步保存。
          </div>
        </div>
        <button
          type="button"
          onClick={() => applyIndices(actionableIndices)}
          disabled={applying || actionableIndices.length === 0}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-black shadow-md transition-all ${
            applying || actionableIndices.length === 0
              ? 'bg-gray-100 text-gray-400 shadow-none cursor-not-allowed'
              : 'bg-primary text-white hover:bg-blue-700'
          }`}
        >
          {applying ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          一键应用全部
        </button>
      </div>

      {applyError && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-bold text-red-600">
          {applyError}
        </div>
      )}

      {inferences.map((item, idx) => {
         const currentSkill = getStudentSkill(studentData, item);
         const currentLevel = currentSkill?.levelRequired || 1;
         const inferredLevel = Number(item.inferredLevel);
         const appliedLevel = Number(item.appliedLevel || item.inferredLevel);
         const isLevelDiff = isValidLevel(inferredLevel) && inferredLevel !== Number(currentLevel);
         const isApplied = Boolean(item._applied) && appliedLevel === Number(currentLevel);
         const status = item.inferredLevel == null ? '证据不足' : (item.inferredLevel > currentLevel ? '建议提升' : (item.inferredLevel < currentLevel ? '建议下调' : '一致'));
         const statusCls = status === '建议提升' ? 'bg-orange-50 text-orange-600' : status === '建议下调' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500';

         return (
           <div key={idx} className={`bg-white rounded-2xl border ${isLevelDiff ? 'border-primary/20 shadow-sm' : 'border-gray-100'} p-4 transition-all`}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-6 flex-grow min-w-0">
                  <div className="w-28 flex-shrink-0">
                    <p className="text-sm font-black text-gray-800 truncate">{item.skillName}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-tight">{CAT_LABEL[item.category] || item.category}</p>
                  </div>

                  <div className="flex flex-col gap-1.5 flex-grow max-w-[120px]">
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black text-gray-400 w-8 text-right uppercase">OLD</span>
                      <LevelDots value={currentLevel} activeCls="bg-gray-300" />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black text-primary w-8 text-right uppercase tracking-widest">AIM</span>
                      <LevelDots value={item.inferredLevel || 0} activeCls="bg-primary shadow-[0_0_8px_rgba(37,99,235,0.3)]" />
                    </div>
                  </div>

                  <div className={`text-[10px] font-black px-2.5 py-1 rounded-lg border border-transparent ${statusCls}`}>
                    {status}
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                   <button 
                    onClick={() => toggle(idx)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-100 text-[11px] font-bold text-gray-500 hover:bg-gray-50 active:scale-95 transition-all"
                   >
                     <Eye size={14} /> 理由
                   </button>
                   {isLevelDiff && !isApplied && (
                     <button
                       type="button"
                       onClick={() => applyIndices([idx])}
                       disabled={applying}
                       className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-black shadow-md transition-all animate-in zoom-in-95 ${
                         applying
                           ? 'bg-gray-100 text-gray-400 shadow-none cursor-not-allowed'
                           : 'bg-primary text-white shadow-blue-100 hover:bg-blue-700 active:scale-95'
                       }`}
                     >
                       {applying ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                       应用
                     </button>
                   )}
                   {isApplied && (
                     <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[11px] font-black text-emerald-600">
                       <CheckCircle2 size={13} />
                       已应用
                     </span>
                   )}
                </div>
              </div>

              <AnimatePresence>
                {expanded[idx] && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 p-4 rounded-xl bg-blue-50/50 border border-blue-100 text-[11px] leading-relaxed text-gray-600">
                      <p className="font-bold text-gray-800 mb-1 flex items-center gap-1.5"><ShieldCheck size={12} className="text-primary" /> 推断依据</p>
                      <p className="mb-3">{item.reasoning}</p>
                      <div className="flex items-center gap-2 text-gray-400 border-t border-blue-100/50 pt-2">
                         <span className="uppercase font-black tracking-tighter text-[9px]">Sources :</span>
                         {(item.sourceExperienceIds || []).map((id, i) => (
                           <span key={i} className="bg-white px-1.5 py-0.5 rounded border border-blue-50 text-primary font-mono">#{id}</span>
                         ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
           </div>
         );
      })}
    </div>
  );
};

const LevelDots = ({ value, activeCls }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4].map(v => (
      <div 
        key={v}
        className={`w-2.5 h-2.5 rounded-sm transition-all duration-300 ${value >= v ? activeCls : 'bg-gray-100'}`}
      />
    ))}
  </div>
);

export default AiEval;
