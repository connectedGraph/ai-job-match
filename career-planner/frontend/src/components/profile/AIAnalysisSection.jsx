import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Loader2, AlertCircle, Info } from 'lucide-react';
import { LEVEL_BADGE_CLS, LEVEL_DOT_CLS, LEVEL_LABELS } from '../../constants';
import api from '../../services/api';
import { useData } from '../../context/DataContext';
import { buildMatchStudentPayload, normalizeAiDimensionList } from '../../utils/profileData';

const DimCard = ({ dim, result }) => {
  const level = result?.levelRequired || 0;
  
  return (
    <div className="bg-white border border-blue-100 rounded-2xl p-5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50/50 transition-all duration-300">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-grow min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <span className="font-extrabold text-gray-800 text-sm tracking-tight">{dim.key}</span>
            {level > 0 ? (
              <span className={`text-[10px] px-2 py-0.5 rounded-lg border font-black uppercase tracking-wider ${LEVEL_BADGE_CLS[level]}`}>
                L{level} {LEVEL_LABELS[level]}
              </span>
            ) : (
              <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest italic">Wait for AI</span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 font-medium mb-3">{dim.desc}</p>
          
          <AnimatePresence>
            {result?.reasoning && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="text-[11px] text-slate-600 bg-blue-50/60 p-3 rounded-2xl border border-blue-100 leading-relaxed font-medium"
              >
                <div className="flex gap-1.5">
                  <Info size={12} className="text-gray-300 flex-shrink-0 mt-0.5" />
                  {result.reasoning}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <div className="flex gap-1 flex-shrink-0 mt-1">
          {[1, 2, 3, 4].map((i) => (
            <div 
              key={i} 
              className={`w-2.5 h-2.5 rounded-[3px] transition-all duration-500 ${
                level >= i ? LEVEL_DOT_CLS[level] : "bg-gray-100"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const AIAnalysisSection = ({ title, desc, dims, type }) => {
  const {
    studentData,
    aiResults,
    profileAiTasks,
    saveData,
    updateProfileAiTask,
  } = useData();
  
  const results = normalizeAiDimensionList(aiResults?.[type]);
  const taskState = profileAiTasks?.[type] || {};
  const isLoading = Boolean(taskState.loading);
  const error = taskState.error || null;

  const handleEvaluate = async () => {
    if (isLoading) return;
    updateProfileAiTask(type, { loading: true, error: null });
    try {
      const endpoint = type === 'softQuality' ? '/api/ai/profile/soft-quality' : '/api/ai/profile/growth-potential';
      const result = await api.post(endpoint, { studentData });
      const dimensions = normalizeAiDimensionList(result);
      const nextAiResults = { ...(aiResults || {}), [type]: dimensions };
      const nextStudentData = buildMatchStudentPayload(studentData, nextAiResults);
      await saveData(nextStudentData, { aiResults: nextAiResults, syncServer: true });
      updateProfileAiTask(type, {
        loading: false,
        error: null,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      updateProfileAiTask(type, {
        loading: false,
        error: err.message || 'AI 评估失败，请稍后重试',
      });
    }
  };

  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 section-title">{title}</h2>
          <p className="text-xs text-slate-500 ml-4 mt-1 font-medium">{desc}</p>
        </div>
        <motion.button
          whileHover={{ scale: isLoading ? 1 : 1.05 }}
          whileTap={{ scale: isLoading ? 1 : 0.95 }}
          onClick={handleEvaluate}
          disabled={isLoading}
          className={`flex-shrink-0 flex items-center gap-2 text-xs font-black px-5 py-2.5 rounded-xl shadow-lg transition-all ${
            isLoading 
              ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
              : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"
          }`}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Cpu className="w-4 h-4" />
          )}
          {isLoading ? "正在深度推断..." : results.length > 0 ? "重新推断" : "AI 评估画像"}
        </motion.button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-center gap-2 text-red-600 text-xs mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl font-bold"
          >
            <AlertCircle size={16} />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dims.map((dim) => (
          <DimCard 
            key={dim.key} 
            dim={dim} 
            result={results?.find((item) => item.name === dim.key)}
          />
        ))}
      </div>
    </section>
  );
};

export default AIAnalysisSection;
