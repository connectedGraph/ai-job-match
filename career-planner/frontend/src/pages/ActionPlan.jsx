import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpenCheck,
  BriefcaseBusiness,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  Leaf,
  Loader2,
  Medal,
  MessageSquareText,
  Sprout,
  Target,
  X,
  Zap,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import api from '../services/api';
import Button, { cn } from '../components/ui/Button';
import {
  GROWTH_POINT_RULES,
  formatSalary,
  getGrowthRank,
  normalizeActionPlan,
} from '../services/matchWorkspace';

const TABS = [
  { id: 'overview', label: '行动概览', icon: Target },
  { id: 'tasks', label: '子任务打卡', icon: BookOpenCheck },
  { id: 'checkins', label: '反馈记录', icon: MessageSquareText },
  { id: 'internships', label: '实习推荐', icon: BriefcaseBusiness },
];

const asArray = (value) => Array.isArray(value) ? value : [];
const compact = (value) => String(value || '').trim();
const todayText = () => new Date().toISOString().slice(0, 10);
const eventId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const normalizeToken = (value) => compact(value).toLowerCase().replace(/[^0-9a-z\u4e00-\u9fff]+/g, '');

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildHeatmap(records = [], days = 70) {
  const hoursByDate = new Map();
  records.forEach((record) => {
    const key = String(record.date || record.createdAt || '').slice(0, 10);
    if (key) hoursByDate.set(key, (hoursByDate.get(key) || 0) + (Number(record.hours) || 0));
  });
  const today = new Date(todayText());
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    const key = date.toISOString().slice(0, 10);
    const hours = hoursByDate.get(key) || 0;
    return { date: key, hours, level: hours >= 4 ? 4 : hours >= 2 ? 3 : hours > 0 ? 2 : 0 };
  });
}

function calcStreak(records = []) {
  const dates = new Set(records.map((record) => String(record.date || record.createdAt || '').slice(0, 10)).filter(Boolean));
  let streak = 0;
  const cursor = new Date(todayText());
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function buildCheckinsFromRecords(records = []) {
  return buildHeatmap(records, 30).map((row, index) => ({
    day: index,
    date: row.date,
    hours: row.hours,
  }));
}

function nextPlanWithPoints(plan, points, patch = {}) {
  const growth = Math.max(0, Number(plan.growth_points || plan.growth || 0) + points);
  const rank = getGrowthRank(growth);
  return normalizeActionPlan({
    ...plan,
    ...patch,
    growth_points: growth,
    growth,
    rankTitle: rank.title,
    rankDesc: rank.desc,
    updatedAt: new Date().toISOString(),
  });
}

function findTaskForGap(plan, gapName) {
  const gapToken = normalizeToken(gapName);
  if (!gapToken) return null;
  return asArray(plan?.tasks).find((task) => {
    const tokens = [task.title, task.tag, task.name, task.explanation].map(normalizeToken);
    return tokens.some((token) => token && (token.includes(gapToken) || gapToken.includes(token)));
  }) || null;
}

const EmptyState = () => (
  <div className="orchard-card mt-8 flex min-h-[52vh] flex-col items-center justify-center bg-white px-4 text-center">
    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-gray-100 bg-gray-50 text-gray-400">
      <Target size={32} />
    </div>
    <h3 className="mb-2 text-xl font-bold text-gray-800">行动计划尚未开启</h3>
    <p className="max-w-sm text-sm text-gray-500">
      先在「人岗匹配 - 收割记录」里锁定一个主攻目标，系统会基于岗位缺口生成子任务、打卡热力图和实习推荐。
    </p>
  </div>
);

const Heatmap = ({ records = [] }) => {
  const color = (level) => {
    if (level >= 4) return 'bg-emerald-600 border-emerald-600';
    if (level === 3) return 'bg-emerald-400 border-emerald-400';
    if (level === 2) return 'bg-emerald-200 border-emerald-200';
    return 'bg-slate-50 border-slate-100';
  };
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-900">学习热力图</h3>
          <p className="mt-1 text-[11px] text-slate-400">基于 checkin_records 聚合投入时长。</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-600">GitHub Style</span>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-1">
        {buildHeatmap(records).map((row) => (
          <div
            key={row.date}
            title={`${row.date}: ${row.hours}h`}
            className={cn('h-4 w-4 rounded-[4px] border transition hover:scale-125', color(row.level))}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-400">
        <span>Less</span>
        <span>Today</span>
      </div>
    </div>
  );
};

const InternshipDetailDrawer = ({ job, plan, onClose }) => {
  if (!job) return null;
  const recommendation = job.internshipRecommendation || {};
  const matchedGaps = asArray(recommendation.matchedGaps);
  const jdSplit = job.jdSplit || {};
  const requirements = asArray(jdSplit.jobRequirements);
  const bonusPoints = asArray(jdSplit.bonusPoints);
  const descriptions = asArray(jdSplit.jobDescriptions);
  const metadata = job.metadata || {};
  const skillRows = (matchedGaps.length ? matchedGaps : asArray(plan?.tasks).slice(0, 3)).map((gap, index) => {
    const gapName = gap.gap || gap.title || gap.name || gap.jdTag || '岗位缺口';
    const task = findTaskForGap(plan, gapName);
    return {
      key: `${gapName}-${index}`,
      name: gapName,
      jdTag: gap.jdTag || task?.tag || gapName,
      status: gap.status || 'Matched',
      currentLevel: Number(task?.currentLevel || gap.currentLevel || 0) || 0,
      targetLevel: Number(task?.targetLevel || gap.targetLevel || gap.jobLevel || 2) || 2,
      jobLevel: Number(gap.jobLevel || gap.targetLevel || task?.targetLevel || 2) || 2,
      categoryLabel: task?.categoryLabel || gap.tagType || '能力缺口',
      explanation: task?.explanation || '',
    };
  });

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[130] bg-slate-950/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        className="fixed inset-y-0 right-0 z-[131] flex w-full max-w-[900px] flex-col border-l border-slate-200 bg-[#f8faf7] shadow-[0_24px_90px_rgba(15,23,42,0.24)]"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-500">Internship Detail</div>
            <h2 className="mt-1 text-lg font-black text-slate-950">实习补强详情</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
            aria-label="关闭详情"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <section className="rounded-[30px] border border-emerald-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-600">{metadata.jobType || '实习'}</span>
                  <span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-black text-slate-500">ID {job.id || job.stableId || '--'}</span>
                  {job.direction && <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black text-blue-600">{job.direction}</span>}
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-950">{job.title || '未命名实习岗位'}</h1>
                <p className="mt-2 text-sm font-bold text-slate-500">{job.companyName || '未知公司'} · {formatSalary(metadata.salaryRange)}</p>
                <p className="mt-4 max-w-3xl rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                  {recommendation.reason || '这条实习与当前行动计划缺口存在匹配，可以作为补强项目来源。'}
                </p>
              </div>
              <div className="rounded-3xl bg-slate-950 px-6 py-5 text-center text-white">
                <div className="text-4xl font-black">{Math.round(recommendation.score || job.match_score || 0)}</div>
                <div className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/50">Gap Fit</div>
                <div className="mt-3 text-xs font-bold text-white/70">{skillRows.length} 个补强点</div>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-[30px] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-2">
              <Zap size={18} className="text-amber-500" />
              <h3 className="text-lg font-black text-slate-950">这段实习能补什么</h3>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {skillRows.map((skill) => (
                <article key={skill.key} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-500">{skill.categoryLabel}</div>
                      <h4 className="mt-1 text-base font-black text-slate-950">{skill.name}</h4>
                      <p className="mt-1 text-xs leading-5 text-slate-500">JD 命中：{skill.jdTag}</p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500">{skill.status}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-white px-2 py-3">
                      <div className="text-[9px] font-black uppercase text-slate-400">当前</div>
                      <div className="mt-1 text-lg font-black text-slate-700">Lv{skill.currentLevel}</div>
                    </div>
                    <div className="rounded-xl bg-emerald-500 px-2 py-3 text-white">
                      <div className="text-[9px] font-black uppercase text-white/70">实习后目标</div>
                      <div className="mt-1 text-lg font-black">Lv{Math.max(skill.targetLevel, skill.jobLevel)}</div>
                    </div>
                    <div className="rounded-xl bg-white px-2 py-3">
                      <div className="text-[9px] font-black uppercase text-slate-400">岗位要求</div>
                      <div className="mt-1 text-lg font-black text-slate-700">Lv{skill.jobLevel}</div>
                    </div>
                  </div>
                  <p className="mt-4 text-xs leading-5 text-slate-500">
                    {skill.explanation || `建议在这段实习里围绕「${skill.name}」沉淀项目截图、数据指标和复盘笔记，后续可回填到画像证据链。`}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-[30px] border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-black text-slate-950">补强路径建议</h3>
              <div className="mt-4 space-y-3">
                {skillRows.slice(0, 3).map((skill, index) => (
                  <div key={`${skill.key}-path`} className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs font-black text-slate-900">{index + 1}. 围绕 {skill.name} 做证据沉淀</div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      入职前补概念，实习中找真实任务切入，实习后整理为「背景-动作-结果」三段证据，目标是支撑画像从 Lv{skill.currentLevel} 推到 Lv{Math.max(skill.targetLevel, skill.jobLevel)}。
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[30px] border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-black text-slate-950">JD 原文证据</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">岗位职责</div>
                  <ul className="space-y-2">
                    {(descriptions.length ? descriptions : ['暂无岗位职责拆分']).slice(0, 4).map((item, index) => (
                      <li key={`desc-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">岗位要求 / 加分项</div>
                  <ul className="space-y-2">
                    {[...requirements, ...bonusPoints].slice(0, 8).map((item, index) => (
                      <li key={`req-${index}`} className="rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">{item}</li>
                    ))}
                    {!requirements.length && !bonusPoints.length && (
                      <li className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">暂无岗位要求拆分。</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
};

const ActionPlan = () => {
  const { studentData, matchWorkspace, saveWorkspace } = useData();
  const plan = useMemo(() => normalizeActionPlan(matchWorkspace.actionPlan), [matchWorkspace.actionPlan]);
  const [activeTab, setActiveTab] = useState('overview');
  const [checkinDate, setCheckinDate] = useState(todayText());
  const [checkinHours, setCheckinHours] = useState('1.5');
  const [checkinNote, setCheckinNote] = useState('');
  const [internshipLoading, setInternshipLoading] = useState(false);
  const [internshipError, setInternshipError] = useState('');
  const [detailJob, setDetailJob] = useState(null);

  const records = asArray(plan?.checkin_records);
  const totalHours = records.reduce((sum, record) => sum + (Number(record.hours) || 0), 0);
  const rank = getGrowthRank(plan?.growth_points || 0);

  const persistPlan = async (nextPlan) => {
    await saveWorkspace({ ...matchWorkspace, actionPlan: nextPlan }, true);
  };

  const handleSubTaskToggle = async (taskId, subTaskId) => {
    if (!plan) return;
    const now = new Date().toISOString();
    let delta = 0;
    const nextTasks = asArray(plan.tasks).map((task) => {
      if (task.id !== taskId) return task;
      const subTasks = asArray(task.sub_tasks).map((subTask) => {
        if (subTask.id !== subTaskId) return subTask;
        const wasDone = Boolean(subTask.checked || subTask.completedAt);
        delta = wasDone ? -(Number(subTask.points) || 0) : (Number(subTask.points) || 0);
        return { ...subTask, checked: !wasDone, completedAt: wasDone ? null : now };
      });
      const doneCount = subTasks.filter((item) => item.checked || item.completedAt).length;
      return { ...task, sub_tasks: subTasks, progress: subTasks.length ? Math.round((doneCount / subTasks.length) * 100) : 0 };
    });
    await persistPlan(nextPlanWithPoints(plan, delta, { tasks: nextTasks }));
  };

  const handleCheckinSubmit = async (event) => {
    event.preventDefault();
    if (!plan) return;
    const hours = Math.max(0.25, Number(checkinHours) || 0);
    const record = {
      id: eventId('checkin'),
      date: checkinDate || todayText(),
      hours,
      note: checkinNote.trim(),
      createdAt: new Date().toISOString(),
    };
    const nextRecords = [record, ...records];
    const nextPlan = nextPlanWithPoints(plan, GROWTH_POINT_RULES.checkin, {
      checkin_records: nextRecords,
      checkins: buildCheckinsFromRecords(nextRecords),
      streak: calcStreak(nextRecords),
    });
    setCheckinNote('');
    await persistPlan(nextPlan);
  };

  const handleGenerateInternships = async () => {
    if (!plan || internshipLoading) return;
    setInternshipLoading(true);
    setInternshipError('');
    try {
      const response = await api.post('/api/match/internship-recommendations', {
        student: studentData,
        gaps: plan.gaps || plan.tasks,
        top_k: 6,
      });
      await persistPlan(normalizeActionPlan({
        ...plan,
        internshipRecommendations: response.jobs || [],
        internshipRecommendationMeta: {
          source: response.source,
          totals: response.totals,
          gapProfile: response.gapProfile,
          timing: response.timing,
        },
        internshipRecommendedAt: new Date().toISOString(),
      }));
    } catch (error) {
      setInternshipError(error.message || '实习推荐生成失败');
    } finally {
      setInternshipLoading(false);
    }
  };

  if (!plan || !matchWorkspace.targetJobId) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <EmptyState />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-8">
      <section className="relative overflow-hidden rounded-[32px] border border-emerald-100 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(135deg,#ffffff,#f8fbf5)] p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">
              <Sprout size={14} />
              Action Orchard
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">投递行动柜</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              当前主攻：<span className="font-black text-slate-900">{plan.targetTitle}</span>
              {plan.targetCompany ? ` @ ${plan.targetCompany}` : ''}。每个缺口拆成子任务，完成任务和打卡都会沉淀成长值。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Progress', `${plan.totalProgress}%`, 'text-emerald-600'],
              ['Growth', plan.growth_points, 'text-slate-950'],
              ['Title', rank.title, 'text-amber-600'],
              ['Streak', plan.streak || 0, 'text-orange-500'],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-2xl border border-white bg-white/80 p-4 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
                <div className={cn('mt-1 text-2xl font-black', tone)}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-[24px] border border-slate-100 bg-white p-2 shadow-sm">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex min-w-max items-center gap-2 rounded-2xl px-4 py-3 text-xs font-black transition',
                activeTab === tab.id ? 'bg-slate-950 text-white shadow-lg shadow-slate-200' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
              )}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <section className="rounded-[28px] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">主攻目标与缺口</h2>
                <p className="mt-1 text-xs text-slate-400">这些缺口会同步用于实习岗位推荐。</p>
              </div>
              <span className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-black text-red-500">{plan.targetJobType || '目标岗位'}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {asArray(plan.tasks).map((task) => (
                <div key={task.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-900">{task.title}</div>
                      <div className="mt-1 text-[11px] text-slate-400">{task.categoryLabel} · {task.statusLabel || (task.severity === 'missing' ? '缺失' : '等级不足')}</div>
                    </div>
                    <span className="rounded-xl bg-white px-2 py-1 text-xs font-black text-emerald-600">{task.progress}%</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{task.explanation}</p>
                </div>
              ))}
            </div>
          </section>
          <div className="space-y-6">
            <Heatmap records={records} />
            <section className="rounded-[28px] border border-amber-100 bg-amber-50/50 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white">
                  <Medal size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-950">{rank.title}</h3>
                  <p className="text-xs leading-5 text-slate-500">{rank.desc}</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <section className="space-y-4">
          {asArray(plan.tasks).map((task) => (
            <article key={task.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500">{task.categoryLabel}</div>
                  <h2 className="mt-1 text-lg font-black text-slate-950">{task.title}</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{task.explanation}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
                  <div className="text-xl font-black text-slate-950">{task.progress}%</div>
                  <div className="text-[10px] font-bold text-slate-400">子任务进度</div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {asArray(task.sub_tasks).map((subTask) => {
                  const done = Boolean(subTask.checked || subTask.completedAt);
                  return (
                    <button
                      key={subTask.id}
                      type="button"
                      onClick={() => handleSubTaskToggle(task.id, subTask.id)}
                      className={cn(
                        'rounded-2xl border p-4 text-left transition hover:-translate-y-0.5',
                        done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50 hover:border-emerald-200 hover:bg-white',
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-black', subTask.pointType === 'project' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600')}>
                          {subTask.type} +{subTask.points}
                        </span>
                        <CheckCircle2 size={18} className={done ? 'text-emerald-500' : 'text-slate-300'} />
                      </div>
                      <div className="text-sm font-black text-slate-900">{subTask.title}</div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{subTask.detail}</p>
                      <div className="mt-3 flex items-center gap-1 text-[10px] font-bold text-slate-400">
                        <Clock size={12} />
                        预计 {subTask.estimatedHours}h
                      </div>
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      )}

      {activeTab === 'checkins' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <section className="rounded-[28px] border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">记录今日反馈</h2>
            <p className="mt-1 text-xs text-slate-400">每次打卡 +{GROWTH_POINT_RULES.checkin} Growth Points。</p>
            <form onSubmit={handleCheckinSubmit} className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-500">打卡日期</span>
                <input type="date" value={checkinDate} onChange={(event) => setCheckinDate(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-300 focus:bg-white" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">投入时长</span>
                <input type="number" min="0.25" step="0.25" value={checkinHours} onChange={(event) => setCheckinHours(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-300 focus:bg-white" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">心得 / 反馈</span>
                <textarea value={checkinNote} onChange={(event) => setCheckinNote(event.target.value)} rows={5} placeholder="今天补了什么？卡在哪里？下一次准备怎么推进？" className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-300 focus:bg-white" />
              </label>
              <Button type="submit" variant="accent" className="h-12 w-full justify-center rounded-2xl">
                <Flame size={16} />
                保存打卡反馈
              </Button>
            </form>
          </section>
          <section className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Records</div>
                <div className="mt-1 text-2xl font-black text-slate-950">{records.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hours</div>
                <div className="mt-1 text-2xl font-black text-slate-950">{totalHours.toFixed(1)}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active Days</div>
                <div className="mt-1 text-2xl font-black text-slate-950">{buildHeatmap(records).filter((row) => row.hours > 0).length}</div>
              </div>
            </div>
            <Heatmap records={records} />
            <div className="space-y-3">
              {records.length ? records.map((record) => (
                <article key={record.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-black text-slate-900">{record.date}</div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-600">{record.hours}h · +{GROWTH_POINT_RULES.checkin}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{record.note || '这次打卡暂未填写心得。'}</p>
                  <div className="mt-2 text-[10px] font-bold text-slate-300">{formatDateTime(record.createdAt)}</div>
                </article>
              )) : (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
                  还没有反馈记录。先保存一次打卡，热力图就会亮起来。
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'internships' && (
        <section className="space-y-5">
          <div className="flex flex-col gap-4 rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">缺口驱动实习岗位推荐</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                系统会把你当前不擅长或缺失的标签构造成 gap profile，只在实习岗位池里找最能补短板的岗位。
              </p>
              {plan.internshipRecommendedAt && <p className="mt-1 text-[10px] font-bold text-slate-400">上次生成：{formatDateTime(plan.internshipRecommendedAt)}</p>}
            </div>
            <Button type="button" variant="accent" className="h-11 rounded-2xl" onClick={handleGenerateInternships} disabled={internshipLoading}>
              {internshipLoading ? <Loader2 size={16} className="animate-spin" /> : <Leaf size={16} />}
              {internshipLoading ? '正在匹配实习岗位' : '生成实习推荐'}
            </Button>
          </div>
          {internshipError && <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{internshipError}</div>}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {asArray(plan.internshipRecommendations).length ? asArray(plan.internshipRecommendations).map((job) => {
              const recommendation = job.internshipRecommendation || {};
              const metadata = job.metadata || {};
              return (
                <article
                  key={job.id || job.stableId}
                  onClick={() => setDetailJob(job)}
                  className="cursor-pointer rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-500/5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-emerald-500">ID {job.id || job.stableId || '--'}</div>
                      <h3 className="text-lg font-black text-slate-950">{job.title || '未命名实习岗位'}</h3>
                      <p className="mt-1 text-sm font-bold text-slate-500">{job.companyName || '未知公司'}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold text-slate-400">
                        <span>{metadata.jobType || '实习'}</span>
                        <span>{job.direction || '不限方向'}</span>
                        <span>{formatSalary(metadata.salaryRange)}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-950 px-4 py-3 text-center text-white">
                      <div className="text-2xl font-black">{Math.round(recommendation.score || job.match_score || 0)}</div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-white/50">Gap Fit</div>
                    </div>
                  </div>
                  <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-700">{recommendation.reason || '这条实习与当前行动计划缺口存在匹配。'}</p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {asArray(recommendation.matchedGaps).slice(0, 4).map((gap, index) => (
                        <span key={`${gap.gap}-${index}`} className="rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-500">{gap.gap}</span>
                      ))}
                    </div>
                    <button type="button" onClick={(event) => { event.stopPropagation(); setDetailJob(job); }} className="shrink-0 rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-black text-white transition hover:bg-emerald-600">
                      看详情
                    </button>
                  </div>
                </article>
              );
            }) : (
              <div className="col-span-full rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
                还没有生成实习推荐。点击上方按钮后，会用行动计划缺口去匹配实习岗位池。
              </div>
            )}
          </div>
        </section>
      )}

      <InternshipDetailDrawer job={detailJob} plan={plan} onClose={() => setDetailJob(null)} />
    </motion.div>
  );
};

export default ActionPlan;
