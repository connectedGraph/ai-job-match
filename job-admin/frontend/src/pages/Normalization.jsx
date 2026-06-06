import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardSection, CardHeader } from '../components/ui/Card';
import Button, { cn } from '../components/ui/Button';
import { 
  Play, 
  RotateCcw, 
  Settings, 
  Activity, 
  Database, 
  Loader2, 
  Pause, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  FileJson,
  Tags,
  Cpu,
  ChevronRight,
  Clock,
  History,
  Sparkles,
  Sprout
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';

const Normalization = () => {
  const { fetchJson } = useApi();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('normalize'); // normalize or review
  const [cacheStatus, setCacheStatus] = useState({ matchedRows: 0, sizeBytes: 0, model: '-', dimensions: 0 });
  const [normalizeRuns, setNormalizeRuns] = useState([]);
  const [selectedNormalizeRun, setSelectedNormalizeRun] = useState(null);
  const [reviewRuns, setReviewRuns] = useState([]);
  const [selectedReviewRun, setSelectedReviewRun] = useState(null);
  
  const [reviewConfigs, setReviewConfigs] = useState([]);
  const [selectedReviewConfig, setSelectedReviewConfig] = useState('');
  const [reviewMode] = useState('all');
  const [maxAttempts, setMaxAttempts] = useState(2);

  const [normalLogs, setNormalLogs] = useState('[System] Normalization Engine Ready.\n');
  const [reviewLogs, setReviewLogs] = useState('[System] AI Review Center Ready.\n');

  const loadInitialData = useCallback(async () => {
    try {
      const normData = await fetchJson('/api/admin/normalization/runs');
      setNormalizeRuns(normData.data || []);
      setCacheStatus(normData.cacheStatus || {});
      if (normData.data?.length > 0) setSelectedNormalizeRun(normData.data[0]);

      const reviewData = await fetchJson('/api/admin/normalization/tag-review/runs?review_mode=all');
      setReviewRuns(reviewData.data || []);
      if (reviewData.data?.length > 0) setSelectedReviewRun(reviewData.data[0]);

      // Load configs from local storage
      const saved = JSON.parse(localStorage.getItem('portrait_builder_configs_v1') || '[]');
      setReviewConfigs(saved.filter(c => c.enabled));
      if (saved.length > 0) setSelectedReviewConfig(saved[0].id);
    } catch {
      // Mock for demo if needed
      setNormalizeRuns(generateMockNormalizeRuns());
      setReviewRuns(generateMockReviewRuns());
    }
  }, [fetchJson]);

  useEffect(() => {
    const timer = window.setTimeout(loadInitialData, 0);
    return () => window.clearTimeout(timer);
  }, [loadInitialData]);

  const handleStartNormalize = async () => {
    try {
      setNormalLogs("[Normalize] Initiating embedding space...\n");
      // Use first available config for normalization
      const configs = JSON.parse(localStorage.getItem('portrait_builder_configs_v1') || '[]');
      const activeConfig = configs.find(c => c.enabled);

      const res = await fetchJson('/api/admin/normalization/runs', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: activeConfig })
      });
      
      setNormalLogs(prev => prev + `[Success] Run ID: ${res.runId} active. Tracking progress...\n`);
      showToast(`Normalization run ${res.runId} started.`, 'success');
      loadInitialData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleStartReview = async () => {
    try {
      setReviewLogs("[AI Review] Requesting task cluster analysis...\n");
      const configs = JSON.parse(localStorage.getItem('portrait_builder_configs_v1') || '[]');
      const activeConfig = configs.find(c => c.id === selectedReviewConfig) || configs.find(c => c.enabled);

      const res = await fetchJson('/api/admin/normalization/tag-review/runs', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          config: activeConfig,
          review_mode: reviewMode,
          max_attempts: parseInt(maxAttempts)
        })
      });
      
      setReviewLogs(prev => prev + `[Success] Review Run ID: ${res.runId} created.\n[System] Backend processing started.\n`);
      showToast("Tag review task initiated.", "success");
      loadInitialData();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="p-7 animate-fade-up max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-tx-1 tracking-[-0.03em] leading-tight mb-1">Tag Normalization 归一任务中心</h1>
          <p className="text-[12.5px] text-tx-2">向量空间对齐与 AI 自动化复查。支持基于 Embedding 的相似度合并与大模型逻辑校验。</p>
        </div>
        <div className="flex bg-bg p-1 rounded-md border border-border shadow-sm">
          <button 
            onClick={() => setActiveTab('normalize')}
            className={cn("px-5 py-2 text-[12px] font-bold rounded flex items-center gap-2 transition-all", activeTab === 'normalize' ? 'bg-teal text-tx-inv' : 'text-tx-3 hover:text-tx-1')}
          >
            <Activity size={14} /> 相似度归一
          </button>
          <button 
            onClick={() => setActiveTab('review')}
            className={cn("px-5 py-2 text-[12px] font-bold rounded flex items-center gap-2 transition-all", activeTab === 'review' ? 'bg-teal text-tx-inv' : 'text-tx-3 hover:text-tx-1')}
          >
            <Cpu size={14} /> AI 标签复查
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatItem icon={Database} color="blue" label="Cache Rows" val={cacheStatus.matchedRows || 0} />
        <StatItem icon={Tags} color="teal" label="Normalize Status" val={selectedNormalizeRun?.status || 'IDLE'} />
        <StatItem icon={Cpu} color="amber" label="Review Items" val="452" />
        <StatItem icon={History} color="violet" label="Total Runs" val={normalizeRuns.length + reviewRuns.length} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-6">
        {/* Left Column: History & Controls */}
        <div className="space-y-6">
          <Card>
            <CardSection>
              <CardHeader title="Task Control" desc={activeTab === 'normalize' ? "Similarity-based tag merging" : "AI verifying tag validity"} />
              <div className="space-y-4 mt-4">
                {activeTab === 'normalize' ? (
                  <>
                    <Button variant="accent" className="w-full" onClick={handleStartNormalize}>
                      <Play size={14} fill="currentColor" /> 执行归一对齐
                    </Button>
                    <div className="p-4 bg-surface-2 border border-border rounded-lg text-[11px] text-tx-3 leading-relaxed">
                      系统将使用向量空间对齐（阈值 0.90）并优先匹配已有 Cache 中的标记。
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3">
                      <select 
                        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-[12px]"
                        value={selectedReviewConfig}
                        onChange={e => setSelectedReviewConfig(e.target.value)}
                      >
                        <option value="">选择复查配置</option>
                        {reviewConfigs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                         <select className="bg-bg border border-border rounded-lg px-3 py-2 text-[12px]">
                           <option value="all">Full Review</option>
                           <option value="unreviewed">New items only</option>
                         </select>
                         <input type="number" className="bg-bg border border-border rounded-lg px-3 py-2 text-[12px]" value={maxAttempts} onChange={e => setMaxAttempts(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                       <Button variant="accent" className="flex-1" onClick={handleStartReview}>
                         <Play size={14} fill="currentColor" /> 启动复查
                       </Button>
                       <Button variant="ghost" className="px-3"><Pause size={14} /></Button>
                       <Button variant="ghost" className="px-3"><RefreshCw size={14} /></Button>
                    </div>
                  </>
                )}
              </div>
            </CardSection>
          </Card>

          <Card>
            <CardSection>
              <span className="font-mono text-[10px] uppercase tracking-widest text-tx-4 mb-4 block">Run History</span>
              <div className="space-y-2 max-h-[500px] overflow-auto pr-1 custom-scrollbar">
                {(activeTab === 'normalize' ? normalizeRuns : reviewRuns).map(run => (
                  <div 
                    key={run.id || run.runId}
                    onClick={() => activeTab === 'normalize' ? setSelectedNormalizeRun(run) : setSelectedReviewRun(run)}
                    className={cn(
                      "p-3 border rounded-lg flex items-center justify-between cursor-pointer transition-all",
                      (activeTab === 'normalize' ? selectedNormalizeRun?.runId : selectedReviewRun?.runId) === (run.runId || run.id) ? "bg-surface-2 border-border-2 transition-all hover:bg-surface-3/30 shadow-sm" : "bg-bg border-border"
                    )}
                  >
                    <div className="min-w-0 pr-2">
                       <div className="text-[12px] font-bold text-tx-1 truncate">{run.runId || run.id}</div>
                       <div className="flex gap-2 mt-1">
                          <span className="text-[9px] font-bold text-teal">{run.status}</span>
                          <span className="text-[9px] text-tx-4 font-mono">{run.createdAt || run.time}</span>
                       </div>
                    </div>
                    <ChevronRight size={12} className="text-tx-4" />
                  </div>
                ))}
              </div>
            </CardSection>
          </Card>
        </div>

        {/* Right Column: Execution View */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* Detail Panel */}
             <Card>
               <CardSection>
                 <CardHeader title="Run Details" desc="当前颗粒度与执行进度细节" />
                 <div className="mt-4 space-y-4">
                    <div className="h-1.5 w-full bg-surface-3 rounded-full overflow-hidden">
                       <div className="h-full bg-teal" style={{ width: `${(activeTab === 'normalize' ? selectedNormalizeRun : selectedReviewRun)?.percent || 0}%` }} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                       <DetailTile label="Status" val={(activeTab === 'normalize' ? selectedNormalizeRun : selectedReviewRun)?.status || 'NONE'} />
                       <DetailTile label="Percent" val={`${(activeTab === 'normalize' ? selectedNormalizeRun : selectedReviewRun)?.percent || 0}%`} />
                       <DetailTile label="Changed" val={(activeTab === 'normalize' ? selectedNormalizeRun : selectedReviewRun)?.changed || 0} />
                    </div>
                    <div className="terminal-box h-[150px] p-4 font-mono text-[11px] bg-surface-2/30 border-border shadow-inner font-mono text-tx-3 selection:bg-teal selection:text-surface-3">
                       {JSON.stringify((activeTab === 'normalize' ? selectedNormalizeRun : selectedReviewRun) || {}, null, 2)}
                    </div>
                 </div>
               </CardSection>
             </Card>

             {/* Log Console */}
             <Card>
               <CardSection>
                 <CardHeader title="Live Console" desc="实时展示后端引擎输出的运行日志" />
                 <div className="terminal-box h-[280px] mt-4 p-4 font-mono text-[11.5px] bg-surface-2/80 border-border shadow-inner text-teal selection:bg-teal selection:text-surface-3 overflow-auto">
                    {activeTab === 'normalize' ? normalLogs : reviewLogs}
                 </div>
               </CardSection>
             </Card>
          </div>

          {/* Student Flow Test Entry */}
          <Card className="border-teal-border/30 bg-gradient-to-br from-teal-dim/5 to-transparent relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Sprout size={120} className="text-teal" />
            </div>
            <CardSection className="relative z-10">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <h3 className="font-display text-xl font-bold text-tx-1 mb-2 flex items-center gap-2">
                    <Sparkles className="text-teal animate-pulse" size={20} />
                    学生端流程测试 / Student Flow Test
                  </h3>
                  <p className="text-[13px] text-tx-2 max-w-[600px] leading-relaxed">
                    归一化任务完成后，点击进入模拟学生端体验。在该环境下可验证人岗匹配、收割报告生成以及行动计划的完整业务流效果。
                  </p>
                </div>
                <button 
                  onClick={() => window.location.href = '/match'}
                  className="shrink-0 flex items-center gap-3 bg-teal hover:bg-teal-hover text-tx-inv px-8 py-3.5 rounded-2xl font-bold text-[14px] shadow-lg shadow-teal/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  进入模拟测试入口
                  <ChevronRight size={18} />
                </button>
              </div>
            </CardSection>
          </Card>

          {/* Decision Summary Rails */}
          <Card>
            <CardSection>
              <CardHeader title="Decision Log / 决策预览" desc="展示系统中被自动合并、更名或确认的标签痕迹" />
              <div className="space-y-6 mt-6">
                 <div>
                    <span className="text-[10px] font-mono font-bold text-teal flex items-center gap-2 mb-3">
                       <CheckCircle2 size={12} /> REPLACED / MERGED (已对齐)
                    </span>
                    <div className="flex flex-wrap gap-2">
                       <DecisionChip from="TS" to="TypeScript" />
                       <DecisionChip from="Node" to="Node.js" />
                       <DecisionChip from="React Native" to="RN" type="warn" />
                       <DecisionChip from="Go-lang" to="Go" />
                    </div>
                 </div>
                 <div className="border-t border-border pt-6">
                    <span className="text-[10px] font-mono font-bold text-tx-3 flex items-center gap-2 mb-3">
                       <Activity size={12} /> NEW / UNCHANGED (保留原样)
                    </span>
                    <div className="flex flex-wrap gap-2">
                       <span className="px-2 py-1 bg-surface-2 border border-border rounded text-[11px] font-medium text-tx-3 italic opacity-60">
                          Pending evaluation...
                       </span>
                    </div>
                 </div>
              </div>
            </CardSection>
          </Card>
        </div>
      </div>
    </div>
  );
};

// --- Sub components ---

const StatItem = ({ icon, color, label, val }) => {
  const IconComponent = icon;
  const colorMap = {
    blue: 'bg-blue-dim border-blue-border text-blue',
    teal: 'bg-teal-dim border-teal-border text-teal',
    amber: 'bg-amber-dim border-amber-border text-amber',
    violet: 'bg-violet-dim border-[rgba(167,139,250,0.22)] text-violet',
  };

  return (
    <div className="flex items-center gap-[14px] bg-surface border border-border rounded-lg p-[14px_16px] transition-mid hover:border-border-2 group">
      <div className={`w-[34px] h-[34px] rounded-sm flex items-center justify-center shrink-0 border ${colorMap[color]}`}>
        <IconComponent size={15} />
      </div>
      <div className="flex flex-col gap-[1px]">
        <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-tx-4">{label}</span>
        <span className="font-display text-[20px] font-extrabold tracking-[-0.04em] leading-none text-tx-1">{val}</span>
      </div>
    </div>
  );
};

const DetailTile = ({ label, val }) => (
  <div className="p-3 bg-surface-2 border border-border rounded-lg text-center">
    <div className="text-[9px] text-tx-4 font-mono uppercase tracking-widest mb-1">{label}</div>
    <div className="text-[13px] font-black text-tx-1">{val}</div>
  </div>
);

const DecisionChip = ({ from, to, type = 'success' }) => (
  <div className={cn(
    "px-3 py-1.5 rounded-lg border flex items-center gap-2",
    type === 'success' ? "bg-teal-dim/10 border-teal-border/20" : "bg-amber-dim/10 border-amber-border/20"
  )}>
    <span className="text-[11px] font-bold text-tx-2">{from}</span>
    <ChevronRight size={12} className="text-tx-4" />
    <span className="text-[11px] font-black text-teal">{to}</span>
  </div>
);

function generateMockNormalizeRuns() {
  return [
    { runId: 'norm_23984fsd', status: 'completed', percent: 100, createdAt: '2026-04-12 10:00', changed: 42 },
    { runId: 'norm_m8934n5v', status: 'failed', percent: 45, createdAt: '2026-04-11 09:20', changed: 12 }
  ];
}

function generateMockReviewRuns() {
  return [
    { runId: 'rev_v92384n5', status: 'completed', percent: 100, createdAt: '2026-04-12 11:30', changed: 88 }
  ];
}

export default Normalization;
