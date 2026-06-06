import {
  formatTimeLabel,
  getConfidenceCoefficient,
  getJdStarScore,
  getMatchScore,
  getPreConfidenceScore,
  getReportScore,
  getStudentCompetitivenessScore,
  getTagMatchScore,
} from './matchWorkspace';

function compact(value) {
  return String(value || '').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return String(Math.round(Math.max(0, Math.min(100, numeric))));
}

function formatCoefficient(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(3) : '--';
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

export function careerReportId(harvest = {}, rank = {}) {
  const harvestId = compact(harvest.id || harvest.harvestId || 'harvest');
  const jobId = compact(rank.stableId || rank.id || rank.jobId || 'job');
  return `${harvestId}::${jobId}`;
}

export function findSavedReport(workspace = {}, reportId = '') {
  return asArray(workspace.savedReports).find((report) => report?.id === reportId) || null;
}

export function buildCareerReportSnapshot(harvest = {}, rank = {}, student = {}, previous = null) {
  const id = careerReportId(harvest, rank);
  const now = new Date().toISOString();
  const formula = rank.scoreFormula || previous?.scoreFormula || {};
  return {
    ...(previous || {}),
    id,
    type: 'match_harvest_job_report',
    source: 'matching-harvest',
    harvestId: compact(harvest.id || harvest.harvestId),
    jobId: compact(rank.stableId || rank.id || rank.jobId),
    title: compact(rank.title) || '未命名岗位报告',
    companyName: compact(rank.companyName) || '未知公司',
    bestJobTitle: harvest.bestJobTitle || '',
    generatedAt: harvest.completedAt || harvest.submittedAt || previous?.generatedAt || now,
    savedAt: previous?.savedAt || now,
    updatedAt: now,
    overview: harvest.overview || previous?.overview || '',
    studentName: harvest.studentName || student?.basicInfo?.name || student?.name || previous?.studentName || '',
    confidence: harvest.confidence ?? previous?.confidence ?? null,
    confidenceCoefficient: getConfidenceCoefficient(rank) ?? harvest.confidenceCoefficient ?? previous?.confidenceCoefficient ?? null,
    studentCompetitivenessScore: getStudentCompetitivenessScore(rank) || harvest.studentCompetitiveness?.total_score || previous?.studentCompetitivenessScore || 0,
    reportScore: getReportScore(rank),
    matchScore: getMatchScore(rank),
    tagMatchScore: getTagMatchScore(rank),
    jdStarScore: getJdStarScore(rank),
    preConfidenceScore: getPreConfidenceScore(rank),
    rank: rank.rank || previous?.rank || null,
    jdAssessmentSource: rank.jdAssessmentSource || previous?.jdAssessmentSource || '',
    ranking: {
      ...rank,
      jdSplitAssessment: asArray(rank.jdSplitAssessment),
      jdStarCounts: rank.jdStarCounts || {},
      scoreFormula: formula,
    },
    scoreFormula: {
      jdStarWeight: formula.jdStarWeight ?? 0.6,
      tagMatchWeight: formula.tagMatchWeight ?? 0.4,
      jdStarScore: formula.jdStarScore ?? getJdStarScore(rank),
      tagMatchScore: formula.tagMatchScore ?? getTagMatchScore(rank),
      preConfidenceScore: formula.preConfidenceScore ?? getPreConfidenceScore(rank),
      confidenceCoefficient: formula.confidenceCoefficient ?? getConfidenceCoefficient(rank),
      finalReportScore: formula.finalReportScore ?? getReportScore(rank),
    },
    chatMessages: asArray(previous?.chatMessages),
  };
}

export function upsertSavedReport(workspace = {}, report = {}) {
  const reports = asArray(workspace.savedReports);
  const nextReports = [
    report,
    ...reports.filter((item) => item?.id !== report.id),
  ];
  return {
    ...workspace,
    savedReports: nextReports,
  };
}

export function removeSavedReport(workspace = {}, reportId = '') {
  return {
    ...workspace,
    savedReports: asArray(workspace.savedReports).filter((report) => report?.id !== reportId),
  };
}

export function formatCareerReportMarkdown(report = {}) {
  const rank = report.ranking || {};
  const formula = report.scoreFormula || {};
  const items = asArray(rank.jdSplitAssessment);
  const lines = [
    `# ${report.title || '职业报告'} @ ${report.companyName || '未知公司'}`,
    '',
    `- 报告 ID：${report.id || '--'}`,
    `- 生成时间：${formatTimeLabel(report.generatedAt)}`,
    `- 收藏时间：${formatTimeLabel(report.savedAt)}`,
    `- 最终报告分：${formatScore(report.reportScore)}`,
    `- 逐条星级分：${formatScore(report.jdStarScore)}`,
    `- 标签匹配分：${formatScore(report.tagMatchScore || report.matchScore)}`,
    `- 乘系数前合成分：${formatScore(report.preConfidenceScore)}`,
    `- 置信度系数：${formatCoefficient(report.confidenceCoefficient)}`,
    '',
    '## 评分公式',
    '',
    `最终报告分 = (逐条星级分 × ${formula.jdStarWeight ?? 0.6} + 标签匹配分 × ${formula.tagMatchWeight ?? 0.4}) × 置信度系数`,
    '',
    '## 报告摘要',
    '',
    report.overview || '暂无摘要。',
    '',
    '## 岗位要求 / 加分项逐条评估',
    '',
  ];

  if (!items.length) {
    lines.push('暂无逐条评估。');
  } else {
    items.forEach((item, index) => {
      lines.push(`### ${index + 1}. ${item.section || 'JD'}：${item.text || '未命名条目'}`);
      lines.push('');
      lines.push(`- 星级：${item.stars || '--'} / 3`);
      lines.push(`- 单项分：${formatScore(item.score)}`);
      lines.push(`- 结论：${item.label || '--'}`);
      lines.push(`- 理由：${studentSafeAssessmentText(item.reason) || '暂无'}`);
      lines.push(`- 证据/缺口：${evidenceTextForItem(item) || '暂无'}`);
      lines.push('');
    });
  }

  return lines.join('\n');
}
