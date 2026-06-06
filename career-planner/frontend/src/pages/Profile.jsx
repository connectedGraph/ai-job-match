import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Cpu,
  Eye,
  History,
  NotebookPen,
  PanelTopClose,
  Save,
  Send,
  Tags,
  Upload,
  UserRound,
  Loader2,
} from 'lucide-react';
import { useBlocker, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import api from '../services/api';
import UnsavedChangesModal from '../components/profile/UnsavedChangesModal';
import Button, { cn } from '../components/ui/Button';
import ProfileHeader from '../components/profile/ProfileHeader';
import UploadSection from '../components/profile/UploadSection';
import DirectionSelector from '../components/profile/DirectionSelector';
import SummarySection from '../components/profile/SummarySection';
import SkillsModule from '../components/profile/SkillsModule';
import ExperienceSection from '../components/profile/ExperienceSection';
import AIAnalysisSection from '../components/profile/AIAnalysisSection';
import ProfilePreview from '../components/profile/ProfilePreview';
import { PROFILE_EXP_SECTIONS, SOFT_QUALITY_DIMS, GROWTH_POTENTIAL_DIMS } from '../constants';
import { APP_NAME } from '../constants/brand';

const TABS = [
  { id: 'upload', label: '上传简历', icon: Upload },
  { id: 'intro', label: '个人介绍', icon: NotebookPen },
  { id: 'direction', label: '方向标签', icon: Tags },
  { id: 'basic', label: '基础信息', icon: UserRound },
  { id: 'skills', label: '技能画像', icon: Cpu },
  { id: 'exp', label: '履历经历', icon: History },
  { id: 'preview', label: '预览提交', icon: Eye },
];

const FOCUSED_TABS = new Set(['upload', 'intro', 'direction', 'basic']);

const Profile = () => {
  const { 
    studentData, 
    isProfileDirty, 
    saveData, 
    saveWorkspace, 
    matchWorkspace, 
    performMatch 
  } = useData();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('upload');
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Navigation Blocking
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isProfileDirty && currentLocation.pathname !== nextLocation.pathname
  );

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setIsHeaderCollapsed(true);
  };

  const handleHeaderSubmit = async () => {
    setSubmitting(true);
    try {
      await Promise.all([
        saveData(studentData, true),
        saveWorkspace(matchWorkspace, true),
      ]);

      await api.post('/api/student-profile/submit-and-evaluate', {
        studentProfile: studentData,
        meta: {
          submittedAt: new Date().toISOString(),
          source: 'profile-header',
          type: 'final_persist',
        },
      });
      await performMatch();
      
      // If we were blocked, proceed now
      if (blocker.state === 'blocked') {
        blocker.proceed();
      } else {
        navigate('/ai-eval', {
          state: { autorunAt: Date.now(), source: 'profile-header' },
        });
      }
    } catch (err) {
      console.error('Submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [activeTab]);

  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) || TABS[0];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'upload':
        return <UploadSection />;
      case 'intro':
        return <SummarySection />;
      case 'direction':
        return <DirectionSelector />;
      case 'basic':
        return <ProfileHeader />;
      case 'skills':
        return (
          <div className="space-y-6">
            <SkillsModule />
            <AIAnalysisSection
              type="softQuality"
              title="职业素养"
              desc="根据你的经历整理沟通、协作与责任感等综合表现。"
              dims={SOFT_QUALITY_DIMS}
            />
            <AIAnalysisSection
              type="growthPotential"
              title="成长潜力"
              desc="评估学习速度、抗压能力与长期发展空间。"
              dims={GROWTH_POTENTIAL_DIMS}
            />
          </div>
        );
      case 'exp':
        return (
          <div className="space-y-6">
            {PROFILE_EXP_SECTIONS.map((section) => (
              <ExperienceSection
                key={section.type}
                type={section.type}
                title={section.title}
                emptyText={section.emptyText}
              />
            ))}
            <ExperienceSection
              type="certificates"
              title="获得证书"
              emptyText="暂无证书记录"
            />
          </div>
        );
      case 'preview':
        return <ProfilePreview />;
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="sticky top-0 z-20 mb-6 no-print">
        <div className="rounded-[28px] border border-blue-100 bg-white/90 shadow-[0_22px_70px_rgba(59,130,246,0.10)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 px-5 py-5 sm:px-7 relative">
            <div className={cn(
              "flex transition-all duration-300",
              isHeaderCollapsed ? "flex-row items-center justify-between gap-6" : "flex-col gap-4"
            )}>
              <AnimatePresence mode="wait">
                {!isHeaderCollapsed ? (
                  <motion.div
                    key="expanded-header"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-2">
                      <div>
                        <p className="text-sm font-semibold text-blue-600">{APP_NAME}</p>
                        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                          职业画像
                        </h1>
                        <p className="mt-2 text-sm text-slate-500">
                          按步骤完善简历、个人介绍和求职方向，草稿会持续保留。
                        </p>
                      </div>

                      <div className="hidden lg:inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-700">
                        当前页面：{activeTabMeta.label}
                      </div>

                      <div className="flex items-center gap-3">
                        <Button
                          disabled={submitting}
                          onClick={handleHeaderSubmit}
                          className={cn(
                            "gap-2 rounded-2xl px-6 h-10 shadow-lg transition-all",
                            isProfileDirty 
                              ? "bg-blue-600 border-blue-600 shadow-blue-200 text-white" 
                              : "bg-slate-100 border-slate-100 text-slate-400 opacity-60 cursor-not-allowed shadow-none"
                          )}
                        >
                          {submitting ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Send size={16} />
                          )}
                          <span className="font-bold">提交评估</span>
                          {isProfileDirty && (
                            <span className="flex h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="collapsed-header"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex-shrink-0"
                  >
                    <div className="flex items-center gap-3">
                      <h1 className="text-lg font-black tracking-tighter text-slate-900 italic">
                        PRO-FILE
                      </h1>
                      <span className="h-4 w-[1px] bg-slate-200" />
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest whitespace-nowrap">
                        {activeTabMeta.label}
                      </span>

                      <Button
                        disabled={submitting}
                        onClick={handleHeaderSubmit}
                        className={cn(
                          "ml-2 flex h-7 items-center gap-1.5 rounded-full px-3 text-[10px] font-black transition-all shadow-md",
                          isProfileDirty 
                            ? "bg-blue-600 border-blue-600 shadow-blue-100 text-white" 
                            : "bg-slate-50 border-slate-100 text-slate-300 opacity-40 cursor-not-allowed shadow-none"
                        )}
                      >
                        {submitting ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <Send size={10} />
                        )}
                        提交
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className={cn(
                "overflow-x-auto no-scrollbar transition-all duration-300",
                isHeaderCollapsed ? "flex-1 pr-12" : "w-full"
              )}>
                <div className={cn(
                  "flex min-w-max gap-2 transition-all duration-300",
                  isHeaderCollapsed ? "justify-end" : ""
                )}>
                  {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => handleTabChange(tab.id)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200',
                          isHeaderCollapsed ? "px-3 py-1.5 text-xs" : "py-2.5",
                          isActive
                            ? 'border-blue-600 bg-blue-600 text-white shadow-[0_10px_25px_rgba(37,99,235,0.2)]'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700',
                        )}
                      >
                        <Icon size={isHeaderCollapsed ? 14 : 16} className={isActive ? 'text-white' : 'text-blue-500'} />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full border border-blue-50 bg-white text-blue-400 transition-all hover:border-blue-500 hover:text-blue-500 shadow-sm z-30",
                !isHeaderCollapsed && "top-6 translate-y-0",
                isHeaderCollapsed && "rotate-180"
              )}
              title={isHeaderCollapsed ? "展开引导" : "收起引导"}
            >
              <PanelTopClose size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className={cn('transition-all duration-300', FOCUSED_TABS.has(activeTab) && 'mx-auto max-w-5xl')}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>
      </div>

      <UnsavedChangesModal
        isOpen={blocker.state === 'blocked'}
        onDiscard={() => blocker.proceed()}
        onSave={handleHeaderSubmit}
        onCancel={() => blocker.reset()}
      />
    </motion.div>
  );
};

export default Profile;
