import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardSection, CardHeader } from '../components/ui/Card';
import Button, { cn } from '../components/ui/Button';
import { 
  Search, 
  RotateCcw, 
  ExternalLink,
  Tag as TagIcon,
  Filter,
  BarChart3,
  Info,
  ChevronRight,
  TrendingUp,
  Brain,
  Rocket
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { Link } from 'react-router-dom';

const TagsCenter = () => {
  const { fetchJson, loading: apiLoading } = useApi();
  const { showToast } = useToast();
  
  const [tags, setTags] = useState([]);
  const [viewMode, setViewMode] = useState('normalized'); // normalized or source
  const [summary, setSummary] = useState({ jobCount: 0, tagCount: 0, highFrequencyTagCount: 0, runCount: 0 });
  const [filters, setFilters] = useState({
    keyword: '',
    type: '',
    ratio: '0'
  });

  const [softDimensions, setSoftDimensions] = useState([
    { name: '沟通表达', desc: '口头与书面表达能力', score: 92 },
    { name: '团队协作', desc: '多人项目配合与沟通', score: 88 },
    { name: '压力承受', desc: '高压环境下的任务质量', score: 85 },
    { name: '自主学习', desc: '新技术的掌握速度', score: 90 },
    { name: '解决问题', desc: '针对未知 Bug 的拆解力', score: 94 }
  ]);

  const [growthDimensions, setGrowthDimensions] = useState([
    { name: '技术广度', desc: '跨领域方案设计能力', score: 78 },
    { name: '工程化思维', desc: '系统架构与长期演进', score: 82 },
    { name: '业务敏感度', desc: '对商业需求的理解力', score: 75 },
    { name: '管理潜力', desc: '团队领导与任务分配', score: 68 },
    { name: '创新能力', desc: '非标准问题的创意方案', score: 85 }
  ]);

  useEffect(() => {
    loadData();
  }, [filters, viewMode]);

  const loadData = async (showFeedback = false) => {
    try {
      const queryParams = new URLSearchParams({
        q: filters.keyword,
        tag_type: filters.type,
        min_ratio: filters.ratio,
        view: viewMode,
        limit: '1000'
      });

      const [summaryData, data] = await Promise.all([
        fetchJson('/api/admin/summary'),
        fetchJson(`/api/admin/tags?${queryParams.toString()}`)
      ]);

      setSummary(summaryData);
      
      const rows = data.data || [];
      const fixed = data.fixedDimensions || {};
      
      setTags(rows);
      
      if (fixed.softQuality) {
        setSoftDimensions(fixed.softQuality.map(d => ({
          name: d.tagName || d.canonicalName || '-',
          id: d.tagId || '-',
          count: d.jobCount || 0,
          ratio: d.jobRatio || 0,
          score: Math.round((d.jobRatio || 0) * 100) // Using ratio for score preview
        })));
      }
      
      if (fixed.growthPotential) {
        setGrowthDimensions(fixed.growthPotential.map(d => ({
          name: d.tagName || d.canonicalName || '-',
          id: d.tagId || '-',
          count: d.jobCount || 0,
          ratio: d.jobRatio || 0,
          score: Math.round((d.jobRatio || 0) * 100)
        })));
      }

      if (showFeedback) {
        showToast(`Loaded ${data.total || rows.length} ${viewMode === 'normalized' ? 'Normalized' : 'Source'} tags.`, 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // We now use server-side filtering, so filteredTags just returns tags
  const filteredTags = tags;

  return (
    <div className="p-7 animate-fade-up max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-tx-1 tracking-[-0.03em] leading-tight mb-1">Tags Center 技术 Tag 池</h1>
          <p className="text-[12.5px] text-tx-2">数据画像归一结果与频次统计。支持按出现率检索高频核心能力。</p>
        </div>
        <div className="flex gap-2">
          <Link to="/normalize">
            <Button variant="ghost"><ExternalLink size={14} /> 进入归一任务页</Button>
          </Link>
          <Button variant="accent" onClick={loadData} disabled={apiLoading}>
            <RotateCcw size={14} className={cn(apiLoading && "animate-spin")} />
            刷新 Tag 池
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatItem icon={TagIcon} color="blue" label="Total Jobs" val={summary.jobCount} />
        <StatItem icon={BarChart3} color="teal" label="Normal Tags" val={summary.tagCount} />
        <StatItem icon={TrendingUp} color="amber" label="High Freq Tech" val={summary.highFrequencyTagCount} />
        <StatItem icon={RotateCcw} color="violet" label="Run Batches" val={summary.runCount || 0} />
      </div>

      <div className="space-y-6">
        {/* Top Info Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <Card className="h-full">
            <CardSection>
              <CardHeader title="归一策略 / Policy" desc="系统归一逻辑核心规范" />
              <div className="mt-4 p-4 bg-teal-dim/5 border border-teal-border/10 rounded-xl space-y-3 font-mono text-[11px] text-tx-3 leading-relaxed">
                <p>1. 批次构建只输出 `embeddings` 产物，不自动归一。</p>
                <p>2. 各维度独立对齐，`techStack` 与 `devTools` 共享归一主池。</p>
                <p>3. 归一后主键为 English Tag，中文仅供检索展示。</p>
                <div className="pt-2 mt-2 border-t border-teal-border/10 text-teal italic">
                  * 手动归一请进入专门的任务工作间。
                </div>
              </div>
            </CardSection>
          </Card>

          <Card className="h-full">
            <CardSection>
              <div className="flex items-center gap-2 mb-4">
                <Brain className="text-blue" size={18} />
                <h3 className="font-display font-bold text-tx-1">职业素养 / Soft Skills</h3>
              </div>
              <div className="space-y-4">
                {softDimensions.map((dim, i) => (
                  <DimensionItem key={i} {...dim} color="blue" />
                ))}
              </div>
            </CardSection>
          </Card>

          <Card className="h-full md:col-span-2 xl:col-span-1">
            <CardSection>
              <div className="items-center gap-2 mb-4 flex">
                <Rocket className="text-amber" size={18} />
                <h3 className="font-display font-bold text-tx-1">成长潜力 / Growth</h3>
              </div>
              <div className="space-y-4">
                {growthDimensions.map((dim, i) => (
                  <DimensionItem key={i} {...dim} color="amber" />
                ))}
              </div>
            </CardSection>
          </Card>
        </div>

        {/* Main Console: List & Table */}
        <Card>
          <CardSection>
            <span className="font-mono text-[10px] uppercase tracking-widest text-tx-4 mb-4 block">Filter & Search</span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="relative group">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-4 group-focus-within:text-teal transition-colors" />
                <input 
                  className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-2 text-[12.5px] outline-none focus:border-teal/40 transition-all font-medium"
                  placeholder="搜索 Tag、对照名或 ID"
                  value={filters.keyword}
                  onChange={e => setFilters({...filters, keyword: e.target.value})}
                />
              </div>
              <select 
                className="bg-bg border border-border rounded-lg px-3 py-2 text-[12.5px] outline-none"
                value={filters.type}
                onChange={e => setFilters({...filters, type: e.target.value})}
              >
                <option value="">全部技术类别</option>
                <option value="techStack">techStack</option>
                <option value="techCapabilities">techCapabilities</option>
                <option value="devTools">devTools</option>
              </select>
              <select 
                className="bg-bg border border-border rounded-lg px-3 py-2 text-[12.5px] outline-none"
                value={filters.ratio}
                onChange={e => setFilters({...filters, ratio: e.target.value})}
              >
                <option value="0">全部出现率</option>
                <option value="0.2">出现率 ≥ 20%</option>
                <option value="0.1">出现率 ≥ 10%</option>
                <option value="0.05">出现率 ≥ 5%</option>
                <option value="0.03">出现率 ≥ 3%</option>
                <option value="0.01">出现率 ≥ 1%</option>
                <option value="0.005">出现率 ≥ 0.5%</option>
                <option value="0.001">出现率 ≥ 0.1%</option>
              </select>
            </div>
            <div className="flex flex-col md:flex-row gap-4 items-center p-3 bg-surface-2 rounded-lg border border-border">
              <div className="flex bg-bg p-1 rounded-md border border-border shrink-0">
                <button 
                  onClick={() => setViewMode('normalized')}
                  className={cn("px-4 py-1.5 text-[11px] font-bold rounded-sm transition-all", viewMode === 'normalized' ? 'bg-teal text-tx-inv' : 'text-tx-3 hover:text-tx-1')}
                >Normalized</button>
                <button 
                  onClick={() => setViewMode('source')}
                  className={cn("px-4 py-1.5 text-[11px] font-bold rounded-sm transition-all", viewMode === 'source' ? 'bg-teal text-tx-inv' : 'text-tx-3 hover:text-tx-1')}
                >Source</button>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-tx-3 italic overflow-hidden">
                <Info size={14} className="shrink-0 text-blue" />
                <span className="truncate">当前查看：{viewMode === 'normalized' ? '归一后标签。体现系统核心技术栈共性。' : '原始提取文本。展示原始画像痕迹。'}</span>
              </div>
            </div>
          </CardSection>

          <CardSection className="p-0 overflow-x-auto border-t border-border">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-surface-2/50 border-border shadow-inner font-mono text-[10px] text-tx-4 uppercase tracking-wider border-b border-border">
                  <th className="px-5 py-4 font-bold">English Tag</th>
                  <th className="px-5 py-4 font-bold">中文对照</th>
                  <th className="px-5 py-4 font-bold">类别 / Type</th>
                  <th className="px-5 py-4 font-bold text-nowrap">分布岗位数</th>
                  <th className="px-5 py-4 font-bold">出现率</th>
                  <th className="px-5 py-4 font-bold text-center">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTags.map((tag, i) => (
                  <tr key={i} className="bg-surface-3/30 border-border-2 transition-all shadow-sm group-hover:border-teal/30 w-full flex-1">
                    <td className="px-5 py-4">
                      <div className="text-[13px] font-bold text-tx-1 group-hover:text-teal transition-colors">{tag.tagName || "-"}</div>
                      <div className="text-[10px] font-mono text-tx-4 mt-1 uppercase">ID: {tag.tagId || "-"}</div>
                    </td>
                    <td className="px-5 py-4 text-[12px] text-tx-2 font-medium">{tag.tagNameZh || "-"}</td>
                    <td className="px-5 py-4 font-mono text-[11px] text-teal-shade">{tag.tagType || "-"}</td>
                    <td className="px-5 py-4 font-mono text-[12.5px] text-tx-1 font-bold">{tag.jobCount || 0}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                          <div className="h-full bg-teal" style={{ width: `${(tag.jobRatio || 0) * 100}%` }} />
                        </div>
                        <span className="font-mono text-[11px] text-tx-2">{((tag.jobRatio || 0) * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {tag.isHighFrequency ? (
                        <span className="text-amber font-bold text-[11px] flex items-center justify-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
                          High Freq
                        </span>
                      ) : (
                        <span className="text-tx-4 font-medium text-[11px]">Regular</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTags.length === 0 && <div className="p-20 text-center text-tx-4 italic">No tags match current filters.</div>}
          </CardSection>
        </Card>
      </div>
    </div>
  );
};

// --- Sub components ---

const DimensionItem = ({ name, desc, score, color }) => (
  <div className="group">
    <div className="flex justify-between items-end mb-1.5">
      <div>
        <div className="text-[12.5px] font-bold text-tx-1 group-hover:text-teal transition-colors">{name}</div>
        <div className="text-[10px] text-tx-4 font-mono">{desc}</div>
      </div>
      <div className={cn("font-display text-lg font-black leading-none", color === 'blue' ? 'text-blue' : 'text-amber')}>{score}</div>
    </div>
    <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
      <div className={cn("h-full", color === 'blue' ? 'bg-blue' : 'bg-amber')} style={{ width: `${score}%` }} />
    </div>
  </div>
);

const StatItem = ({ icon: Icon, color, label, val }) => {
  const colorMap = {
    blue: 'bg-blue-dim border-blue-border text-blue',
    teal: 'bg-teal-dim border-teal-border text-teal',
    amber: 'bg-amber-dim border-amber-border text-amber',
    violet: 'bg-violet-dim border-[rgba(167,139,250,0.22)] text-violet',
  };

  return (
    <div className="flex items-center gap-[14px] bg-surface border border-border rounded-lg p-[14px_16px] transition-mid hover:border-border-2 group">
      <div className={`w-[34px] h-[34px] rounded-sm flex items-center justify-center shrink-0 border ${colorMap[color]}`}>
        <Icon size={15} />
      </div>
      <div className="flex flex-col gap-[1px]">
        <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-tx-4">{label}</span>
        <span className="font-display text-[20px] font-extrabold tracking-[-0.04em] leading-none text-tx-1">{val}</span>
      </div>
    </div>
  );
};

export default TagsCenter;
