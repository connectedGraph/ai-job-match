import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Share2,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  Phone,
  Globe,
  GraduationCap,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import api from '../../services/api';
import Button, { cn } from '../ui/Button';
import { PROFILE_EXP_SECTIONS } from '../../constants';
import { buildExperienceDisplayId, getExperienceDisplay } from '../../utils/profileData';

const ProfilePreview = () => {
  const { studentData, saveData, matchWorkspace, saveWorkspace, performMatch, isProfileDirty } = useData();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const bi = studentData.basicInfo || {};
  const explicitMetrics = studentData.explicitMetrics || {};
  const skills = studentData.techStack || [];
  const certificates = bi.certificates || [];
  const experienceSections = PROFILE_EXP_SECTIONS.map((section) => ({
    ...section,
    items: Array.isArray(studentData.experiences?.[section.type]) ? studentData.experiences[section.type] : [],
  })).filter((section) => section.items.length > 0);

  const handlePrint = () => {
    window.print();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await Promise.all([
        saveData(studentData, true),
        saveWorkspace(matchWorkspace, true),
      ]);

      await api.post('/api/student-profile/submit-and-evaluate', {
        studentProfile: studentData,
        meta: {
          submittedAt: new Date().toISOString(),
          source: 'career-planner-react',
          type: 'final_persist',
        },
      });
      await performMatch();
      setSubmitted(true);
      navigate('/ai-eval', {
        state: {
          autorunAt: Date.now(),
          source: 'profile-preview',
        },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-[28px] border border-blue-100 bg-white px-6 py-5 text-slate-900 shadow-[0_18px_48px_rgba(59,130,246,0.08)] no-print sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">预览与提交</h2>
          <p className="mt-1 text-sm text-slate-500">确认资料无误后，再提交评估。</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            className="gap-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 border-transparent" 
            onClick={handlePrint}
          >
            <Share2 size={16} />
            导出 PDF
          </Button>
          <Button
            disabled={submitting || submitted}
            onClick={handleSubmit}
            className={cn(
              'gap-2 min-w-[132px] rounded-2xl h-11 shadow-lg transition-all',
              submitted 
                ? 'bg-emerald-600 border-emerald-600 shadow-emerald-200' 
                : isProfileDirty
                  ? 'bg-blue-600 border-blue-600 shadow-blue-200 text-white'
                  : 'bg-slate-100 border-slate-100 text-slate-400 opacity-60 shadow-none'
            )}
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : submitted ? (
              <CheckCircle2 size={16} />
            ) : (
              <Send size={16} />
            )}
            {submitting ? '提交中...' : submitted ? '已提交' : '提交评估'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-600 no-print">
          <AlertCircle size={18} />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      <div className="resume-container mx-auto max-w-4xl rounded-[32px] border border-blue-100 bg-white p-12 text-slate-900 shadow-[0_30px_80px_rgba(59,130,246,0.10)] print:border-none print:p-0 print:shadow-none">
        <header className="mb-10 border-b border-blue-100 pb-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="mb-3 text-4xl font-semibold tracking-tight text-slate-900">{bi.name || '你的姓名'}</h1>
              <div className="flex flex-wrap gap-y-3 text-sm font-medium text-slate-500">
                <span className="flex items-center gap-1.5 mr-6">
                  <GraduationCap size={14} className="text-blue-600" />
                  {bi.schoolName || '学校未填写'} · {bi.schoolMajor || '专业未填写'}
                </span>
                <span className="flex items-center gap-1.5 mr-6 border-l border-slate-200 pl-6">
                  {bi.educationLevel || '本科'} | {bi.graduationYear || '--'} 届
                </span>
                <span className="flex items-center gap-1.5 border-l border-slate-200 pl-6">
                  <Globe size={14} className="text-blue-600" />
                  {[bi.graduationProvince, explicitMetrics.graduationCity].filter(Boolean).join(' · ') || '城市未填写'}
                </span>
              </div>
            </div>
            
            <div className="flex flex-col gap-2 border-l border-blue-100 pl-6 text-xs font-semibold text-slate-600 md:text-right md:border-l-0 md:pl-0">
              <div className="flex items-center gap-2 md:justify-end">
                <Mail size={14} className="text-blue-500" />
                <span>{bi.email || '邮箱未填写'}</span>
              </div>
              <div className="flex items-center gap-2 md:justify-end">
                <Phone size={14} className="text-blue-500" />
                <span>{bi.phone || '电话未填写'}</span>
              </div>
              <div className="mt-1 text-slate-400 font-medium no-print">
                ID: {studentData.student_id?.slice(0, 8)} | 更新于 {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-12">
          {/* Summary & Core Competencies Combined */}
          <section className="grid grid-cols-1 gap-12 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <h3 className="mb-5 border-l-4 border-blue-600 pl-3 text-lg font-semibold text-slate-900 italic tracking-tight">个人介绍 · SUMMARY</h3>
              <p className="whitespace-pre-wrap text-sm leading-8 text-slate-600 font-medium">
                {studentData.summary || '尚未填写个人介绍。'}
              </p>
            </div>
            
            <div className="rounded-3xl border border-blue-50 bg-slate-50/30 p-6">
              <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">技能图谱 · SKILLS</h4>
              <div className="space-y-3">
                {skills.slice(0, 8).map((skill) => (
                  <div key={skill.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700">{skill.name}</span>
                      <span className="text-[10px] font-black text-blue-500 italic">Lv.{skill.levelRequired}</span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200/50">
                      <div className="h-full bg-blue-600" style={{ width: `${(skill.levelRequired / 4) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              
              {certificates.length > 0 && (
                <div className="mt-6 border-t border-blue-100 pt-5">
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">荣誉证书</h4>
                  <ul className="space-y-1.5">
                    {certificates.slice(0, 3).map((cert, i) => (
                      <li key={i} className="text-[10px] font-semibold text-slate-500 flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-blue-400" />
                        <span className="truncate">{cert.name || cert.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* Main Experience Flow */}
          <section>
            <h3 className="mb-8 border-l-4 border-blue-600 pl-3 text-lg font-semibold text-slate-900 italic tracking-tight">核心履历 · EXPERIENCE</h3>
            <div className="space-y-10">
              {experienceSections.length > 0 ? (
                experienceSections.map((section) => (
                  <div key={section.type} className="space-y-6">
                    <div className="flex items-center gap-3">
                      <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">{section.title}</h4>
                      <span className="h-[1px] flex-1 bg-slate-100" />
                    </div>

                    <div className="space-y-6">
                      {section.items.map((exp, idx) => {
                        const { title, sub, desc, date } = getExperienceDisplay(section.type, exp);
                        const displayId = buildExperienceDisplayId(section.type, idx);

                        return (
                          <div
                            key={exp.experience_id || `${section.type}-${idx}`}
                            className="relative pl-8 before:absolute before:left-0 before:top-2 before:bottom-0 before:w-[2px] before:bg-blue-50"
                          >
                            <div className="absolute left-[-4px] top-2 h-2 w-2 rounded-full bg-blue-200 border-2 border-white ring-4 ring-blue-50/30" />
                            
                            <div className="flex flex-wrap items-baseline justify-between gap-4 mb-3">
                              <div className="flex flex-wrap items-center gap-3">
                                <h5 className="text-base font-bold text-slate-900">{title}</h5>
                                {sub && (
                                  <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-bold text-slate-500">
                                    {sub}
                                  </span>
                                )}
                                <span className="text-[10px] font-black text-blue-300 tracking-widest opacity-60">#{displayId}</span>
                              </div>
                              <span className="text-xs font-semibold text-slate-400 italic">
                                {date || '时间待补充'}
                              </span>
                            </div>

                            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-500 font-medium">{desc || '暂无描述'}</p>

                            {exp.tags?.length > 0 && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {exp.tags.map((tag) => (
                                  <span key={tag} className="rounded-lg bg-blue-50/50 px-2 py-1 text-[10px] font-bold text-blue-600/70 border border-blue-100/50">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400 italic">暂无项目或实习经历记录。</p>
              )}
            </div>
          </section>
        </div>

        {/* Watermark Section */}
        <div className="mt-12 flex items-center justify-end gap-3 border-t border-blue-50 pt-8 opacity-40">
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Career Orchard</p>
            <p className="text-[10px] font-bold text-slate-400">职途星 · AI 职业画像报告</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm p-1.5 grayscale opacity-50">
            <img src="/logo.png" alt="职途星" className="h-full w-full object-contain" />
          </div>
        </div>
      </div>

      <div className="pb-12 text-center text-xs text-slate-400 no-print">提交后会同步当前资料并进入评估流程。</div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .resume-container {
            border: none !important;
            padding: 2cm !important;
            box-shadow: none !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: none !important;
            background: white !important;
          }
          .resume-container section {
            page-break-inside: avoid;
            margin-bottom: 2rem !important;
          }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
};

export default ProfilePreview;
