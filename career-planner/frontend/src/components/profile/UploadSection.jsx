import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CloudUpload, FileImage, Loader2, Sparkles, X } from 'lucide-react';
import { useData } from '../../context/DataContext';

const UploadSection = ({ onTabChange }) => {
  const fileInputRef = useRef(null);
  const [resumeDataUrl, setResumeDataUrl] = useState(null);
  const [resumeFileName, setResumeFileName] = useState('');
  const { resumeParsing, parseResume, resetResumeParsing, hasUploadedResume } = useData();

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Limit maximum dimension to 1200px for optimal OCR clarity and small file size
        const MAX_DIM = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height *= MAX_DIM / width;
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width *= MAX_DIM / height;
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress to JPEG with 0.75 quality (perfect balance of clarity and size)
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
        setResumeDataUrl(compressedDataUrl);
        setResumeFileName(file.name);
      };
      img.src = loadEvent.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleCancel = () => {
    setResumeDataUrl(null);
    setResumeFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleParse = async () => {
    if (!resumeDataUrl) return;
    await parseResume(resumeDataUrl, resumeFileName);
    handleCancel();
  };

  if (resumeParsing.isParsing) {
    return (
      <section className="overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_20px_60px_rgba(59,130,246,0.08)]">
        <div className="border-b border-slate-100 px-6 py-5 sm:px-8 bg-gradient-to-r from-blue-50/20 to-indigo-50/10">
          <div className="mx-auto max-w-3xl">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <CloudUpload size={20} />
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">简历解析中</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">正在异步将您的简历转换为职业画像数据...</p>
          </div>
        </div>
        <div className="px-6 py-12 sm:px-8 text-center max-w-3xl mx-auto space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm animate-pulse">
            <Loader2 size={32} className="animate-spin text-blue-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">
              大模型正在提取并对齐您的技能画像
            </h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              分析过程中，<span className="text-blue-600 font-semibold">您可以安全地切换到其他模块或页面</span>（例如填写个人介绍、浏览职业匹配等）。解析会在后台继续运行，并在完成后为您呈现审核引导。
            </p>
          </div>
          {resumeParsing.fileName && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-100 bg-blue-50/50 text-xs text-blue-600 font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping" />
              当前解析文件：{resumeParsing.fileName}
            </div>
          )}
        </div>
      </section>
    );
  }

  if (resumeParsing.success) {
    const steps = [
      { id: 'intro', step: '第一步', title: '核对个人介绍', desc: '检查 AI 提炼的个人自述与求职意向。' },
      { id: 'direction', step: '第二步', title: '确认方向标签', desc: '确认求职分类方向及提取的技术细分领域。' },
      { id: 'basic', step: '第三步', title: '校对基础身份', desc: '核准学校、专业、学历以及毕业时间等身份信息。' },
      { id: 'skills', step: '第四步', title: '确认核心技能', desc: '查看提取出的专业技术能力、能级与核心研发工具。' },
      { id: 'exp', step: '第五步', title: '丰富履历经历', desc: '确保实习、项目、科研等经历内容无误并带有量化细节。' },
      { id: 'preview', step: '第六步', title: '预览画像与智能匹配', desc: '一键提交画像，开启多维度确定性人岗匹配！' },
    ];

    return (
      <section className="overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_20px_60px_rgba(59,130,246,0.08)]">
        <div className="border-b border-slate-100 px-6 py-6 sm:px-8 bg-gradient-to-r from-blue-50/50 to-indigo-50/20">
          <div className="mx-auto max-w-3xl flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50 text-green-600">
                <Sparkles size={20} className="animate-pulse" />
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">🎉 简历画像结构化完成！</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                我们已从您的简历中自动提取并对齐了大部分核心属性。为确保最佳的推荐匹配效果，请依次前往核对：
              </p>
            </div>
            <button
              type="button"
              onClick={resetResumeParsing}
              className="text-xs font-semibold px-4 py-2.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-1.5 shrink-0 shadow-sm"
            >
              重新上传简历
            </button>
          </div>
        </div>

        <div className="px-6 py-8 sm:px-8 max-w-3xl mx-auto">
          <div className="grid gap-4 md:grid-cols-2">
            {steps.map((s) => (
              <div
                key={s.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-slate-100 bg-slate-50/30 p-5 transition hover:border-blue-200 hover:bg-blue-50/10"
              >
                <div>
                  <span className="text-xs font-black text-blue-500 tracking-wider uppercase">{s.step}</span>
                  <h3 className="mt-1 text-base font-bold text-slate-900">{s.title}</h3>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{s.desc}</p>
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => onTabChange?.(s.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition"
                  >
                    前往审核 &rarr;
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_20px_60px_rgba(59,130,246,0.08)]">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        className="hidden"
      />

      <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
        <div className="mx-auto max-w-3xl">
          {/* overwrite warning */}
          {hasUploadedResume && (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-850 flex items-start gap-3 shadow-sm">
              <Sparkles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">⚠️ 提示：</span>
                您之前已在此账号导入过简历。再次上传并导入将<span className="font-semibold text-amber-950 underline decoration-amber-500 underline-offset-2">完全覆盖</span>现有的画像与草稿数据，请谨慎操作。
              </div>
            </div>
          )}

          {/* error box */}
          {resumeParsing.error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-800 flex items-start justify-between gap-3 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="font-bold shrink-0 mt-0.5">⚠️ 导入失败：</span>
                <div>
                  <p className="font-medium text-red-950">{resumeParsing.error}</p>
                  <p className="mt-1 text-xs text-red-600">请检查图片格式或网络连接，然后重试。</p>
                </div>
              </div>
              <button
                onClick={resetResumeParsing}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 transition shrink-0"
              >
                清除错误
              </button>
            </div>
          )}

          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <CloudUpload size={20} />
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">上传简历</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">导入简历图片，快速带入已有内容。</p>
        </div>
      </div>

      <div className="px-6 py-8 sm:px-8">
        <AnimatePresence mode="wait">
          {resumeDataUrl ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-auto grid max-w-3xl gap-6 md:grid-cols-[180px_minmax(0,1fr)] md:items-center"
            >
              <div className="relative mx-auto w-full max-w-[180px]">
                <img
                  src={resumeDataUrl}
                  alt="Resume preview"
                  className="h-[240px] w-full rounded-[24px] border border-blue-100 object-cover shadow-[0_18px_40px_rgba(59,130,246,0.14)]"
                />
                <button
                  type="button"
                  onClick={handleCancel}
                  className="absolute -right-2 -top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white bg-white text-slate-500 shadow-md transition hover:text-blue-600"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-500">已选择文件</p>
                  <h3 className="break-all text-xl font-semibold text-slate-900">{resumeFileName}</h3>
                  <p className="text-sm leading-6 text-slate-500">导入后可继续补充个人介绍、方向标签和基础信息。</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={resumeParsing.isParsing}
                    onClick={handleParse}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                  >
                    {resumeParsing.isParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {resumeParsing.isParsing ? '导入中...' : '开始导入'}
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                  >
                    重新选择
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mx-auto max-w-3xl"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group w-full rounded-[28px] border border-dashed border-blue-200 bg-blue-50/50 px-6 py-12 text-center transition hover:border-blue-300 hover:bg-blue-50"
              >
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm transition group-hover:-translate-y-0.5">
                  <CloudUpload size={26} />
                </span>
                <span className="mt-5 block text-xl font-semibold text-slate-900">上传简历图片</span>
                <span className="mt-2 block text-sm text-slate-500">支持 JPG、PNG、WEBP</span>
                <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition group-hover:bg-blue-700">
                  <FileImage size={16} />
                  选择文件
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

export default UploadSection;
