const EXPERIENCE_TYPES = ["internship", "projects", "competition", "research", "campus", "learning"];
const EXPERIENCE_TYPE_CODES = {
  internship: "INT",
  projects: "PRO",
  competition: "COM",
  research: "RES",
  campus: "CAM",
  learning: "LEA",
};

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const asArray = (value) => (Array.isArray(value) ? value : []);

const normalizeTags = (tags) => asArray(tags).map((tag) => String(tag || "").trim()).filter(Boolean);
const normalizeDirectionList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const single = String(value || "").trim();
  return single ? [single] : [];
};

const normalizeSkillLevelRequired = (value, fallback = 1) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(4, Math.round(numeric)));
};

const normalizeDimensionLevelRequired = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(1, Math.min(4, Math.round(numeric)));
};

const normalizeSkillList = (list) =>
  asArray(list)
    .map((item) => {
      if (typeof item === "string") {
        const name = item.trim();
        return name ? { name, levelRequired: 1 } : null;
      }
      if (!isPlainObject(item)) return null;
      return {
        ...item,
        name: String(item.name || item.skill || item.normalizedTag || "").trim(),
        levelRequired: normalizeSkillLevelRequired(item.levelRequired, 1),
      };
    })
    .filter((item) => item?.name);

const normalizeDomainList = (list) =>
  asArray(list)
    .map((item) => {
      if (typeof item === "string") {
        const name = item.trim();
        return name ? { name, tagId: "", normalizedTag: name } : null;
      }
      if (!isPlainObject(item)) return null;
      const normalizedTag = String(item.normalizedTag || item.domain || item.name || "").trim();
      const name = String(item.name || item.displayName || item.domain || normalizedTag || "").trim();
      return name ? { name, tagId: String(item.tagId || item.domainId || "").trim(), normalizedTag } : null;
    })
    .filter((item) => item?.name);

const normalizeCertificate = (item) => {
  if (typeof item === "string") {
    const name = item.trim();
    return name ? { name, level: "", note: "", date: "", tags: [] } : null;
  }
  if (!isPlainObject(item)) return null;
  return {
    ...item,
    name: String(item.name || item.certificateName || item.title || item.certName || "").trim(),
    level: String(item.level || item.grade || item.certificateLevel || "").trim(),
    note: String(item.note || item.description || item.desc || item.details || "").trim(),
    date: String(item.date || item.issueDate || item.awardedAt || "").trim(),
    tags: normalizeTags(item.tags),
  };
};

const normalizeExperience = (item) => {
  if (!isPlainObject(item)) return null;
  return {
    ...item,
    tags: normalizeTags(item.tags),
  };
};

export function createExperienceId(type) {
  return `${String(type || "EXP").slice(0, 3).toUpperCase()}_${Date.now()}`;
}

export function buildExperienceDisplayId(type, index) {
  const prefix = EXPERIENCE_TYPE_CODES[type] || "EXP";
  return `${prefix}-${String(index + 1).padStart(2, "0")}`;
}

export function formatExperienceDateRange(startDate, endDate) {
  if (!startDate) return "";
  return `${startDate} ~ ${endDate || "至今"}`;
}

export function getExperienceDisplay(type, item = {}) {
  const fallbackDate = formatExperienceDateRange(item.startDate, item.endDate) || item.dateRange || item.date || "";
  const fallbackTitle = item.title || item.name || "";
  const fallbackSub = item.subTitle || item.company || item.orgName || "";
  const fallbackDesc = item.description || item.desc || item.note || item.notes || "";

  switch (type) {
    case "internship":
      return {
        title: item.companyName || item.company || fallbackTitle || "未填写公司",
        sub: item.positionName || item.roleName || fallbackSub || "",
        desc: item.jobDesc || fallbackDesc || "",
        date: fallbackDate,
      };
    case "projects":
      return {
        title: item.projectName || fallbackTitle || "未填写项目名",
        sub: item.roleName || fallbackSub || "",
        desc: item.jobDesc || fallbackDesc || "",
        date: fallbackDate,
      };
    case "competition":
      return {
        title: item.competitionName || fallbackTitle || "未填写竞赛",
        sub: item.award || item.roleName || fallbackSub || "",
        desc: item.roleName || fallbackDesc || "",
        date: item.date || fallbackDate,
      };
    case "research":
      return {
        title: item.labName || fallbackTitle || "未填写实验室",
        sub: item.direction || fallbackSub || "",
        desc: item.roleName ? `角色：${item.roleName}` : fallbackDesc,
        date: fallbackDate,
      };
    case "campus":
      return {
        title: item.orgName || fallbackTitle || "未填写组织",
        sub: item.position || fallbackSub || "",
        desc: item.duty || fallbackDesc || "",
        date: fallbackDate,
      };
    case "learning":
      return {
        title: item.skill || fallbackTitle || "未填写技能",
        sub:
          item.type === "course"
            ? "课程学习"
            : item.type === "self_study"
              ? "自主学习"
              : item.type === "self_study_with_project"
                ? "实战学习"
                : fallbackSub || "",
        desc: item.notes || fallbackDesc || "",
        date: item.semester || fallbackDate,
      };
    case "certificates":
      return {
        title: item.name || item.certificateName || fallbackTitle || "未填写证书",
        sub: item.level || fallbackSub || "",
        desc: item.note || fallbackDesc || "",
        date: item.date || fallbackDate,
      };
    default:
      return {
        title: fallbackTitle || "经历",
        sub: fallbackSub || "",
        desc: fallbackDesc || "",
        date: fallbackDate,
      };
  }
}

export function normalizeStudentData(data) {
  const source = isPlainObject(data) ? data : {};
  const basicInfo = isPlainObject(source.basicInfo) ? source.basicInfo : {};
  const explicitMetrics = isPlainObject(source.explicitMetrics) ? source.explicitMetrics : {};
  const preference = isPlainObject(source.preference) ? source.preference : {};
  const learningTime = isPlainObject(source.learningTime) ? source.learningTime : {};
  const sourceExperiences = isPlainObject(source.experiences) ? source.experiences : {};
  const techCapability = normalizeSkillList(source.techCapability || source.techCapabilities);

  const experiences = EXPERIENCE_TYPES.reduce((acc, type) => {
    acc[type] = asArray(sourceExperiences[type]).map(normalizeExperience).filter(Boolean);
    return acc;
  }, {});

  return {
    ...source,
    student_id: source.student_id || `STU_${Math.floor(Math.random() * 900000 + 100000)}`,
    direction: normalizeDirectionList(source.direction || source.profile?.techDirection),
    domains: asArray(source.domains).filter(Boolean),
    techDomains: normalizeDomainList(source.techDomains),
    techStack: normalizeSkillList(source.techStack),
    techCapability,
    techCapabilities: asArray(source.techCapabilities).length ? normalizeSkillList(source.techCapabilities) : techCapability.map((item) => ({ ...item })),
    devTools: normalizeSkillList(source.devTools),
    softQuality: normalizeAiDimensionList(source.softQuality),
    growthPotential: normalizeAiDimensionList(source.growthPotential),
    basicInfo: {
      ...basicInfo,
      name: basicInfo.name || "",
      schoolName: basicInfo.schoolName || "",
      schoolMajor: basicInfo.schoolMajor || "",
      educationLevel: basicInfo.educationLevel || "本科",
      graduationYear: basicInfo.graduationYear ?? "",
      graduationMonth: basicInfo.graduationMonth ?? "",
      graduationProvince: basicInfo.graduationProvince || "",
      certificates: asArray(basicInfo.certificates).map(normalizeCertificate).filter(Boolean),
    },
    summary: typeof source.summary === "string" ? source.summary : "",
    explicitMetrics: {
      ...explicitMetrics,
      graduationCity: explicitMetrics.graduationCity || "",
      schoolTags: normalizeTags(explicitMetrics.schoolTags),
    },
    preference: {
      ...preference,
      preferredCities: asArray(preference.preferredCities),
      jobTarget: preference.jobTarget || "both",
      currentPlan: preference.currentPlan || "",
      currentPlanNote: preference.currentPlanNote || "",
      expectedEmploymentDate: preference.expectedEmploymentDate || "",
    },
    learningTime,
    experiences,
  };
}

export function normalizeAiDimensionList(value) {
  const rawList = Array.isArray(value) ? value : asArray(value?.dimensions);
  return rawList.filter(isPlainObject).map((item) => ({
    ...item,
    name: String(item.name || "").trim(),
    levelRequired: normalizeDimensionLevelRequired(item.levelRequired),
  })).filter((item) => item.name);
}

export function normalizeAiResults(data) {
  const source = isPlainObject(data) ? data : {};
  return {
    ...source,
    completeness: source.completeness || null,
    skillcheck: source.skillcheck || null,
    infer: source.infer || null,
    inferBindings: isPlainObject(source.inferBindings) ? source.inferBindings : {},
    softQuality: normalizeAiDimensionList(source.softQuality),
    growthPotential: normalizeAiDimensionList(source.growthPotential),
  };
}

const activeDimensionList = (value) =>
  normalizeAiDimensionList(value).filter((item) => Number(item.levelRequired || 0) > 0);

const preferAiDimensionList = (studentList, aiList) => {
  const normalizedAiList = activeDimensionList(aiList);
  if (normalizedAiList.length > 0) return normalizedAiList;
  return activeDimensionList(studentList);
};

export function buildMatchStudentPayload(studentData, aiResults = {}) {
  const normalizedStudent = normalizeStudentData(studentData);
  const normalizedAi = normalizeAiResults(aiResults);
  return normalizeStudentData({
    ...normalizedStudent,
    softQuality: preferAiDimensionList(normalizedStudent.softQuality, normalizedAi.softQuality),
    growthPotential: preferAiDimensionList(normalizedStudent.growthPotential, normalizedAi.growthPotential),
  });
}
