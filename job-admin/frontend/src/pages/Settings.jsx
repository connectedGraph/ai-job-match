import React, { useState, useEffect } from 'react';
import { Card, CardSection, CardHeader } from '../components/ui/Card';
import Button, { cn } from '../components/ui/Button';
import { 
  Plus, 
  Trash2, 
  Save, 
  Play, 
  Settings as SettingsIcon,
  Shield,
  Key,
  Server,
  Loader2
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useApi } from '../hooks/useApi';

const CONFIG_STORAGE_KEY = "portrait_builder_configs_v1";

const normalizeBuilderConfig = (config = {}) => ({
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
});

const Settings = () => {
  const { showToast } = useToast();
  const { fetchJson } = useApi();
  const [configs, setConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [testLogs, setTestLogs] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved).map(normalizeBuilderConfig);
        setConfigs(parsed);
        if (parsed.length > 0) setSelectedConfig(parsed[0]);
      } catch {
        setConfigs([]);
      }
    } else {
      // Create a default config if empty
      const defaultCfg = createDefaultConfig();
      setConfigs([defaultCfg]);
      setSelectedConfig(defaultCfg);
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify([defaultCfg]));
    }
  }, []);

  const saveToStorage = (newConfigs) => {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(newConfigs));
  };

  const handleAdd = () => {
    const newCfg = createDefaultConfig();
    const updated = [...configs, newCfg];
    setConfigs(updated);
    setSelectedConfig(newCfg);
    saveToStorage(updated);
    showToast("New configuration added.", "info");
  };

  const handleDelete = () => {
    if (!selectedConfig) return;
    if (!window.confirm(`Delete configuration "${selectedConfig.name}"?`)) return;
    
    const updated = configs.filter(c => c.id !== selectedConfig.id);
    setConfigs(updated);
    setSelectedConfig(updated.length > 0 ? updated[0] : null);
    saveToStorage(updated);
    showToast("Configuration removed.", "success");
  };

  const handleSave = () => {
    if (!selectedConfig) return;
    const normalized = normalizeBuilderConfig(selectedConfig);
    const updated = configs.some(c => c.id === normalized.id)
      ? configs.map(c => c.id === normalized.id ? normalized : c)
      : [normalized, ...configs];
    setConfigs(updated);
    setSelectedConfig(normalized);
    saveToStorage(updated);
    showToast("Configuration saved to local storage.", "success");
  };

  const updateField = (field, value) => {
    setSelectedConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleTest = async () => {
    if (!selectedConfig) return;
    const configForTest = normalizeBuilderConfig(selectedConfig);
    setTesting(true);
    setTestLogs(`[Test] Initiating connection to ${configForTest.baseUrl}...\n`);
    try {
      const result = await fetchJson('/api/builder/configs/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configForTest }),
      });
      const updated = configs.some(c => c.id === configForTest.id)
        ? configs.map(c => c.id === configForTest.id ? configForTest : c)
        : [configForTest, ...configs];
      setConfigs(updated);
      setSelectedConfig(configForTest);
      saveToStorage(updated);
      setTestLogs(prev => prev + [
        `[Success] ${result.configName} responded in ${result.latencyMs}ms.`,
        `[Model] ${result.model}`,
        `[Mode] ${result.apiMode}`,
        `[Reply] ${result.responseText}`,
        `[Ready] Node is functional and saved for build.`,
      ].join('\n'));
      showToast("Connection test passed and config saved.", "success");
    } catch (err) {
      setTestLogs(prev => prev + `[Error] ${err.message}\n[Failed] Connection terminated.`);
      showToast(err.message || "Test failed.", "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-7 animate-fade-up max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-tx-1 tracking-[-0.03em] leading-tight mb-1">Configurations 配置池</h1>
          <p className="text-[12.5px] text-tx-2">维护 OpenAI 兼容配置与并发策略。配置保留在本地 localStorage 中。</p>
        </div>
        <Button variant="accent" onClick={handleAdd}>
          <Plus size={14} /> 新增配置
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* Left Column: Config List */}
        <div className="space-y-4">
          <Card>
            <CardSection>
              <span className="font-mono text-[10px] uppercase tracking-widest text-tx-4 mb-4 block">Saved Configurations</span>
              <div className="space-y-2">
                {configs.map(cfg => (
                  <div 
                    key={cfg.id}
                    onClick={() => setSelectedConfig(cfg)}
                    className={cn(
                      "p-4 border rounded-xl flex items-center justify-between cursor-pointer transition-all hover:bg-surface-2",
                      selectedConfig?.id === cfg.id ? "bg-surface-3/30 border-border-2 transition-all shadow-sm group-hover:border-teal/30 w-full flex-1" : "bg-bg border-border",
                      !cfg.enabled && "opacity-60"
                    )}
                  >
                    <div className="min-w-0 pr-4">
                      <div className="text-[13px] font-bold text-tx-1 truncate">{cfg.name}</div>
                      <div className="text-[10px] text-tx-4 font-mono mt-1 mt-1 truncate">{cfg.baseUrl || 'No URL'}</div>
                    </div>
                    {cfg.enabled ? (
                      <div className="w-2 h-2 rounded-full bg-teal shadow-[0_0_8px_rgba(29,233,182,0.6)]" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-border" />
                    )}
                  </div>
                ))}
                {configs.length === 0 && (
                  <div className="p-8 text-center text-tx-4 italic text-xs">No configurations found.</div>
                )}
              </div>
            </CardSection>
          </Card>

          <Card>
            <CardSection className="bg-amber-dim/5 border border-amber-border/10 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Shield size={18} className="text-amber mt-0.5 shrink-0" />
                <div className="text-[12px] text-tx-3 leading-relaxed">
                  <span className="font-bold text-tx-1 block mb-1">Security Note</span>
                  API Key 保存在浏览器本地；构建或匹配请求会发送到本地后端用于调用模型，不会写入仓库文件。清除浏览器缓存会导致配置丢失。
                </div>
              </div>
            </CardSection>
          </Card>
        </div>

        {/* Right Column: Editor */}
        <div className="space-y-6">
          {!selectedConfig ? (
            <div className="h-[400px] flex flex-col items-center justify-center text-tx-4 border border-border border-dashed rounded-2xl">
              <SettingsIcon size={48} className="opacity-10 mb-4" />
              <p className="text-sm">Click "Add Config" or select an item to edit</p>
            </div>
          ) : (
            <>
              <Card>
                <CardSection>
                  <CardHeader title="配置编辑器 / Node Editor" desc="修改并保存后立即更新本地配置池" />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <FieldInput label="配置名称 Name" value={selectedConfig.name} onChange={v => updateField('name', v)} placeholder="e.g. GPT-4o Production" />
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer group bg-surface-2 px-4 py-2 rounded-lg border border-border hover:border-teal/30 transition-all w-full">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 accent-teal" 
                          checked={selectedConfig.enabled}
                          onChange={e => updateField('enabled', e.target.checked)}
                        />
                        <span className="text-[13px] font-bold text-tx-1 uppercase tracking-tight">启用该配置 (Enable Node)</span>
                      </label>
                    </div>

                    <div className="md:col-span-1">
                      <label className="text-[10px] font-mono font-bold uppercase text-tx-4 ml-1 mb-1 block">应用阶段 Stage Role</label>
                      <select 
                        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-[12.5px] outline-none"
                        value={selectedConfig.stageRole}
                        onChange={e => updateField('stageRole', e.target.value)}
                      >
                        <option value="all">All Stages (全部阶段)</option>
                        <option value="preprocess">Preprocess 专用</option>
                        <option value="extract">Extract 专用</option>
                      </select>
                    </div>

                    <div className="md:col-span-1">
                      <label className="text-[10px] font-mono font-bold uppercase text-tx-4 ml-1 mb-1 block">调用模式 API Mode</label>
                      <select 
                        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-[12.5px] outline-none"
                        value={selectedConfig.apiMode}
                        onChange={e => updateField('apiMode', e.target.value)}
                      >
                        <option value="chat_completions">Chat Completions (标准)</option>
                        <option value="responses">Responses (特定模型)</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-[10px] font-mono font-bold uppercase text-tx-4 ml-1 mb-1 block">Base URL</label>
                      <div className="relative group">
                         <Server size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-4" />
                         <input className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-2 text-[12.5px] outline-none" value={selectedConfig.baseUrl} onChange={e => updateField('baseUrl', e.target.value)} placeholder="https://api.openai.com/v1" />
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-[10px] font-mono font-bold uppercase text-tx-4 ml-1 mb-1 block">API Key</label>
                      <div className="relative group">
                         <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-4" />
                         <input type="password" className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-2 text-[12.5px] outline-none" value={selectedConfig.apiKey} onChange={e => updateField('apiKey', e.target.value)} placeholder="sk-..." />
                      </div>
                    </div>

                    <FieldInput label="模型标识 Model ID" value={selectedConfig.model} onChange={v => updateField('model', v)} placeholder="e.g. gpt-4o" />
                    <FieldInput label="并发线程 Concurrency" type="number" value={selectedConfig.concurrency} onChange={v => updateField('concurrency', v)} />
                  </div>
                </CardSection>
                <CardSection className="bg-surface-2/30 border-t border-border flex justify-between gap-3">
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={handleTest} disabled={testing}>
                      {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      测试调用
                    </Button>
                    <Button variant="danger" ghost onClick={handleDelete}>
                      <Trash2 size={14} /> 删除
                    </Button>
                  </div>
                  <Button variant="accent" className="px-10" onClick={handleSave}>
                    <Save size={14} /> 保存配置
                  </Button>
                </CardSection>
              </Card>

              <Card>
                <CardSection>
                  <CardHeader title="Test Console / 测试结果" desc="实时模拟 API 联通性测试" />
                  <div className="terminal-box h-[150px] mt-4 p-4 font-mono text-[11.5px] overflow-auto bg-surface-2/50 border-border shadow-inner font-mono text-tx-3 selection:bg-teal selection:text-surface-3">
                    {testLogs || "// 尚未执行测试调用"}
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

const FieldInput = ({ label, value, onChange, placeholder, type = "text" }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-mono font-bold uppercase text-tx-4 ml-1">{label}</label>
    <input 
      type={type}
      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-[12.5px] outline-none focus:border-teal/40 transition-all font-medium"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </div>
);

function createDefaultConfig() {
  return {
    id: "cfg_" + Date.now() + Math.random().toString(16).slice(2, 8),
    name: "新配置-" + new Date().toLocaleDateString(),
    baseUrl: "",
    apiKey: "",
    model: "gpt-4o-mini",
    stageRole: "all",
    apiMode: "chat_completions",
    chatSystemRole: "system",
    chatCompletionsSystemRole: "system",
    concurrency: 5,
    requestsPerMinute: 800,
    temperature: 0.2,
    maxTokens: 4000,
    enabled: true
  };
}

export default Settings;
