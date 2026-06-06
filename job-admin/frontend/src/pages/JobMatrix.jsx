import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardSection, CardHeader } from '../components/ui/Card';
import Button, { cn } from '../components/ui/Button';
import { 
  Search, 
  Plus, 
  RotateCcw, 
  Save, 
  Trash2, 
  FileJson, 
  ChevronRight,
  MoreHorizontal,
  Users,
  Tag as TagIcon,
  Zap,
  Terminal,
  Loader2
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';

const JobMatrix = () => {
  const { fetchJson, loading: apiLoading } = useApi();
  const { showToast } = useToast();
  
  const [jobs, setJobs] = useState([]);
  const [recentJobs, setRecentJobs] = useState([]);
  const [currentJob, setCurrentJob] = useState(null);
  const [metadata, setMetadata] = useState({ directions: [], industries: [] });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [summary, setSummary] = useState({ jobCount: 0, tagCount: 0, highFrequencyTagCount: 0, runCount: 0 });
  
  const [filters, setFilters] = useState({
    basicKeyword: '',
    jdKeyword: '',
    direction: '',
    industry: '',
    sortBy: 'default'
  });

  // Editor states
  const [editorData, setEditorData] = useState(null);
  const [jsonText, setJsonText] = useState('');

  // Initial load
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [meta, summaryData] = await Promise.all([
        fetchJson('/api/metadata'),
        fetchJson('/api/admin/summary')
      ]);
      setMetadata(meta);
      setSummary(summaryData);
      loadJobs(1, true);
      loadRecentJobs();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const loadJobs = async (pageNum = 1, reset = false) => {
    const params = new URLSearchParams({
      page: String(pageNum),
      limit: '24',
      basic_keyword: filters.basicKeyword,
      jd_keyword: filters.jdKeyword,
      direction: filters.direction,
      industry: filters.industry,
      sort_by: filters.sortBy
    });

    try {
      const data = await fetchJson(`/api/jobs?${params.toString()}`);
      setJobs(prev => reset ? data.data : [...prev, ...data.data]);
      setHasMore(data.hasMore);
      setPage(pageNum);
      
      // Select first job if none selected
      if (reset && data.data.length > 0 && !currentJob) {
        selectJob(data.data[0]);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const loadRecentJobs = async () => {
    try {
      const data = await fetchJson('/api/jobs?page=1&limit=12&sort_by=recent_created');
      setRecentJobs(data.data || []);
    } catch (err) {}
  };

  const selectJob = (job) => {
    setCurrentJob(job);
    setEditorData({ ...job });
    setJsonText(JSON.stringify(job, null, 2));
  };

  const handleCreateNew = () => {
    const emptyJob = {
      id: "NEW-" + Date.now().toString(36),
      title: "",
      companyName: "",
      direction: "",
      industry: "",
      metadata: { jobType: null, salaryRange: null },
      techStack: [],
      techCapabilities: [],
      devTools: [],
      softQuality: [],
      growthPotential: []
    };
    selectJob(emptyJob);
    showToast("Workspace initialized for new record.", "info");
  };

  const handleSave = async () => {
    try {
      const payload = JSON.parse(jsonText);
      const isNew = !currentJob.id || currentJob.id.startsWith('NEW-');
      
      if (isNew) {
        const created = await fetchJson('/api/admin/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job: payload })
        });
        showToast(`Job record [${created.job.id}] created.`, 'success');
        loadInitialData();
      } else {
        await fetchJson(`/api/admin/jobs/${encodeURIComponent(currentJob.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job: payload })
        });
        showToast(`Job record [${currentJob.id}] updated.`, 'success');
        refreshLocal(payload);
      }
    } catch (err) {
      showToast("Save failed: " + err.message, "error");
    }
  };

  const refreshLocal = (updatedJob) => {
    setJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j));
    setRecentJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j));
    setCurrentJob(updatedJob);
  };

  const handleDelete = async () => {
    if (!currentJob?.id) return;
    if (!window.confirm(`Are you sure you want to delete job [${currentJob.id}]?`)) return;

    try {
      await fetchJson(`/api/admin/jobs/${encodeURIComponent(currentJob.id)}`, { method: 'DELETE' });
      showToast(`Job [${currentJob.id}] deleted.`, 'success');
      loadInitialData();
      setCurrentJob(null);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Sync basic fields to JSON
  const updateField = (field, value) => {
    const newData = { ...editorData, [field]: value };
    // Handle nested metadata if needed
    if (field === 'jobType') {
      newData.metadata = { ...newData.metadata, jobType: value };
    }
    setEditorData(newData);
    setJsonText(JSON.stringify(newData, null, 2));
  };

  return (
    <div className="p-7 animate-fade-up max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-tx-1 tracking-[-0.03em] leading-tight mb-1">Job Matrix 岗位矩阵</h1>
          <p className="text-[12.5px] text-tx-2">岗位主表、搜索、编辑和最近新增。左侧看列表，右侧维护结构化画像。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => loadJobs(1, true)}>
            <RotateCcw size={14} className={cn(apiLoading && "animate-spin")} />
            刷新列表
          </Button>
          <Button variant="accent" onClick={handleCreateNew}>
            <Plus size={14} />
            新建岗位
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatItem icon={Users} color="blue" label="Total Jobs" val={summary.jobCount} />
        <StatItem icon={TagIcon} color="teal" label="Normal Tags" val={summary.tagCount} />
        <StatItem icon={Zap} color="amber" label="High Freq Tech" val={summary.highFrequencyTagCount} />
        <StatItem icon={Terminal} color="violet" label="Run Batches" val={summary.runCount} />
      </div>

      {/* Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        
        {/* Left Column: Search & List */}
        <div className="space-y-4">
          <Card>
            <CardSection>
              <span className="font-mono text-[10px] uppercase tracking-widest text-tx-4 mb-3 block">Data Query</span>
              <div className="space-y-3">
                <div className="relative group">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-4 group-focus-within:text-teal transition-colors" />
                  <input 
                    className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-2 text-[12.5px] outline-none focus:ring-4 focus:ring-teal/5 focus:border-teal/40 transition-all"
                    placeholder="搜索 ID、岗位名、公司名"
                    value={filters.basicKeyword}
                    onChange={e => setFilters({...filters, basicKeyword: e.target.value})}
                    onKeyDown={e => e.key === 'Enter' && loadJobs(1, true)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select 
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-[12.5px] outline-none focus:border-teal/40 transition-all appearance-none"
                    value={filters.direction}
                    onChange={e => setFilters({...filters, direction: e.target.value})}
                  >
                    <option value="">全部方向</option>
                    {metadata.directions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select 
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-[12.5px] outline-none focus:border-teal/40 transition-all appearance-none"
                    value={filters.industry}
                    onChange={e => setFilters({...filters, industry: e.target.value})}
                  >
                    <option value="">全部行业</option>
                    {metadata.industries.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <Button className="w-full" variant="blue" onClick={() => loadJobs(1, true)} disabled={apiLoading}>
                  {apiLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Deep Search
                </Button>
              </div>
            </CardSection>
            
            <CardSection className="p-0 border-t border-border">
              <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                {jobs.map(job => (
                  <div 
                    key={job.id}
                    onClick={() => selectJob(job)}
                    className={cn(
                      "p-4 border-b border-border flex justify-between items-center cursor-pointer transition-all hover:bg-surface-2",
                      currentJob?.id === job.id && "bg-surface-2 border-l-4 border-l-teal"
                    )}
                  >
                    <div className="min-w-0 pr-4">
                      <div className="text-[13px] font-bold text-tx-1 truncate">{job.title || "未命名岗位"}</div>
                      <div className="flex gap-2 mt-1 items-center">
                        <span className="text-[10px] text-tx-3 uppercase font-mono">{job.companyName || "未知公司"}</span>
                        <span className="w-1 h-1 rounded-full bg-border" />
                        <span className="text-[10px] text-tx-4 truncate">{job.direction || "-"}</span>
                      </div>
                    </div>
                    <div className="text-[9px] font-mono text-tx-4 bg-surface-3 px-1.5 py-0.5 rounded border border-border shrink-0">
                      {job.id}
                    </div>
                  </div>
                ))}
                {hasMore && (
                  <button 
                    onClick={() => loadJobs(page + 1)}
                    className="w-full py-4 text-xs font-bold text-teal hover:bg-teal/5 transition-colors"
                  >
                    Load More Data
                  </button>
                )}
                {jobs.length === 0 && !apiLoading && (
                  <div className="p-10 text-center text-tx-4 italic text-sm">No jobs found matching criteria.</div>
                )}
              </div>
            </CardSection>
          </Card>
        </div>

        {/* Right Column: Editor & Details */}
        <div className="space-y-4">
          <Card>
            <CardSection className="bg-surface-2/30 border-b border-border">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-display font-bold text-tx-1">Inspector & Editor</h3>
                  <p className="text-[11px] text-tx-4 mt-0.5 font-mono">WORKSPACE FOR STRUCTURAL PORTRAIT</p>
                </div>
                <div className="text-[10px] font-mono font-bold px-2 py-1 bg-teal-dim text-teal border border-teal-border rounded uppercase">
                  ID: {currentJob?.id || "PENDING"}
                </div>
              </div>
            </CardSection>
            <CardSection>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <FieldInput label="Title" value={editorData?.title || ''} onChange={v => updateField('title', v)} />
                <FieldInput label="Company" value={editorData?.companyName || ''} onChange={v => updateField('companyName', v)} />
                <FieldInput label="Direction" value={editorData?.direction || ''} onChange={v => updateField('direction', v)} />
                <FieldInput label="Industry" value={editorData?.industry || ''} onChange={v => updateField('industry', v)} />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-tx-4">Raw JSON Object</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => {
                      try { setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2)) } catch(e) {}
                    }}>Format</Button>
                  </div>
                </div>
                <textarea 
                  className="w-full bg-bg border border-border rounded-lg p-4 font-mono text-[11px] text-tx-2 min-h-[400px] outline-none focus:border-teal/40 focus:ring-4 focus:ring-teal/5 transition-all resize-y"
                  value={jsonText}
                  onChange={e => setJsonText(e.target.value)}
                  spellCheck={false}
                />
              </div>
            </CardSection>
            <CardSection className="bg-surface-2/30 border-t border-border flex justify-between gap-3">
              <Button variant="accent" className="px-8" onClick={handleSave}>
                <Save size={14} />
                Save Record
              </Button>
              <Button variant="danger" ghost onClick={handleDelete}>
                <Trash2 size={14} />
                Delete
              </Button>
            </CardSection>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-4">
            {/* Tag Preview */}
            <Card>
              <CardSection>
                <CardHeader title="Tag Cloud Preview" desc="当前岗位已提取的画像标签预览" />
                <div className="flex flex-wrap gap-2 mt-4">
                  {currentJob ? (
                    <>
                      {getJobTags(currentJob).map((tag, i) => (
                        <span 
                          key={i} 
                          className={cn(
                            "px-2 py-1 rounded-sm text-[11px] font-bold border",
                            tag.type === 'skill' ? "bg-teal-dim text-teal border-teal-border" : 
                            tag.type === 'soft' ? "bg-blue-dim text-blue border-blue-border" : 
                            "bg-amber-dim text-amber border-amber-border"
                          )}
                        >
                          {tag.text}
                        </span>
                      ))}
                      {getJobTags(currentJob).length === 0 && <span className="text-tx-4 italic text-xs">暂未提取出画像标签。</span>}
                    </>
                  ) : <span className="text-tx-4 italic text-xs">请选择岗位以查看预览。</span>}
                </div>
              </CardSection>
            </Card>

            {/* Recent Audits */}
            <Card>
              <CardSection>
                <CardHeader title="Recent Audits" desc="最近处理过的岗位记录" />
                <div className="mt-4 space-y-2">
                  {recentJobs.map((job, i) => (
                    <div 
                      key={job.id} 
                      onClick={() => selectJob(job)}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-2 cursor-pointer group transition-all border border-transparent hover:border-border"
                    >
                      <span className="font-mono text-[10px] text-tx-4 w-5 shrink-0">{(i+1).toString().padStart(2, '0')}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-bold text-tx-2 truncate group-hover:text-teal">{job.title}</div>
                        <div className="text-[10px] text-tx-4 truncate">{job.companyName}</div>
                      </div>
                      <ChevronRight size={12} className="text-tx-4 group-hover:text-teal" />
                    </div>
                  ))}
                </div>
              </CardSection>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Helpers ---

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

const FieldInput = ({ label, value, onChange }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-mono font-bold uppercase text-tx-3 ml-1">{label}</label>
    <input 
      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-[12.5px] outline-none focus:border-teal/40 transition-all font-medium"
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  </div>
);

function getJobTags(job) {
  if (!job) return [];
  const tags = [];
  
  // Tech Stack
  (job.techStack || []).forEach(item => {
    if (item.options) {
      item.options.forEach(opt => {
        tags.push({ text: opt.normalizedTag || opt.name, type: 'skill' });
      });
    } else {
      tags.push({ text: item.normalizedTag || item.name, type: 'skill' });
    }
  });

  // Capabilities
  (job.techCapabilities || []).forEach(item => {
    tags.push({ text: item.normalizedTag || item.skill, type: 'skill' });
  });

  // Soft Skills
  (job.softQuality || []).forEach(item => {
    tags.push({ text: item.name, type: 'soft' });
  });

  // Domain/Growth
  (job.growthPotential || []).forEach(item => {
    tags.push({ text: item.name, type: 'domain' });
  });

  return tags.filter(t => t.text);
}

export default JobMatrix;
