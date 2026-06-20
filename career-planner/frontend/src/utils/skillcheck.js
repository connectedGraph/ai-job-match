const VALID_CATEGORIES = new Set(['techStack', 'techCapability', 'devTools']);
const VALID_OPS = new Set(['add', 'delete']);
const VALID_CAPABILITY_TYPES = new Set(['engineering', 'scene', 'principle']);

const CATEGORY_ALIASES = {
  techCapabilities: 'techCapability',
};

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const asArray = (value) => (Array.isArray(value) ? value : []);

const cleanText = (value) => String(value || '').trim();

const lowerText = (value) => cleanText(value).toLowerCase();

const uniq = (values) => Array.from(new Set(values.map(cleanText).filter(Boolean)));

const normalizeCategory = (category) => {
  const next = CATEGORY_ALIASES[category] || category;
  return VALID_CATEGORIES.has(next) ? next : '';
};

const normalizeOp = (op) => {
  const next = lowerText(op);
  return VALID_OPS.has(next) ? next : '';
};

const normalizeCapabilityType = (type) => {
  const next = lowerText(type);
  return VALID_CAPABILITY_TYPES.has(next) ? next : '';
};

const clampLevel = (level, fallback = 1) => {
  const numeric = Number(level);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(4, Math.round(numeric)));
};

export const displayNameOf = (item) => {
  if (typeof item === 'string') return item.trim();
  return cleanText(item?.name || item?.skillName || item?.displayName || item?.skillZh || item?.normalizedTag || item?.skill);
};

export const normalizedNameOf = (item) => {
  if (typeof item === 'string') return item.trim();
  return cleanText(item?.normalizedTag || item?.skill || item?.name || item?.skillName || item?.displayName || item?.skillZh);
};

export const skillName = (item) => displayNameOf(item);

export const skillNames = (studentData, key) => {
  const names = asArray(studentData?.[key]).map(skillName).filter(Boolean);
  return names.length > 0 ? names.join('、') : '无';
};

const appliedSkillNames = (aiResults) =>
  uniq(
    asArray(aiResults?.skillcheck?.changes)
      .filter((change) => change?._applied)
      .flatMap((change) => [
        change.name,
        change.skillName,
        change.resolvedName,
        change.originalName,
        change.skillZh,
        change.normalizedTag,
      ])
  );

export const buildSkillTaskPayload = (studentData, aiResults = {}) => ({
  studentProfile: studentData,
  techNames: skillNames(studentData, 'techStack'),
  capNames: skillNames(studentData, 'techCapability'),
  toolNames: skillNames(studentData, 'devTools'),
  appliedNames: appliedSkillNames(aiResults),
});

const normalizeChange = (change) => {
  if (!isPlainObject(change)) return null;
  const category = normalizeCategory(change.category);
  const op = normalizeOp(change.op);
  const name = displayNameOf(change);
  if (!category || !op || !name) return null;

  const originalName = cleanText(change.originalName) || name;
  const rawType = normalizeCapabilityType(change.type);
  const type = category === 'techCapability' && op === 'add'
    ? rawType || 'engineering'
    : rawType;

  return {
    ...change,
    op,
    category,
    name,
    originalName,
    type,
    levelRequired: op === 'delete' ? 0 : clampLevel(change.levelRequired),
    inference: cleanText(change.inference),
    reasoning: cleanText(change.reasoning || change.inference),
  };
};

const semanticMatch = async (api, change) => {
  try {
    const result = await api.get('/api/student-profile/professional-skills/search', {
      params: {
        query: change.name,
        category: change.category,
        limit: 1,
        min_similarity: 0.7,
      },
    });
    const option = asArray(result?.options)[0];
    if (!option) {
      return { ...change, match: { matched: false } };
    }

    const resolvedName = displayNameOf(option) || change.name;
    const resolvedType = change.category === 'techCapability'
      ? normalizeCapabilityType(option.type) || normalizeCapabilityType(change.type) || 'engineering'
      : '';

    return {
      ...change,
      originalName: change.originalName || change.name,
      name: resolvedName,
      resolvedName,
      displayName: resolvedName,
      tagId: cleanText(option.tagId || change.tagId),
      tagType: cleanText(option.tagType || change.tagType),
      normalizedTag: normalizedNameOf(option) || normalizedNameOf(change) || resolvedName,
      skill: cleanText(option.skill || change.skill),
      skillZh: cleanText(option.skillZh || resolvedName),
      domain: cleanText(option.domain || change.domain),
      type: resolvedType,
      typeCounts: option.typeCounts || change.typeCounts,
      jobCount: option.jobCount ?? change.jobCount,
      match: {
        matched: true,
        similarity: option.similarity,
        rankScore: option.rankScore,
        scoreSource: option.scoreSource,
      },
    };
  } catch (error) {
    return {
      ...change,
      match: {
        matched: false,
        error: error?.message || 'semantic search failed',
      },
    };
  }
};

const changeIdentity = (change) => {
  const id = lowerText(change.tagId);
  if (id) return [change.op, change.category, 'tag', id].join('::');

  const normalized = lowerText(change.normalizedTag || change.skill);
  if (normalized) return [change.op, change.category, 'normalized', normalized].join('::');

  return [
    change.op,
    change.category,
    change.category === 'techCapability' ? change.type || 'engineering' : '',
    lowerText(change.name),
  ].join('::');
};

const dedupeChanges = (changes) => {
  const order = [];
  const byKey = new Map();

  changes.forEach((change) => {
    const key = changeIdentity(change);
    const existing = byKey.get(key);
    if (!existing) {
      order.push(key);
      byKey.set(key, change);
      return;
    }
    if (!existing.match?.matched && change.match?.matched) {
      byKey.set(key, change);
    }
  });

  return order.map((key) => byKey.get(key));
};

export const resolveSkillcheckResult = async (api, result) => {
  const base = Array.isArray(result) ? { changes: result } : (isPlainObject(result) ? result : {});
  const normalized = asArray(base.changes).map(normalizeChange).filter(Boolean);
  const resolved = await Promise.all(
    normalized.map((change) => (change.op === 'add' ? semanticMatch(api, change) : change))
  );

  return {
    ...base,
    changes: dedupeChanges(resolved),
    resolvedAt: new Date().toISOString(),
  };
};

const skillKeys = (item) =>
  uniq([
    item?.tagId,
    item?.normalizedTag,
    item?.skill,
    item?.skillZh,
    item?.skillName,
    item?.displayName,
    item?.resolvedName,
    item?.originalName,
    item?.name,
  ]).map((value) => value.toLowerCase());

const hasSkill = (list, item) => {
  const nextKeys = new Set(skillKeys(item));
  if (!nextKeys.size) return false;
  return list.some((current) => skillKeys(current).some((key) => nextKeys.has(key)));
};

const matchesSkill = (current, change) => hasSkill([current], change);

const cloneSkill = (item) => {
  if (typeof item === 'string') return { name: item.trim(), levelRequired: 1 };
  return isPlainObject(item) ? { ...item } : null;
};

const cloneSkillList = (items) =>
  asArray(items).map(cloneSkill).filter((item) => item?.name);

const buildSkillItem = (change) => {
  const name = displayNameOf(change);
  const item = {
    name,
    levelRequired: clampLevel(change.levelRequired),
  };

  ['tagId', 'normalizedTag', 'skill', 'skillZh', 'domain'].forEach((key) => {
    const value = cleanText(change[key]);
    if (value) item[key] = value;
  });

  if (change.category === 'techCapability') {
    item.type = normalizeCapabilityType(change.type) || 'engineering';
  }

  return item;
};

const addChangedNames = (set, change) => {
  [
    change.name,
    change.skillName,
    change.resolvedName,
    change.originalName,
    change.skillZh,
    change.normalizedTag,
    change.skill,
  ].forEach((value) => {
    const key = lowerText(value);
    if (key) set.add(key);
  });
};

const clearInferForSkills = (infer, changedNames) => {
  if (!isPlainObject(infer)) return infer;
  const inferences = asArray(infer.inferences).filter((item) => {
    const keys = skillKeys({
      name: item.skillName,
      normalizedTag: item.normalizedTag,
      skill: item.skill,
      skillZh: item.skillZh,
    });
    return !keys.some((key) => changedNames.has(key));
  });
  return { ...infer, inferences };
};

export const applySkillcheckChanges = ({ studentData, aiResults, indices }) => {
  const skillcheck = isPlainObject(aiResults?.skillcheck) ? aiResults.skillcheck : {};
  const changes = asArray(skillcheck.changes).map((change) => ({ ...change }));
  const pending = changes
    .map((change, originalIndex) => ({ change, originalIndex }))
    .filter(({ change }) => !change?._applied);
  const selected = new Set(
    asArray(indices).length ? asArray(indices).map((index) => Number(index)) : pending.map((_, index) => index)
  );

  const nextStudentData = {
    ...(isPlainObject(studentData) ? studentData : {}),
    techStack: cloneSkillList(studentData?.techStack),
    techCapability: cloneSkillList(studentData?.techCapability || studentData?.techCapabilities),
    devTools: cloneSkillList(studentData?.devTools),
  };

  let applied = 0;
  const changedNames = new Set();
  const appliedAt = new Date().toISOString();

  pending.forEach(({ change, originalIndex }, pendingIndex) => {
    if (!selected.has(pendingIndex)) return;
    let didApply = false;

    if (change.op === 'delete') {
      const list = asArray(nextStudentData[change.category]);
      nextStudentData[change.category] = list.filter((item) => !matchesSkill(item, change));
      didApply = true;
    }

    if (change.op === 'add') {
      const item = buildSkillItem(change);
      const list = asArray(nextStudentData[change.category]);
      if (!hasSkill(list, item)) {
        nextStudentData[change.category] = [...list, item];
      }
      didApply = true;
    }

    if (!didApply) return;
    applied += 1;
    addChangedNames(changedNames, change);
    changes[originalIndex] = {
      ...change,
      _applied: true,
      appliedAt,
    };
  });

  nextStudentData.techCapabilities = cloneSkillList(nextStudentData.techCapability);

  const nextAiResults = {
    ...(isPlainObject(aiResults) ? aiResults : {}),
    skillcheck: {
      ...skillcheck,
      changes,
      completedAt: skillcheck.completedAt || appliedAt,
    },
  };

  if (applied > 0) {
    nextAiResults.infer = clearInferForSkills(nextAiResults.infer, changedNames);
  }

  return {
    studentData: nextStudentData,
    aiResults: nextAiResults,
    applied,
  };
};
