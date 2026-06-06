import React from 'react';
import {
  BarChart3,
  Calendar,
  FileText,
  Sparkles,
} from 'lucide-react';
import {
  formatTimeLabel,
  getConfidenceCoefficient,
  getJdStarScore,
  getMatchScore,
  getPreConfidenceScore,
  getReportScore,
  getTagMatchScore,
  renderStars,
} from '../../services/matchWorkspace';

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

function scoreFromStars(value) {
  const stars = Math.max(1, Math.min(3, Number(value || 0) || 1));
  if (stars === 3) return 100;
  if (stars === 2) return 50;
  return 0;
}

function studentSafeAssessmentText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .replace(/基于当前标签匹配结果的本地降级评估。?/g, '基于当前画像标签、命中项与缺口列表的系统评估。')
    .replace(/本地降级结果/g, '系统辅助评估结果')
    .replace(/降级评估/g, '系统评估');
}

function evidenceTextForItem(item = {}) {
  const evidence = studentSafeAssessmentText(item.evidence);
  if (/基于当前画像标签、命中项与缺口列表的系统评估/.test(evidence)) {
    const text = String(item.text || '').trim();
    return text
      ? `该条为旧版系统兜底结果，尚未形成逐条证据；建议围绕「${text.slice(0, 36)}」补充项目、结果数据或技能证明。`
      : '该条为旧版系统兜底结果，尚未形成逐条证据；建议重新收割生成新版逐条解释。';
  }
  return evidence;
}

const Metric = ({ label, value, tone = 'slate' }) => {
  const tones = {
    orange: 'text-orange-500 bg-orange-50 border-orange-100',
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    slate: 'text-slate-800 bg-slate-50 border-slate-100',
  };
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones[tone] || tones.slate}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-60">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
};

const CareerReportDetail = ({ report = {} }) => {
  const rank = report.ranking || report;
  const formula = report.scoreFormula || rank.scoreFormula || {};
  const items = asArray(rank.jdSplitAssessment);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-orange-600">
              <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1">
                <FileText size={13} className="mr-1.5" />
                职业报告
              </span>
              <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-slate-500">
                <Calendar size={13} className="mr-1.5" />
                {formatTimeLabel(report.generatedAt)}
              </span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">
              {report.title || rank.title || '未命名岗位'}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {report.companyName || rank.companyName || '未知公司'}
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
              {report.overview || '本报告基于收割时的岗位匹配结果、逐条 JD 评估与画像竞争力系数生成。'}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-950 px-5 py-4 text-right text-white shadow-xl shadow-slate-200">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Final Score</div>
            <div className="mt-1 text-4xl font-black">{formatScore(getReportScore(report))}</div>
            <div className="text-[11px] text-white/60">最终报告分</div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="逐条星级分" value={renderStars(getJdStarScore(report))} tone="orange" />
        <Metric label="标签匹配分" value={formatScore(getTagMatchScore(report) || getMatchScore(report))} tone="emerald" />
        <Metric label="乘系数前" value={formatScore(getPreConfidenceScore(report))} tone="blue" />
        <Metric label="置信度系数" value={formatCoefficient(getConfidenceCoefficient(report))} />
      </section>

      <section className="rounded-[28px] border border-slate-100 bg-white p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
              <BarChart3 size={17} className="text-orange-500" />
              评分公式
            </h3>
            <p className="mt-1 text-[12px] leading-5 text-slate-500">
              工作内容不参与星级评分，只评估岗位要求与加分项。
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-[12px] font-bold text-slate-600">
            最终分 = ({formatScore(formula.jdStarScore ?? getJdStarScore(report))} × {formula.jdStarWeight ?? 0.6}
            {' + '}
            {formatScore(formula.tagMatchScore ?? getTagMatchScore(report))} × {formula.tagMatchWeight ?? 0.4})
            {' × '}
            {formatCoefficient(formula.confidenceCoefficient ?? getConfidenceCoefficient(report))}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-100 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
              <Sparkles size={17} className="text-orange-500" />
              岗位要求 / 加分项逐条解释
            </h3>
            <p className="mt-1 text-[12px] text-slate-500">
              每条都保留评估星级、可解释理由和证据/缺口。
            </p>
          </div>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-bold text-orange-600">
            {items.length} 条
          </span>
        </div>

        {items.length ? (
          <div className="space-y-3">
            {items.map((item, index) => {
              const itemScore = item.score ?? scoreFromStars(item.stars);
              return (
                <article key={`${report.id || rank.stableId}-item-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
                        <span className="rounded bg-white px-2 py-1">{item.section || 'JD'}</span>
                        <span>#{index + 1}</span>
                      </div>
                      <p className="mt-2 text-sm font-bold leading-6 text-slate-800">{item.text || '未命名条目'}</p>
                      <p className="mt-2 text-[12px] leading-5 text-slate-600">{studentSafeAssessmentText(item.reason) || '暂无解释'}</p>
                      {item.evidence && (
                        <p className="mt-1 text-[12px] leading-5 text-slate-400">证据/缺口：{evidenceTextForItem(item)}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-black text-orange-500">{renderStars(item.stars)}</div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
            暂无逐条评估数据。
          </div>
        )}
      </section>
    </div>
  );
};

export default CareerReportDetail;
