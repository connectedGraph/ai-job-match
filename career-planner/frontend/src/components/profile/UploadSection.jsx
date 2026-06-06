import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CloudUpload, FileImage, Loader2, Sparkles, X } from 'lucide-react';
import api from '../../services/api';
import { useData } from '../../context/DataContext';

const UploadSection = () => {
  const fileInputRef = useRef(null);
  const [resumeDataUrl, setResumeDataUrl] = useState(null);
  const [resumeFileName, setResumeFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const { studentData, setStudentData, saveData } = useData();

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setResumeDataUrl(loadEvent.target.result);
      setResumeFileName(file.name);
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

    setIsParsing(true);
    try {
      const result = await api.post('/api/ai/resume/parse', { dataUrl: resumeDataUrl });
      if (!result) return;

      const nextData = {
        ...studentData,
        ...result,
        techDomains: Array.isArray(studentData.techDomains) ? studentData.techDomains : [],
      };

      setStudentData(nextData);
      await saveData(nextData);
      handleCancel();
    } catch (error) {
      console.error('Parse failed:', error);
      alert(`简历解析失败：${error.message || '请稍后重试'}`);
    } finally {
      setIsParsing(false);
    }
  };

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
                    disabled={isParsing}
                    onClick={handleParse}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                  >
                    {isParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isParsing ? '导入中...' : '开始导入'}
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
