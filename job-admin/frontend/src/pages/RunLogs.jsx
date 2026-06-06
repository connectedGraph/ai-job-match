import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardSection, CardHeader } from '../components/ui/Card';
import Button, { cn } from '../components/ui/Button';
import { 
  RotateCcw, 
  History, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ChevronRight,
  Database,
  FileJson,
  Activity,
  Download,
  Terminal as TerminalIcon
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';

const RunLogs = () => {
  const { fetchJson, loading: apiLoading } = useApi();
  const { showToast } = useToast();
  
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [summary, setSummary] = useState({ jobCount: 0, tagCount: 0, highFrequencyTagCount: 0, runCount: 0 });

  useEffect(() => {
    loadInitialData();
    // Auto refresh every 30s
    const timer = setInterval(loadRuns, 30000);
    return () => clearInterval(timer);
  }, []);

  const loadInitialData = async () => {
    try {
      const summaryData = await fetchJson('/api/admin/summary');
      setSummary(summaryData);
      loadRuns();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const loadRuns = async () => {
    try {
      const data = await fetchJson('/api/builder/runs');
      const runsData = data.data || generateMockRuns();
      setRuns(runsData);
      if (runsData.length > 0 && !selectedRun) {
        setSelectedRun(runsData[0]);
      }
    } catch (err) {
      // If API fails, use mock for demo
      setRuns(generateMockRuns());
    }
  };

  return (
    <div className="p-7 animate-fade-up max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-tx-1 tracking-[-0.03em] leading-tight mb-1">Run Logs 运行记录</h1>
          <p className="text-[12.5px] text-tx-2">构建批次状态、失败追溯与入库概览。页面每 30 秒自动更新。</p>
        </div>
        <Button variant="accent" onClick={loadRuns} disabled={apiLoading}>
          <RotateCcw size={14} className={cn(apiLoading && "animate-spin")} />
          刷新记录
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatItem icon={Database} color="blue" label="Total Jobs" val={summary.jobCount} />
        <StatItem icon={Activity} color="teal" label="Normal Tags" val={summary.tagCount} />
        <StatItem icon={Clock} color="amber" label="Total Runs" val={runs.length} />
        <StatItem icon={History} color="violet" label="Last Success" val="2h ago" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        {/* Left Column: Batch History */}
        <div className="space-y-4">
          <Card>
            <CardSection>
              <span className="font-mono text-[10px] uppercase tracking-widest text-tx-4 mb-4 block">Batch History</span>
              <div className="space-y-3 max-h-[800px] overflow-auto pr-1 custom-scrollbar">
                {runs.map(run => (
                  <div 
                    key={run.id}
                    onClick={() => setSelectedRun(run)}
                    className={cn(
                      "p-4 border rounded-xl flex items-center justify-between cursor-pointer transition-all hover:bg-surface-2",
                      selectedRun?.id === run.id ? "bg-surface-3/30 border-border-2 transition-all shadow-sm group-hover:border-teal/30 flex-1" : "bg-bg border-border"
                    )}
                  >
                    <div className="min-w-0 pr-4">
                      <div className="text-[13px] font-bold text-tx-1 truncate">{run.batch_name || `Batch ${run.id.slice(0, 8)}`}</div>
                      <div className="flex gap-2 mt-1.5 items-center">
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-tighter",
                          run.status === 'completed' ? "bg-teal-dim text-teal border border-teal-border/30" : "bg-red-dim text-red border border-red-border/30"
                        )}>{run.status}</span>
                        <span className="text-[10px] text-tx-4 font-mono">{run.time}</span>
                      </div>
                    </div>
                    <ChevronRight size={14} className={cn("shrink-0 transition-colors", selectedRun?.id === run.id ? "text-teal" : "text-tx-4")} />
                  </div>
                ))}
              </div>
            </CardSection>
          </Card>
        </div>

        {/* Right Column: Detail Panels */}
        <div className="space-y-6">
          {!selectedRun ? (
            <div className="h-[400px] flex flex-col items-center justify-center text-tx-4 border border-border border-dashed rounded-2xl">
              <History size={48} className="opacity-10 mb-4" />
              <p className="text-sm">Select a batch to view details</p>
            </div>
          ) : (
            <>
              {/* Panel 1: Summary */}
              <Card>
                <CardSection>
                  <div className="flex justify-between items-start mb-4">
                    <CardHeader title="运行详情 / Run Details" desc="时间线、配置分配与当前动作" />
                    <Button variant="ghost" size="sm">
                      <Download size={14} /> 导出日志
                    </Button>
                  </div>
                  <div className="terminal-box bg-surface-2/50 border-border shadow-inner font-mono text-tx-3 selection:bg-teal selection:text-surface-3">
                    <div className="grid grid-cols-2 gap-y-2">
                       <div>{">"} Batch ID: <span className="text-teal">{selectedRun.id}</span></div>
                       <div>{">"} Created: <span className="text-tx-1">{selectedRun.createdAt || selectedRun.time}</span></div>
                       <div>{">"} Duration: <span className="text-tx-1">{selectedRun.duration || '8m 42s'}</span></div>
                       <div>{">"} Total Items: <span className="text-blue font-bold">{selectedRun.total_count || 128}</span></div>
                       <div>{">"} Success Rate: <span className="text-teal font-bold">{((selectedRun.success_count / selectedRun.total_count) * 100).toFixed(1)}%</span></div>
                       <div>{">"} Status: <span className={selectedRun.status === 'completed' ? 'text-teal' : 'text-red'}>{selectedRun.status.toUpperCase()}</span></div>
                    </div>
                  </div>
                </CardSection>
              </Card>

              {/* Panel 2: Results & Failures */}
              <Card>
                <CardSection>
                  <CardHeader title="结果与失败预览 / Result & Failures" desc="前几条成功记录与失败样例追溯" />
                  <div className="terminal-box h-[200px] mt-4 p-4 font-mono text-[11.5px] overflow-auto bg-bg border border-border">
                    {selectedRun.status === 'completed' ? (
                      <div className="space-y-1">
                        <span className="text-tx-4">// Success Sample:</span>
                        <pre className="text-teal">{JSON.stringify(selectedRun.sample_result || { title: "Senior Developer", tags: ["React", "TS"] }, null, 2)}</pre>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-red font-bold">!! Error detected in item 42:</span>
                        <pre className="text-tx-3">{`{ "error": "Token limit exceeded", "job_id": "JOB_ERR_01" }`}</pre>
                      </div>
                    )}
                  </div>
                </CardSection>
              </Card>

              {/* Panel 3: Embedding Logs */}
              <Card>
                <CardSection>
                  <div className="flex items-center gap-2 mb-4">
                    <TerminalIcon size={16} className="text-tx-3" />
                    <h3 className="font-display font-bold text-tx-1">Embedding 日志 / Embed Logs</h3>
                  </div>
                  <div className="terminal-box h-[150px] p-4 font-mono text-[11.5px] overflow-auto bg-surface-2/50 border-border shadow-inner font-mono text-tx-3 selection:bg-teal selection:text-surface-3">
                    {`[Embed] Starting embedding batch...
[Success] Generated 128 vectors.
[Save] vectors_batch_${selectedRun.id.slice(0,6)}.jsonl created.
[Status] Ready for vector search indexing.`}
                  </div>
                </CardSection>
              </Card>
            </>
          )}
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

function generateMockRuns() {
  return [
    { id: 'run_jkh2398d7sf', batch_name: '2026-04-12 深度画像构建', status: 'completed', time: '10:45 AM', total_count: 120, success_count: 120 },
    { id: 'run_m8934n5v923', batch_name: '快速测试批次 (Mini-GPT4)', status: 'failed', time: '09:20 AM', total_count: 40, success_count: 38 },
    { id: 'run_n2v3987v239', batch_name: 'BOSS 原始数据预处理', status: 'completed', time: 'Yesterday', total_count: 500, success_count: 498 },
    { id: 'run_v92384n5v93', batch_name: '全量归一索引重置', status: 'completed', time: 'Yesterday', total_count: 2400, success_count: 2400 },
  ];
}

export default RunLogs;
