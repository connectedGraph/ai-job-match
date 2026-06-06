export const MATCH_STORAGE_KEYS = {
  history: 'match_history_orchard_v2',
  inputDraft: 'match_input_orchard_v2',
  workspace: 'match_workspace_orchard_v3',  // v3：三槽结构，旧 v2 数据自动丢弃
};

export const MATCH_VIEWS = [
  {
    id: 'explore',
    label: '探索',
    english: 'Explore',
    route: '/match/explore',
    desc: '岗位推荐主战场',
    accent: 'emerald',
  },
  {
    id: 'basket',
    label: '篮子',
    english: 'Basket',
    route: '/match/basket',
    desc: '唯一活跃篮子',
    accent: 'amber',
  },
  {
    id: 'harvest',
    label: '收割记录',
    english: 'Harvest',
    route: '/match/harvest',
    desc: '报告与历史',
    accent: 'orange',
  },
  {
    id: 'action',
    label: '行动计划',
    english: 'Action Plan',
    route: '/match/action',
    desc: '成长任务与打卡',
    accent: 'red',
  },
  {
    id: 'profile',
    label: '我的画像',
    english: 'Profile',
    route: '/match/profile',
    desc: '能力与变化趋势',
    accent: 'sky',
  },
];

export const RECOMMENDATION_LANES = [
  {
    id: 'featured',
    source: 'featured',   // 后端 lanes.featured：Safety+Target+Reach 三档混合精准推荐
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
    description: '从你当前求职方向中，挑选与精选槽去重后的高匹配岗位。适合在主赛道已有保底后继续横向探索。',
  },
  {
    id: 'switch',
    source: 'switch',
    label: '换岗路径',
    english: 'Switch',
    tag: '职业转型探索',
    accent: 'amber',
    description: '系统性列出跨方向可迁移岗位，按可迁移命中与原始匹配从高到低排列。适合主动探索职业转型路径。',
  },
];

export const RESERVED_ENDPOINTS = [
  { id: 'match', method: 'POST', path: '/api/match', live: true, desc: '岗位召回与三梯度推荐' },
  { id: 'check', method: 'POST', path: '/api/match/check', live: false, desc: '岗位准入核查，占位接口' },
  { id: 'basket-upsert', method: 'PUT', path: '/api/match/basket/active', live: false, desc: '当前篮子增删改，占位接口' },
  { id: 'basket-submit', method: 'POST', path: '/api/match/basket/submit', live: false, desc: '篮子提交与排队，占位接口' },
  { id: 'harvest-report', method: 'GET', path: '/api/match/harvest/{basketId}', live: false, desc: '收割总览与深度报告，占位接口' },
  { id: 'action-plan', method: 'POST', path: '/api/match/action-plan', live: false, desc: '行动计划生成，占位接口' },
  { id: 'profile-sync', method: 'POST', path: '/api/match/profile/sync-event', live: false, desc: '事件同步画像，占位接口' },
];

export const DEMO_STUDENT = {
    "student_id": "STU_889900",
    "direction": "嵌入式 / 硬件开发（IoT、单片机、驱动）",
    "domains": [],
    "techStack": [
        {
            "name": "React",
            "levelRequired": 3
        },
        {
            "name": "MySQL",
            "levelRequired": 2
        }
    ],
    "techCapability": [
        {
            "name": "模块/接口设计",
            "skill": "模块/接口设计",
            "skillZh": "模块/接口设计",
            "rawExtractedText": "模块/接口设计",
            "normalizedTag": null,
            "type": "engineering",
            "domain": "软件工程",
            "levelRequired": 2,
            "evidence": ""
        }
    ],
    "techCapabilities": [
        {
            "name": "模块/接口设计",
            "skill": "模块/接口设计",
            "skillZh": "模块/接口设计",
            "rawExtractedText": "模块/接口设计",
            "normalizedTag": null,
            "type": "engineering",
            "domain": "软件工程",
            "levelRequired": 2,
            "evidence": ""
        }
    ],
    "devTools": [
        {
            "name": "Git",
            "levelRequired": 4
        }
    ],
    "basicInfo": {
        "name": "张三",
        "schoolName": "浙江大学",
        "schoolMajor": "软件工程",
        "educationLevel": "本科",
        "graduationYear": 2026,
        "graduationMonth": 6,
        "graduationProvince": "浙江",
        "certificates": [
            {
                "name": "英语四级",
                "level": "四级",
                "note": "",
                "date": "",
                "tags": []
            }
        ]
    },
    "summary": "前端基础扎实，学习意愿强，具备持续成长潜力。热爱开源技术，具备良好的团队协作能力。",
    "explicitMetrics": {
        "graduationCity": "广州市",
        "schoolTags": [
            "985",
            "211",
            "双一流"
        ]
    },
    "preference": {
        "preferredCities": [
            "北京",
            "上海",
            "广州"
        ],
        "expectedSalaryMin": 15,
        "expectedSalaryMax": 20,
        "willingToTravel": false,
        "willingToRelocate": true,
        "jobTarget": "fulltime",
        "expectedEmploymentDate": "2026-07",
        "currentPlan": "job",
        "currentPlanNote": ""
    },
    "learningTime": {
        "mode": "simple",
        "weekdayHours": 2,
        "weekendHours": 4,
        "dailyHours": {
            "mon": 2,
            "tue": 2,
            "wed": 2,
            "thu": 2,
            "fri": 2,
            "sat": 4,
            "sun": 4
        }
    },
    "experiences": {
        "internship": [
            {
                "companyName": "某科技公司",
                "positionName": "前端实习生",
                "jobDesc": "负责活动页面开发、组件封装与联调测试（3个月）。主导了公司核心产品营销页面的重构，使用 React + Tailwind 提升了页面加载速度。",
                "startDate": "2023-07",
                "endDate": "2023-09",
                "tags": [
                    "前端",
                    "全职"
                ],
                "experience_id": "INT_001"
            }
        ],
        "projects": [
            {
                "projectName": "电商前台重构",
                "roleName": "前端开发",
                "jobDesc": "重构首页、列表页与结算流程，将首屏加载时间从 3s 降低至 1.2s。",
                "startDate": "2023-03",
                "endDate": "2023-06",
                "tags": [
                    "团队项目",
                    "前端"
                ],
                "experience_id": "PRJ_001"
            },
            {
                "projectName": "个人博客",
                "roleName": "独立开发",
                "jobDesc": "基于 Next.js 搭建，实现 SEO 优化，后端采用 Node.js + MongoDB。",
                "startDate": "2022-10",
                "endDate": "2023-01",
                "tags": [
                    "个人项目"
                ],
                "experience_id": "PRJ_002"
            }
        ],
        "competition": [
            {
                "competitionName": "蓝桥杯",
                "award": "省级二等奖",
                "roleName": "个人参赛",
                "date": "2023-04",
                "startDate": "",
                "endDate": "",
                "tags": [
                    "省级",
                    "个人赛"
                ],
                "experience_id": "CMP_001"
            }
        ],
        "research": [
            {
                "labName": "智能系统实验室",
                "direction": "推荐系统",
                "roleName": "参与者",
                "startDate": "2022-09",
                "endDate": "2023-06",
                "tags": [
                    "推荐系统"
                ],
                "experience_id": "RES_001"
            }
        ],
        "campus": [
            {
                "orgName": "软件工程2101班",
                "position": "班长",
                "duty": "组织班级活动，协调师生沟通，多次获评优秀班干部。",
                "startDate": "2021-09",
                "endDate": "2023-06",
                "tags": [
                    "班委",
                    "院级"
                ],
                "experience_id": "CAM_001"
            }
        ],
        "learning": [
            {
                "type": "self_study",
                "skill": "Python",
                "semester": "大二上",
                "notes": "学习基础语法、函数、面向对象及常用标准库",
                "startDate": "2022-09",
                "endDate": "2022-12",
                "tags": [
                    "教材自学"
                ],
                "experience_id": "LRN_001"
            },
            {
                "type": "self_study_with_project",
                "skill": "Vue3",
                "semester": "",
                "notes": "通过官方文档学习 Composition API",
                "startDate": "2023-01",
                "endDate": "",
                "tags": [
                    "官方文档"
                ],
                "experience_id": "LRN_002"
            }
        ]
    }
};

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

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function compact(value) {
  return String(value || '').trim();
}

function sanitizePreviewText(value) {
  return compact(value).replace(/^【[^】]+】/, '').replace(/^[-~+]/, '').trim();
}

function branchMetaFromDetail(item = {}) {
  const groupName = compact(item?.branch_group_name || '');
  const requiredCount = Math.max(0, Number(item?.branch_required_count || 0) || 0);
  const optionCount = Math.max(requiredCount, Number(item?.branch_option_count || 0) || 0);
  const similarCount = Math.max(0, Number(item?.branch_similar_count || 0) || 0);
  const matchedCount = Math.max(0, Number(item?.branch_matched_count || 0) || 0);
  const missingCount = Math.max(0, Number(item?.branch_missing_count || 0) || 0);
  return {
    isBranch: Boolean(groupName && requiredCount),
    groupId: compact(item?.group_id || groupName),
    groupName,
    requiredCount,
    optionCount,
    similarCount,
    matchedCount,
    missingCount,
    groupStatus: compact(item?.branch_group_status || ''),
  };
}

function formatBranchRuleText(branchMeta = {}) {
  if (!branchMeta.requiredCount) return '';
  if (branchMeta.optionCount) return `${branchMeta.optionCount}选${branchMeta.requiredCount}`;
  return `至少满足 ${branchMeta.requiredCount} 项`;
}

function branchPreviewKind(branchMeta = {}) {
  if (branchMeta.missingCount > 0) return 'minus';
  if ((branchMeta.groupStatus || '').toLowerCase() === 'similar' || branchMeta.similarCount > 0) return 'sim';
  return 'plus';
}

function branchPreviewText(branchMeta = {}) {
  const base = `${branchMeta.groupName} ${formatBranchRuleText(branchMeta)}`.trim();
  if (branchMeta.missingCount > 0) return `${base} 还差 ${branchMeta.missingCount} 项`;
  if (branchPreviewKind(branchMeta) === 'sim') return `${base} 相近满足`;
  return `${base} 已满足`;
}

function buildBranchPreviewTags(job = {}) {
  const techDetails = [
    ...asArray(job?.match_details?.techStack?.exact),
    ...asArray(job?.match_details?.techStack?.fuzzy),
    ...asArray(job?.match_details?.techStack?.missing),
  ];
  const groups = new Map();
  techDetails.forEach((item) => {
    const branchMeta = branchMetaFromDetail(item);
    if (!branchMeta.isBranch) return;
    const key = branchMeta.groupId || branchMeta.groupName;
    if (!key || groups.has(key)) return;
    groups.set(key, {
      kind: branchPreviewKind(branchMeta),
      text: branchPreviewText(branchMeta),
    });
  });
  return Array.from(groups.values());
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

export function getDefaultMatchInput() {
  return JSON.stringify(DEMO_STUDENT, null, 2);
}

export function parseStudentInput(text) {
  return JSON.parse(text || '{}');
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
      ?? job.competitiveness_score
      ?? job.competitivenessScore
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
  const items = [
    ...buildBranchPreviewTags(job),
    ...asArray(job.overflows).slice(0, 2).map((item) => ({ kind: 'plus', text: sanitizePreviewText(item) })),
    ...asArray(job.similars).slice(0, 2).map((item) => ({ kind: 'sim', text: sanitizePreviewText(item) })),
    ...asArray(job.missings).slice(0, 2).map((item) => ({ kind: 'minus', text: sanitizePreviewText(item) })),
  ];
  return items.slice(0, 4);
}

export function normalizeMatchJobs(matchData = {}, previousJobs = {}) {
  const jobsById = {};
  const lanes = {};

  // 归一化单个岗位数组 → stableIds，同时填充 jobsById
  function normalizeJobList(rows, laneId, laneLabel) {
    return asArray(rows).map((job, index) => {
      // compact(undefined) 会得到字符串 "undefined"，必须先判断值存在
      const rawId = job.id != null ? String(job.id).trim() : '';
      const stableId =
        rawId ||
        `${laneId}-${compact(job.title) || 'untitled'}-${compact(job.companyName) || 'company'}-${index}`;
      const previous = previousJobs[stableId];
      jobsById[stableId] = {
        ...job,
        stableId,
        lane: laneId,
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

  // ── Featured：新后端返回 { safety, target, reach } 对象 ──────────────────
  const featuredRaw = matchData?.lanes?.featured;
  if (featuredRaw && typeof featuredRaw === 'object' && !Array.isArray(featuredRaw)) {
    // 新格式：三个子槽
    lanes['featured_safety'] = normalizeJobList(featuredRaw.safety, 'featured_safety', '保守槽');
    lanes['featured_target'] = normalizeJobList(featuredRaw.target, 'featured_target', '精准槽');
    lanes['featured_reach'] = normalizeJobList(featuredRaw.reach, 'featured_reach', '冲刺槽');
    // 合并平铺数组保留 lanes.featured，供兼容旧逻辑（basketJobs 等）使用
    lanes['featured'] = [
      ...lanes['featured_safety'],
      ...lanes['featured_target'],
      ...lanes['featured_reach'],
    ];
  } else if (Array.isArray(featuredRaw)) {
    // 兼容旧后端平铺数组
    lanes['featured'] = normalizeJobList(featuredRaw, 'featured', '精选推荐');
    lanes['featured_safety'] = [];
    lanes['featured_target'] = [];
    lanes['featured_reach'] = [];
  } else if (matchData?.topJobs) {
    // 最旧格式：topJobs.safety/target/reach
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

  // ── Interest / Switch：仍然是平铺数组 ───────────────────────────────────
  lanes['interest'] = normalizeJobList(
    matchData?.lanes?.interest || [],
    'interest',
    '猜你喜欢',
  );
  lanes['switch'] = normalizeJobList(
    matchData?.lanes?.switch || [],
    'switch',
    '换岗推荐',
  );
  lanes['unqualified'] = normalizeJobList(
    matchData?.lanes?.unqualified || [],
    'unqualified',
    '未达标岗位',
  );

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
    overview: analysis || '基于当前画像，系统已完成最终报告分排序。优先查看排名第一岗位与补短建议。',
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
      goldScore: getGoldScore(job),
      confidenceCoefficient: getConfidenceCoefficient(job),
      studentCompetitivenessScore: getStudentCompetitivenessScore(job),
      jdSplitAssessment: job.jdSplitAssessment || [],
      jdStarCounts: job.jdStarCounts || {},
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

function gapRowsFromJob(job = {}) {
  const rows = [];
  asArray(job.missings).slice(0, 2).forEach((item) => rows.push({ name: sanitizePreviewText(item), severity: 'missing' }));
  asArray(job.level_mismatches).slice(0, 2).forEach((item) => rows.push({ name: sanitizePreviewText(item), severity: 'gap' }));
  if (!rows.length) {
    previewTags(job).slice(0, 2).forEach((item) => rows.push({ name: item.text, severity: item.kind === 'minus' ? 'missing' : 'gap' }));
  }
  return rows;
}

export function buildActionPlan(targetJob = {}, student = {}, existing = {}) {
  const weeklyHours = bucketHours(student.learningTime || {});
  const gaps = gapRowsFromJob(targetJob);
  const tasks = gaps.map((gap, index) => {
    const estimatedHours = gap.severity === 'missing' ? 16 + index * 4 : 10 + index * 3;
    return {
      id: `gap-${index + 1}`,
      title: gap.name,
      severity: gap.severity,
      estimatedHours,
      progress: existing.tasks?.find((item) => item.id === `gap-${index + 1}`)?.progress || 0,
      suggestions: [
        { type: '理论任务', text: `${gap.name} 核心概念梳理`, hours: Math.max(2, Math.round(estimatedHours * 0.25)) },
        { type: '工程项目', text: `围绕 ${gap.name} 搭建一个可展示 Demo`, hours: Math.max(4, Math.round(estimatedHours * 0.5)) },
        { type: '实战补强', text: `补一段能覆盖 ${gap.name} 的项目或实习经历`, hours: Math.max(3, Math.round(estimatedHours * 0.25)) },
      ],
    };
  });

  const checkins = existing.checkins?.length
    ? existing.checkins
    : Array.from({ length: 30 }, (_, index) => ({ day: index, hours: index > 21 ? (index % 4) : 0 }));
  const growth = existing.growth || 236;
  const streak = existing.streak || 3;

  return {
    targetJobId: targetJob.stableId || null,
    targetTitle: targetJob.title || '待选定目标岗位',
    targetCompany: targetJob.companyName || '',
    weeklyHours,
    countdownDays: Math.max(7, Math.round(((Number(student.preference?.expectedSalaryMin) || 0) + 60) / 3)),
    totalProgress: tasks.length
      ? Math.round(tasks.reduce((sum, item) => sum + item.progress, 0) / tasks.length)
      : 0,
    tasks,
    checkins,
    growth,
    streak,
    badges: [
      { id: 'first-checkin', label: '首次打卡', unlocked: true },
      { id: 'three-days', label: '连续 3 天', unlocked: streak >= 3 },
      { id: 'first-project', label: '首个项目', unlocked: growth >= 180 },
      { id: 'week-champion', label: '周冠军', unlocked: streak >= 7 },
      { id: 'profile-sync', label: '画像同步', unlocked: growth >= 260 },
    ],
  };
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
