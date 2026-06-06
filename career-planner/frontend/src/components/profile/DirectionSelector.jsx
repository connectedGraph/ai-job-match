import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Tags, X } from 'lucide-react';
import { DIRECTION_GROUPS } from '../../constants';
import { useData } from '../../context/DataContext';
import api from '../../services/api';

const RECOMMEND_LIMIT = 6;
const EMPTY_DOMAIN_STATE = {
  options: [],
  loading: false,
  error: '',
  nextPage: 0,
  totalCandidateCount: 0,
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const normalizeDirectionList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const single = String(value || '').trim();
  return single ? [single] : [];
};

const directionNameOf = (item) => (typeof item === 'string' ? item : String(item?.name || '').trim());
const directionDescOf = (item) => (typeof item === 'string' ? '' : String(item?.desc || '').trim());

const displayDomainName = (item) => String(item?.name || item?.domain || item?.normalizedTag || '').trim();
const normalizedDomainName = (item) => String(item?.normalizedTag || item?.domain || item?.name || '').trim();

const buildDomainItem = (option) => ({
  name: displayDomainName(option),
  tagId: option.domainId || option.tagId || '',
  normalizedTag: normalizedDomainName(option),
});

const domainExists = (list, option) => {
  const next = buildDomainItem(option);
  return list.some((item) => {
    const sameId = next.tagId && item.tagId === next.tagId;
    const sameNormalized =
      next.normalizedTag &&
      normalizedDomainName(item).toLowerCase() === next.normalizedTag.toLowerCase();
    return sameId || sameNormalized;
  });
};

const DirectionSelector = () => {
  const { studentData, setStudentData } = useData();
  const selectedDirections = useMemo(
    () => normalizeDirectionList(studentData.direction),
    [studentData.direction],
  );
  const techDomains = Array.isArray(studentData.techDomains) ? studentData.techDomains : [];

  const [domainState, setDomainState] = useState(EMPTY_DOMAIN_STATE);
  const [domainSearch, setDomainSearch] = useState({
    query: '',
    options: [],
    loading: false,
    error: '',
    searched: false,
  });

  const persist = (nextData) => {
    setStudentData(nextData);
  };

  const toggleDirection = (name) => {
    const nextDirections = selectedDirections.includes(name)
      ? selectedDirections.filter((item) => item !== name)
      : [...selectedDirections, name];
    persist({ ...studentData, direction: nextDirections });
  };

  const loadDomainRecommendations = async (page = 0) => {
    setDomainState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await api.get('/api/student-profile/tech-domains/recommendations', {
        params: { limit: RECOMMEND_LIMIT, page, min_frequency: 5 },
      });
      setDomainState({
        options: Array.isArray(result.options) ? result.options : [],
        loading: false,
        error: '',
        nextPage: Number(result.nextPage) || 0,
        totalCandidateCount: Number(result.totalCandidateCount) || 0,
      });
    } catch (error) {
      setDomainState((current) => ({
        ...current,
        loading: false,
        error: error.message || '推荐标签加载失败',
      }));
    }
  };

  useEffect(() => {
    loadDomainRecommendations(0);
  }, []);

  const runDomainSearch = async () => {
    const query = domainSearch.query.trim();
    if (!query) {
      setDomainSearch((current) => ({ ...current, options: [], error: '', searched: false }));
      return;
    }

    setDomainSearch((current) => ({ ...current, loading: true, error: '', searched: false }));
    try {
      const result = await api.get('/api/student-profile/tech-domains/search', {
        params: { query, limit: RECOMMEND_LIMIT, min_frequency: 5 },
      });
      setDomainSearch((current) => ({
        ...current,
        loading: false,
        searched: true,
        options: Array.isArray(result.options) ? result.options : [],
      }));
    } catch (error) {
      setDomainSearch((current) => ({
        ...current,
        loading: false,
        searched: true,
        options: [],
        error: error.message || '标签搜索失败',
      }));
    }
  };

  const addDomain = (option) => {
    if (domainExists(techDomains, option)) return;
    persist({
      ...studentData,
      techDomains: [...techDomains, buildDomainItem(option)],
    });
  };

  const removeDomain = (index) => {
    persist({
      ...studentData,
      techDomains: techDomains.filter((_, itemIndex) => itemIndex !== index),
    });
  };

  const removeDirection = (name) => {
    persist({
      ...studentData,
      direction: selectedDirections.filter((item) => item !== name),
    });
  };

  const renderDomainOption = (option, source) => {
    const isSelected = domainExists(techDomains, option);
    return (
      <button
        key={`${source}:${option.domainId || option.tagId || option.normalizedTag || option.name}`}
        type="button"
        onClick={() => addDomain(option)}
        disabled={isSelected}
        className={`rounded-full border px-3 py-1.5 text-sm transition ${
          isSelected
            ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
            : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700'
        }`}
      >
        {displayDomainName(option)}
      </button>
    );
  };

  return (
    <section className="overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_20px_60px_rgba(59,130,246,0.08)]">
      <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Tags size={20} />
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">方向标签</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              这里恢复为多选。先选你想重点探索的岗位方向，再补充更细的技术方向标签。
            </p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            当前已选 <span className="font-semibold">{selectedDirections.length}</span> 个方向
          </div>
        </div>
      </div>

      <div className="space-y-8 px-6 py-6 sm:px-8">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">已选方向</h3>
            <p className="mt-1 text-sm text-slate-500">会以字符串数组形式保存在画像里，支持多选。</p>
          </div>

          <div className="flex min-h-[52px] flex-wrap items-center gap-2 rounded-[24px] border border-blue-100 bg-blue-50/50 px-4 py-3">
            {selectedDirections.length > 0 ? (
              selectedDirections.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => removeDirection(item)}
                    className="text-white/80 transition hover:text-white"
                  >
                    <X size={13} />
                  </button>
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-400">尚未选择方向</span>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">岗位方向集群</h3>
            <p className="mt-1 text-sm text-slate-500">
              每个方向都带了简短解释，方便学生先看懂再选，不用只靠岗位名猜。
            </p>
          </div>

          <div className="space-y-4">
            {DIRECTION_GROUPS.map((group) => (
              <section
                key={group.title}
                className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5"
              >
                <div className="mb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-semibold text-slate-900">{group.title}</h4>
                    {group.subtitle && (
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        {group.subtitle}
                      </span>
                    )}
                  </div>
                  {group.desc && <p className="mt-2 text-sm leading-6 text-slate-500">{group.desc}</p>}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {group.items.map((item) => {
                    const name = directionNameOf(item);
                    const desc = directionDescOf(item);
                    const selected = selectedDirections.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleDirection(name)}
                        className={`rounded-[20px] border p-4 text-left transition ${
                          selected
                            ? 'border-blue-600 bg-blue-600 text-white shadow-[0_16px_40px_rgba(37,99,235,0.18)]'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-semibold">{name}</div>
                          <div
                            className={`mt-0.5 h-5 w-5 rounded-full border ${
                              selected ? 'border-white bg-white/20' : 'border-slate-300 bg-white'
                            }`}
                          />
                        </div>
                        {desc && (
                          <p className={`mt-2 text-sm leading-6 ${selected ? 'text-white/85' : 'text-slate-500'}`}>
                            {desc}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">具体技术方向标签</h3>
              <p className="mt-1 text-sm text-slate-500">搜索或从推荐里补充更细的技术方向。</p>
            </div>

            <div className="flex min-h-[52px] flex-wrap items-center gap-2 rounded-[24px] border border-slate-200 bg-white px-4 py-3">
              {techDomains.length > 0 ? (
                techDomains.map((item, index) => (
                  <span
                    key={`${item.tagId || item.normalizedTag}-${index}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700"
                  >
                    {displayDomainName(item)}
                    <button
                      type="button"
                      onClick={() => removeDomain(index)}
                      className="text-blue-400 transition hover:text-blue-700"
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-400">尚未选择具体标签</span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={domainSearch.query}
                onChange={(event) =>
                  setDomainSearch((current) => ({
                    ...current,
                    query: event.target.value,
                    options: [],
                    error: '',
                    searched: false,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    runDomainSearch();
                  }
                }}
                className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                placeholder="搜索技术方向，例如 LLM、Computer Vision、数据平台"
              />
              <button
                type="button"
                onClick={runDomainSearch}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-[0_14px_34px_rgba(37,99,235,0.22)] transition hover:bg-blue-700"
              >
                <Search size={14} />
                搜索
              </button>
            </div>

            {domainSearch.loading && <p className="text-sm text-slate-400">正在搜索标签...</p>}
            {domainSearch.error && <p className="text-sm text-red-500">{domainSearch.error}</p>}
            {!domainSearch.loading && domainSearch.searched && domainSearch.options.length === 0 && !domainSearch.error && (
              <p className="text-sm text-slate-400">没有找到匹配标签，可以试更短的关键词。</p>
            )}

            {domainSearch.options.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-900">搜索结果</h4>
                <div className="flex flex-wrap gap-2">
                  {domainSearch.options.map((option) => renderDomainOption(option, 'search'))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-[24px] border border-blue-100 bg-blue-50/50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">推荐标签</h3>
                <p className="mt-1 text-sm text-slate-500">从岗位库里挑出更常见的技术方向。</p>
              </div>

              <button
                type="button"
                onClick={() => loadDomainRecommendations(domainState.nextPage)}
                disabled={domainState.loading}
                className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={14} className={domainState.loading ? 'animate-spin' : ''} />
                换一批
              </button>
            </div>

            {domainState.error && <p className="text-sm text-red-500">{domainState.error}</p>}

            <div className="flex flex-wrap gap-2">
              {domainState.options.map((option) => renderDomainOption(option, 'recommend'))}
            </div>

            {!domainState.loading && domainState.options.length === 0 && !domainState.error && (
              <p className="text-sm text-slate-400">暂时没有可用推荐标签。</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default DirectionSelector;
