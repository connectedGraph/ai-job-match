import React, { useCallback, useEffect, useState } from 'react';
import { marked } from 'marked';
import { Card, CardSection, CardHeader } from '../components/ui/Card';
import Button, { cn } from '../components/ui/Button';
import {
  FileJson,
  Loader2,
  Send,
  Shield,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';

const HISTORY_KEY = 'match_history_react_v1';
const INPUT_DRAFT_KEY = 'match_input_react_v1';

function getCompetitivenessScore(job = {}) {
  const value = job.reportScore
    ?? job.report_score
    ?? job.competitiveness_score
    ?? job.competitivenessScore
    ?? job.scoring?.competitiveness_score
    ?? job.score_breakdown?.competitiveness
    ?? job.match_score
    ?? job.matchScore
    ?? job.scoring?.match_score
    ?? job.score_breakdown?.match
    ?? 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getMatchScore(job = {}) {
  const value = job.match_score
    ?? job.matchScore
    ?? job.scoring?.match_score
    ?? job.score_breakdown?.match
    ?? 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getGoldScore(job = {}) {
  const value = job.gold_score
    ?? job.goldScore
    ?? job.scoring?.gold_score
    ?? job.score_breakdown?.raw?.gold_profile
    ?? job.gold_assessment?.total_score
    ?? 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function loadMatchHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

const BasicMatchPage = () => {
  const { fetchJson, loading } = useApi();
  const { showToast } = useToast();

  const [inputJson, setInputJson] = useState(() => localStorage.getItem(INPUT_DRAFT_KEY) || '');
  const [history, setHistory] = useState(loadMatchHistory);
  const [result, setResult] = useState(null);

  useEffect(() => {
    localStorage.setItem(INPUT_DRAFT_KEY, inputJson);
  }, [inputJson]);

  const saveToHistory = useCallback((studentData, matchResult) => {
    const newEntry = {
      id: Date.now(),
      time: new Date().toLocaleString(),
      studentName: studentData.student_id || studentData.basicInfo?.name || studentData.name || 'Unknown',
      direction: studentData.direction || 'General',
      studentInput: studentData,
      data: matchResult,
    };
    const newHistory = [newEntry, ...history.slice(0, 19)];
    setHistory(newHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
  }, [history]);

  const handleMatch = async () => {
    let studentData;
    try {
      studentData = JSON.parse(inputJson);
    } catch (error) {
      showToast(`JSON 校验失败: ${error.message}`, 'error');
      return;
    }

    try {
      setResult(null);
      const savedConfigs = JSON.parse(localStorage.getItem('portrait_builder_configs_v1') || '[]');
      const activeConfig = savedConfigs.find((item) => item.enabled);

      const data = await fetchJson('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: studentData,
          config: activeConfig,
        }),
      });

      setResult(data);
      saveToHistory(studentData, data);
      showToast('Match report generated successfully', 'success');
    } catch (error) {
      setResult(null);
      showToast(`匹配失败: ${error.message}`, 'error');
    }
  };

  const clearHistory = () => {
    if (!window.confirm('Clear all history?')) return;
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
    showToast('History cleared', 'info');
  };

  const loadFromHistory = (item) => {
    setResult(item.data);
    setInputJson(JSON.stringify(item.studentInput, null, 2));
    showToast(`Loaded ${item.studentName}'s report`, 'success');
  };

  return (
    <div className="p-5 md:p-7 animate-fade-up max-w-[1400px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        <div className="space-y-5">
          <Card>
            <CardSection className="bg-surface-2/50 border-b border-border">
              <CardHeader
                title="📝 学生画像 (JSON)"
                desc="输入学生画像数据进行基础匹配评估"
              />
            </CardSection>
            <CardSection>
              <textarea
                className="w-full bg-bg border border-border-2 rounded-sm p-3 font-mono text-xs text-tx-1 min-h-[300px] outline-none focus:border-teal/50 focus:ring-4 focus:ring-teal/5 transition-all resize-none"
                value={inputJson}
                onChange={(event) => setInputJson(event.target.value)}
                spellCheck={false}
              />
              <Button
                variant="accent"
                className="w-full mt-4 h-11"
                onClick={() => handleMatch()}
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                生成三梯度匹配报告
              </Button>
              {loading ? (
                <div className="mt-3 flex items-center justify-center gap-2 text-teal text-[11px] animate-pulse">
                  <Loader2 className="animate-spin" size={12} />
                  倒排索引检索中，AI 模型评估中...
                </div>
              ) : null}
            </CardSection>
          </Card>

          <Card className="hidden md:block">
            <CardSection className="bg-blue-dim/10 border-b border-blue-border/20">
              <CardHeader title="🧭 Demo 输入说明" className="mb-0" />
            </CardSection>
            <CardSection className="space-y-4 text-xs text-tx-2">
              <p>按保守、精准、冲刺三档返回岗位。后端评分会把技术栈、核心能力、协作工具聚合为 80% 权重。</p>
              <div className="space-y-1.5 font-mono text-[11px]">
                <InfoRow label="techStack" value="掌握技术" />
                <InfoRow label="techCapabilities" value="抽象能力" />
                <InfoRow label="softQuality" value="软素质" />
              </div>
            </CardSection>
          </Card>

          <Card>
            <CardHeader
              title="📂 历史匹配记录"
              className="px-5 pt-4 mb-0"
              hint={<Button variant="ghost" size="sm" className="p-1 h-auto" onClick={clearHistory}><Trash2 size={12} /></Button>}
            />
            <CardSection className="max-h-[300px] overflow-y-auto pt-2">
              {history.length === 0 ? (
                <div className="text-center py-6 text-tx-4 text-xs italic">暂无记录，匹配后自动保存</div>
              ) : (
                <div className="space-y-2">
                  {history.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => loadFromHistory(item)}
                      className="w-full text-left p-3 rounded-lg border border-border bg-bg/50 hover:bg-surface-2 hover:border-border-2 cursor-pointer transition-all group"
                    >
                      <div className="text-[10px] text-tx-4 mb-1">{item.time}</div>
                      <div className="text-sm font-bold text-tx-1 group-hover:text-teal truncate">{item.studentName} · {item.direction}</div>
                      <div className="flex gap-2 mt-2">
                        <Badge count={item.data?.topJobs?.safety?.length || 0} label="保守" color="emerald" />
                        <Badge count={item.data?.topJobs?.target?.length || 0} label="精准" color="blue" />
                        <Badge count={item.data?.topJobs?.reach?.length || 0} label="冲刺" color="amber" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardSection>
          </Card>
        </div>

        <div className="bg-surface border border-border rounded-xl min-h-[600px] flex flex-col shadow-sm relative overflow-hidden">
          {loading ? (
            <div className="absolute inset-0 bg-surface/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center animate-in fade-in duration-300">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-teal/10 border-t-teal rounded-full animate-spin" />
                <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-teal animate-pulse" size={24} />
              </div>
              <div className="mt-6 text-center">
                <h3 className="text-sm font-bold text-tx-1">正在生成深度匹配报告</h3>
                <p className="text-[11px] text-tx-4 mt-2 font-mono">AI 引擎正在分析岗位画像与学生能力的契合度...</p>
              </div>
            </div>
          ) : null}

          {!result ? (
            <div className="flex-1 flex flex-col items-center justify-center text-tx-4 p-10 text-center">
              <div className="w-16 h-16 bg-surface-2 rounded-full flex items-center justify-center mb-5">
                <FileJson size={32} className="opacity-20" />
              </div>
              <h3 className="text-sm font-bold text-tx-2 mb-2">在左侧输入学生画像并点击「生成匹配报告」</h3>
              <p className="text-xs max-w-xs">系统将调用后端 match 算法，分析保守/精准/冲刺岗位各 5 个。</p>
            </div>
          ) : (
            <ResultView data={result} />
          )}
        </div>
      </div>
    </div>
  );
};

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between p-2 bg-surface-2 rounded-sm">
    <span className="text-blue">{label}</span>
    <span className="text-tx-3">{value}</span>
  </div>
);

const Badge = ({ count, label, color }) => (
  <span className={cn(
    'flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border',
    color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
    color === 'blue' ? 'bg-blue-500/10 border-blue-500/20 text-blue' :
    'bg-amber-500/10 border-amber-500/20 text-amber'
  )}>
    <span className={cn('w-1.5 h-1.5 rounded-full', color === 'emerald' ? 'bg-emerald-500' : color === 'blue' ? 'bg-blue-500' : 'bg-amber-500')} />
    {label} {count}
  </span>
);

const ResultView = ({ data }) => {
  return (
    <div className="p-6 overflow-auto animate-fade-up">
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="bg-teal-dim text-teal text-[10px] font-bold px-2 py-0.5 rounded-full border border-teal-border">实时报告</span>
          <span className="text-[11px] text-tx-4">{new Date().toLocaleString()}</span>
        </div>
        <Button variant="ghost" size="sm" className="h-8 text-[11px]"><FileJson size={12} /> 导出 JSON</Button>
      </div>

      {data.analysis ? (
        <div
          className="prose prose-sm prose-invert max-w-none bg-surface-2/50 border border-border p-6 rounded-xl mb-7 text-tx-2"
          dangerouslySetInnerHTML={{ __html: marked.parse(data.analysis) }}
        />
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <TierColumn icon={Shield} title="保守岗" label="匹配度高" color="emerald" jobs={data.topJobs?.safety || []} />
        <TierColumn icon={Target} title="精准岗" label="能力匹配" color="blue" jobs={data.topJobs?.target || []} />
        <TierColumn icon={TrendingUp} title="冲刺岗" label="挑战高潜" color="amber" jobs={data.topJobs?.reach || []} />
      </div>
    </div>
  );
};

const TierColumn = ({ icon, title, label, color, jobs }) => {
  const IconComponent = icon;
  return (
    <div className="space-y-4">
      <div className={cn(
        'p-3 rounded-lg flex items-center justify-between border',
        color === 'emerald' ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-500' :
        color === 'blue' ? 'bg-blue-500/5 border-blue-500/10 text-blue' :
        'bg-amber-500/5 border-amber-500/10 text-amber'
      )}>
        <div className="flex items-center gap-2">
          <IconComponent size={16} />
          <span className="font-bold text-sm">{title}</span>
        </div>
        <span className="text-[10px] font-medium opacity-70">{label}</span>
      </div>
      <div className="space-y-3">
        {(!jobs || jobs.length === 0) ? (
          <div className="p-4 bg-bg border border-border border-dashed rounded-lg text-tx-4 text-xs text-center">暂无合适推荐</div>
        ) : (
          jobs.map((job, index) => <JobCard key={`${job.id || job.title}-${index}`} job={job} color={color} />)
        )}
      </div>
    </div>
  );
};

const JobCard = ({ job, color }) => {
  const isMatched = job.tier && !job.tier.includes('未达标');
  const score = getMatchScore(job);

  return (
    <div className={cn(
      'group p-4 bg-bg border rounded-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-xl',
      isMatched ? (
        color === 'emerald' ? 'border-emerald-500/20 hover:border-emerald-500/40 bg-emerald-500/[0.02]' :
        color === 'blue' ? 'border-blue-500/20 hover:border-blue-500/40 bg-blue-500/[0.02]' :
        'border-amber-500/20 hover:border-amber-500/40 bg-amber-500/[0.02]'
      ) : 'border-border opacity-60 grayscale hover:grayscale-0'
    )}>
      <div className="flex justify-between items-start mb-3">
        <div className="min-w-0">
          <span className={cn(
            'text-[9px] font-bold px-1.5 py-0.5 rounded-full border',
            color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
            color === 'blue' ? 'bg-blue-500/10 border-blue-500/20 text-blue' :
            'bg-amber-500/10 border-amber-500/20 text-amber'
          )}>{job.tier || '未知'}</span>
          <h4 className="font-bold text-tx-1 text-sm mt-1.5 truncate leading-tight">{job.title}</h4>
          <p className="text-[11px] text-tx-3 mt-1 truncate">{job.companyName} · {formatSalary(job.metadata?.salaryRange)}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-black font-display text-tx-1 leading-none">{score.toFixed(1)}</div>
          <div className="text-[10px] text-tx-4 font-bold uppercase tracking-tight mt-1">原始匹配</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 bg-surface-2/60 p-2 rounded-lg mb-3">
        <StatItem label="岗位匹配" val={getMatchScore(job).toFixed(0)} />
        <StatItem label="技术分" val={Number(job.score_tech || 0).toFixed(0)} />
        <StatItem label="精确覆盖" val={`${((job.exact_match_ratio || 0) * 100).toFixed(0)}%`} />
        <StatItem label="核心能力" val={job.score_tech_capability?.toFixed(0) || '—'} />
      </div>

      <div className="flex flex-wrap gap-1">
        {job.overflows?.map((tag) => <TagPill key={`plus-${tag}`} type="plus" text={tag} />)}
        {job.similars?.map((tag) => <TagPill key={`sim-${tag}`} type="sim" text={tag} />)}
        {job.missings?.map((tag) => <TagPill key={`minus-${tag}`} type="minus" text={tag} />)}
      </div>
    </div>
  );
};

const StatItem = ({ label, val }) => (
  <div>
    <div className="text-[9px] text-tx-4 font-medium mb-0.5">{label}</div>
    <div className="text-[11px] font-bold text-tx-2">{val}</div>
  </div>
);

const TagPill = ({ type, text }) => {
  const styles = {
    plus: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/10',
    sim: 'bg-amber-500/10 text-amber-500 border-amber-500/10',
    minus: 'bg-red-500/10 text-red-500 border-red-500/10',
  };
  const prefixes = { plus: '+', sim: '~', minus: '-' };
  return (
    <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded border', styles[type])}>
      {prefixes[type]}{text}
    </span>
  );
};

function formatSalary(range) {
  if (!Array.isArray(range) || range.length !== 2) return '薪资面议';
  const [min, max] = range.map((value) => Number(value));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return '薪资面议';
  const formatK = (value) => `${Number((value / 1000).toFixed(1)).toString()}k`;
  return min === max ? `${formatK(min)}/月` : `${formatK(min)}-${formatK(max)}/月`;
}

export default BasicMatchPage;
