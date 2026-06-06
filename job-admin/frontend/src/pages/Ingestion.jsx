import React, { useState, useEffect, useRef } from 'react';
import { Card, CardSection, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import { 
  Upload, 
  Settings, 
  FileText, 
  Play, 
  Activity, 
  Loader2, 
  Info,
  Terminal as TerminalIcon
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { Link } from 'react-router-dom';

const readFileAsBase64 = (selectedFile) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    const commaIndex = result.indexOf(',');
    resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
  };
  reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
  reader.readAsDataURL(selectedFile);
});

const loadBuilderConfigs = () => {
  try {
    return JSON.parse(localStorage.getItem("portrait_builder_configs_v1") || "[]");
  } catch {
    return [];
  }
};

const normalizeBuilderConfig = (config = {}) => {
  const normalized = {
    ...config,
    id: config.id || `cfg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name: config.name || config.model || "未命名配置",
    baseUrl: String(config.baseUrl || '').trim(),
    apiKey: String(config.apiKey || '').trim(),
    model: String(config.model || '').trim(),
    stageRole: config.stageRole || "all",
    apiMode: config.apiMode || "chat_completions",
    chatCompletionsSystemRole: config.chatCompletionsSystemRole || config.chatSystemRole || "system",
    concurrency: Number(config.concurrency || 30),
    requestsPerMinute: Number(config.requestsPerMinute || 800),
    temperature: Number(config.temperature ?? 0.2),
    maxTokens: Number(config.maxTokens || 4000),
    enabled: config.enabled !== false,
  };
  if (!normalized.baseUrl || !normalized.apiKey || !normalized.model) {
    return null;
  }
  return normalized;
};

const loadUsableBuilderConfigs = () => (
  loadBuilderConfigs().map(normalizeBuilderConfig).filter(config => config?.enabled)
);

const formatPreflightIssue = (item = {}) => (
  `${item.configName || item.configId || item.model || "unknown"}: ${item.error || item.warning || item.status || "unknown"}`
);

const Ingestion = () => {
  const { fetchJson } = useApi();
  const { showToast } = useToast();
  
  const [file, setFile] = useState(null);
  const [inputMode, setInputMode] = useState('raw_source');
  const [retryLimit, setRetryLimit] = useState(2);
  const [autoApply, setAutoApply] = useState(false);
  const [uploadState, setUploadState] = useState(null);
  
  const [uploadSummary, setUploadSummary] = useState('');
  const [assignmentCheck, setAssignmentCheck] = useState(null);
  const [preflightLogs, setPreflightLogs] = useState('');
  const [builderLogs, setBuilderLogs] = useState('[System] Engine Ready.\n');
  const [summary, setSummary] = useState({ jobCount: 0, fieldCount: 0, configNodes: 0 });

  const logRef = useRef(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [builderLogs]);

  const enabledConfigs = loadUsableBuilderConfigs();
  const canStartBuild = Boolean(uploadState?.uploadId) && enabledConfigs.length > 0;
  const startBuildDisabledReason = !uploadState?.uploadId
    ? "请先选择文件并点击“解析载入”"
    : enabledConfigs.length === 0
      ? "配置池没有已保存且启用的配置"
      : "";

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadState(null);
      setUploadSummary(`// Selected: ${selectedFile.name}\n// Size: ${(selectedFile.size / 1024).toFixed(2)} KB`);
      setSummary(prev => ({ ...prev, jobCount: 0, fieldCount: 0 }));
    }
  };

  const handleParse = async () => {
    if (!file) {
      showToast("Please select a file first.", "error");
      return;
    }
    
    try {
      const contentBase64 = await readFileAsBase64(file);
      const data = await fetchJson('/api/builder/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentBase64,
          inputMode,
        }),
      });

      setUploadState(data);
      setUploadSummary(`uploadId: ${data.uploadId}\nrecordCount: ${data.recordCount}\ncreatedAt: ${data.createdAt}\n\n[Preview]\n${JSON.stringify(data.preview, null, 2)}`);
      setSummary(prev => ({
        ...prev,
        jobCount: data.recordCount || 0,
        fieldCount: Array.isArray(data.fields) ? data.fields.length : 0,
      }));
      showToast("File uploaded and parsed.", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handlePreflight = async () => {
    try {
      setPreflightLogs("[Preflight] Checking available API nodes...\n");
      // Getting configs from local storage like Settings.jsx does
      const configs = loadUsableBuilderConfigs();
      if (!configs.length) {
        showToast("请先在配置池完成测试并保存至少一个可用配置", "error");
        setPreflightLogs(prev => prev + "[Error] No usable enabled configs found in localStorage.\n");
        return;
      }
      
      const data = await fetchJson('/api/builder/configs/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs })
      });
      
      setAssignmentCheck(`Preflight: ${data.ok ? 'OK' : 'FAIL'} (${data.reports.length} reports)`);
      setPreflightLogs(prev => prev + data.reports.map(r => (
        `[${r.status}] ${r.configName}: ${r.latencyMs}ms${r.warning ? ` / ${r.warning}` : ""}${r.error ? ` / ${r.error}` : ""}`
      )).join('\n') + '\n');
      setSummary(prev => ({ ...prev, configNodes: data.reports.filter(r => r.status === 'success').length }));
      showToast("Preflight check complete.", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleStartBuild = async () => {
    try {
      const configs = loadUsableBuilderConfigs();

      const sessionData = {
        uploadId: uploadState?.uploadId,
        inputMode,
        configs,
        options: {
          maxAttemptsPerRecord: Number(retryLimit) || 2,
          autoApplyToJobLibrary: autoApply,
          normalizeWithExistingTags: false,
        },
      };

      if (!sessionData.uploadId) {
        showToast("No upload ID found. Please parse file first.", "error");
        return;
      }
      if (!sessionData.configs.length) {
        showToast("请先在配置池完成测试并保存至少一个可用配置", "error");
        return;
      }

      setBuilderLogs(prev => prev + `[Preflight] Checking ${configs.length} config node(s)...\n`);
      const preflight = await fetchJson('/api/builder/configs/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs }),
      });
      if (!preflight.ok) {
        const message = preflight.invalidConfigs?.map(formatPreflightIssue).filter(Boolean).join('; ')
          || "配置预检失败";
        setBuilderLogs(prev => prev + `[Error] ${message}\n`);
        showToast(message, "error");
        return;
      }
      const warnings = (preflight.reports || []).filter(item => item.warning).map(formatPreflightIssue);
      if (warnings.length) {
        setBuilderLogs(prev => prev + `[Warning] ${warnings.join('; ')}\n`);
      }

      setBuilderLogs(prev => prev + `[Batch] Requesting ingestion run...\n`);
      const data = await fetchJson('/api/builder/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });
      
      const runId = data?.manifest?.runId || data?.runId || '(unknown)';
      setBuilderLogs(prev => prev + `[Success] Created Run ID: ${runId}\n[System] Redirecting to Run Logs for tracking...\n`);
      showToast("Run started successfully.", "success");
      
      // Optional: Redirect after success
      // setTimeout(() => navigate('/runs'), 2000);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="p-7 animate-fade-up max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-tx-1 tracking-[-0.03em] leading-tight mb-1">Ingestion 上传构建</h1>
          <p className="text-[12.5px] text-tx-2">导入原始岗位并发起画像构建。支持 JSON, CSV, XLS。完成后可选自动归一。</p>
        </div>
        <div className="flex gap-2">
          <Link to="/settings">
            <Button variant="ghost"><Settings size={14} /> 去配置池</Button>
          </Link>
          <Link to="/runs">
            <Button variant="ghost"><FileText size={14} /> 看运行记录</Button>
          </Link>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatItem icon={Upload} color="blue" label="待处理岗位" val={summary.jobCount} />
        <StatItem icon={Activity} color="teal" label="解析出字段" val={summary.fieldCount} />
        <StatItem icon={Settings} color="amber" label="可用配置节点" val={summary.configNodes} />
        <StatItem icon={Loader2} color="violet" label="预估耗时 (分)" val="12" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          <Card>
            <CardSection>
              <span className="font-mono text-[10px] uppercase tracking-widest text-tx-4 mb-4 block">File Input & Config</span>
              
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="flex-1 flex items-center gap-3 p-3 bg-surface-2 border border-dashed border-border rounded-lg hover:border-teal/50 transition-colors group">
                  <input
                    type="file"
                    id="fileInput"
                    className="hidden"
                    accept=".json,.jsonl,.csv,.xls,.xlsx"
                    onChange={handleFileChange}
                  />
                  <label htmlFor="fileInput" className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-bg border border-border rounded text-[11px] font-bold hover:bg-surface-2 transition-all">
                    <Upload size={14} /> 浏览文件
                  </label>
                  <span className="text-[11px] text-tx-3 font-mono truncate">{file ? file.name : '等待选择文件...'}</span>
                </div>
                <Button variant="blue" onClick={handleParse} disabled={!file}>
                  解析载入
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-mono font-bold uppercase text-tx-4 ml-1 mb-1 block">输入模式 Input Mode</label>
                  <select 
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-[12.5px] outline-none focus:border-teal/40 transition-all appearance-none"
                    value={inputMode}
                    onChange={e => setInputMode(e.target.value)}
                  >
                    <option value="raw_source">原始岗位源数据（全流程 preprocess + extract）</option>
                    <option value="structured_job_json_extract">标准岗位 JSON（跳过 preprocess，直接 extract）</option>
                    <option value="structured_job_json_fill_missing">标准岗位 JSON（仅补缺失画像字段）</option>
                    <option value="structured_job_json_direct_stage4">标准岗位 JSON（跳过 step3，直接 stage4）</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono font-bold uppercase text-tx-4 ml-1 mb-1 block">失败重试 Retry Limit</label>
                  <input 
                    type="number" 
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-[12.5px] outline-none" 
                    value={retryLimit}
                    onChange={e => setRetryLimit(e.target.value)}
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer group bg-surface-2 px-3 py-2 rounded-lg border border-border hover:border-teal/30 transition-all">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 accent-teal" 
                      checked={autoApply}
                      onChange={e => setAutoApply(e.target.checked)}
                    />
                    <span className="text-[12px] font-medium text-tx-2 group-hover:text-tx-1">构建后自动写入主库</span>
                  </label>
                </div>
              </div>

              <div className="mt-6 flex items-start gap-2 p-3 bg-blue-dim/5 border border-blue-border/10 rounded-lg text-[11px] text-tx-3 leading-relaxed">
                <Info size={14} className="mt-0.5 shrink-0 text-blue" />
                <p>JSON 必须是 object 列表；表格会按表头转 object。多配置会按照并发数自动分配任务。</p>
              </div>
            </CardSection>
            
            <CardSection className="bg-surface-3/30 border-border-2 transition-all hover:bg-surface-3/50">
              <Button variant="ghost" onClick={handlePreflight}>
                <Activity size={14} /> 预检池 (Preflight)
              </Button>
              <Button
                variant="accent"
                onClick={handleStartBuild}
                disabled={!canStartBuild}
                title={startBuildDisabledReason || "开始构建"}
              >
                <Play size={14} fill="currentColor" /> 开始构建 (Start Build)
              </Button>
              {startBuildDisabledReason && (
                <span className="text-[11px] text-tx-3 font-mono">
                  {startBuildDisabledReason}
                </span>
              )}
            </CardSection>
          </Card>

          <Card>
            <CardSection>
              <CardHeader title="解析预览 / Upload Preview" desc="文件解析后的结构化概览" />
              <div className="terminal-box h-[200px] mt-4 font-mono text-[11.5px] whitespace-pre-wrap overflow-auto">
                {uploadSummary || "// 暂无上传记录，请先选择文件并点击“解析载入”。"}
              </div>
            </CardSection>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <Card>
            <CardSection>
              <CardHeader title="任务分配 / Assignment Check" desc="按启用的 API 并发数做加权轮询预检" />
              <div className="mt-4 p-4 bg-surface-2 border-borderdashed border-border-2 rounded-lg flex items-center justify-center font-mono text-[11.5px] text-tx-4">
                {assignmentCheck || "[ 等待执行预检... ]"}
              </div>
              <div className="terminal-box h-[120px] mt-3 font-mono text-[11.5px] overflow-auto">
                {preflightLogs || "// 尚未执行配置预检"}
              </div>
            </CardSection>
          </Card>

          <Card>
            <CardSection>
              <CardHeader title="终端日志 / Builder Console" desc="实时展示当前构建任务进度输出" />
              <div className="mt-4 mb-2 flex items-center gap-2 text-[10.5px] font-mono text-tx-4">
                <TerminalIcon size={12} />
                <span>{summary.jobCount > 0 ? "> Processing Batch..." : "> No active batches detected."}</span>
              </div>
              <div 
                ref={logRef}
                className="terminal-box h-[300px] font-mono text-[11.5px] overflow-auto bg-surface-2/50 border-border shadow-inner"
              >
                {builderLogs}
              </div>
            </CardSection>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Reusing StatItem (In real app this would be a common UI component)
const StatItem = ({ icon, color, label, val }) => {
  const colorMap = {
    blue: 'bg-blue-dim border-blue-border text-blue',
    teal: 'bg-teal-dim border-teal-border text-teal',
    amber: 'bg-amber-dim border-amber-border text-amber',
    violet: 'bg-violet-dim border-[rgba(167,139,250,0.22)] text-violet',
  };
  const iconNode = React.createElement(icon, { size: 15 });

  return (
    <div className="flex items-center gap-[14px] bg-surface border border-border rounded-lg p-[14px_16px] transition-mid hover:border-border-2 group">
      <div className={`w-[34px] h-[34px] rounded-sm flex items-center justify-center shrink-0 border ${colorMap[color]}`}>
        {iconNode}
      </div>
      <div className="flex flex-col gap-[1px]">
        <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-tx-4">{label}</span>
        <span className="font-display text-[20px] font-extrabold tracking-[-0.04em] leading-none text-tx-1">{val}</span>
      </div>
    </div>
  );
};

export default Ingestion;
