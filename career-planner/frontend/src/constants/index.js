export const DIRECTION_GROUPS = [
  {
    title: "业务交付与应用层",
    subtitle: "Application & Product",
    desc: "最靠近用户，直接负责产品功能、界面体验和软件交付。",
    items: [
      { name: "前端开发", desc: "负责浏览器、H5 页面和 Web 交互体验。" },
      { name: "客户端开发", desc: "负责 iOS、Android 或桌面端软件开发。" },
      { name: "后端开发", desc: "负责服务端逻辑、API、数据库和业务系统。" },
      { name: "全栈开发", desc: "前后端都能覆盖，适合完整交付型同学。" },
      { name: "测试开发 / QA", desc: "通过自动化和质量工程保障上线稳定性。" },
      { name: "UI / UX设计", desc: "负责产品界面、交互流程和用户体验。" },
    ],
  },
  {
    title: "数据与人工智能层",
    subtitle: "Data & AI",
    desc: "从数据中提炼价值，让系统具备分析、预测和智能能力。",
    items: [
      { name: "算法工程", desc: "做推荐、搜索、视觉、NLP 等核心算法模型。" },
      { name: "AI 应用开发", desc: "基于大模型、RAG、Agent 开发具体业务能力。" },
      { name: "数据开发", desc: "搭建 ETL、数仓和数据平台等基础管道。" },
      { name: "数据分析", desc: "通过统计和业务分析支持决策与增长。" },
    ],
  },
  {
    title: "底层架构与基础工程",
    subtitle: "Infrastructure & Systems",
    desc: "负责系统稳定性、安全性、底层效率和专项工程能力。",
    items: [
      { name: "运维 / DevOps / SRE", desc: "负责部署、监控、扩容和系统可靠性。" },
      { name: "安全工程", desc: "保护系统安全、用户隐私和企业数据。" },
      { name: "音视频开发", desc: "处理直播、点播、编解码和低延迟问题。" },
      { name: "图形 / 渲染开发", desc: "面向图形引擎、3D、GPU 和 Shader。" },
      { name: "嵌入式 / 硬件开发", desc: "在芯片、IoT、传感器等设备上开发软件。" },
    ],
  },
  {
    title: "内容与行业特化",
    subtitle: "Specialized Industries",
    desc: "面向特定行业的综合型技术岗位。",
    items: [
      { name: "游戏开发", desc: "融合图形、客户端、逻辑和服务端的综合工种。" },
    ],
  },
  {
    title: "商业、流程与连接器",
    subtitle: "Business & Strategy",
    desc: "连接技术、客户、增长和业务流程，决定方案如何落地。",
    items: [
      { name: "产品经理", desc: "定义做什么、为什么做和需求优先级。" },
      { name: "技术支持 / 实施", desc: "把系统交付到客户现场并解决使用问题。" },
      { name: "解决方案 / 售前", desc: "把技术方案转成客户能理解并愿意买单的价值。" },
      { name: "增长运营 / 数据运营", desc: "通过数据和策略提升增长、转化与留存。" },
      { name: "技术写作 / DevRel", desc: "写文档、做社区和开发者沟通传播。" },
    ],
  },
];

export const PROFILE_EXP_SECTIONS = [
  { type: "internship", title: "实习经历", icon: "Building2", emptyText: "暂无实习经历" },
  { type: "projects", title: "项目经历", icon: "Code2", emptyText: "暂无项目经历" },
  { type: "competition", title: "荣誉竞赛", icon: "Trophy", emptyText: "暂无竞赛记录" },
  { type: "research", title: "科研经历", icon: "FlaskConical", emptyText: "暂无科研经历" },
  { type: "campus", title: "校园经历", icon: "Users2", emptyText: "暂无校园经历" },
  { type: "learning", title: "学习轨迹", icon: "BookOpen", emptyText: "暂无学习记录" },
];

export const EXP_TYPE_NAMES = {
  internship: "实习经历",
  projects: "项目经历",
  competition: "竞赛荣誉",
  research: "科研经历",
  campus: "校园经历",
  learning: "学习轨迹",
  certificates: "获得证书",
};

export const EXP_TAG_PRESETS = {
  internship: ["全职", "兼职", "远程", "前端", "后端", "全栈", "移动端", "数据", "算法", "产品", "测试", "运维", "设计", "管理"],
  projects: ["个人项目", "团队项目", "开源项目", "课程项目", "比赛项目", "毕设项目", "商业项目"],
  competition: ["国家级", "省级", "校级", "个人赛", "团队赛", "一等奖", "二等奖", "三等奖", "优秀奖"],
  research: ["NLP", "CV", "推荐系统", "强化学习", "大数据", "安全", "系统", "网络", "多模态"],
  campus: ["班委", "学生会", "社团", "团委", "志愿者", "院级", "校级", "国家级"],
  learning: ["大学课程", "在线课程", "教材自学", "实战练习", "视频教程", "官方文档", "读书"],
  certificates: ["英语", "计算机", "职业资格", "专业认证", "驾照", "奖学金", "论文"],
};

export const SOFT_QUALITY_DIMS = [
  { key: "沟通表达", desc: "班干部、汇报经历、文案写作" },
  { key: "团队协作", desc: "主导、执行、协调的团队配合" },
  { key: "责任心", desc: "项目完成度与量化结果" },
  { key: "执行力", desc: "从想法到落地的能力" },
  { key: "职业意识", desc: "求职方向认知与主动准备" },
];

export const GROWTH_POTENTIAL_DIMS = [
  { key: "学习能力", desc: "快速掌握新技术、学习-落地周期" },
  { key: "创新能力", desc: "个人项目、竞赛、开源等自驱输出" },
  { key: "抗压能力", desc: "实习强度、竞赛经历下的稳定输出" },
  { key: "迁移能力", desc: "跨领域经历是否可复用" },
  { key: "目标清晰度", desc: "方向是否收敛，而非广撒网" },
];

export const LEVEL_LABELS = {
  1: "信号不足",
  2: "初步信号",
  3: "较明确佐证",
  4: "强力佐证",
};

export const LEVEL_BADGE_CLS = {
  1: "bg-gray-100 text-gray-500 border-gray-200",
  2: "bg-amber-50 text-amber-600 border-amber-200",
  3: "bg-blue-50 text-blue-600 border-blue-200",
  4: "bg-green-50 text-green-700 border-green-200",
};

export const LEVEL_DOT_CLS = {
  1: "bg-gray-300",
  2: "bg-amber-400",
  3: "bg-blue-500",
  4: "bg-green-500",
};
