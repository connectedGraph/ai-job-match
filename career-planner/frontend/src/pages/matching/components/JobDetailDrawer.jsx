import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import Button, { cn } from '../../../components/ui/Button';
import api from '../../../services/api';
import {
  buildMatchContributionRows,
  buildSoftGapRows,
  buildTechnicalBuckets,
  formatSalary,
  getLaneDisplayMeta,
  getMatchScore,
} from '../../../services/matchWorkspace';

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function compact(value) {
  return String(value || '').trim();
}

const TAG_CENTER_RESOLVE_CACHE = new Map();

function hasChineseText(value) {
  return /[\u4e00-\u9fff]/.test(compact(value));
}

function resolveCacheKey(query = {}) {
  const tagType = compact(query.tagType || 'techCapabilities');
  const tagId = compact(query.tagId);
  const value = compact(query.value).toLowerCase();
  if (!tagId && !value) return '';
  return `${tagType}::${tagId}::${value}`;
}

function shouldResolveTag(query = {}, fallbackLabel = '') {
  if (!compact(query?.tagId) && !compact(query?.value)) return false;
  if (compact(query?.tagId)) return true;
  return !hasChineseText(fallbackLabel);
}

async function resolveTagCenterLabel(query = {}) {
  const key = resolveCacheKey(query);
  if (!key) return null;
  if (TAG_CENTER_RESOLVE_CACHE.has(key)) {
    return await TAG_CENTER_RESOLVE_CACHE.get(key);
  }
  const task = api.get('/api/student-profile/tag-center/resolve', {
    params: {
      tag_id: compact(query.tagId),
      value: compact(query.value),
      tag_type: compact(query.tagType || 'techCapabilities'),
    },
  })
    .then((result) => result?.matched ? result.tag : null)
    .catch(() => null);
  TAG_CENTER_RESOLVE_CACHE.set(key, task);
  return await task;
}

function formatLevel(value) {
  const numeric = Number(value || 0);
  if (!numeric) return '--';
  return `Lv${numeric}`;
}

function formatScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return Math.round(Math.max(0, Math.min(100, numeric)));
}

function formatPercent(value) {
  const numeric = Number(value || 0);
  return `${Math.round(Math.max(0, Math.min(1, numeric)) * 100)}%`;
}

function getJobDisplayId(job = {}) {
  return String(job.id ?? job.jobId ?? job.job_id ?? job.stableId ?? 'unknown');
}

function getJobType(job = {}) {
  return compact(job.metadata?.jobType ?? job.metadata?.job_type ?? job.jobType ?? job.job_type);
}

function formatRequirementText(value) {
  const list = asArray(value).map((item) => {
    if (typeof item === 'string' || typeof item === 'number') return compact(item);
    if (!item || typeof item !== 'object') return '';
    const parts = ['name', 'title', 'requirement', 'description', 'detail', 'text', 'level', 'note']
      .map((key) => compact(item[key]))
      .filter(Boolean);
    return parts.length ? parts.join(' | ') : '';
  }).filter(Boolean);
  return list.length ? list.join(' / ') : '未设置';
}

function buildRequirementRows(job = {}) {
  const requirements = job.basicRequirements || {};
  return [
    { label: '学历门槛', value: compact(requirements.education_min || requirements.educationMin) || '未设置' },
    { label: '专业要求', value: formatRequirementText(requirements.major || requirements.majors) },
    { label: '毕业年限', value: formatRequirementText(requirements.graduationYearRange || requirements.graduation_year_range) },
    { label: '证书要求', value: formatRequirementText(requirements.certifications) },
    { label: '经验要求', value: formatRequirementText(requirements.experiences) },
  ];
}

function buildScoreCards(job = {}) {
  const techScore = job.score_tech ?? job.scoring?.components?.tech_match ?? job.score_breakdown?.raw?.tech_match;
  const qualityScore = job.score_quality ?? job.scoring?.components?.quality_match ?? job.score_breakdown?.raw?.quality_match;
  return [
    { label: '原始匹配分', value: formatScore(getMatchScore(job)), hint: 'Match Score' },
    { label: '技术分', value: formatScore(techScore), hint: 'Tech Score' },
    { label: '通用素质', value: formatScore(qualityScore), hint: 'Quality Score' },
    { label: '精确覆盖', value: formatPercent(job.exact_match_ratio), hint: 'Exact Coverage' },
  ];
}

function buildJdSections(job = {}) {
  const labels = {
    jobDescriptions: '工作内容',
    jobRequirements: '岗位要求',
    bonusPoints: '加分项',
    notes: '补充说明',
  };
  return Object.entries(labels)
    .map(([key, label]) => ({
      key,
      label,
      items: asArray(job?.jdSplit?.[key]).map(compact).filter(Boolean),
    }))
    .filter((section) => section.items.length > 0);
}

const ScoreCard = ({ item }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{item.hint}</div>
    <div className="mt-3 text-3xl font-black text-slate-900">{item.value}</div>
    <div className="mt-1 text-sm font-medium text-slate-500">{item.label}</div>
  </div>
);

const contributionTone = {
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
};

const ScoreContributionPanel = ({ rows = [], total = 0 }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Score Formula</div>
        <h3 className="mt-1 text-lg font-black text-slate-900">原始匹配贡献拆解</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          采摘前只看能力与 JD 的匹配，不混入学历/经历背景竞争力。
        </p>
      </div>
      <div className="rounded-xl bg-slate-900 px-3 py-2 text-right text-white">
        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-300">Total</div>
        <div className="text-xl font-black">{formatScore(total)}</div>
      </div>
    </div>
    <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="flex h-full">
        {rows.map((row) => (
          <div
            key={`bar-${row.key}`}
            className={contributionTone[row.tone] || 'bg-slate-400'}
            style={{ width: `${Math.max(0, Math.min(100, Number(row.value || 0)))}%` }}
            title={`${row.label}: ${formatScore(row.value)}`}
          />
        ))}
      </div>
    </div>
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', contributionTone[row.tone] || 'bg-slate-400')} />
              <span className="text-sm font-bold text-slate-800">{row.label}</span>
            </div>
            <span className="text-sm font-black text-slate-900">+{formatScore(row.value)}</span>
          </div>
          <div className="mt-1 text-[11px] leading-5 text-slate-500">
            原始分 {formatScore(row.raw)} · {row.description}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const CheckSummaryCard = ({ check }) => {
  if (!check) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
        还没有发起准入核查。建议先看详情，再发起一次核查，确认专业、证书、经历门槛。
      </div>
    );
  }

  return (
    <div className={cn(
      'rounded-2xl border px-4 py-4',
      check.passed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50',
    )}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(
          'inline-flex h-8 items-center rounded-md border px-2.5 text-[11px] font-semibold',
          check.passed ? 'border-emerald-200 bg-white text-emerald-700' : 'border-amber-200 bg-white text-amber-700',
        )}>
          {check.passed ? '已通过' : '未通过'}
        </span>
        {check.sourceMeta?.sourceLabel && (
          <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-500">
            {check.sourceMeta.sourceLabel}
          </span>
        )}
      </div>
      <div className="mt-3 text-base font-bold text-slate-900">{check.title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{check.summary}</p>
      {check.sourceMeta?.mode === 'degraded_local' && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-white px-3 py-2 text-[12px] leading-5 text-amber-700">
          API 调用失败，当前是本地降级结果。专业和证书只做了粗判，经历要求不能视为最终核查结论。
        </div>
      )}
    </div>
  );
};

const TechnicalTable = ({ bucket, resolveTag }) => {
  if (!bucket.rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
        当前岗位没有可展示的 {bucket.label} 对比结果。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="grid grid-cols-[1fr_1fr_0.6fr_0.6fr_1.35fr_0.7fr] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
        <span>标签</span>
        <span>你的命中</span>
        <span>你的等级</span>
        <span>目标等级</span>
        <span>状态</span>
      </div>
      <div className="divide-y divide-slate-100">
        {bucket.rows.map((row) => {
          const jdResolved = resolveTag?.(row.jdQuery, row.jdTag, row.jdSecondaryTag) || {
            primary: row.jdTag,
            secondary: row.jdSecondaryTag,
          };
          const studentResolved = resolveTag?.(row.studentQuery, row.studentTag, row.studentSecondaryTag) || {
            primary: row.studentTag,
            secondary: row.studentSecondaryTag,
          };
          return (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_1fr_0.6fr_0.6fr_1.35fr_0.7fr] gap-3 px-4 py-3 text-sm text-slate-600"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-900">{jdResolved.primary}</div>
                <div className="mt-1 text-[11px] tracking-[0.02em] text-slate-400">
                  {row.jdTagHint || jdResolved.secondary || bucket.label}
                </div>
              </div>
              <div className="min-w-0">
                <div className="truncate">{studentResolved.primary}</div>
                {studentResolved.secondary && (
                  <div className="mt-1 truncate text-[11px] text-slate-400">{studentResolved.secondary}</div>
                )}
              </div>
              <div>{formatLevel(row.studentLevel)}</div>
              <div>{formatLevel(row.targetLevel)}</div>
              <div className="text-[13px] leading-6 text-slate-500">{row.explanation}</div>
              <div>
                <span className={cn(
                  'inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-semibold',
                  row.status === 'Standard'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : row.status === 'Similar'
                      ? 'border-sky-200 bg-sky-50 text-sky-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700',
                )}>
                  {row.statusLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SoftGapList = ({ rows }) => {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
        当前没有 soft / growth 缺口需要单独提醒。
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((row) => (
        <div key={row.key} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">{row.tag}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">{row.categoryLabel}</div>
            </div>
            <span className="inline-flex h-7 items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-700">
              {row.statusLabel}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-600">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">你的等级</div>
              <div className="mt-1 font-semibold">{formatLevel(row.studentLevel)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">目标等级</div>
              <div className="mt-1 font-semibold">{formatLevel(row.targetLevel)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const RequirementGrid = ({ rows }) => (
  <div className="grid gap-3 md:grid-cols-2">
    {rows.map((row) => (
      <div key={row.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{row.label}</div>
        <div className="mt-2 text-sm font-semibold leading-6 text-slate-800">{row.value}</div>
      </div>
    ))}
  </div>
);

const CheckChecklist = ({ check }) => {
  if (!check?.checklist?.length) return null;
  return (
    <div className="space-y-3">
      {check.checklist.map((item, index) => (
        <div key={`${item.label}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-900">{item.label}</span>
            <span className={cn(
              'inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-semibold',
              item.pass ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700',
            )}>
              {item.pass ? '[✅]' : '[❌]'}
            </span>
            {item.source && (
              <span className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[11px] text-slate-500">
                {item.source}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
        </div>
      ))}
    </div>
  );
};

const JdSections = ({ sections }) => (
  <div className="space-y-4">
    {sections.map((section) => (
      <div key={section.key} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <ChevronRight size={16} className="text-slate-400" />
          <h4 className="text-sm font-black text-slate-900">{section.label}</h4>
        </div>
        <div className="space-y-2 text-sm leading-6 text-slate-600">
          {section.items.map((item, index) => (
            <div key={`${section.key}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2">
              {item}
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

const JobDetailDrawer = ({
  job,
  student,
  isPicked,
  onClose,
  onCheck,
  onPick,
}) => {
  const technicalBuckets = useMemo(
    () => buildTechnicalBuckets(job || {}, student || {}),
    [job, student],
  );
  const [resolvedTagMap, setResolvedTagMap] = useState({});
  const [activeTab, setActiveTab] = useState('analysis');
  const softGapRows = buildSoftGapRows(job || {});
  const requirements = buildRequirementRows(job || {});
  const scoreCards = buildScoreCards(job || {});
  const contributionRows = buildMatchContributionRows(job || {});
  const laneMeta = getLaneDisplayMeta(job?.lane);
  const jdSections = buildJdSections(job || {});
  const externalUrl = compact(job?.jobUrl || job?.job_url || job?.url || job?.link);
  const check = job?.check || null;
  const jobDisplayId = getJobDisplayId(job || {});
  const jobType = getJobType(job || {});
  const duplicateCount = Number(job?.dedupeMeta?.duplicateCount || 1);

  useEffect(() => {
    let cancelled = false;

    async function loadResolvedTags() {
      if (!job) {
        setResolvedTagMap({});
        return;
      }
      const queryMap = new Map();
      technicalBuckets.forEach((bucket) => {
        bucket.rows.forEach((row) => {
          if (shouldResolveTag(row.jdQuery, row.jdTag)) {
            queryMap.set(resolveCacheKey(row.jdQuery), row.jdQuery);
          }
          if (shouldResolveTag(row.studentQuery, row.studentTag)) {
            queryMap.set(resolveCacheKey(row.studentQuery), row.studentQuery);
          }
        });
      });

      if (!queryMap.size) {
        setResolvedTagMap({});
        return;
      }

      const entries = await Promise.all(
        Array.from(queryMap.entries()).map(async ([key, query]) => [key, await resolveTagCenterLabel(query)])
      );

      if (cancelled) return;
      const next = {};
      entries.forEach(([key, value]) => {
        if (value) next[key] = value;
      });
      setResolvedTagMap(next);
    }

    loadResolvedTags();
    return () => {
      cancelled = true;
    };
  }, [job, technicalBuckets]);

  const resolveTag = (query, fallbackLabel = '', fallbackSecondary = '') => {
    const resolved = resolvedTagMap[resolveCacheKey(query)] || null;
    const primary = compact(
      resolved?.displayName || fallbackLabel || resolved?.normalizedTag || query?.value || '--'
    );
    const secondary = compact(resolved?.normalizedTag || fallbackSecondary || query?.value);
    return {
      primary,
      secondary: secondary && secondary !== primary ? secondary : '',
    };
  };

  return (
    <AnimatePresence>
      {job && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[102] bg-slate-950/35 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed inset-y-0 right-0 z-[103] flex w-full max-w-[1100px] flex-col border-l border-slate-200 bg-[#f7f4ee] shadow-[0_24px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="border-b border-slate-200 bg-white/85 px-6 py-5 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <BriefcaseBusiness size={14} className="mr-2" />
                      Job Detail
                    </span>
                    <span className="inline-flex h-8 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-700">
                      {laneMeta.label}
                    </span>
                    {jobType && (
                      <span className="inline-flex h-8 items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-700">
                        {jobType}
                      </span>
                    )}
                    {job?.tier && (
                      <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600">
                        {job.tier}
                      </span>
                    )}
                    <span
                      className="inline-flex h-8 max-w-[360px] items-center truncate rounded-md border border-slate-200 bg-white px-2.5 font-mono text-[11px] font-semibold text-slate-500"
                      title={`stableId: ${job?.stableId || jobDisplayId}`}
                    >
                      Job ID: {jobDisplayId}
                    </span>
                    {duplicateCount > 1 && (
                      <span
                        className="inline-flex h-8 items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-700"
                        title={(job?.dedupeMeta?.duplicateJobIds || []).join(', ')}
                      >
                        已折叠 {duplicateCount} 条相似岗位
                      </span>
                    )}
                  </div>

                  <h2 className="truncate text-3xl font-black tracking-tight text-slate-900">
                    {job?.title || '未命名岗位'}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                    <span className="font-semibold text-slate-800">{compact(job?.companyName) || '未知公司'}</span>
                    <span>{compact(job?.city) || '不限城市'}</span>
                    <span>{formatSalary(job?.metadata?.salaryRange)}</span>
                    {compact(job?.direction) && <span>{job.direction}</span>}
                  </div>

                  <div className="mt-8 flex items-center gap-8">
                    {[
                      { id: 'analysis', label: '匹配分析' },
                      { id: 'jd', label: '岗位描述' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          'relative pb-3 text-sm font-bold transition-all',
                          activeTab === tab.id
                            ? 'text-blue-600'
                            : 'text-slate-400 hover:text-slate-600'
                        )}
                      >
                        {tab.label}
                        {activeTab === tab.id && (
                          <motion.div
                            layoutId="activeTab"
                            className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.4)]"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {externalUrl && (
                    <a
                      href={externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hidden h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 md:inline-flex"
                    >
                      原始链接
                      <ArrowUpRight size={14} className="ml-2" />
                    </a>
                  )}
                  <button
                    onClick={onClose}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                    aria-label="关闭岗位详情"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
              {activeTab === 'analysis' && (
                <>
                  <section className="grid gap-4 md:grid-cols-4">
                    {scoreCards.map((item) => <ScoreCard key={item.label} item={item} />)}
                  </section>

              <section>
                <ScoreContributionPanel rows={contributionRows} total={getMatchScore(job || {})} />
              </section>

              <section className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={16} className="text-slate-500" />
                    <h3 className="text-lg font-black text-slate-900">核查摘要</h3>
                  </div>
                  <CheckSummaryCard check={check} />
                  <CheckChecklist check={check} />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-slate-500" />
                    <h3 className="text-lg font-black text-slate-900">准入要求</h3>
                  </div>
                  <RequirementGrid rows={requirements} />
                </div>
              </section>

              <section className="space-y-5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-slate-500" />
                  <h3 className="text-lg font-black text-slate-900">技术标签对比</h3>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600">
                        技术栈
                      </span>
                    </div>
                    <TechnicalTable bucket={technicalBuckets[0]} resolveTag={resolveTag} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600">
                        核心技术特征
                      </span>
                    </div>
                    <div className="space-y-4">
                      {technicalBuckets.slice(1).map((bucket) => (
                        <div key={bucket.id} className="space-y-2">
                          <div className="text-sm font-bold text-slate-800">{bucket.label}</div>
                          <TechnicalTable bucket={bucket} resolveTag={resolveTag} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={16} className="text-slate-500" />
                      <h3 className="text-lg font-black text-slate-900">Soft / Growth 缺口</h3>
                    </div>
                    <SoftGapList rows={softGapRows} />
                  </section>
                </>
              )}

              {activeTab === 'jd' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <BriefcaseBusiness size={16} className="text-slate-500" />
                      <h3 className="text-lg font-black text-slate-900">JD 预览</h3>
                    </div>
                    <JdSections sections={jdSections} />
                  </section>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 border-t border-slate-200 bg-white px-6 py-5">
              <Button
                variant="default"
                className="h-11 justify-center text-sm"
                onClick={() => onCheck?.(job)}
              >
                {check ? '重新核查' : '发起核查'}
              </Button>
              <Button
                variant={isPicked ? 'accent' : 'default'}
                className={cn('h-11 justify-center text-sm', isPicked && 'bg-amber-600 border-amber-600 shadow-none hover:brightness-100')}
                onClick={() => onPick?.(job)}
                disabled={!isPicked && (!check?.passed || check?.sourceMeta?.mode === 'degraded_local')}
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
};

export default JobDetailDrawer;
