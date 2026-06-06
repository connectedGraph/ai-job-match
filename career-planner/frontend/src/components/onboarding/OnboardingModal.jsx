import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, Upload, Pencil, Wand2, Check, 
  CloudUpload, FileText, X, Code, Building2, 
  Users, MapPin, SquarePen, ClipboardCheck, Brain, Lightbulb, 
  Trophy, Star, Gauge, Rocket, ArrowRight, ArrowLeft 
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { DIRECTION_GROUPS } from '../../constants';
import BrandMark from '../brand/BrandMark';
import { APP_NAME } from '../../constants/brand';

const BUSINESS_DOMAIN_OPTIONS = ['电商', '金融', '教育', '医疗健康', '社交媒体', '游戏', '企业服务', '物联网'];
const COMPANY_SIZE_OPTIONS = ['创业公司（<50人）', '中小企业（50-500人）', '大型企业（500-5000人）', '超大型企业（>5000人）'];
const CITY_OPTIONS = ['北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '武汉'];
const MotionDiv = motion.div;
const STEP_SHELL_CLASS = 'mx-auto w-full max-w-3xl';

const asArray = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
};

const OnboardingModal = ({ isOpen, onClose }) => {
  const { studentData, saveData } = useData();
  const currentData = studentData || {};
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadState, setUploadState] = useState({
    status: 'idle', // idle, uploading, complete
    progress: 0,
    fileName: '',
    fileSize: ''
  });

  const [formData, setFormData] = useState({
    techDirections: asArray(currentData.direction || currentData.profile?.techDirection),
    businessDomains: asArray(currentData.domains || currentData.profile?.businessDomains),
    companySize: asArray(currentData.preference?.companySize || currentData.profile?.companySize),
    locations: asArray(currentData.preference?.preferredCities || currentData.profile?.locations),
    personalStatement: currentData.summary || currentData.profile?.description || ''
  });

  const totalSteps = 5;

  const nextStep = () => {
    if (currentStep < totalSteps - 1) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handleFinish = async () => {
    const selectedDirections =
      formData.techDirections.length
        ? formData.techDirections
        : asArray(currentData.direction || currentData.profile?.techDirection);
    const summary = formData.personalStatement.trim() || currentData.summary || currentData.profile?.description || "";
    const updatedData = {
      ...currentData,
      direction: selectedDirections,
      domains: formData.businessDomains,
      summary,
      preference: {
        ...(currentData.preference || {}),
        preferredCities: formData.locations,
        companySize: formData.companySize[0] || currentData.preference?.companySize || "",
      },
      orientated: true
    };
    
    try {
      await saveData(updatedData, { syncServer: true });
      onClose();
    } catch (error) {
      console.error('Failed to save orientation data:', error);
      // Still close as the UX should be smooth, or show a toast
      onClose();
    }
  };

  const toggleTag = (category, value, multi = true) => {
    setFormData(prev => {
      const current = prev[category];
      if (multi) {
        if (current.includes(value)) {
          return { ...prev, [category]: current.filter(t => t !== value) };
        } else {
          return { ...prev, [category]: [...current, value] };
        }
      } else {
        return { ...prev, [category]: [value] };
      }
    });
  };

  const simulateUpload = (file) => {
    setUploadState({
      status: 'uploading',
      progress: 0,
      fileName: file.name,
      fileSize: (file.size / (1024 * 1024)).toFixed(1) + ' MB'
    });

    let prog = 0;
    const interval = setInterval(() => {
      prog += Math.random() * 20;
      if (prog >= 100) {
        prog = 100;
        clearInterval(interval);
        setUploadState(prev => ({ ...prev, status: 'complete', progress: 100 }));
        setTimeout(nextStep, 1500);
      } else {
        setUploadState(prev => ({ ...prev, progress: Math.min(prog, 99) }));
      }
    }, 300);
  };

  if (!isOpen) return null;

  const steps = [
    // Step 0: Welcome
    (
      <div className={`${STEP_SHELL_CLASS} text-center space-y-5`}>
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-[28px] flex items-center justify-center mx-auto shadow-xl shadow-blue-200">
          <Sparkles className="text-white" size={32} />
        </div>
        <h2 className="text-[28px] font-black text-gray-900">欢迎使用职途星！</h2>
        <p className="text-base text-gray-600 max-w-2xl mx-auto leading-relaxed">
          我们将通过几个简单的步骤，帮助你构建完整的个人职业画像。
          这将为你提供精准的职业规划建议和岗位匹配推荐。
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pb-4">
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex flex-col items-center">
            <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center mb-2.5">
              <Upload className="text-white" size={18} />
            </div>
            <h3 className="font-bold text-gray-900 text-sm">上传简历</h3>
            <p className="text-xs text-gray-500 text-center mt-1">AI 自动解析内容</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100 flex flex-col items-center">
            <div className="w-9 h-9 bg-purple-500 rounded-xl flex items-center justify-center mb-2.5">
              <Pencil className="text-white" size={18} />
            </div>
            <h3 className="font-bold text-gray-900 text-sm">完善信息</h3>
            <p className="text-xs text-gray-500 text-center mt-1">补充兴趣和偏好</p>
          </div>
          <div className="p-4 bg-green-50 rounded-2xl border border-green-100 flex flex-col items-center">
            <div className="w-9 h-9 bg-green-500 rounded-xl flex items-center justify-center mb-2.5">
              <Wand2 className="text-white" size={18} />
            </div>
            <h3 className="font-bold text-gray-900 text-sm">AI 增强</h3>
            <p className="text-xs text-gray-500 text-center mt-1">智能评估画像</p>
          </div>
        </div>
        
        <button 
          onClick={nextStep}
          className="px-7 py-3.5 bg-primary text-white rounded-2xl font-bold text-base shadow-xl shadow-blue-200 hover:shadow-2xl hover:scale-105 transition-all flex items-center gap-2 mx-auto"
        >
          开始设置 <ArrowRight size={18} />
        </button>
      </div>
    ),

    // Step 1: Upload Resume
    (
      <div className={`${STEP_SHELL_CLASS} space-y-5`}>
        <div className="text-center md:text-left">
          <h2 className="text-2xl font-black text-gray-900">上传你的简历</h2>
          <p className="text-gray-500 text-sm font-medium">支持 PDF、Word、图片格式，AI 将自动解析简历内容</p>
        </div>

        <div 
          className="border-3 border-dashed border-gray-200 rounded-3xl px-6 py-9 md:px-8 md:py-10 text-center cursor-pointer hover:border-primary hover:bg-blue-50 transition-all group"
          onClick={() => document.getElementById('resume-upload').click()}
        >
          <div className="mb-4 flex justify-center">
            <CloudUpload size={54} className="text-gray-300 group-hover:text-primary transition-colors" />
          </div>
          <h3 className="text-base font-bold text-gray-800">点击或拖拽文件到这里</h3>
          <p className="text-xs text-gray-400 mt-2 font-medium">支持 PDF, DOCX, JPG, PNG (Max 10MB)</p>
          <input 
            id="resume-upload" 
            type="file" 
            className="hidden" 
            onChange={(e) => e.target.files[0] && simulateUpload(e.target.files[0])}
          />
        </div>

        {uploadState.status !== 'idle' && (
          <MotionDiv 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3"
          >
            <div className="w-11 h-11 bg-white rounded-xl shadow-sm flex items-center justify-center">
              <FileText className="text-primary" size={22} />
            </div>
            <div className="flex-grow">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-bold text-gray-800 truncate max-w-[200px]">{uploadState.fileName}</span>
                <span className="text-xs font-black text-primary">{Math.round(uploadState.progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300" 
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1 font-bold uppercase tracking-wider">
                {uploadState.status === 'complete' ? '解析完成！' : 'AI 正在解析简历结构...'}
              </p>
            </div>
            {uploadState.status === 'complete' && <Check className="text-green-500" size={20} />}
          </MotionDiv>
        )}

        <div className="flex items-center justify-between pt-2">
          <button onClick={prevStep} className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={16} /> 上一步
          </button>
          <button onClick={nextStep} className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-primary transition-colors">
            暂时跳过 <ArrowRight size={16} />
          </button>
        </div>
      </div>
    ),

    // Step 2: Interests
    (
      <div className={`${STEP_SHELL_CLASS} space-y-5`}>
        <div className="text-center md:text-left">
          <h2 className="text-2xl font-black text-gray-900">完善你的兴趣信息</h2>
          <p className="text-gray-500 text-sm font-medium">帮助我们更好地了解你的职业偏好和发展方向</p>
        </div>

        <div className="space-y-5">
          <Section 
            title="技术方向（与“我的画像”一致）" 
            icon={<Code className="text-blue-500" size={16} />} 
          >
            <DirectionTagGroups
              groups={DIRECTION_GROUPS}
              selected={formData.techDirections}
              onToggle={(v) => toggleTag('techDirections', v, true)}
            />
          </Section>

          <Section 
            title="感兴趣的业务领域" 
            icon={<Building2 className="text-purple-500" size={16} />} 
          >
            <TagGroup 
              tags={BUSINESS_DOMAIN_OPTIONS} 
              selected={formData.businessDomains}
              onToggle={(v) => toggleTag('businessDomains', v, true)}
            />
          </Section>

          <Section 
            title="期望的公司规模" 
            icon={<Users className="text-green-500" size={16} />} 
          >
            <TagGroup 
              tags={COMPANY_SIZE_OPTIONS} 
              selected={formData.companySize}
              onToggle={(v) => toggleTag('companySize', v, false)}
            />
          </Section>

          <Section 
            title="期望的工作城市" 
            icon={<MapPin className="text-red-500" size={16} />} 
          >
            <TagGroup 
              tags={CITY_OPTIONS} 
              selected={formData.locations}
              onToggle={(v) => toggleTag('locations', v, true)}
            />
          </Section>

          <Section 
            title="个人自述" 
            icon={<SquarePen className="text-orange-500" size={16} />} 
          >
            <textarea 
              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-primary focus:bg-white transition-all min-h-[88px]"
              placeholder="简单介绍一下你自己，你的职业目标..."
              value={formData.personalStatement}
              onChange={(e) => setFormData(p => ({ ...p, personalStatement: e.target.value }))}
            />
          </Section>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between border-t border-gray-100 bg-white/95 pt-3 pb-1 backdrop-blur-sm">
          <button onClick={prevStep} className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={16} /> 上一步
          </button>
          <button 
            onClick={nextStep} 
            className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-100 hover:scale-105 transition-all flex items-center gap-2"
          >
            下一步 <ArrowRight size={16} />
          </button>
        </div>
      </div>
    ),

    // Step 3: AI Tools
    (
      <div className={`${STEP_SHELL_CLASS} space-y-5`}>
        <div className="text-center md:text-left">
          <h2 className="text-2xl font-black text-gray-900">AI 智能工具说明</h2>
          <p className="text-gray-500 text-sm font-medium">了解我们如何利用 AI 优化你的画像</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <ToolCard 
            icon={<ClipboardCheck className="text-blue-500" />}
            title="技能声明核查"
            desc="AI 会检查你填写的技能与实际经历是否一致，帮助你发现被高估或漏掉的技能点。"
          />
          <ToolCard 
            icon={<Brain className="text-purple-500" />}
            title="掌握深度推断"
            desc="根据项目时长和复杂度，AI 智能推断技能等级（L1-L4），让你的画像更具客观性。"
          />
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3">
            <Lightbulb className="text-primary flex-shrink-0" size={16} />
            <p className="text-xs font-medium text-gray-600 leading-relaxed">
              这些工具会在你完成画像后自动提供建议，您可以随时在画像页、AI 评估页中查阅并采纳。
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button onClick={prevStep} className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={16} /> 上一步
          </button>
          <button 
            onClick={nextStep} 
            className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-100 hover:scale-105 transition-all flex items-center gap-2"
          >
            继续 <ArrowRight size={16} />
          </button>
        </div>
      </div>
    ),

    // Step 4: Finish & Scoring
    (
      <div className={`${STEP_SHELL_CLASS} text-center space-y-5`}>
        <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-[28px] flex items-center justify-center mx-auto shadow-xl shadow-green-200">
          <Trophy className="text-white" size={32} />
        </div>
        <h2 className="text-[28px] font-black text-gray-900">即将开启</h2>
        <p className="text-base text-gray-600 max-w-2xl mx-auto leading-relaxed">
          新人引导已完成！最后一步是前往画像页，AI 将为您的画像进行<b>完整度打分</b>。
        </p>
        
        <div className="grid grid-cols-1 gap-3 text-left max-w-md mx-auto">
          <ScoreItem icon={<Star className="text-yellow-500" />} title="综合评分" desc="多维度量化您的竞争力" />
          <ScoreItem icon={<Gauge className="text-blue-500" />} title="优化建议" desc="精准指导如何完善信息" />
        </div>

        <div className="pt-4">
          <button 
            onClick={handleFinish}
            className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-green-200 hover:shadow-2xl hover:scale-105 transition-all flex items-center gap-2 mx-auto"
          >
            完成引导，开始使用 <Rocket size={20} />
          </button>
        </div>
      </div>
    )
  ];

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-gray-900/60 p-3 backdrop-blur-sm sm:p-4">
      <MotionDiv 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative my-3 mx-auto flex w-full max-w-[920px] flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl max-h-[calc(100vh-24px)]"
      >
        {/* Progress Header */}
        <div className="bg-white border-b border-gray-100 px-5 py-4 sm:px-6 sm:py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark logoSize="h-9 w-9" titleClassName="text-sm" showSubtitle={false} />
            <div>
              <h2 className="text-sm font-black text-gray-900">新人引导设置</h2>
              <div className="flex items-center gap-1 mt-0.5">
                {[...Array(totalSteps)].map((_, i) => (
                  <div 
                    key={i} 
                    className={`h-1 rounded-full transition-all duration-300 ${i <= currentStep ? 'w-4 bg-primary' : 'w-2 bg-gray-200'}`} 
                  />
                ))}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6 md:px-8 md:py-7">
          <AnimatePresence mode="wait">
            <MotionDiv
              key={currentStep}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {steps[currentStep]}
            </MotionDiv>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-4 py-3 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
            © {new Date().getFullYear()} {APP_NAME} · 让 AI 助力你的职业发展
          </p>
        </div>
      </MotionDiv>
    </div>
  );
};

// Sub-components
const Section = ({ title, icon, children }) => (
  <div className="space-y-2.5">
    <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
      {icon} {title}
    </div>
    {children}
  </div>
);

const tagValue = (tag) => (typeof tag === 'string' ? tag : String(tag?.name || '').trim());
const tagDesc = (tag) => (typeof tag === 'string' ? '' : String(tag?.desc || '').trim());

const DirectionTagGroups = ({ groups, selected, onToggle }) => (
  <div className="space-y-4">
    {groups.map((group) => (
      <div key={group.title} className="space-y-2.5">
        <div>
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.18em] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40"></span>
            {group.title}
            {group.subtitle ? <span className="text-[10px] font-semibold normal-case tracking-normal">{group.subtitle}</span> : null}
          </p>
          {group.desc ? <p className="mt-1 text-xs text-gray-500">{group.desc}</p> : null}
        </div>
        <TagGroup tags={group.items} selected={selected} onToggle={onToggle} />
      </div>
    ))}
  </div>
);

const TagGroup = ({ tags, selected, onToggle }) => (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    {tags.map((tag) => {
      const value = tagValue(tag);
      const desc = tagDesc(tag);
      const isSelected = selected.includes(value);
      return (
        <button
          key={value}
          onClick={() => onToggle(value)}
          className={`rounded-2xl border-2 px-3.5 py-3 text-left transition-all ${
            isSelected
              ? 'bg-primary border-primary text-white shadow-lg shadow-blue-100'
              : 'bg-white border-gray-100 text-gray-700 hover:border-blue-200 hover:bg-blue-50'
          }`}
        >
          <div className="text-xs font-bold">{value}</div>
          {desc ? (
            <div className={`mt-1 text-[11px] leading-5 ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
              {desc}
            </div>
          ) : null}
        </button>
      );
    })}
  </div>
);

const ToolCard = ({ icon, title, desc }) => (
  <div className="p-3.5 rounded-2xl border-2 border-gray-100 hover:border-blue-100 hover:bg-blue-50/30 transition-all flex gap-3">
    <div className="w-9 h-9 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center flex-shrink-0">
      {icon}
    </div>
    <div>
      <h4 className="text-sm font-bold text-gray-900 mb-1">{title}</h4>
      <p className="text-xs text-gray-500 font-medium leading-relaxed">{desc}</p>
    </div>
  </div>
);

const ScoreItem = ({ icon, title, desc }) => (
  <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
      {icon}
    </div>
    <div>
      <h4 className="text-sm font-bold text-gray-800 tracking-tight">{title}</h4>
      <p className="text-xs text-gray-400 font-medium">{desc}</p>
    </div>
  </div>
);

export default OnboardingModal;
