import React, { useEffect, useState } from 'react';
import { Card, CardSection, CardHeader } from '../components/ui/Card';
import { 
  Users, 
  Tag as TagIcon, 
  Zap, 
  Terminal
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';

const emptySummary = { jobCount: 0, tagCount: 0, highFrequencyTagCount: 0, runCount: 0 };

const formatStat = (value) => Number(value || 0).toLocaleString('en-US');

const StatCard = ({ icon, color, label, val }) => {
  const colorMap = {
    blue: 'bg-blue-dim border-blue-border text-blue',
    teal: 'bg-teal-dim border-teal-border text-teal',
    amber: 'bg-amber-dim border-amber-border text-amber',
    violet: 'bg-violet-dim border-[rgba(167,139,250,0.22)] text-violet',
  };

  return (
    <div className="flex items-center gap-[14px] bg-surface border border-border rounded-lg p-[16px_18px] transition-mid hover:border-border-2 hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(0,0,0,0.15)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.35)] group">
      <div className={`w-[38px] h-[38px] rounded-sm flex items-center justify-center shrink-0 border ${colorMap[color]}`}>
        {React.createElement(icon, { size: 17 })}
      </div>
      <div className="flex flex-col gap-[2px]">
        <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-tx-3">{label}</span>
        <span className="font-display text-[26px] font-extrabold tracking-[-0.04em] leading-none text-tx-1">{val}</span>
      </div>
    </div>
  );
};

const RouteCard = ({ to, pill, title, desc, hint, disabled }) => {
  if (disabled) {
    return (
      <div className="flex flex-col bg-surface border border-border border-dashed rounded-xl p-6 opacity-60">
        <div className="self-start font-mono text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-[6px] bg-surface-3 text-tx-3 border border-border-2 mb-4">
          {pill}
        </div>
        <h3 className="font-display text-base font-bold text-tx-1 mb-2 leading-tight">{title}</h3>
        <p className="text-[12.5px] text-tx-2 leading-relaxed flex-1">{desc}</p>
        <div className="mt-5 pt-4 border-t border-dashed border-border-2 font-mono text-[10.5px] text-tx-4 leading-relaxed">
          {hint}
        </div>
      </div>
    );
  }

  return (
    <Link to={to} className="flex flex-col bg-surface border border-border rounded-xl p-6 transition-mid hover:-translate-y-1 hover:border-teal-border hover:shadow-[0_12px_32px_rgba(0,0,0,0.15)] dark:hover:shadow-[0_12px_32px_rgba(0,0,0,0.4)] hover:bg-surface-2 group">
      <div className="self-start font-mono text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-[6px] bg-teal-dim text-teal border border-teal-border mb-4">
        {pill}
      </div>
      <h3 className="font-display text-base font-bold text-tx-1 mb-2 leading-tight group-hover:text-teal">{title}</h3>
      <p className="text-[12.5px] text-tx-2 leading-relaxed flex-1">{desc}</p>
      <div className="mt-5 pt-4 border-t border-dashed border-border-2 font-mono text-[10.5px] text-tx-4 leading-relaxed bg-transparent">
        {hint}
      </div>
    </Link>
  );
};

const Dashboard = () => {
  const { fetchJson } = useApi();
  const { showToast } = useToast();
  const [summary, setSummary] = useState(emptySummary);

  useEffect(() => {
    let isMounted = true;

    const loadSummary = async () => {
      try {
        const data = await fetchJson('/api/admin/summary');
        if (isMounted) {
          setSummary({ ...emptySummary, ...data });
        }
      } catch (err) {
        if (isMounted) {
          showToast(err.message, 'error');
        }
      }
    };

    loadSummary();

    return () => {
      isMounted = false;
    };
  }, [fetchJson, showToast]);

  return (
    <div className="p-7 animate-fade-up">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold text-tx-1 tracking-[-0.03em] leading-tight mb-1">Dashboard 系统总览</h1>
        <p className="text-[12.5px] text-tx-2 max-w-[500px]">系统入口拆分完成，功能按页面切换。不再把岗位库、上传、Tag、运行和配置堆在同一张首页上。首页只负责总览和跳转。</p>
      </div>

      {/* 数据统计条 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard icon={Users} color="blue" label="Total Jobs" val={formatStat(summary.jobCount)} />
        <StatCard icon={TagIcon} color="teal" label="Normal Tags" val={formatStat(summary.tagCount)} />
        <StatCard icon={Zap} color="amber" label="High Freq Tech" val={formatStat(summary.highFrequencyTagCount)} />
        <StatCard icon={Terminal} color="violet" label="Run Batches" val={formatStat(summary.runCount)} />
      </div>

      {/* 网格路由卡片区 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-7">
        <RouteCard 
          to="/jobs" 
          pill="Matrix" 
          title="岗位库" 
          desc="岗位浏览、搜索、单岗位详情与增删改查入口。" 
          hint="当前主数据直接写回 `dataset/career.json`。" 
        />
        <RouteCard 
          to="/ingest" 
          pill="Ingest" 
          title="上传构建" 
          desc="导入原始岗位文件，走标准化和画像构建任务。" 
          hint="后续这里会接上传后自动入库与自动归一。" 
        />
        <RouteCard 
          to="/tags" 
          pill="Tags" 
          title="Tag 中心" 
          desc="查看 Tag 频次、高频候选和后续归一入口。" 
          hint="`>1%` 高频 Tag 是后续自动归一目标集合。" 
        />
        <RouteCard 
          to="/runs" 
          pill="Runs" 
          title="运行记录" 
          desc="查看上传批次、失败明细、日志和导出文件。" 
          hint="运行产物保存在 `dataset/runtime_data/`。" 
        />
        <RouteCard 
          to="/settings" 
          pill="Config" 
          title="配置池" 
          desc="本地保存 OpenAI 兼容配置与并发策略。" 
          hint="上传构建会直接复用这里的已启用配置。" 
        />
        <RouteCard 
          to="/normalize" 
          pill="Normalize" 
          title="归一中心" 
          desc="执行向量相似度合并与 AI 自动化校验。" 
          hint="稳定岗位画像，消除数据孤岛与冗余。" 
        />
        <RouteCard 
          pill="Roadmap" 
          title="下一步重点" 
          desc="上传后自动入岗位库，以及 Tag 主表与高频归一候选写入。" 
          hint="这一层下周继续实现。" 
          disabled 
        />
      </div>

      {/* 底部附加信息区 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
        <Card>
          <CardSection>
            <CardHeader 
              title="System Constraints / 当前系统口径" 
              desc="这几个规则已经固定下来，后续实现直接围绕它展开。" 
            />
            <div className="terminal-box">
{`1. 岗位库支持增删改查
2. 上传构建是后台的一个功能页，不是独立系统
3. 上传后要自动画像化
4. Tag 归一只对历史高频 canonical tag 做候选匹配
5. 如果是第一次上传，没有历史 tag，则不归一
6. 归一只回填 \`normalizedTag\` 与 \`freq\`，不再写回旧版归一化痕迹字段`}
            </div>
          </CardSection>
        </Card>

        <Card>
          <CardSection>
            <CardHeader 
              title="Local Entry / 本地入口" 
              desc="保留已有匹配和调试页，但后台管理已经切换为多页面结构。" 
            />
            <div className="flex flex-wrap gap-2 mb-4">
              <Link to="/match" className="inline-flex items-center gap-2 px-4 py-2 bg-teal text-tx-inv font-bold rounded-sm text-[12.5px] hover:brightness-110 transition-all">
                进入匹配页
              </Link>
              <Link to="/jobs" className="inline-flex items-center gap-2 px-4 py-2 bg-surface-2 border border-border-2 text-tx-1 font-semibold rounded-sm text-[12.5px] hover:bg-surface-3 transition-all">
                进入岗位库
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/match" className="inline-flex items-center gap-2 px-4 py-2 bg-transparent border border-border text-tx-2 rounded-sm text-[11.5px] hover:bg-surface-2 hover:text-tx-1 transition-all">
                <Users size={14} />
                匹配页
              </Link>
              <button className="inline-flex items-center gap-2 px-4 py-2 bg-transparent border border-border text-tx-2 rounded-sm text-[11.5px] hover:bg-surface-2 hover:text-tx-1 transition-all">
                <Terminal size={14} />
                调试页
              </button>
            </div>
          </CardSection>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
