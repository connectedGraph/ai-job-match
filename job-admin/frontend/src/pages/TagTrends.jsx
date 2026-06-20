import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useApi } from '../hooks/useApi';

const TREND_STYLES = {
  rising:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  stable_growth: 'bg-sky-50 text-sky-700 border-sky-200',
  stable:        'bg-gray-50 text-gray-500 border-gray-200',
  declining:     'bg-amber-50 text-amber-700 border-amber-200',
  cold:          'bg-rose-50 text-rose-600 border-rose-200',
};

const TREND_LABELS = {
  rising: '🔥 Rising',
  stable_growth: '📈 Stable Growth',
  stable: '— Stable',
  declining: '📉 Declining',
  cold: '💀 Cold',
};

const SortHeader = ({ label, sortKey, current, asc, onSort }) => (
  <th
    className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
    onClick={() => onSort(sortKey)}
  >
    <span className="inline-flex items-center gap-1">
      {label}
      {current === sortKey ? (asc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
    </span>
  </th>
);

const TagTrends = () => {
  const { fetchJson, loading } = useApi();
  const [tags, setTags] = useState([]);
  const [sortKey, setSortKey] = useState('jobRatio');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    fetchJson('/api/tags/hot?limit=50').then(data => {
      if (data?.data) setTags(data.data);
    });
  }, []);

  const sorted = [...tags].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortAsc ? diff : -diff;
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Tag Trends</h1>
        <p className="text-sm text-gray-500 mt-1">标签热度排行与趋势分析</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">标签名</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">类型</th>
              <SortHeader label="岗位数" sortKey="jobCount" current={sortKey} asc={sortAsc} onSort={handleSort} />
              <SortHeader label="引用率" sortKey="jobRatio" current={sortKey} asc={sortAsc} onSort={handleSort} />
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">趋势</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">增长率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">加载中…</td></tr>
            )}
            {!loading && sorted.map(tag => (
              <tr key={tag.tagId} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-semibold text-gray-800">{tag.displayName}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{tag.tagType}</td>
                <td className="px-4 py-3 text-gray-700">{tag.jobCount}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.round(tag.jobRatio * 100)}%` }} />
                    </div>
                    <span className="text-gray-600 tabular-nums">{(tag.jobRatio * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TREND_STYLES[tag.trend_type] || TREND_STYLES.stable}`}>
                    {TREND_LABELS[tag.trend_type] || tag.trend_type}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-gray-600">
                  {tag.growth_rate >= 0 ? '+' : ''}{(tag.growth_rate * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TagTrends;
