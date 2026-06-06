import React, { useState } from 'react';
import {
  Brain,
  Layers,
  Microscope,
  Network,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Toolbox,
} from 'lucide-react';
import SkillItem from './SkillItem';
import { useData } from '../../context/DataContext';
import api from '../../services/api';

const TYPE_META = {
  engineering: {
    label: '工程能力',
    icon: Settings,
    color: 'amber',
    desc: '工程实现、质量治理、性能优化与协作。',
  },
  scene: {
    label: '场景能力',
    icon: Network,
    color: 'blue',
    desc: '系统设计、业务建模与复杂场景处理。',
  },
  principle: {
    label: '原理能力',
    icon: Microscope,
    color: 'emerald',
    desc: '计算机基础、通信协议与底层原理。',
  },
};

const TAG_TYPE_BY_CATEGORY = {
  techStack: 'techStack',
  techCapability: 'techCapabilities',
  devTools: 'devTools',
};

const EMPTY_SEARCH_STATE = {
  query: '',
  options: [],
  loading: false,
  error: '',
  hasSearched: false,
};

const EMPTY_RECOMMENDATION_STATE = {
  options: [],
  groups: { high: [], mid: [], tail: [], random: [] },
  loading: false,
  error: '',
  loaded: false,
  nextOffset: 0,
  nextPage: 0,
  totalCandidateCount: 0,
};

const displayNameOf = (item) =>
  String(item?.name || item?.displayName || item?.skillZh || item?.normalizedTag || item?.skill || '').trim();

const normalizedNameOf = (item) =>
  String(item?.normalizedTag || item?.skill || item?.name || '').trim();

const buildStandardItem = (option, overrides = {}) => {
  const nameZh = displayNameOf(option);
  const normalizedTag = normalizedNameOf(option);
  const item = {
    tagId: option.tagId || '',
    name: nameZh || normalizedTag,
    normalizedTag,
    levelRequired: Number(option.levelRequired) || 2,
    ...overrides,
  };
  if (option.type && !item.type) item.type = option.type;
  if (option.domain && !item.domain) item.domain = option.domain;
  if (Array.isArray(option.matchedDomains) && option.matchedDomains[0] && !item.domain) {
    item.domain = displayNameOf(option.matchedDomains[0]);
  }
  return item;
};

const skillExists = (list, item) => {
  const nextNormalized = normalizedNameOf(item).toLowerCase();
  const nextName = displayNameOf(item).toLowerCase();
  return list.some((current) => {
    const currentNormalized = normalizedNameOf(current).toLowerCase();
    const currentName = displayNameOf(current).toLowerCase();
    return (
      (nextNormalized && currentNormalized === nextNormalized) ||
      (nextName && currentName === nextName)
    );
  });
};

const colorClasses = (type) => {
  if (type === 'scene') return 'bg-sky-50 text-sky-700 border-sky-200';
  if (type === 'principle') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
};

const TagSearchBox = ({
  state,
  placeholder,
  onQueryChange,
  onSearch,
  onAddCustom,
  onSelect,
}) => (
  <div className="w-full">
    <div className="flex gap-2">
      <input
        type="text"
        value={state.query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSearch();
          }
        }}
        className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 shadow-sm bg-white"
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={onSearch}
        className="px-3 py-2 text-sm rounded-lg border font-semibold bg-white text-blue-700 border-blue-200 hover:bg-blue-50 inline-flex items-center gap-1.5 no-print"
      >
        <Search size={14} />
        搜索
      </button>
      <button
        type="button"
        onClick={onAddCustom}
      className="px-3 py-2 text-sm rounded-lg border font-semibold bg-white text-slate-600 border-slate-200 hover:bg-slate-50 no-print"
      >
        自填添加
      </button>
    </div>
    {state.error && <div className="mt-2 text-xs text-red-500">{state.error}</div>}
    {state.loading && <div className="mt-2 text-xs text-gray-400">正在搜索专业技能标准词...</div>}
    {!state.loading && !state.error && state.hasSearched && state.query.trim() && state.options.length === 0 && (
      <div className="mt-2 text-xs text-red-500">
        未找到相似标准词，可以换个说法搜索，或点击“自填添加”保留当前输入。
      </div>
    )}
    {!state.loading && state.options.length > 0 && (
      <div className="mt-2 rounded-2xl border border-blue-100 bg-white shadow-sm overflow-hidden">
        {state.options.map((option) => (
          <button
            key={`${option.tagType}:${option.tagId || option.normalizedTag}`}
            type="button"
            onClick={() => onSelect(option)}
            className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 last:border-b-0"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-800">{displayNameOf(option)}</span>
              <span className="text-[11px] text-gray-400">freq {option.jobCount || 0}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-gray-400">{normalizedNameOf(option)}</div>
          </button>
        ))}
      </div>
    )}
  </div>
);

const RecommendationPanel = ({
  state,
  title,
  description,
  emptyText = '暂无可推荐的高频标准词。',
  groupLabels = {
    high: '高频',
    mid: '中频',
    tail: '长尾',
    random: '随机探索',
  },
  onRefresh,
  onSelect,
}) => (
  <div className="rounded-3xl border border-blue-100 bg-white p-4 mb-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-bold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{description}</div>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onRefresh}
          disabled={state.loading}
          className="px-3 py-1.5 rounded-2xl text-xs font-semibold border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-60 inline-flex items-center gap-1.5 no-print"
        >
          <RefreshCw size={13} className={state.loading ? 'animate-spin' : ''} />
          {state.loaded ? '换一批' : '加载推荐'}
        </button>
        <button
          type="button"
          onClick={() => {}}
          disabled
          className="hidden no-print"
        >
          填入本批
        </button>
      </div>
    </div>

    {state.error && <div className="mt-2 text-xs text-red-500">{state.error}</div>}
    {!state.error && state.loaded && state.options.length === 0 && (
      <div className="mt-2 text-xs text-red-500">{emptyText}</div>
    )}
    {Object.entries(state.groups || {}).some(([, items]) => Array.isArray(items) && items.length > 0) ? (
      <div className="mt-3 space-y-2">
        {Object.entries(groupLabels).map(([groupKey, label]) => {
          const items = Array.isArray(state.groups?.[groupKey]) ? state.groups[groupKey] : [];
          if (items.length === 0) return null;
          return (
            <div key={groupKey}>
              <div className="mb-1 text-[10px] font-black text-blue-500 uppercase tracking-[0.16em]">{label}</div>
              <div className="flex flex-wrap gap-2">
                {items.map((option) => (
                  <button
                    key={`${groupKey}:${option.tagType}:${option.tagId || option.normalizedTag}`}
                    type="button"
                    onClick={() => onSelect?.(option)}
                    className="inline-flex flex-col px-3 py-2 rounded-lg border border-blue-100 bg-white shadow-sm text-left hover:border-blue-300 hover:bg-white/80 hover:shadow transition-all"
                  >
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-gray-800">{displayNameOf(option)}</span>
                      {option.type && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${colorClasses(option.type)}`}>
                          {option.type}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      freq {option.jobCount || 0} · {normalizedNameOf(option)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    ) : state.options.length > 0 && (
      <div className="mt-3 flex flex-wrap gap-2">
        {state.options.map((option) => (
          <button
            key={`${option.tagType}:${option.tagId || option.normalizedTag}`}
            type="button"
            onClick={() => onSelect?.(option)}
            className="inline-flex flex-col px-3 py-2 rounded-lg border border-blue-100 bg-white shadow-sm text-left hover:border-blue-300 hover:bg-white/80 hover:shadow transition-all"
          >
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-gray-800">{displayNameOf(option)}</span>
              {option.type && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${colorClasses(option.type)}`}>
                  {option.type}
                </span>
              )}
            </span>
            <span className="text-[10px] text-gray-400">
              freq {option.jobCount || 0} · {normalizedNameOf(option)}
            </span>
          </button>
        ))}
      </div>
    )}
    {state.totalCandidateCount > 0 && (
      <div className="mt-2 text-[11px] text-gray-400">
        高频候选 {state.totalCandidateCount} 个，按频率排序分批展示。
      </div>
    )}
  </div>
);

const SkillsModule = () => {
  const { studentData, setStudentData, saveData } = useData();
  const [searchState, setSearchState] = useState({});
  const [recommendationState, setRecommendationState] = useState({});

  const techStack = studentData.techStack || [];
  const techCapability = studentData.techCapability || studentData.techCapabilities || [];
  const devTools = studentData.devTools || [];
  const techDomains = studentData.techDomains || [];

  const getSearchState = (key) => searchState[key] || EMPTY_SEARCH_STATE;
  const getRecommendationState = (key) => recommendationState[key] || EMPTY_RECOMMENDATION_STATE;

  const setSearchPatch = (key, patch) => {
    setSearchState((current) => ({
      ...current,
      [key]: {
        ...EMPTY_SEARCH_STATE,
        ...(current[key] || {}),
        ...patch,
      },
    }));
  };

  const setRecommendationPatch = (key, patch) => {
    setRecommendationState((current) => ({
      ...current,
      [key]: {
        ...EMPTY_RECOMMENDATION_STATE,
        ...(current[key] || {}),
        ...patch,
      },
    }));
  };

  const updateCategory = (category, list) => {
    const newData = {
      ...studentData,
      [category]: list,
    };
    if (category === 'techCapability') {
      newData.techCapabilities = list.map((item) => ({ ...item }));
    }
    setStudentData(newData);
    saveData(newData);
  };

  const addItem = (category, item) => {
    const list = [...(studentData[category] || [])];
    if (skillExists(list, item)) return false;
    updateCategory(category, [...list, item]);
    return true;
  };

  const addCustomItem = (key, category, overrides = {}) => {
    const state = getSearchState(key);
    const name = state.query.trim();
    if (!name) return;
    const added = addItem(category, { name, tagId: '', normalizedTag: '', levelRequired: 2, ...overrides });
    if (added) setSearchPatch(key, { query: '', options: [], error: '', hasSearched: false });
  };

  const selectStandardItem = (key, category, option, overrides = {}) => {
    const added = addItem(category, buildStandardItem(option, overrides));
    if (added) setSearchPatch(key, { query: '', options: [], error: '', hasSearched: false });
  };

  const runTagSearch = async (key, tagType, type = '') => {
    const query = getSearchState(key).query.trim();
    if (!query) {
      setSearchPatch(key, { options: [], error: '', hasSearched: false });
      return;
    }
    setSearchPatch(key, { loading: true, error: '', hasSearched: false });
    try {
      const result = await api.get('/api/student-profile/professional-skills/search', {
        params: {
          query,
          category: Object.entries(TAG_TYPE_BY_CATEGORY).find(([, value]) => value === tagType)?.[0] || 'techCapability',
          type,
          limit: 5,
          min_similarity: 0.7,
        },
      });
      setSearchPatch(key, {
        loading: false,
        options: Array.isArray(result.options) ? result.options : [],
        hasSearched: true,
      });
    } catch (error) {
      setSearchPatch(key, {
        loading: false,
        options: [],
        error: error.message || 'Tag Center 搜索失败',
        hasSearched: false,
      });
    }
  };

  const runRecommendations = async (category, page = null) => {
    const key = category;
    const current = getRecommendationState(key);
    const list = studentData[category] || [];
    const domainIds = techDomains.map((item) => item.tagId).filter(Boolean).join(',');
    const domains = techDomains.map((item) => normalizedNameOf(item)).filter(Boolean).join(',');
    if (category === 'techCapability' && !domainIds && !domains) {
      setRecommendationPatch(key, {
        loading: false,
        loaded: true,
        options: [],
        groups: { high: [], mid: [], tail: [], random: [] },
        totalCandidateCount: 0,
        error: '',
      });
      return;
    }
    setRecommendationPatch(key, { loading: true, error: '' });
    try {
      const result = await api.get('/api/student-profile/professional-skills/recommendations', {
        params: {
          category,
          limit: 10,
          page: page ?? current.nextPage ?? 0,
          min_frequency: 10,
          exclude_tag_ids: list.map((item) => item.tagId).filter(Boolean).join(','),
          exclude_values: list.map((item) => normalizedNameOf(item) || displayNameOf(item)).filter(Boolean).join(','),
          domain_ids: category === 'techCapability' ? domainIds : '',
          domains: category === 'techCapability' ? domains : '',
          random_seed: `${category}:${page ?? current.nextPage ?? 0}:${domains}`,
        },
      });
      setRecommendationPatch(key, {
        loading: false,
        loaded: true,
        options: Array.isArray(result.options) ? result.options : [],
        groups: result.groups || { high: [], mid: [], tail: [], random: [] },
        nextOffset: Number(result.nextOffset) || 0,
        nextPage: Number(result.nextPage) || 0,
        totalCandidateCount: Number(result.totalCandidateCount) || 0,
      });
    } catch (error) {
      setRecommendationPatch(key, {
        loading: false,
        loaded: true,
        options: [],
        groups: { high: [], mid: [], tail: [], random: [] },
        error: error.message || '推荐加载失败',
      });
    }
  };

  const selectRecommendedItem = (category, option, overrides = {}) => {
    addItem(category, buildStandardItem(option, overrides));
  };

  const handleDelete = (category, index) => {
    const list = [...(studentData[category] || [])];
    list.splice(index, 1);
    updateCategory(category, list);
  };

  const handleLevelChange = (category, index, levelRequired) => {
    const list = [...(studentData[category] || [])];
    list[index] = { ...list[index], levelRequired };
    updateCategory(category, list);
  };

  const renderTagSearch = (key, category, placeholder, overrides = {}) => (
    <TagSearchBox
      state={getSearchState(key)}
      placeholder={placeholder}
      onQueryChange={(query) => setSearchPatch(key, { query, options: [], error: '', hasSearched: false })}
      onSearch={() => runTagSearch(key, TAG_TYPE_BY_CATEGORY[category], overrides.type || '')}
      onAddCustom={() => addCustomItem(key, category, overrides)}
      onSelect={(option) => selectStandardItem(key, category, option, overrides)}
    />
  );

  return (
    <div className="p-8 pb-4">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <h2 className="text-xl font-bold text-gray-800 section-title">
          专业技能构建
          <span className="text-xs font-normal text-gray-400 ml-2">
            1=了解 2=熟悉 3=掌握 4=熟练
          </span>
        </h2>
        <button
          type="button"
          onClick={() => {
            runRecommendations('techCapability', 0);
            runRecommendations('devTools', 0);
          }}
          className="text-xs font-semibold px-3 py-1.5 rounded-2xl border transition-colors bg-white text-blue-700 border-blue-200 hover:bg-blue-50 flex items-center gap-1.5 no-print"
        >
          <Sparkles size={14} />
          刷新技术画像推荐
        </button>
      </div>

      <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm space-y-8">
        <section>
          <div className="flex items-center mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mr-3">
              <Layers size={18} />
            </div>
            <h3 className="text-base font-bold text-gray-800">
              技术栈
              <span className="text-xs font-normal text-gray-500 ml-2">
                语言、框架、数据库、云平台...
              </span>
            </h3>
          </div>
          <div className="flex flex-wrap pl-11 mb-1">
            {techStack.map((item, index) => (
              <SkillItem
                key={`${item.tagId || item.normalizedTag || item.name}-${index}`}
                item={item}
                category="techStack"
                index={index}
                onDelete={handleDelete}
                onLevelChange={handleLevelChange}
              />
            ))}
          </div>
          <div className="pl-11">
            {renderTagSearch('techStack', 'techStack', '搜索中文技术栈，例如 Python / React / MySQL')}
          </div>
        </section>

        <div className="w-full h-px bg-gray-200"></div>

        <section>
          <div className="flex items-center mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mr-3">
              <Brain size={18} />
            </div>
            <h3 className="text-base font-bold text-gray-800">
              统一技术画像
              <span className="text-xs font-normal text-gray-500 ml-2">
                按 engineering / scene / principle 分类填写
              </span>
            </h3>
          </div>

          <div className="pl-11 space-y-4">
            <RecommendationPanel
              state={getRecommendationState('techCapability')}
              title="高频统一技术画像推荐"
              description={
                techDomains.length
                  ? `按已选技术方向推荐：${techDomains.map((item) => displayNameOf(item)).join('、')}`
                  : '先在“技术方向”里选择方向 tag，再推荐对应 domain 下的高频能力。'
              }
              emptyText={
                techDomains.length
                  ? '当前技术方向下暂无可推荐的高频标准词，可以换一批方向 tag。'
                  : '请先在“技术方向”里选择方向 tag。'
              }
              onRefresh={() => runRecommendations('techCapability')}
              onSelect={(option) => selectRecommendedItem('techCapability', option)}
            />
            {Object.entries(TYPE_META).map(([type, meta]) => {
              const Icon = meta.icon;
              const filtered = techCapability.filter(
                (item) => item.type === type || (!item.type && type === 'engineering')
              );
              const searchKey = `techCapability:${type}`;

              return (
                <div key={type} className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl ${colorClasses(type)} flex items-center justify-center flex-shrink-0 border`}
                      >
                        <Icon size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-gray-800">{meta.label}</h4>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${colorClasses(type)}`}>
                            {type}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{meta.desc}</p>
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400">已填 {filtered.length} 项</span>
                  </div>

                  <div className="flex flex-wrap mb-3 min-h-[2.5rem]">
                    {filtered.length > 0 ? (
                      filtered.map((item, index) => (
                        <SkillItem
                          key={`${item.tagId || item.normalizedTag || item.name}-${index}`}
                          item={item}
                          category="techCapability"
                          index={techCapability.indexOf(item)}
                          onDelete={handleDelete}
                          onLevelChange={handleLevelChange}
                        />
                      ))
                    ) : (
                      <div className="text-xs text-gray-400 italic px-1 py-2">暂未填写该类技术画像</div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-2 no-print">
                      中文语义搜索 / 自定义补充
                    </label>
                    {renderTagSearch(searchKey, 'techCapability', '搜索能力名称，例如 算法、系统设计、RAG', { type })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="w-full h-px bg-gray-200"></div>

        <section>
          <div className="flex items-center mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mr-3">
              <Toolbox size={18} />
            </div>
            <h3 className="text-base font-bold text-gray-800">开发与协作工具</h3>
          </div>
          <div className="flex flex-wrap pl-11 mb-1">
            {devTools.map((item, index) => (
              <SkillItem
                key={`${item.tagId || item.normalizedTag || item.name}-${index}`}
                item={item}
                category="devTools"
                index={index}
                onDelete={handleDelete}
                onLevelChange={handleLevelChange}
              />
            ))}
          </div>
          <div className="pl-11">
            <RecommendationPanel
              state={getRecommendationState('devTools')}
              title="高频开发与协作工具推荐"
              description="来自 Tag Center 中 jobCount > 10 的工具标准词，适合快速补齐 Git、Docker、Jira 等工具画像。"
              onRefresh={() => runRecommendations('devTools')}
              onSelect={(option) => selectRecommendedItem('devTools', option)}
            />
            {renderTagSearch('devTools', 'devTools', '搜索中文工具，例如 Git / Docker / Jira')}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SkillsModule;
