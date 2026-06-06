export const MATCH_VIEWS = [
  {
    id: 'explore',
    label: '探索',
    english: 'Explore',
    route: '/matching/explore',
    desc: '岗位推荐主战场',
    accent: 'emerald',
  },
  {
    id: 'basket',
    label: '篮子',
    english: 'Basket',
    route: '/matching/basket',
    desc: '唯一活跃篮子',
    accent: 'amber',
  },
  {
    id: 'harvest',
    label: '收割记录',
    english: 'Harvest',
    route: '/matching/harvest',
    desc: '报告与历史',
    accent: 'orange',
  },
  {
    id: 'profile',
    label: '我的画像',
    english: 'Profile',
    route: '/matching/profile',
    desc: '能力与变化趋势',
    accent: 'sky',
  },
];

export const MATCH_EXPLORE_TABS = [
  {
    id: 'featured',
    label: '精选',
    english: 'Featured',
    accent: 'emerald',
    description: '保守、精准、冲刺三段展开，统一按薪资上限排序。',
  },
  {
    id: 'interest',
    label: '猜你喜欢',
    english: 'For You',
    accent: 'violet',
    description: '同方向岗位，至少保留 1 个 techStack 命中。',
  },
  {
    id: 'switch',
    label: '换岗',
    english: 'Switch',
    accent: 'amber',
    description: '跨方向岗位，至少保留 1 个 techStack 命中。',
  },
];

export const FEATURED_LANE_SECTIONS = [
  {
    id: 'featured_safety',
    tier: 'safety',
    label: '保守',
    english: 'Safety',
    accent: 'emerald',
    description: '门槛友好、适合优先投递的稳定槽位。',
  },
  {
    id: 'featured_target',
    tier: 'target',
    label: '精准',
    english: 'Target',
    accent: 'sky',
    description: '最贴近主方向的核心投递池。',
  },
  {
    id: 'featured_reach',
    tier: 'reach',
    label: '冲刺',
    english: 'Reach',
    accent: 'amber',
    description: '保持技术命中的高薪冲刺位。',
  },
];

export const RECOMMENDATION_LANES = [
  {
    id: 'featured',
    source: 'featured',
    label: '精选推荐',
    english: 'Featured',
    tag: '算法推荐',
    accent: 'emerald',
    description: '按原始匹配分与精准覆盖优先展示最值得先看的岗位，冲刺岗按同方向薪资排序。',
  },
  {
    id: 'interest',
    source: 'interest',
    label: '猜你喜欢',
    english: 'For You',
    tag: '跨方向高分',
    accent: 'violet',
    description: '从你当前求职方向中，挑选与精选槽去重后的高竞争力岗位。适合在主赛道已有保底后继续横向探索。',
  },
  {
    id: 'switch',
    source: 'switch',
    label: '换岗路径',
    english: 'Switch',
    tag: '职业转型探索',
    accent: 'amber',
    description: '系统性列出跨方向可迁移岗位，按可迁移命中与竞争力从高到低排列。适合主动探索职业转型路径。',
  },
];

const EDUCATION_RANK = {
  中专: 1,
  大专: 2,
  本科: 3,
  学士: 3,
  硕士: 4,
  研究生: 4,
  博士: 5,
};

const TOOL_TAGS = new Set(['Docker', 'K8s', 'Git', 'GitHub', 'Jenkins', 'Figma', 'Jira']);
const FRAMEWORK_TAGS = new Set(['React', 'Vue', 'Angular', 'Node.js', 'Express', 'NestJS']);
const LANGUAGE_TAGS = new Set(['JavaScript', 'TypeScript', 'Python', 'Go', 'Java']);
const CLOUD_TAGS = new Set(['Docker', 'K8s', 'AWS', 'Azure', '阿里云', '腾讯云']);

const CHECK_SOURCE_LABELS = {
  rule_only: '本地规则',
  rule_plus_llm: 'LLM 核查',
  degraded_local: 'API 失败降级',
  preview_local: '本地预估',
};
const MAJOR_FAMILY_ALIASES = {
  computer: ['计算机', '软件工程', '软件', '网络工程', '信息安全', '数据科学', '人工智能', '物联网工程', '数字媒体技术'],
  electronics: ['电子信息', '通信工程', '自动化', '集成电路', '微电子', '电气工程'],
  math: ['数学', '统计', '应用数学', '信息与计算科学'],
  business: ['金融', '经济', '会计', '工商管理', '电子商务'],
};
const CERT_FAMILY_ALIASES = {
  cet4: ['cet4', '英语四级', '大学英语四级', '四级'],
  cet6: ['cet6', '英语六级', '大学英语六级', '六级'],
  pmp: ['pmp', '项目管理专业人士'],
  aws_saa: ['aws saa', 'aws-saa', 'aws solutions architect associate', 'aws certified solutions architect associate'],
  aws_practitioner: ['aws practitioner', 'aws cloud practitioner', 'aws certified cloud practitioner'],
  hcia: ['hcia', '华为认证ict工程师'],
  hcip: ['hcip', '华为认证ict高级工程师'],
  hcie: ['hcie', '华为认证ict专家'],
  soft_exam: ['软考', '软件设计师', '系统架构设计师', '信息系统项目管理师'],
};

export function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function compact(value) {
  return String(value || '').trim();
}

function normalizeToken(value) {
  return compact(value).toLowerCase().replace(/[^0-9a-z\u4e00-\u9fff]+/g, '');
}

function resolveAliasFamilies(value, aliasMap) {
  const normalized = normalizeToken(value);
  if (!normalized) return [];
  return Object.entries(aliasMap)
    .filter(([, aliases]) => aliases.some((alias) => {
      const aliasToken = normalizeToken(alias);
      return aliasToken && (normalized.includes(aliasToken) || aliasToken.includes(normalized));
    }))
    .map(([family]) => family);
}

function formatRawValue(value) {
  if (Array.isArray(value)) return value.map(formatRawValue).filter(Boolean).join(' / ');
  if (typeof value === 'string' || typeof value === 'number') return compact(value);
  if (!value || typeof value !== 'object') return '';
  const preferred = ['name', 'title', 'requirement', 'description', 'detail', 'text', 'value', 'level', 'note'];
  const parts = preferred.map((key) => compact(value[key])).filter(Boolean);
  return parts.length ? parts.join(' | ') : JSON.stringify(value);
}

function sanitizePreviewText(value) {
  return compact(value).replace(/^【[^】]+】/, '').replace(/^[-~+]/, '').trim();
}

function isTechStackBranch(item) {
  return Array.isArray(item?.options) && item.options.length > 0;
}

function parseTechStackTraceLabel(value = '') {
  const raw = compact(value);
  if (!raw.includes('->')) return null;
  const parts = raw.split(/\s*->\s*/).map(compact).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    groupName: parts[0],
    optionName: parts.slice(1).join(' -> '),
  };
}

function catalogKey(tagType, value) {
  const token = normalizeToken(value);
  return token ? `${tagType}::${token}` : '';
}

function buildCatalogRecord(tagType, item = {}, extra = {}) {
  const normalizedTag = compact(extra.normalizedTag || item.normalizedTag || item.skill || item.name);
  const displayName = compact(extra.displayName || item.displayName || item.skillZh || item.name || normalizedTag);
  return {
    tagType,
    tagId: compact(extra.tagId || item.tagId),
    normalizedTag,
    displayName,
    type: compact(extra.type || item.type),
    groupName: compact(extra.groupName),
    optionName: compact(extra.optionName),
  };
}

function registerCatalogEntry(index, tagType, item = {}, extra = {}) {
  const record = buildCatalogRecord(tagType, item, extra);
  const aliases = [
    record.tagId,
    record.normalizedTag,
    record.displayName,
    item?.name,
    item?.displayName,
    item?.skillZh,
    item?.skill,
    extra.groupName,
    extra.optionName,
  ]
    .map(compact)
    .filter(Boolean);
  aliases.forEach((alias) => {
    const key = catalogKey(tagType, alias);
    if (key && !index.has(key)) index.set(key, record);
  });
}

function buildJobTagCatalog(job = {}) {
  const index = new Map();
  asArray(job.techStack).forEach((item) => {
    if (isTechStackBranch(item)) {
      const groupName = compact(item.groupName || item.name || item.displayName || item.normalizedTag);
      asArray(item.options).forEach((option) => {
        const optionDisplay = compact(option.displayName || option.skillZh || option.name || option.normalizedTag || option.skill);
        registerCatalogEntry(index, 'techStack', option, {
          groupName,
          optionName: optionDisplay,
        });
        const branchKey = catalogKey('techStack', `${groupName} -> ${optionDisplay}`);
        if (branchKey && !index.has(branchKey)) {
          index.set(branchKey, buildCatalogRecord('techStack', option, {
            groupName,
            optionName: optionDisplay,
          }));
        }
      });
      return;
    }
    registerCatalogEntry(index, 'techStack', item);
  });
  asArray(job.techCapabilities).forEach((item) => registerCatalogEntry(index, 'techCapabilities', item));
  asArray(job.devTools).forEach((item) => registerCatalogEntry(index, 'devTools', item));
  return index;
}

function buildStudentTagCatalog(student = {}) {
  const index = new Map();
  asArray(student.techStack).forEach((item) => registerCatalogEntry(index, 'techStack', item));
  asArray(student.techCapabilities || student.techCapability).forEach((item) => registerCatalogEntry(index, 'techCapabilities', item));
  asArray(student.devTools).forEach((item) => registerCatalogEntry(index, 'devTools', item));
  return index;
}

function resolveCatalogEntry(index, tagType, rawValue) {
  const raw = compact(rawValue);
  if (!raw) return null;
  const parsedBranch = tagType === 'techStack' ? parseTechStackTraceLabel(raw) : null;
  const primaryValue = parsedBranch?.optionName || raw;
  const direct = index.get(catalogKey(tagType, raw));
  const matched = direct || index.get(catalogKey(tagType, primaryValue)) || null;
  return {
    tagType,
    rawValue: raw,
    tagId: compact(matched?.tagId),
    normalizedTag: compact(matched?.normalizedTag || primaryValue || raw),
    displayName: compact(parsedBranch?.groupName || matched?.displayName || primaryValue || raw),
    secondaryName: compact(matched?.displayName || parsedBranch?.optionName || ''),
    groupName: compact(parsedBranch?.groupName || matched?.groupName || ''),
    optionName: compact(parsedBranch?.optionName || matched?.optionName || ''),
    type: compact(matched?.type),
  };
}

function resolveTraceTagType(source) {
  if (source === 'techStack') return 'techStack';
  if (source === 'devTools') return 'devTools';
  return 'techCapabilities';
}

function branchMetaFromItem(item = {}, meta = {}) {
  const groupName = compact(item?.branch_group_name || item?.groupName || meta?.groupName);
  const optionName = compact(item?.branch_option_name || meta?.optionName || meta?.secondaryName);
  const requiredCount = Math.max(0, Number(item?.branch_required_count || 0) || 0);
  const optionCount = Math.max(requiredCount, Number(item?.branch_option_count || 0) || 0);
  const exactCount = Math.max(0, Number(item?.branch_exact_count || 0) || 0);
  const similarCount = Math.max(0, Number(item?.branch_similar_count || 0) || 0);
  const rawMatchedCount = Number(item?.branch_matched_count);
  const matchedCount = Number.isFinite(rawMatchedCount) ? Math.max(0, rawMatchedCount) : exactCount + similarCount;
  const rawMissingCount = Number(item?.branch_missing_count);
  const missingCount = Number.isFinite(rawMissingCount) ? Math.max(0, rawMissingCount) : Math.max(0, requiredCount - matchedCount);
  return {
    isBranch: Boolean(groupName && requiredCount),
    groupId: compact(item?.group_id || item?.groupId || groupName),
    groupName,
    optionName,
    requiredCount,
    optionCount,
    exactCount,
    similarCount,
    matchedCount,
    missingCount,
    groupStatus: compact(item?.branch_group_status || ''),
    note: compact(item?.note || ''),
  };
}

function formatBranchRuleText(branchMeta = {}) {
  const requiredCount = Math.max(0, Number(branchMeta?.requiredCount || 0) || 0);
  const optionCount = Math.max(requiredCount, Number(branchMeta?.optionCount || 0) || 0);
  if (!requiredCount) return '';
  if (optionCount) return `${optionCount}选${requiredCount}`;
  return `至少满足 ${requiredCount} 项`;
}

function buildBranchHint(branchMeta = {}) {
  if (!branchMeta?.isBranch) return '';
  const parts = [`分支组：${formatBranchRuleText(branchMeta)}`];
  if (branchMeta.matchedCount > 0 || branchMeta.missingCount > 0) {
    const progress = [`已命中 ${branchMeta.matchedCount} 项`];
    if (branchMeta.missingCount > 0) progress.push(`还差 ${branchMeta.missingCount} 项`);
    parts.push(progress.join('，'));
  }
  if (branchMeta.optionName) parts.push(`组选项：${branchMeta.optionName}`);
  return parts.join('；');
}

function branchPreviewKind(branchMeta = {}) {
  if (branchMeta.missingCount > 0) return 'minus';
  if ((branchMeta.groupStatus || '').toLowerCase() === 'similar' || branchMeta.similarCount > 0) return 'sim';
  return 'plus';
}

function branchPreviewText(branchMeta = {}) {
  const label = compact(branchMeta.groupName || '分支组');
  const ruleText = formatBranchRuleText(branchMeta);
  const base = compact(`${label} ${ruleText}`).trim();
  if (branchMeta.missingCount > 0) return `${base} 还差 ${branchMeta.missingCount} 项`;
  if (branchPreviewKind(branchMeta) === 'sim') return `${base} 相近满足`;
  return `${base} 已满足`;
}

function buildTechnicalExplanation({
  status,
  blockReason,
  delta,
  jdDisplay,
  studentDisplay,
  secondaryName,
  lowFrequency,
  branchMeta,
}) {
  const branch = branchMeta?.isBranch ? branchMeta : null;
  const target = branch?.optionName || secondaryName || jdDisplay || '该能力';
  const student = studentDisplay || secondaryName;
  const gapLevel = Number.isFinite(delta) ? Math.abs(Math.round(delta)) : null;
  const withLowFrequencyHint = (text) => lowFrequency ? `${text} 这个标准词样本较少，建议结合 JD 原文一起看。` : text;

  if (branch) {
    const groupTarget = branch.groupName || jdDisplay || '该分支组';
    const ruleText = formatBranchRuleText(branch);
    const missingText = `当前整组还差 ${Math.max(1, branch.missingCount || 1)} 项。`;

    if (status === 'Standard') {
      const base = delta != null && delta > 0
        ? `你命中的 ${target} 等级已经高于岗位要求。`
        : `你已经命中分支组 ${groupTarget} 里的 ${target}。`;
      if (branch.missingCount > 0) {
        return withLowFrequencyHint(`${base} 这组要求 ${ruleText}，当前已命中 ${branch.matchedCount} 项，还差 ${branch.missingCount} 项。`);
      }
      return withLowFrequencyHint(`${base} 这组要求 ${ruleText}，目前已满足。`);
    }

    if (status === 'Similar') {
      const base = student
        ? `你当前用 ${student} 覆盖了分支组 ${groupTarget} 里的 ${target}。`
        : `你有与 ${target} 接近的相关能力。`;
      if (branch.missingCount > 0) {
        return withLowFrequencyHint(`${base} 这组要求 ${ruleText}，当前已命中 ${branch.matchedCount} 项，还差 ${branch.missingCount} 项。`);
      }
      return withLowFrequencyHint(`${base} 这组要求 ${ruleText}，目前已满足。`);
    }

    if ((blockReason === 'level_mismatch' || (delta != null && delta < 0)) && student) {
      return `分支组 ${groupTarget} 要求 ${ruleText}。${student} 可以对应 ${target}，但当前等级还低 ${Math.max(1, gapLevel || 1)} 级。${missingText}`;
    }

    if (blockReason === 'similar_disabled_for_hard_tag' && student) {
      return `分支组 ${groupTarget} 要求 ${ruleText}。你有相近项 ${student}，但 ${target} 是硬标签，不接受相近词替代。${missingText}`;
    }

    if (student) {
      return `分支组 ${groupTarget} 要求 ${ruleText}。当前最接近的是 ${student}，但还不能覆盖 ${target}。${missingText}`;
    }

    return `分支组 ${groupTarget} 要求 ${ruleText}。当前画像里还没有找到能够覆盖 ${target} 的对应标签。${missingText}`;
  }

  if (status === 'Standard') {
    const base = delta != null && delta > 0
      ? `你这项能力已经高于岗位对 ${target} 的等级要求。`
      : `你的画像已经直接命中岗位要求的 ${target}。`;
    return withLowFrequencyHint(base);
  }

  if (status === 'Similar') {
    const base = student
      ? `你当前命中的是 ${student}，它和岗位要求的 ${target} 属于相近标准词。`
      : `你有与 ${target} 接近的相关能力，但还不是同一标准词。`;
    return lowFrequency ? `${base} 这个判断基于低频标签相似度，建议再核对 JD 语境。` : base;
  }

  if ((blockReason === 'level_mismatch' || (delta != null && delta < 0)) && student) {
    return `${student} 已经有基础，但当前等级还比岗位要求低 ${Math.max(1, gapLevel || 1)} 级。`;
  }

  if (blockReason === 'similar_disabled_for_hard_tag' && student) {
    return `你有相近项 ${student}，但这个岗位把 ${target} 当作硬标签，不接受相近词替代。`;
  }

  if (student) {
    return `当前最接近的是 ${student}，但还不能覆盖岗位要求的 ${target}。`;
  }

  return `当前画像里还没有找到能够覆盖 ${target} 的对应标签。`;
}

function previewLabelFromDetail(item, source, jobCatalog) {
  const tagType = resolveTraceTagType(source);
  const meta = resolveCatalogEntry(jobCatalog, tagType, item?.jd_tag);
  return compact(meta?.displayName || meta?.secondaryName || item?.jd_tag);
}

function buildBranchPreviewRows(details = {}, jobCatalog = new Map()) {
  const grouped = new Map();
  const techRows = [
    ...asArray(details?.techStack?.exact),
    ...asArray(details?.techStack?.fuzzy),
    ...asArray(details?.techStack?.missing),
  ];
  techRows.forEach((item) => {
    const meta = resolveCatalogEntry(jobCatalog, 'techStack', item?.jd_tag);
    const branchMeta = branchMetaFromItem(item, meta);
    if (!branchMeta.isBranch) return;
    const key = compact(branchMeta.groupId || branchMeta.groupName);
    if (!key || grouped.has(key)) return;
    grouped.set(key, branchMeta);
  });
  return Array.from(grouped.values())
    .sort((left, right) => {
      const priority = { minus: 0, sim: 1, plus: 2 };
      return (priority[branchPreviewKind(left)] ?? 3) - (priority[branchPreviewKind(right)] ?? 3);
    })
    .map((branchMeta) => ({
      kind: branchPreviewKind(branchMeta),
      text: branchPreviewText(branchMeta),
    }));
}

function buildDetailPreviewTags(job = {}) {
  const details = job.match_details || {};
  const jobCatalog = buildJobTagCatalog(job);
  const rows = [];
  const seen = new Set();
  const pushRow = (kind, label, suffix) => {
    const text = compact(`${label}${suffix ? ` ${suffix}` : ''}`);
    const token = normalizeToken(text);
    if (!text || seen.has(token)) return;
    seen.add(token);
    rows.push({ kind, text });
  };

  buildBranchPreviewRows(details, jobCatalog).forEach((row) => pushRow(row.kind, row.text));

  const exactRows = [
    ...asArray(details?.techStack?.exact).map((item) => ({ item, source: 'techStack' })),
    ...asArray(details?.techCapabilities?.exact).map((item) => ({ item, source: 'techCapabilities' })),
    ...asArray(details?.devTools?.exact).map((item) => ({ item, source: 'devTools' })),
  ];
  exactRows
    .filter(({ item, source }) => {
      const meta = resolveCatalogEntry(jobCatalog, resolveTraceTagType(source), item?.jd_tag);
      return !branchMetaFromItem(item, meta).isBranch;
    })
    .slice(0, 2)
    .forEach(({ item, source }) => {
      const label = previewLabelFromDetail(item, source, jobCatalog);
      pushRow('plus', label, '已达标');
    });

  const fuzzyRows = [
    ...asArray(details?.techStack?.fuzzy).map((item) => ({ item, source: 'techStack' })),
    ...asArray(details?.techCapabilities?.fuzzy).map((item) => ({ item, source: 'techCapabilities' })),
    ...asArray(details?.devTools?.fuzzy).map((item) => ({ item, source: 'devTools' })),
  ];
  fuzzyRows
    .filter(({ item, source }) => {
      const meta = resolveCatalogEntry(jobCatalog, resolveTraceTagType(source), item?.jd_tag);
      return !branchMetaFromItem(item, meta).isBranch;
    })
    .slice(0, 1)
    .forEach(({ item, source }) => {
      const label = previewLabelFromDetail(item, source, jobCatalog);
      pushRow('sim', label, '属于相近能力');
    });

  const missingRows = [
    ...asArray(details?.techStack?.missing).map((item) => ({ item, source: 'techStack' })),
    ...asArray(details?.techCapabilities?.missing).map((item) => ({ item, source: 'techCapabilities' })),
    ...asArray(details?.devTools?.missing).map((item) => ({ item, source: 'devTools' })),
  ];
  missingRows
    .filter(({ item, source }) => {
      const meta = resolveCatalogEntry(jobCatalog, resolveTraceTagType(source), item?.jd_tag);
      return !branchMetaFromItem(item, meta).isBranch;
    })
    .slice(0, 2)
    .forEach(({ item, source }) => {
      const label = previewLabelFromDetail(item, source, jobCatalog);
      const delta = Number(item?.level_delta);
      if (Number.isFinite(delta) && delta < 0 && compact(item?.best_stu)) {
        pushRow('minus', label, `还差 ${Math.max(1, Math.abs(Math.round(delta)))} 级`);
      } else {
        pushRow('minus', label, '需要补齐');
      }
    });

  return rows.slice(0, 4);
}

function seededLevel(label = '') {
  let total = 0;
  for (const char of label) total += char.charCodeAt(0);
  return (total % 3) + 1;
}

function parseRange(value) {
  if (!value) return null;
  if (Array.isArray(value) && value.length >= 2) {
    return { min: Number(value[0]) || 0, max: Number(value[1]) || 0 };
  }
  if (typeof value === 'object') {
    return {
      min: Number(value.min ?? value.start ?? value.from ?? 0) || 0,
      max: Number(value.max ?? value.end ?? value.to ?? 0) || 0,
    };
  }
  const matched = String(value).match(/(\d{4}).*?(\d{4})/);
  if (matched) {
    return { min: Number(matched[1]), max: Number(matched[2]) };
  }
  return null;
}

export function getStudentDisplayName(student = {}) {
  return (
    student?.basicInfo?.name ||
    student?.name ||
    student?.student_id ||
    '未命名候选人'
  );
}

export function formatSalary(range) {
  if (!Array.isArray(range) || range.length !== 2) return '薪资面议';
  const [min, max] = range.map((value) => Number(value));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return '薪资面议';
  const formatK = (value) => `${Number((value / 1000).toFixed(1)).toString()}k`;
  return min === max ? `${formatK(min)}/月` : `${formatK(min)}-${formatK(max)}/月`;
}

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function getCompetitivenessScore(job = {}) {
  return getReportScore(job);
}

export function getReportScore(job = {}) {
  return numberOrZero(
    job.reportScore
      ?? job.report_score
      ?? job.finalReportScore
      ?? job.final_report_score
      ?? job.harvest_report?.report_score
      // 旧快照兼容：历史数据曾把最终展示分写成 competitivenessScore。
      ?? job.competitivenessScore
      ?? job.competitiveness_score
      ?? job.scoring?.competitiveness_score
      ?? job.score_breakdown?.competitiveness
      ?? getMatchScore(job)
      ?? 0,
  );
}

export function getMatchScore(job = {}) {
  return numberOrZero(
    job.match_score
      ?? job.matchScore
      ?? job.scoring?.match_score
      ?? job.score_breakdown?.match
      ?? 0,
  );
}

export function getTagMatchScore(job = {}) {
  return numberOrZero(job.tagMatchScore ?? job.tag_match_score ?? job.scoreFormula?.tagMatchScore ?? getMatchScore(job));
}

export function getJdStarScore(job = {}) {
  return numberOrZero(job.jdStarScore ?? job.jd_star_score ?? job.scoreFormula?.jdStarScore ?? 0);
}

export function getPreConfidenceScore(job = {}) {
  return numberOrZero(job.preConfidenceScore ?? job.pre_confidence_score ?? job.scoreFormula?.preConfidenceScore ?? 0);
}

export function getGoldScore(job = {}) {
  return getStudentCompetitivenessScore(job);
}

export function getStudentCompetitivenessScore(job = {}) {
  return numberOrZero(
    job.studentCompetitivenessScore
      ?? job.student_competitiveness_score
      ?? job.gold_score
      ?? job.goldScore
      ?? job.scoring?.gold_score
      ?? job.score_breakdown?.raw?.gold_profile
      ?? job.gold_assessment?.total_score
      ?? 0,
  );
}

export function getGoldWeightK(job = {}) {
  return getConfidenceCoefficient(job);
}

export function getConfidenceCoefficient(job = {}) {
  const value = job.confidenceCoefficient
    ?? job.confidence_coefficient
    ?? job.gold_weight_k
    ?? job.scoring?.gold_weight_k
    ?? job.gold_assessment?.confidence_coefficient
    ?? job.gold_assessment?.gold_weight_k;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function getScoreContributions(job = {}) {
  const source = job.score_breakdown?.contributions || job.scoring?.contributions || {};
  return {
    techMatch: numberOrZero(source.tech_match),
    qualityMatch: numberOrZero(source.quality_match),
    goldProfile: numberOrZero(source.gold_profile),
    graduationFit: numberOrZero(source.graduation_fit),
  };
}

export function getScoreComponents(job = {}) {
  const source = job.score_breakdown?.raw || job.scoring?.components || {};
  return {
    techMatch: numberOrZero(source.tech_match),
    qualityMatch: numberOrZero(source.quality_match),
    goldProfile: numberOrZero(source.gold_profile),
    educationGold: numberOrZero(source.education_gold),
    experienceGold: numberOrZero(source.experience_gold),
    graduationFit: numberOrZero(source.graduation_fit),
  };
}

export function buildScoreContributionRows(job = {}) {
  const contributions = getScoreContributions(job);
  const raw = getScoreComponents(job);
  return [
    {
      key: 'tech',
      label: '技术贡献',
      value: contributions.techMatch,
      raw: raw.techMatch,
      tone: 'emerald',
      description: '来自技术栈、技术能力、开发工具的综合匹配。',
    },
    {
      key: 'quality',
      label: '通用素质贡献',
      value: contributions.qualityMatch,
      raw: raw.qualityMatch,
      tone: 'sky',
      description: '来自职业素养与成长潜力的匹配情况。',
    },
    {
      key: 'gold',
      label: '背景竞争力贡献',
      value: contributions.goldProfile,
      raw: raw.goldProfile || getGoldScore(job),
      tone: 'amber',
      description: '来自学历、专业、毕业新鲜度和经历成色。',
    },
    {
      key: 'graduation',
      label: '毕业匹配贡献',
      value: contributions.graduationFit,
      raw: raw.graduationFit,
      tone: 'violet',
      description: '来自岗位对毕业年份、校招时效的适配。',
    },
  ];
}

export function buildMatchContributionRows(job = {}) {
  const contributions = getScoreContributions(job);
  const raw = getScoreComponents(job);
  const techContribution = contributions.techMatch || numberOrZero(job.score_tech) * 0.9;
  const qualityContribution = contributions.qualityMatch || numberOrZero(job.score_quality) * 0.1;
  return [
    {
      key: 'tech',
      label: '技术匹配贡献',
      value: techContribution,
      raw: raw.techMatch || numberOrZero(job.score_tech),
      tone: 'emerald',
      description: '来自技术栈、技术能力、开发工具的原始匹配。',
    },
    {
      key: 'quality',
      label: '通用素质贡献',
      value: qualityContribution,
      raw: raw.qualityMatch || numberOrZero(job.score_quality),
      tone: 'sky',
      description: '来自职业素养与成长潜力的匹配情况。',
    },
  ];
}

export function formatTimeLabel(value) {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function previewTags(job = {}) {
  const detailRows = buildDetailPreviewTags(job);
  if (detailRows.length) return detailRows;
  const items = [
    ...asArray(job.overflows)
      .slice(0, 2)
      .map((item) => sanitizePreviewText(item))
      .filter((item) => item && !/(sim:|delta:|等级系数|↔)/i.test(item))
      .map((item) => ({ kind: 'plus', text: item })),
    ...asArray(job.similars)
      .slice(0, 2)
      .map((item) => sanitizePreviewText(item))
      .filter((item) => item && !/(sim:|delta:|等级系数|↔)/i.test(item))
      .map((item) => ({ kind: 'sim', text: item })),
    ...asArray(job.missings)
      .slice(0, 2)
      .map((item) => sanitizePreviewText(item))
      .filter((item) => item && !/(sim:|delta:|等级系数|↔)/i.test(item))
      .map((item) => ({ kind: 'minus', text: item })),
  ];
  return items.slice(0, 4);
}

export function normalizeMatchJobs(matchData = {}, previousJobs = {}) {
  const jobsById = {};
  const lanes = {};

  function normalizeJobList(rows, laneId, laneLabel) {
    return asArray(rows).map((job, index) => {
      const rawId = job.id != null ? String(job.id).trim() : '';
      const stableId =
        rawId ||
        `${laneId}-${compact(job.title) || 'untitled'}-${compact(job.companyName) || 'company'}-${index}`;
      const previous = previousJobs[stableId];
      const laneParent = laneId.startsWith('featured_') ? 'featured' : laneId;
      jobsById[stableId] = {
        ...job,
        stableId,
        lane: laneId,
        laneParent,
        laneLabel,
        workspaceStatus: previous?.workspaceStatus || 'locked',
        check: previous?.check || null,
        pickedAt: previous?.pickedAt || null,
        targetLocked: previous?.targetLocked || false,
        previewTags: previewTags(job),
      };
      return stableId;
    });
  }

  const featuredRaw = matchData?.lanes?.featured;
  if (featuredRaw && typeof featuredRaw === 'object' && !Array.isArray(featuredRaw)) {
    lanes['featured_safety'] = normalizeJobList(featuredRaw.safety, 'featured_safety', '保守槽');
    lanes['featured_target'] = normalizeJobList(featuredRaw.target, 'featured_target', '精准槽');
    lanes['featured_reach'] = normalizeJobList(featuredRaw.reach, 'featured_reach', '冲刺槽');
    lanes['featured'] = [
      ...lanes['featured_safety'],
      ...lanes['featured_target'],
      ...lanes['featured_reach'],
    ];
  } else if (Array.isArray(featuredRaw)) {
    lanes['featured'] = normalizeJobList(featuredRaw, 'featured', '精选推荐');
    lanes['featured_safety'] = [];
    lanes['featured_target'] = [];
    lanes['featured_reach'] = [];
  } else if (matchData?.topJobs) {
    lanes['featured_safety'] = normalizeJobList(matchData.topJobs.safety, 'featured_safety', '保守槽');
    lanes['featured_target'] = normalizeJobList(matchData.topJobs.target, 'featured_target', '精准槽');
    lanes['featured_reach'] = normalizeJobList(matchData.topJobs.reach, 'featured_reach', '冲刺槽');
    lanes['featured'] = [
      ...lanes['featured_safety'],
      ...lanes['featured_target'],
      ...lanes['featured_reach'],
    ];
  } else {
    lanes['featured'] = [];
    lanes['featured_safety'] = [];
    lanes['featured_target'] = [];
    lanes['featured_reach'] = [];
  }

  lanes['interest'] = normalizeJobList(matchData?.lanes?.interest || [], 'interest', '猜你喜欢');
  lanes['switch'] = normalizeJobList(matchData?.lanes?.switch || [], 'switch', '换岗推荐');
  lanes['unqualified'] = normalizeJobList(matchData?.lanes?.unqualified || [], 'unqualified', '未达标岗位');

  return {
    generatedAt: new Date().toISOString(),
    jobsById,
    lanes,
    analysis: matchData.analysis || '',
    analysisMeta: matchData.analysisMeta || null,
    structuredReport: matchData.structured_report || null,
    hasMore: matchData.has_more || {},
    totals: matchData.totals || {},
    timing: matchData.timing || null,
  };
}

export function buildCheckResult(job = {}, student = {}) {
  const basic = student.basicInfo || {};
  const requirements = job.basicRequirements || {};
  const studentEducation = compact(basic.educationLevel);
  const educationRequired = compact(requirements.education_min || requirements.educationMin);
  const educationPass =
    !educationRequired ||
    (EDUCATION_RANK[studentEducation] || 0) >= (EDUCATION_RANK[educationRequired] || 0);

  const gradRange = parseRange(requirements.graduationYearRange || requirements.graduation_year_range);
  const gradYear = Number(basic.graduationYear || 0);
  const graduationPass =
    !gradRange ||
    !gradYear ||
    (gradYear >= (gradRange.min || gradYear) && gradYear <= (gradRange.max || gradYear));

  const majors = asArray(requirements.major || requirements.majors).map(compact).filter(Boolean);
  const studentMajor = compact(basic.schoolMajor);
  const majorPass =
    majors.length === 0 ||
    !studentMajor ||
    majors.some((item) => studentMajor.includes(item) || item.includes(studentMajor));

  const requiredCerts = asArray(requirements.certifications).map((item) => compact(item.name || item)).filter(Boolean);
  const studentCerts = asArray(basic.certificates).map((item) => compact(item.name || item)).filter(Boolean);
  const certPass =
    requiredCerts.length === 0 ||
    requiredCerts.every((item) => studentCerts.some((cert) => cert.includes(item) || item.includes(cert)));

  const fallbackCoverage = (job.exact_match_ratio || 0) >= 0.42;
  const fallbackGap = asArray(job.missings).length <= 3;
  const fallbackScore = getMatchScore(job) >= 72;
  const explicitChecks = [
    { label: '学历要求', pass: educationPass, detail: educationRequired ? `${studentEducation || '未填写'} vs ${educationRequired}` : '未设置门槛' },
    { label: '毕业年限', pass: graduationPass, detail: gradRange ? `${gradYear || '未填写'} vs ${gradRange.min}-${gradRange.max}` : '未设置区间' },
    { label: '专业匹配', pass: majorPass, detail: majors.length ? `${studentMajor || '未填写'} vs ${majors.join(' / ')}` : '未设置专业限制' },
    { label: '证书要求', pass: certPass, detail: requiredCerts.length ? `${studentCerts.join(' / ') || '未提供'} vs ${requiredCerts.join(' / ')}` : '未设置证书门槛' },
  ];

  const useFallback = !educationRequired && !gradRange && majors.length === 0 && requiredCerts.length === 0;
  const checklist = useFallback
    ? [
      { label: '核心技术覆盖', pass: fallbackCoverage, detail: `${Math.round((job.exact_match_ratio || 0) * 100)}% 精确覆盖` },
      { label: '原始匹配阈值', pass: fallbackScore, detail: `${getMatchScore(job).toFixed(1)} / 100` },
      { label: '短板数量', pass: fallbackGap, detail: `${asArray(job.missings).length} 个高优先级缺口` },
    ]
    : explicitChecks;

  const passed = checklist.every((item) => item.pass);
  const firstFail = checklist.find((item) => !item.pass);

  return {
    passed,
    checkedAt: new Date().toISOString(),
    checklist,
    title: passed ? '核查通过，可以采摘' : '核查未通过，暂不可采摘',
    summary: passed
      ? '硬性门槛未发现明显阻塞项，建议进入篮子后继续做深度对比。'
      : firstFail
        ? `主要阻塞项：${firstFail.label}。建议先补齐门槛或查看换岗推荐。`
        : '画像完整度不足，建议补齐基础信息后重试。',
    tip: passed
      ? '通过后可加入篮子并参与后续收割报告。'
      : asArray(job.missings).length
        ? `优先补齐：${asArray(job.missings).slice(0, 2).map(sanitizePreviewText).join('、')}`
        : '建议转向更贴近当前画像的岗位。'
  };
}

function buildEducationCheck(student = {}, requirements = {}) {
  const studentEducation = compact(student?.basicInfo?.educationLevel);
  const educationRequired = compact(requirements.education_min || requirements.educationMin);
  const passed =
    !educationRequired ||
    (EDUCATION_RANK[studentEducation] || 0) >= (EDUCATION_RANK[educationRequired] || 0);
  return {
    requirement_text: educationRequired || '未设置',
    passed,
    reason: educationRequired
      ? `你的学历为“${studentEducation || '未填写'}”，岗位要求为“${educationRequired}”。`
      : '岗位未设置学历门槛。',
    matched_evidence_ids: [],
    matched_evidence_summary: studentEducation ? [`学历：${studentEducation}`] : [],
    source: 'local_rule',
  };
}

function buildGraduationCheck(student = {}, requirements = {}) {
  const gradRange = parseRange(requirements.graduationYearRange || requirements.graduation_year_range);
  const gradYear = Number(student?.basicInfo?.graduationYear || 0);
  const passed =
    !gradRange ||
    !gradYear ||
    (gradYear >= (gradRange.min || gradYear) && gradYear <= (gradRange.max || gradYear));
  return {
    requirement_text: gradRange ? `${gradRange.min}-${gradRange.max}` : '未设置',
    passed,
    reason: gradRange
      ? `你的毕业年份为“${gradYear || '未填写'}”，岗位要求区间为“${gradRange.min}-${gradRange.max}”。`
      : '岗位未设置毕业年限门槛。',
    matched_evidence_ids: [],
    matched_evidence_summary: gradYear ? [`毕业年份：${gradYear}`] : [],
    source: 'local_rule',
  };
}

function buildMajorFallbackCheck(student = {}, requirements = {}, options = {}) {
  const degraded = Boolean(options.degraded);
  const majors = asArray(requirements.major || requirements.majors).map(formatRawValue).filter(Boolean);
  if (!majors.length) return null;
  const studentMajor = compact(student?.basicInfo?.schoolMajor);
  const studentFamilies = resolveAliasFamilies(studentMajor, MAJOR_FAMILY_ALIASES);
  const requirementFamilies = majors.flatMap((item) => resolveAliasFamilies(item, MAJOR_FAMILY_ALIASES));
  const familyHit = requirementFamilies.some((item) => studentFamilies.includes(item));
  const directHit = majors.some((item) => {
    const current = normalizeToken(item);
    const target = normalizeToken(studentMajor);
    return current && target && (current.includes(target) || target.includes(current));
  });
  const passed = Boolean(studentMajor) && (directHit || familyHit);
  return {
    requirement_text: majors.join(' / '),
    passed,
    reason: degraded
      ? (passed
        ? `API 核查失败，已按专业别名粗判为匹配。你的专业为“${studentMajor}”。`
        : `API 核查失败，已按专业别名粗判。你的专业为“${studentMajor || '未填写'}”，暂未命中岗位要求“${majors.join(' / ')}”。`)
      : `你的专业为“${studentMajor || '未填写'}”，本地规则仅做粗判。`,
    matched_evidence_ids: studentMajor ? ['MAJOR_001'] : [],
    matched_evidence_summary: studentMajor ? [`专业：${studentMajor}`] : [],
    source: degraded ? 'degraded_local' : 'local_rule',
  };
}

function buildCertificateFallbackChecks(student = {}, requirements = {}, options = {}) {
  const degraded = Boolean(options.degraded);
  const certRequirements = asArray(requirements.certifications).map(formatRawValue).filter(Boolean);
  const studentCerts = asArray(student?.basicInfo?.certificates)
    .map((item) => ({
      name: compact(item?.name || item),
      families: resolveAliasFamilies(item?.name || item, CERT_FAMILY_ALIASES),
    }))
    .filter((item) => item.name);
  return certRequirements.map((requirementText, index) => {
    const requirementFamilies = resolveAliasFamilies(requirementText, CERT_FAMILY_ALIASES);
    const matched = studentCerts.find((item) => {
      const reqToken = normalizeToken(requirementText);
      const certToken = normalizeToken(item.name);
      const familyHit = requirementFamilies.some((family) => item.families.includes(family));
      return (reqToken && certToken && (reqToken.includes(certToken) || certToken.includes(reqToken))) || familyHit;
    });
    return {
      requirement_text: requirementText,
      passed: Boolean(matched),
      reason: degraded
        ? (matched
          ? `API 核查失败，已按证书别名粗判命中“${matched.name}”。`
          : `API 核查失败，已按证书别名粗判，暂未找到与“${requirementText}”对应的证书。`)
        : `本地规则仅做证书别名粗判，要求为“${requirementText}”。`,
      matched_evidence_ids: matched ? [`CERT_${String(index + 1).padStart(3, '0')}`] : [],
      matched_evidence_summary: matched ? [`证书：${matched.name}`] : [],
      source: degraded ? 'degraded_local' : 'local_rule',
    };
  });
}

function buildExperienceFallbackChecks(job = {}, options = {}) {
  const degraded = Boolean(options.degraded);
  const requirements = job.basicRequirements || {};
  return asArray(requirements.experiences).map((item) => ({
    requirement_text: formatRawValue(item),
    passed: false,
    reason: degraded
      ? 'API 核查失败，经历要求无法通过本地规则可靠判断，当前结果仅供参考。'
      : '经历要求需要远端 LLM 核查。',
    matched_evidence_ids: [],
    matched_evidence_summary: [],
    source: degraded ? 'degraded_local' : 'local_rule',
  }));
}

function normalizeSingleCheck(item = {}) {
  return {
    requirement_text: compact(item.requirement_text || item.requirementText || '未设置'),
    passed: Boolean(item.passed),
    reason: compact(item.reason || item.detail || ''),
    matched_evidence_ids: asArray(item.matched_evidence_ids || item.matchedEvidenceIds).map(compact).filter(Boolean),
    matched_evidence_summary: asArray(item.matched_evidence_summary || item.matchedEvidenceSummary).map(compact).filter(Boolean),
    source: compact(item.source || 'local_rule'),
  };
}

export function normalizeCheckResult(raw = {}) {
  const education_check = raw.education_check ? normalizeSingleCheck(raw.education_check) : null;
  const graduation_check = raw.graduation_check ? normalizeSingleCheck(raw.graduation_check) : null;
  const major_check = raw.major_check ? normalizeSingleCheck(raw.major_check) : null;
  const certificate_checks = asArray(raw.certificate_checks).map(normalizeSingleCheck);
  const experience_checks = asArray(raw.experience_checks).map(normalizeSingleCheck);
  const fallbackChecklist = [];
  if (education_check) fallbackChecklist.push({ label: '学历要求', pass: education_check.passed, detail: education_check.reason, source: education_check.source });
  if (graduation_check) fallbackChecklist.push({ label: '毕业年限', pass: graduation_check.passed, detail: graduation_check.reason, source: graduation_check.source });
  if (major_check) fallbackChecklist.push({ label: '专业要求', pass: major_check.passed, detail: major_check.reason, source: major_check.source });
  certificate_checks.forEach((item, index) => {
    fallbackChecklist.push({ label: `证书要求 ${index + 1}`, pass: item.passed, detail: item.reason, source: item.source });
  });
  experience_checks.forEach((item, index) => {
    fallbackChecklist.push({ label: `经验要求 ${index + 1}`, pass: item.passed, detail: item.reason, source: item.source });
  });
  const requiredChecks = [education_check, graduation_check, major_check, ...certificate_checks, ...experience_checks].filter(Boolean);
  const passed = typeof raw.passed === 'boolean' ? raw.passed : requiredChecks.every((item) => item.passed);
  const sourceMeta = {
    mode: raw?.sourceMeta?.mode || 'rule_only',
    degraded: raw?.sourceMeta?.mode === 'degraded_local',
    sourceLabel: CHECK_SOURCE_LABELS[raw?.sourceMeta?.mode] || '本地规则',
    ...raw?.sourceMeta,
  };
  return {
    passed,
    overall_passed: typeof raw.overall_passed === 'boolean' ? raw.overall_passed : passed,
    checkedAt: raw.checkedAt || new Date().toISOString(),
    title: raw.title || (passed ? '核查通过，可进入采摘' : '核查未通过，暂不建议采摘'),
    summary: raw.summary || (passed ? '硬门槛与核查结果没有发现明显阻塞项。' : '当前仍存在硬门槛阻塞项，请先查看失败理由。'),
    tip: raw.tip || '',
    checklist: asArray(raw.checklist).length ? raw.checklist : fallbackChecklist,
    education_check,
    graduation_check,
    major_check,
    certificate_checks,
    experience_checks,
    sourceMeta,
  };
}

export function jobNeedsRemoteCheck(job = {}) {
  const requirements = job.basicRequirements || {};
  return Boolean(
    asArray(requirements.major || requirements.majors).length ||
    asArray(requirements.certifications).length ||
    asArray(requirements.experiences).length
  );
}

export function buildLocalCheckFallback(job = {}, student = {}, options = {}) {
  const requirements = job.basicRequirements || {};
  const degraded = Boolean(options.degraded);
  const education_check = buildEducationCheck(student, requirements);
  const graduation_check = buildGraduationCheck(student, requirements);
  const major_check = buildMajorFallbackCheck(student, requirements, { degraded });
  const certificate_checks = buildCertificateFallbackChecks(student, requirements, { degraded });
  const experience_checks = buildExperienceFallbackChecks(job, { degraded });
  return normalizeCheckResult({
    passed: [education_check, graduation_check, major_check, ...certificate_checks, ...experience_checks]
      .filter(Boolean)
      .every((item) => item.passed),
    title: degraded ? 'API 核查失败，已降级为本地规则结果' : '本地规则核查完成',
    summary: degraded
      ? '远端核查接口失败，当前结果仅供参考；专业和证书做了本地粗判，经历要求未做可靠语义判断。'
      : '当前岗位未触发远端 LLM 核查，已按本地规则完成门槛检查。',
    tip: degraded
      ? `失败原因：${options.errorMessage || '核查服务暂时不可用'}`
      : '如果岗位后续补充了专业、证书或经验要求，建议重新发起远端核查。',
    education_check,
    graduation_check,
    major_check,
    certificate_checks,
    experience_checks,
    sourceMeta: {
      mode: degraded ? 'degraded_local' : 'rule_only',
      error: options.errorMessage || '',
    },
  });
}

function buildCapabilityTypeMap(job = {}) {
  return asArray(job.techCapabilities).reduce((acc, item) => {
    const type = compact(item?.type || 'engineering') || 'engineering';
    [item?.name, item?.normalizedTag, item?.displayName, item?.skill]
      .map(compact)
      .filter(Boolean)
      .forEach((name) => {
        acc[name] = type;
      });
    return acc;
  }, {});
}

function bucketStatusLabel(status) {
  if (status === 'Standard') return '强匹配';
  if (status === 'Similar') return '相近';
  return '缺口';
}

function buildBucketRows(list = [], source, resolver = () => source, jobCatalog = new Map(), studentCatalog = new Map()) {
  return asArray(list).map((item, index) => {
    const bucketId = resolver(item);
    const tagType = resolveTraceTagType(source);
    const jdMeta = resolveCatalogEntry(jobCatalog, tagType, item?.jd_tag);
    const studentMeta = resolveCatalogEntry(studentCatalog, tagType, item?.best_stu);
    const branchMeta = branchMetaFromItem(item, jdMeta);
    const delta = Number(item?.level_delta);
    const jdDisplay = compact(jdMeta?.displayName || item?.jd_tag) || '--';
    const studentDisplay = compact(studentMeta?.displayName || item?.best_stu) || '--';

    return {
      key: `${source}-${bucketId}-${item?.jd_tag || index}-${item?.status || 'status'}`,
      bucketId,
      source,
      tagType,
      status: item?.status || 'Missing',
      statusLabel: bucketStatusLabel(item?.status),
      jdTag: jdDisplay,
      jdSecondaryTag:
        compact(jdMeta?.secondaryName || jdMeta?.normalizedTag) !== jdDisplay
          ? compact(jdMeta?.secondaryName || jdMeta?.normalizedTag)
          : '',
      jdTagHint:
        branchMeta.isBranch
          ? buildBranchHint(branchMeta)
          : compact(jdMeta?.groupName) && compact(jdMeta?.secondaryName)
            ? `组选项：${jdMeta.secondaryName}`
          : '',
      studentTag: studentDisplay,
      studentSecondaryTag:
        compact(studentMeta?.normalizedTag) !== studentDisplay
          ? compact(studentMeta?.normalizedTag)
          : '',
      studentLevel: Number(item?.best_stu_level || 0) || null,
      targetLevel: Number(item?.jd_level || 0) || null,
      delta: Number.isFinite(delta) ? delta : null,
      lowFrequency: Boolean(item?.low_frequency),
      blockReason: compact(item?.block_reason),
      explanation: buildTechnicalExplanation({
        status: item?.status || 'Missing',
        blockReason: item?.block_reason,
        delta: Number.isFinite(delta) ? delta : null,
        jdDisplay,
        studentDisplay: studentDisplay === '--' ? '' : studentDisplay,
        secondaryName: compact(jdMeta?.secondaryName),
        lowFrequency: Boolean(item?.low_frequency),
        branchMeta,
      }),
      jdQuery: {
        tagType,
        tagId: compact(jdMeta?.tagId),
        value: compact(jdMeta?.normalizedTag || item?.jd_tag),
      },
      studentQuery: {
        tagType,
        tagId: compact(studentMeta?.tagId),
        value: compact(studentMeta?.normalizedTag || item?.best_stu),
      },
    };
  });
}

export function buildTechnicalBuckets(job = {}, student = {}) {
  const details = job.match_details || {};
  const capabilityTypeMap = buildCapabilityTypeMap(job);
  const jobCatalog = buildJobTagCatalog(job);
  const studentCatalog = buildStudentTagCatalog(student);
  const buckets = {
    techStack: [],
    engineering: [],
    scene: [],
    principle: [],
    devTools: [],
  };
  const appendRows = (target, rows = []) => {
    rows.forEach((row) => buckets[target].push(row));
  };
  ['exact', 'fuzzy', 'missing'].forEach((bucket) => {
    appendRows('techStack', buildBucketRows(details?.techStack?.[bucket], 'techStack', () => 'techStack', jobCatalog, studentCatalog));
    appendRows(
      'devTools',
      buildBucketRows(details?.devTools?.[bucket], 'devTools', () => 'devTools', jobCatalog, studentCatalog)
    );
    const capabilityRows = buildBucketRows(
      details?.techCapabilities?.[bucket],
      'techCapabilities',
      (item) => capabilityTypeMap[compact(item?.jd_tag)] || 'engineering',
      jobCatalog,
      studentCatalog,
    );
    capabilityRows.forEach((row) => {
      const targetKey = ['engineering', 'scene', 'principle'].includes(row.bucketId) ? row.bucketId : 'engineering';
      buckets[targetKey].push(row);
    });
  });
  return [
    { id: 'techStack', group: '技术栈', label: '技术栈', rows: buckets.techStack },
    { id: 'engineering', group: '核心技术特征', label: '工程实现', rows: buckets.engineering },
    { id: 'scene', group: '核心技术特征', label: '业务场景', rows: buckets.scene },
    { id: 'principle', group: '核心技术特征', label: '原理认知', rows: buckets.principle },
    { id: 'devTools', group: '核心技术特征', label: '开发工具', rows: buckets.devTools },
  ];
}

export function buildSoftGapRows(job = {}) {
  const details = job.match_details || {};
  const buckets = [
    { key: 'softQuality', label: '软素质' },
    { key: 'growthPotential', label: '成长潜力' },
  ];
  return buckets.flatMap(({ key, label }) => {
    const payload = details?.[key] || {};
    const merged = [...asArray(payload.missing), ...asArray(payload.level_mismatch)];
    const seen = new Set();
    return merged
      .filter((item) => {
        const token = compact(item?.jd_tag);
        if (!token || seen.has(token)) return false;
        seen.add(token);
        return true;
      })
      .map((item, index) => ({
        key: `${key}-${compact(item?.jd_tag) || index}`,
        categoryLabel: label,
        tag: compact(item?.jd_tag) || '--',
        studentTag: compact(item?.best_stu) || '--',
        studentLevel: Number(item?.best_stu_level || 0) || null,
        targetLevel: Number(item?.jd_level || 0) || null,
        status: item?.status || (item?.level_delta < 0 ? 'Missing' : 'Missing'),
        statusLabel: item?.level_delta < 0 ? '等级不足' : '缺失',
      }));
  });
}

export function getLaneDisplayMeta(laneId = '') {
  const map = {
    featured_safety: { label: '保守', parent: 'featured', accent: 'emerald' },
    featured_target: { label: '精准', parent: 'featured', accent: 'sky' },
    featured_reach: { label: '冲刺', parent: 'featured', accent: 'amber' },
    interest: { label: '猜你喜欢', parent: 'interest', accent: 'violet' },
    switch: { label: '换岗', parent: 'switch', accent: 'amber' },
  };
  return map[laneId] || { label: '岗位', parent: laneId, accent: 'emerald' };
}

export function createDraftBasket(previous = []) {
  const maxId = previous.reduce((current, item) => Math.max(current, Number(String(item.id || '').replace(/\D/g, '')) || 0), 0);
  return {
    id: `basket-${String(maxId + 1).padStart(3, '0')}`,
    status: 'Draft',
    createdAt: new Date().toISOString(),
    lastEditedAt: new Date().toISOString(),
    submittedAt: null,
    completedAt: null,
    progress: 0,
    jobIds: [],
  };
}

const HARVEST_LOCK_TTL_MS = 12 * 60 * 1000;

export function isBasketHarvesting(basket = {}) {
  if (!basket || typeof basket !== 'object') return false;
  if (String(basket.harvestStatus || '').toLowerCase() !== 'processing') return false;

  const startedAt = Date.parse(basket.harvestStartedAt || basket.submittedAt || '');
  if (!Number.isFinite(startedAt)) return true;
  return Date.now() - startedAt < HARVEST_LOCK_TTL_MS;
}

export function markBasketHarvestStarted(basket = {}) {
  const timestamp = new Date().toISOString();
  return {
    ...basket,
    status: 'Submitting',
    submittedAt: basket.submittedAt || timestamp,
    lastEditedAt: timestamp,
    progress: Math.max(5, Number(basket.progress || 0) || 0),
    harvestStatus: 'processing',
    harvestLockId: `${basket.id || 'basket'}-${Date.now()}`,
    harvestStartedAt: timestamp,
    harvestError: null,
  };
}

export function stripBasketHarvestLock(basket = {}) {
  const cleanBasket = { ...(basket || {}) };
  delete cleanBasket.harvestStatus;
  delete cleanBasket.harvestLockId;
  delete cleanBasket.harvestStartedAt;
  delete cleanBasket.harvestError;
  return cleanBasket;
}

export function clearBasketHarvestLock(basket = {}, patch = {}) {
  const timestamp = new Date().toISOString();
  return {
    ...stripBasketHarvestLock(basket),
    status: 'Draft',
    progress: 0,
    ...patch,
    lastEditedAt: timestamp,
    harvestFinishedAt: timestamp,
  };
}

export function buildBasketHistoryRecord(basket = {}, jobList = [], harvestRecord = null) {
  const completedAt = harvestRecord?.completedAt || new Date().toISOString();
  const rankings = Array.isArray(harvestRecord?.rankings) ? harvestRecord.rankings : [];
  const bestJob = rankings[0] || jobList[0] || null;

  return {
    ...basket,
    status: 'Harvested',
    submittedAt: basket.submittedAt || completedAt,
    completedAt,
    harvestId: harvestRecord?.id || null,
    jobIds: [...asArray(basket.jobIds)],
    jobSnapshots: jobList.map((job) => ({
      stableId: job.stableId,
      title: job.title,
      companyName: job.companyName,
      reportScore: getReportScore(job),
      matchScore: getMatchScore(job),
      goldScore: getGoldScore(job),
      confidenceCoefficient: getConfidenceCoefficient(job),
      studentCompetitivenessScore: getStudentCompetitivenessScore(job),
      jdStarCounts: job.jdStarCounts || {},
      scoreQuality: Number(job.score_quality || 0),
      exactMatchRatio: Number(job.exact_match_ratio || 0),
    })),
    bestJobId: harvestRecord?.bestJobId || bestJob?.stableId || null,
    bestJobTitle: harvestRecord?.bestJobTitle || (bestJob ? `${bestJob.title} @ ${bestJob.companyName}` : '暂无结果'),
    confidence: harvestRecord?.confidence || null,
  };
}

export function buildBasketComparison(jobList = []) {
  return [
    {
      label: '原始匹配分',
      values: jobList.map((job) => `${Math.round(getMatchScore(job))} 分`),
    },
    {
      label: '技术栈',
      values: jobList.map((job) => `${asArray(job.match_details?.techStack?.exact).length}/${Math.max(1, asArray(job.match_details?.techStack?.exact).length + asArray(job.match_details?.techStack?.fuzzy).length + asArray(job.match_details?.techStack?.missing).length)} 匹配`),
    },
    {
      label: '精确覆盖',
      values: jobList.map((job) => `${Math.round((job.exact_match_ratio || 0) * 100)}%`),
    },
    {
      label: '软素质',
      values: jobList.map((job) => `${Math.round(job.score_quality || 0)} / 100`),
    },
  ];
}

export function buildHarvestRecord(basket = {}, jobList = [], student = {}, analysis = '') {
  const ranking = [...jobList].sort((left, right) => getReportScore(right) - getReportScore(left));
  const bestJob = ranking[0] || null;
  const confidence = Math.max(55, Math.min(96, 64 + Math.round((bestJob?.exact_match_ratio || 0) * 28)));

  return {
    ...basket,
    status: 'Harvested',
    progress: 100,
    completedAt: new Date().toISOString(),
    overview: analysis || '基于当前篮子，系统已按最终报告分完成排序。优先查看排名第一岗位与 JD 对应关系。',
    confidence,
    bestJobId: bestJob?.stableId || null,
    bestJobTitle: bestJob ? `${bestJob.title} @ ${bestJob.companyName}` : '暂无结果',
    studentName: getStudentDisplayName(student),
    rankings: ranking.map((job, index) => ({
      stableId: job.stableId,
      rank: index + 1,
      title: job.title,
      companyName: job.companyName,
      reportScore: getReportScore(job),
      matchScore: getMatchScore(job),
      tagMatchScore: getTagMatchScore(job),
      jdStarScore: getJdStarScore(job),
      preConfidenceScore: getPreConfidenceScore(job),
      goldScore: getGoldScore(job),
      confidenceCoefficient: getConfidenceCoefficient(job),
      studentCompetitivenessScore: getStudentCompetitivenessScore(job),
      jdSplitAssessment: job.jdSplitAssessment || [],
      jdStarCounts: job.jdStarCounts || {},
      scoreFormula: job.scoreFormula || {},
      confidence: Math.max(50, Math.min(95, 58 + Math.round((job.exact_match_ratio || 0) * 32))),
    })),
  };
}

function bucketHours(learningTime = {}) {
  if (learningTime.mode === 'detailed' && learningTime.dailyHours) {
    return Object.values(learningTime.dailyHours).reduce((sum, item) => sum + (Number(item) || 0), 0);
  }
  return (Number(learningTime.weekdayHours) || 0) * 5 + (Number(learningTime.weekendHours) || 0) * 2;
}

export const GROWTH_POINT_RULES = {
  checkin: 5,
  theory: 10,
  project: 25,
};

export const GROWTH_RANKS = [
  { min: 0, title: '种子', desc: '刚埋下第一颗职业目标种子。' },
  { min: 60, title: '幼苗', desc: '已经形成稳定补强节奏。' },
  { min: 160, title: '小树', desc: '开始把短板变成可讲述的作品。' },
  { min: 320, title: '果树', desc: '目标岗位证据链逐渐成型。' },
  { min: 520, title: '丰收者', desc: '具备持续投递与复盘的闭环。' },
  { min: 800, title: '果园之王', desc: '行动、证据和表达都进入高成熟度。' },
];

export function getGrowthRank(points = 0) {
  const numeric = Math.max(0, Number(points) || 0);
  return [...GROWTH_RANKS].reverse().find((rank) => numeric >= rank.min) || GROWTH_RANKS[0];
}

function taskPointType(taskType = '') {
  const text = compact(taskType);
  if (/工程|项目|实战/.test(text)) return 'project';
  return 'theory';
}

function pointsForTaskType(taskType = '') {
  return GROWTH_POINT_RULES[taskPointType(taskType)] || GROWTH_POINT_RULES.theory;
}

function buildActionGapRows(job = {}, student = {}) {
  const buckets = buildTechnicalBuckets(job, student);
  const rows = buckets.flatMap((bucket) => bucket.rows
    .filter((row) => row.status !== 'Standard')
    .map((row) => {
      const isLevelGap = row.delta != null && row.delta < 0 && row.studentTag && row.studentTag !== '--';
      return {
        id: `${row.tagType || row.source}-${compact(row.jdQuery?.value || row.jdTag)}-${row.targetLevel || 0}`,
        name: compact(row.jdTag),
        tag: compact(row.jdQuery?.value || row.jdTag),
        tagType: row.tagType || row.source || 'techCapabilities',
        categoryLabel: bucket.label,
        severity: isLevelGap ? 'level_gap' : 'missing',
        statusLabel: isLevelGap ? '等级不足' : '缺失',
        currentLevel: row.studentLevel || 0,
        targetLevel: row.targetLevel || 2,
        studentTag: row.studentTag === '--' ? '' : row.studentTag,
        explanation: row.explanation,
      };
    }));

  const seen = new Set();
  const uniqueRows = rows.filter((row) => {
    const key = `${row.tagType}:${normalizeToken(row.tag || row.name)}`;
    if (!row.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueRows.length) return uniqueRows.slice(0, 6);

  return previewTags(job)
    .filter((item) => item.kind !== 'plus')
    .slice(0, 3)
    .map((item, index) => ({
      id: `preview-gap-${index + 1}`,
      name: item.text,
      tag: item.text,
      tagType: 'techCapabilities',
      categoryLabel: '岗位缺口',
      severity: item.kind === 'minus' ? 'missing' : 'level_gap',
      statusLabel: item.kind === 'minus' ? '缺失' : '相近/待补强',
      currentLevel: 0,
      targetLevel: 2,
      studentTag: '',
      explanation: item.text,
    }));
}

function buildSubTasksForGap(gap = {}, existingTask = {}) {
  const existingSubTasks = asArray(existingTask.sub_tasks || existingTask.subTasks);
  const findExisting = (id) => existingSubTasks.find((item) => item.id === id || item.key === id) || {};
  const levelText = gap.currentLevel
    ? `当前 Lv${gap.currentLevel}，目标 Lv${gap.targetLevel || 2}`
    : `目标 Lv${gap.targetLevel || 2}`;
  const rows = [
    {
      id: 'theory',
      type: '理论任务',
      pointType: 'theory',
      title: `${gap.name} 核心概念与面试高频点梳理`,
      detail: `${levelText}。先补齐定义、使用场景、常见坑和追问链路。`,
      estimatedHours: 2,
    },
    {
      id: 'project',
      type: '工程项目',
      pointType: 'project',
      title: `围绕 ${gap.name} 做一个可展示小项目`,
      detail: '产出仓库、截图、指标或复盘笔记，让这项短板变成可讲述证据。',
      estimatedHours: gap.severity === 'missing' ? 8 : 5,
    },
    {
      id: 'interview',
      type: '理论任务',
      pointType: 'theory',
      title: `把 ${gap.name} 写成简历与面试话术`,
      detail: '用 STAR 结构整理“问题-动作-结果”，准备 1 段 60 秒表达。',
      estimatedHours: 1.5,
    },
  ];

  return rows.map((row) => {
    const previous = findExisting(row.id);
    return {
      ...row,
      points: pointsForTaskType(row.type),
      completedAt: previous.completedAt || null,
      checked: Boolean(previous.checked || previous.completedAt),
    };
  });
}

function normalizeActionTask(task = {}, index = 0) {
  const subTasks = asArray(task.sub_tasks || task.subTasks);
  const completedCount = subTasks.filter((item) => item.checked || item.completedAt).length;
  const progress = subTasks.length
    ? Math.round((completedCount / subTasks.length) * 100)
    : Number(task.progress || 0) || 0;
  return {
    ...task,
    id: task.id || `gap-${index + 1}`,
    progress,
    sub_tasks: subTasks,
  };
}

export function normalizeActionPlan(plan = {}) {
  if (!plan || typeof plan !== 'object') return null;
  const tasks = asArray(plan.tasks).map(normalizeActionTask);
  const checkinRecords = asArray(plan.checkin_records || plan.checkinRecords);
  const completedTasks = tasks.reduce(
    (sum, task) => sum + asArray(task.sub_tasks).filter((item) => item.checked || item.completedAt).length,
    0,
  );
  const totalSubTasks = tasks.reduce((sum, task) => sum + asArray(task.sub_tasks).length, 0);
  const totalProgress = totalSubTasks
    ? Math.round((completedTasks / totalSubTasks) * 100)
    : Number(plan.totalProgress || 0) || 0;
  const growthPoints = Number(plan.growth_points ?? plan.growthPoints ?? plan.growth ?? 0) || 0;
  const rank = getGrowthRank(growthPoints);
  return {
    ...plan,
    tasks,
    sub_tasks: tasks.flatMap((task) => asArray(task.sub_tasks).map((item) => ({ ...item, taskId: task.id, gapName: task.title }))),
    checkin_records: checkinRecords,
    totalProgress,
    growth_points: growthPoints,
    growth: growthPoints,
    rankTitle: rank.title,
    rankDesc: rank.desc,
  };
}

export function renderStars(score) {
  const numeric = Number(score || 0);
  let stars = 1;
  if (numeric <= 3) {
    stars = Math.max(1, Math.min(3, Math.round(numeric) || 1));
  } else {
    if (numeric >= 90) stars = 3;
    else if (numeric >= 40) stars = 2;
  }
  return `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
}

export function buildActionPlan(targetJob = {}, student = {}, existing = {}) {
  const weeklyHours = bucketHours(student.learningTime || {});
  const gaps = buildActionGapRows(targetJob, student);
  const tasks = gaps.map((gap, index) => {
    const estimatedHours = gap.severity === 'missing' ? 16 + index * 4 : 10 + index * 3;
    const existingTask = asArray(existing.tasks).find((item) => item.id === `gap-${index + 1}` || item.title === gap.name) || {};
    const subTasks = buildSubTasksForGap(gap, existingTask);
    return {
      id: `gap-${index + 1}`,
      title: gap.name,
      tag: gap.tag || gap.name,
      tagType: gap.tagType || 'techCapabilities',
      categoryLabel: gap.categoryLabel || '岗位缺口',
      severity: gap.severity,
      statusLabel: gap.statusLabel,
      currentLevel: gap.currentLevel || 0,
      targetLevel: gap.targetLevel || 2,
      explanation: gap.explanation || '',
      estimatedHours,
      progress: subTasks.length
        ? Math.round((subTasks.filter((item) => item.checked || item.completedAt).length / subTasks.length) * 100)
        : 0,
      sub_tasks: subTasks,
      suggestions: subTasks.map((item) => ({
        type: item.type,
        text: item.title,
        hours: item.estimatedHours,
      })),
    };
  });

  const checkins = existing.checkins?.length
    ? existing.checkins
    : Array.from({ length: 30 }, (_, index) => ({ day: index, hours: 0 }));
  const checkinRecords = asArray(existing.checkin_records || existing.checkinRecords);
  const growth = Number(existing.growth_points ?? existing.growthPoints ?? existing.growth ?? 0) || 0;
  const rank = getGrowthRank(growth);

  return normalizeActionPlan({
    targetJobId: targetJob.stableId || null,
    targetTitle: targetJob.title || '待选定目标岗位',
    targetCompany: targetJob.companyName || '',
    targetDirection: targetJob.direction || '',
    targetJobType: targetJob.metadata?.jobType || '',
    targetJobIdDisplay: targetJob.id || targetJob.stableId || '',
    weeklyHours,
    countdownDays: Math.max(7, Math.round(((Number(student.preference?.expectedSalaryMin) || 0) + 60) / 3)),
    totalProgress: tasks.length
      ? Math.round(tasks.reduce((sum, item) => sum + item.progress, 0) / tasks.length)
      : 0,
    gaps,
    tasks,
    checkins,
    checkin_records: checkinRecords,
    internshipRecommendations: asArray(existing.internshipRecommendations),
    internshipRecommendedAt: existing.internshipRecommendedAt || null,
    growth_points: growth,
    growth,
    streak: Number(existing.streak || 0) || 0,
    rankTitle: rank.title,
    rankDesc: rank.desc,
    badges: [
      { id: 'first-checkin', label: '首次打卡', unlocked: checkinRecords.length > 0 },
      { id: 'first-theory', label: '理论破冰', unlocked: tasks.some((task) => asArray(task.sub_tasks).some((item) => item.pointType === 'theory' && (item.checked || item.completedAt))) },
      { id: 'first-project', label: '首个项目', unlocked: tasks.some((task) => asArray(task.sub_tasks).some((item) => item.pointType === 'project' && (item.checked || item.completedAt))) },
      { id: 'week-champion', label: '连续 7 天', unlocked: Number(existing.streak || 0) >= 7 },
      { id: 'orchard-king', label: '果园之王', unlocked: growth >= 800 },
    ],
  });
}

function classifySkill(name = '') {
  if (LANGUAGE_TAGS.has(name)) return '语言';
  if (FRAMEWORK_TAGS.has(name)) return '框架';
  if (CLOUD_TAGS.has(name)) return '云平台 & 容器';
  if (TOOL_TAGS.has(name)) return '开发与协作工具';
  return '通用技术';
}

export function buildProfileSnapshot(student = {}, events = []) {
  const stackGroups = {};
  asArray(student.techStack).forEach((item) => {
    const group = classifySkill(item.name);
    stackGroups[group] ||= [];
    stackGroups[group].push({
      name: item.name,
      levelRequired: Number(item.levelRequired || seededLevel(item.name)),
    });
  });
  asArray(student.devTools).forEach((item) => {
    const group = classifySkill(item.name);
    stackGroups[group] ||= [];
    stackGroups[group].push({
      name: item.name,
      levelRequired: Number(item.levelRequired || seededLevel(item.name)),
    });
  });

  const capabilityGroups = { engineering: [], scene: [], principle: [] };
  asArray(student.techCapabilities).forEach((item) => {
    const type = compact(item.type || 'engineering');
    if (!capabilityGroups[type]) capabilityGroups[type] = [];
    capabilityGroups[type].push(Number(item.levelRequired || 2));
  });

  const dimension = (key) => {
    const values = capabilityGroups[key] || [];
    if (!values.length) return 55;
    return Math.round((values.reduce((sum, item) => sum + item, 0) / values.length) * 25);
  };

  const completenessChecks = [
    asArray(student.techStack).length > 0,
    asArray(student.techCapabilities).length > 0,
    asArray(student.devTools).length > 0,
    asArray(student.softQuality).length > 0,
    Boolean(student.basicInfo?.schoolName),
    Boolean(student.preference?.expectedEmploymentDate),
  ];

  return {
    name: getStudentDisplayName(student),
    completeness: Math.round((completenessChecks.filter(Boolean).length / completenessChecks.length) * 100),
    schoolName: student.basicInfo?.schoolName || '待补充',
    schoolMajor: student.basicInfo?.schoolMajor || '待补充',
    educationLevel: student.basicInfo?.educationLevel || '待补充',
    graduationYear: student.basicInfo?.graduationYear || '待补充',
    stackGroups,
    dimensions: {
      engineering: dimension('engineering'),
      scene: dimension('scene'),
      principle: dimension('principle'),
    },
    softQualities: asArray(student.softQuality).map((item) => ({
      name: item.name || '未命名',
      levelRequired: Number(item.levelRequired || seededLevel(item.name)),
    })),
    recentChanges: events.slice(0, 4).map((item) => ({
      title: item.title,
      tags: item.tags,
      happenedAt: item.happenedAt,
    })),
  };
}

export function syncStudentProfile(student = {}, event = {}) {
  const next = structuredClone(student || {});
  next.techStack ||= [];
  next.devTools ||= [];
  next.profileEvents ||= [];

  const tags = asArray(event.tags).map(compact).filter(Boolean);
  tags.forEach((tag) => {
    const bucket = TOOL_TAGS.has(tag) || CLOUD_TAGS.has(tag) ? next.devTools : next.techStack;
    const existing = bucket.find((item) => compact(item.name) === tag);
    if (existing) {
      existing.levelRequired = Math.min(4, Number(existing.levelRequired || 1) + 1);
    } else {
      bucket.push({ name: tag, levelRequired: 1 });
    }
  });

  next.profileEvents.unshift({
    title: event.title,
    type: event.type,
    tags,
    summary: event.summary,
    happenedAt: new Date().toISOString(),
  });
  return next;
}

export function createEmptyWorkspace() {
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
    basketHistory: [],
    harvests: [],
    savedReports: [],
    targetJobId: null,
    selectedHarvestId: null,
    selectedReportJobId: null,
    actionPlan: null,
    profileEvents: [],
  };
}
