import React from 'react';
import { motion } from 'framer-motion';
import { 
  UserRound, 
  Settings, 
  Shield, 
  TrendingUp, 
  Zap, 
  Clock, 
  BarChart,
  Brain,
  History,
  Sparkles
} from 'lucide-react';
import { useData } from '../../../context/DataContext';
import { buildProfileSnapshot } from '../../../services/matchWorkspace';
import { cn } from '../../../components/ui/Button';

const ProfileMatchView = () => {
  const { studentData, matchWorkspace } = useData();
  const snapshot = buildProfileSnapshot(studentData, matchWorkspace.profileEvents || []);

  const dimensions = [
    { key: 'engineering', label: '工程能力', icon: Brain, color: 'text-teal-400', bg: 'bg-teal-500/10' },
    { key: 'scene', label: '场景方案', icon: Zap, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    { key: 'principle', label: '计算机原理', icon: Shield, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-20">
      {/* Left: Basic Info & Completeness */}
      <div className="space-y-6">
        <div className="orchard-card !p-8 flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-gray-50 rounded-full border-2 border-gray-100 flex items-center justify-center mb-4 relative">
             <UserRound size={48} className="text-gray-400" />
             <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-teal-500 rounded-full border-4 border-[var(--surface-1)] flex items-center justify-center">
               <Sparkles size={14} className="text-white" />
             </div>
          </div>
          <h2 className="text-xl font-black mb-1">{snapshot.name}</h2>
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-6">{snapshot.schoolMajor} | {snapshot.schoolName}</p>
          
          <div className="w-full space-y-2">
            <div className="flex justify-between text-[10px] font-bold uppercase text-gray-400">
              <span>画像完整度 Profile Health</span>
              <span>{snapshot.completeness}%</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-teal-500 transition-all duration-1000" 
                style={{ width: `${snapshot.completeness}%` }}
              />
            </div>
          </div>
        </div>

        <div className="orchard-card space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
            <History size={14} />
            近期画像更新同步
          </h3>
          <div className="space-y-4">
            {snapshot.recentChanges?.length > 0 ? (
              snapshot.recentChanges.map((event, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-1.5 shrink-0" />
                  <div>
                    <div className="text-[11px] font-bold leading-tight mb-1">{event.title}</div>
                    <div className="flex flex-wrap gap-1">
                      {event.tags?.map(tag => (
                        <span key={tag} className="text-[9px] bg-gray-100 px-1 rounded-sm text-gray-500">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-gray-600 italic">尚未有画像更新记录</div>
            )}
          </div>
        </div>
      </div>

      {/* Center & Right: Skills & Dimensions */}
      <div className="lg:col-span-2 space-y-8">
        {/* Radar/Dimension Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {dimensions.map(dim => (
            <div key={dim.key} className="orchard-card !p-6 flex flex-col items-center text-center">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-4", dim.bg)}>
                <dim.icon size={24} className={dim.color} />
              </div>
              <div className="text-2xl font-black text-[var(--tx-1)] leading-none">{snapshot.dimensions[dim.key]}</div>
              <div className="text-[10px] font-bold text-gray-500 uppercase mt-2">{dim.label}</div>
            </div>
          ))}
        </div>

        {/* Skill Groups */}
        <div className="space-y-6">
          <h3 className="text-sm font-black flex items-center gap-2 uppercase tracking-tight">
            <Zap size={18} className="text-teal-400" />
            已同步的技术栈分布
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(snapshot.stackGroups).map(([group, skills]) => (
              <div key={group} className="space-y-3">
                <h4 className="text-[11px] font-black text-gray-500 uppercase tracking-widest">{group}</h4>
                <div className="space-y-3">
                  {skills.map(skill => (
                    <div key={skill.name} className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold">{skill.name}</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div 
                              key={i} 
                              className={cn(
                                "w-2.5 h-1 rounded-full",
                                i < skill.levelRequired ? "bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.5)]" : "bg-gray-100"
                              )} 
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileMatchView;
