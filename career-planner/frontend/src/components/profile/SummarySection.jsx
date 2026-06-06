import React from 'react';
import { NotebookPen } from 'lucide-react';
import { useData } from '../../context/DataContext';

const SummarySection = () => {
  const { studentData, setStudentData } = useData();
  const summary = studentData.summary || '';

  return (
    <section className="overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_20px_60px_rgba(59,130,246,0.08)]">
      <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <NotebookPen size={20} />
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">个人介绍</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">用几句话说明你的方向、优势和代表性经历。</p>
          </div>

          <div className="text-xs font-medium text-slate-400">{summary.trim().length} 字</div>
        </div>
      </div>

      <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="space-y-4">
          <textarea
            value={summary}
            onChange={(event) => setStudentData({ ...studentData, summary: event.target.value })}
            placeholder="例如：我主要关注前端与 AI 应用开发，擅长把复杂需求拆成可交付方案。过去在项目和实习里持续负责页面搭建、协作推进与效果优化。"
            className="min-h-[320px] w-full rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          />
          <p className="text-xs text-slate-400">内容会自动保存在当前草稿中。</p>
        </div>

        <div className="rounded-[24px] border border-blue-100 bg-blue-50/60 p-5">
          <h3 className="text-sm font-semibold text-slate-900">建议聚焦</h3>
          <div className="mt-4 space-y-4 text-sm text-slate-500">
            <div>
              <p className="font-medium text-slate-700">方向</p>
              <p className="mt-1 leading-6">说明你想投递的岗位，以及为什么适合。</p>
            </div>
            <div>
              <p className="font-medium text-slate-700">优势</p>
              <p className="mt-1 leading-6">写清楚你的核心能力、做事风格或技术侧强项。</p>
            </div>
            <div>
              <p className="font-medium text-slate-700">代表经历</p>
              <p className="mt-1 leading-6">用一两段项目、实习或成果支撑你的判断。</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SummarySection;
