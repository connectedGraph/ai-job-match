import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, LogOut, Save } from 'lucide-react';
import Button, { cn } from '../ui/Button';

const UnsavedChangesModal = ({ isOpen, onDiscard, onSave, onCancel }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={onCancel}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-blue-100 bg-white p-8 shadow-[0_40px_100px_rgba(15,23,42,0.25)]"
          >
            <div className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[24px] bg-red-50 text-red-500 shadow-sm">
                <AlertTriangle size={40} strokeWidth={2.5} />
              </div>
              
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">内容尚未保存提交</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-500 font-medium">
                您对职业画像进行了修改，但尚未“提交评估”。离开本页面会导致修改仅保留在本地草稿中，云端不会更新。
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                onClick={onDiscard}
                className="group flex h-12 items-center justify-center gap-2 rounded-2xl border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
              >
                <LogOut size={16} className="transition-transform group-hover:-translate-x-1" />
                仍然离开
              </Button>
              <Button
                onClick={onSave}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 border-blue-600 shadow-lg shadow-blue-200"
              >
                <Save size={16} />
                保存并提交
              </Button>
            </div>
            
            <button
              onClick={onCancel}
              className="mt-6 w-full text-center text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
            >
              取消并返回编辑
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default UnsavedChangesModal;
