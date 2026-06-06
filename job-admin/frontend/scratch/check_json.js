const jsonStr = `{
  "student_id": "STU_202602",
  "direction": "Web开发（前端 / 后端 / 全栈）",
  "domains": [
    "互联网/内容平台（含短视频、电商、新媒体等，覆盖最多）"
  ],
  "techStack": [
    { "name": "React", "level": 4, "note": "精通 React 19 新特性，深入理解并发渲染与 Fiber 调度" },
    { "name": "TypeScript", "level": 4, "note": "擅长高级类型体操，负责过大型项目的类型架构设计" },
    { "name": "Next.js", "level": 3, "note": "熟悉 App Router, SSR/SSG 性能优化及 Edge Runtime 应用" },
    { "name": "React Native", "level": 3, "note": "具备高性能动画（Reanimated）与原生桥接（Turbo Modules）经验" },
    { "name": "Node.js", "level": 3, "note": "熟悉 NestJS 及高性能后端中间件开发" },
    { "name": "Rust", "level": 2, "note": "了解前端工具链重构，能阅读 SWC/Turbopack 部分源码" },
    { "name": "Vite", "level": 4, "note": "精通插件开发与分包策略，有大型项目迁移至 Vite 的经验" },
    { "name": "Electron", "level": 2 },
    { "name": "Three.js", "level": 2, "note": "具备基础的 3D 渲染与 Shader 优化能力" }
  ],
  "techCapabilities": [
    { "name": "LLM 应用架构", "level": 3, "type": "tech", "inference": "精通 Vercel AI SDK 与流式渲染优化" },
    { "name": "前端架构设计", "level": 3, "type": "tech" },
    { "name": "浏览器底层原理", "level": 3, "type": "tech", "inference": "深入理解 V8 垃圾回收、JIT 编译及页面渲染合成流水线" },
    { "name": "自动化效能平台", "level": 3, "type": "tech", "inference": "具备从零搭建 CI/CD 流水线及全链路监控系统的经验" },
    { "name": "跨端开发", "level": 4, "type": "tech" },
    { "name": "前端工程化", "level": 4, "type": "tech" },
    { "name": "组件库设计", "level": 4, "type": "tech", "inference": "基于 Headless UI 理念构建高性能、无障碍（A11y）的组件系统" }
  ],
  "devTools": [
    { "name": "Git", "level": 4 },
    { "name": "VS Code Extension API", "level": 3 },
    { "name": "Docker", "level": 2 },
    { "name": "Chrome DevTools", "level": 4, "note": "擅长使用 Performance 与 Memory 面板排查复杂性能瓶颈" },
    { "name": "pnpm / Turborepo", "level": 4 }
  ],
  "basicInfo": {
    "name": "王雨晨",
    "schoolName": "北京邮电大学",
    "schoolMajor": "软件工程",
    "educationLevel": "本科",
    "graduationYear": 2027,
    "graduationMonth": 6,
    "graduationProvince": "北京",
    "certificates": [
      { "name": "英语六级", "level": "六级", "note": "成绩 580 分", "date": "2024-12" },
      { "name": "计算机二级", "level": "二级", "note": "Web 程序设计", "date": "2023-09" }
    ]
  },
  "summary": "专注于 React 生态与 AI 原生应用开发的深耕者。具备极强的跨端技术迁移能力与前端工程化视野，不满足于业务实现，更致力于通过 Rust 等基建工具提升开发效能。拥有大型开源项目贡献经历，擅长处理高并发场景下的流式渲染与交互优化。对 AI 时代的交互形态（LUI）有深刻见解，追求极致的代码质量与用户体验。",
  "explicitMetrics": {
    "graduationCity": "北京",
    "schoolTags": ["211", "双一流"]
  },
  "preference": {
    "preferredCities": ["北京", "上海", "深圳"],
    "expectedSalaryMin": 250,
    "expectedSalaryMax": 400,
    "jobTarget": "internship",
    "expectedEmploymentDate": "2026-06",
    "currentPlan": "job",
    "currentPlanNote": "希望在 AI 原生应用（AI-Native）或前端基建方向深耕。寻求能接触大规模用户、对性能有严苛要求的业务场景，目标是成长为全栈视野的资深前端架构师。"
  },
  "learningTime": {
    "mode": "custom",
    "weekdayHours": 4,
    "weekendHours": 8,
    "dailyHours": { "mon": 4, "tue": 4, "wed": 4, "thu": 4, "fri": 4, "sat": 8, "sun": 8 }
  },
  "softQuality": [
    { "name": "产品感知力", "level": 4, "inference": "在多个 AI 项目中参与产品定义，对生成式交互有独特见解" },
    { "name": "沟通表达", "level": 3 },
    { "name": "团队协作", "level": 4, "inference": "在开源社区中表现出成熟的 Code Review 习惯与规范化的文档意识" },
    { "name": "责任心", "level": 4 },
    { "name": "抗压能力", "level": 4 }
  ],
  "growthPotential": [
    { "name": "技术敏锐度", "level": 4, "inference": "能够快速拆解 MCP、WebAssembly 等新兴协议并应用到生产中" },
    { "name": "学习能力", "level": 4 },
    { "name": "迁移能力", "level": 4 },
    { "name": "创新能力", "level": 3 }
  ],
  "experiences": {
    "internship": [
      {
        "experience_id": "INT_001",
        "companyName": "腾讯科技（深圳）有限公司",
        "positionName": "前端开发实习生",
        "jobDesc": "负责微信小程序和 H5 项目开发。1) 使用 Taro 4 开发跨端应用，实现一套代码多端运行；2) 引入模块化联邦（Module Federation）优化大型 H5 应用的构建速度，构建耗时降低 40%；3) 参与自研组件库建设，负责 Headless 核心逻辑封装；4) 优化小程序 Canvas 性能，支撑复杂动效流畅运行；5) 建立前端自动化异常上报与监控链路。",
        "startDate": "2025-07",
        "endDate": "2025-10",
        "tags": ["前端", "跨端", "性能优化", "模块化"]
      }
    ],
    "projects": [
      {
        "experience_id": "PRJ_005",
        "projectName": "基于 MCP 协议的 AI 辅助开发效能工具",
        "roleName": "独立开发者",
        "jobDesc": "1) 实现 Model Context Protocol (MCP) 服务，使 LLM 能精准访问本地代码上下文；2) 开发 VS Code 插件，集成代码语义搜索与自动化 Refactor 功能；3) 使用 Rust 编写高性能的文件指纹分析引擎，支持万级文件量的秒级上下文加载；4) 探索 AI 驱动的自动化单元测试生成，覆盖率提升 30%。",
        "startDate": "2026-01",
        "endDate": "2026-04",
        "tags": ["AI-Native", "Rust", "VS Code Extension", "工程效能"]
      },
      {
        "experience_id": "PRJ_001",
        "projectName": "AI 聊天娱乐应用 (Next-Gen AI Chat)",
        "roleName": "前端负责人",
        "jobDesc": "基于 React 19 + Next.js 开发的流式 AI 应用。1) 核心重构：采用 Server Components 显著降低首屏 JS Bundle 体积；2) 流式渲染：接入 Vercel AI SDK 实现打字机效果的极致流畅度，解决长文本渲染卡顿问题；3) 交互创新：设计并实现拖拽式提示词（Prompt）组装工具；4) 极致性能：LCP 指标优化至 0.8s，获校内创新大赛特等奖。",
        "startDate": "2025-03",
        "endDate": "2025-06",
        "tags": ["Next.js", "AI应用", "性能调优"]
      },
      {
        "experience_id": "PRJ_004",
        "projectName": "知名开源 React 组件库 (Headless UI Collection)",
        "roleName": "核心贡献者",
        "jobDesc": "1) 提交 10+ PR，重点修复 React 18 并发模式下的竞态问题；2) 负责可访问性（Accessibility）模块，确保组件完全符合 WCAG 2.1 标准；3) 优化文档站搜索体验，引入 Algolia 实现全文毫秒级检索；4) 与全球开发者协作进行大规模代码库的 Typescript 严苛化重构。",
        "startDate": "2024-06",
        "endDate": "2025-12",
        "tags": ["开源贡献", "React", "组件库设计"]
      }
    ],
    "competition": [
      {
        "experience_id": "CMP_001",
        "competitionName": "中国大学生计算机设计大赛",
        "award": "国家级一等奖",
        "roleName": "技术负责人",
        "date": "2025-08"
      }
    ],
    "learning": [
      {
        "experience_id": "LRN_007",
        "type": "self_study",
        "skill": "Rust 基建开发",
        "semester": "大三下",
        "notes": "学习使用 Rust 编写前端工具链。了解内存管理、所有权机制及其在提升构建工具效能方面的应用。",
        "startDate": "2025-12",
        "endDate": "2026-04"
      }
    ]
  }
}`;

try {
  JSON.parse(jsonStr);
  console.log("JSON is VALID");
} catch (e) {
  console.log("JSON is INVALID");
  console.log(e.message);
}
