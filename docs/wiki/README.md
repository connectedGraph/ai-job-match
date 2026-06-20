# 职途星 & 岗位数据管理后台 项目 Wiki

欢迎来到 **职途星 (Career Planner) 与 岗位数据管理后台 (Job Admin)** 系统的项目 Wiki 主页！本 Wiki 详细汇总了整个系统的架构设计、核心工作流、数据模型、API 接口规范以及双端前端交互的完整文档。

---

## 📖 Wiki 目录结构

我们在 [docs/wiki/](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/docs/wiki/) 目录下将系统文档拆分为以下五个核心专题页面。您可以根据需要直接点击跳转阅读：

### 1. [系统概述与架构设计 (01_overview_architecture.md)](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/docs/wiki/01_overview_architecture.md)
* **系统背景与核心特色**：解决非标词泛滥、向量匹配黑箱、缺失画像等痛点，核心英文 Tag 语义对齐机制。
* **部署拓扑**：双客户端（React 19）与双服务端（FastAPI）四端口联动拓扑结构，以及与 AI 引擎（LLM、Embedding）的交互。
* **目录结构与关键入口**：详尽的目录树及每个文件与模块的定位说明。
* **快速启动与配置说明**：`.env` 环境配置、依赖安装、`start_all.py` 统一编排启动逻辑。

### 2. [数据库与数据模型 (02_data_models.md)](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/docs/wiki/02_data_models.md)
* **标准岗位画像 Schema**：`career.json` 中岗位信息的顶层字段、结构化描述（`jdSplit`, `basicRequirements`, `techStack`, `techCapabilities`, `devTools`, `softQuality`, `growthPotential`, `systemMeta` 等）及归一规则。
* **标准标签中心数据结构 (Tag Center)**：`dataset/db/tag_center` 及 `domain_center` 资产目录、主字典格式、本地语义搜索索引结构、自动翻译缓存。
* **学生端 SQLite 数据库 Schema**：`career-planner/backend/data/` 目录下的 SQLite 实体定义、表结构设计（用户、画像、匹配记录、历史记录等）和模型关系。

### 3. [核心工作流与逻辑引擎 (03_core_workflows.md)](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/docs/wiki/03_core_workflows.md)
* **岗位画像抽取 Pipeline (Portrait Builder)**：三阶段大模型级联抽取流水线、上传预检、任务记录合并与写回（Apply）逻辑。
* **标签归一化与审核系统 (Tag Normalization & Review)**：向量化缓存更新、相似标签聚类、人岗匹配英文 Tag 映射，暂停/恢复/重启审计任务的状态机机制。
* **确定性人岗匹配算法 (Matching Engine)**：精排打分细节、各维度加权公式、等级差折损机制、覆盖率有效分母上限、低频标签降权公式、基于算定结果 of LLM 定性报告生成约束。

### 4. [全量 API 接口参考手册 (04_api_reference.md)](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/docs/wiki/04_api_reference.md)
* **管理端 (Job Admin) 后端全量 API**：涵盖 Job 基础数据、匹配打分、后台管理（标签统计、导出、归一）、画像复查、Builder 管道相关接口的路径、方法、传参及详细 JSON 返回格式。
* **学生端 (Career Planner) 后端全量 API**：用户注册登录、画像管理、简历解析、专业技能构建中文语义搜索、推荐、Domain 检索等 API 的契约定义。

### 5. [前端页面功能与交互设计 (05_ui_interactions.md)](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/docs/wiki/05_ui_interactions.md)
* **学生端页面交互**：简历解析（`AiEval.jsx`）、技能编辑（`Profile.jsx`）、行动计划（`ActionPlan.jsx`）、岗位推荐与沉浸式发现（`ImmersiveDiscovery.jsx`）的交互流。
* **管理后台页面交互**：可视化看板（`Dashboard.jsx`）、JD 跑批上传（`Ingestion.jsx`）、岗位列表与打分沙盒（`MatchPage.jsx`）、标签治理与归一复查（`Normalization.jsx`）等页面的模块划分和状态传递。

---

## 🛠️ 项目服务端口一览

系统一键启动后将同时拉起四个本地端口，协作结构如下：

* **学生端前端 (career-planner/frontend)**: `http://localhost:3000`
* **学生端后端 (career-planner/backend)**: `http://localhost:8001` (交互式 API 文档在 `/docs`)
* **管理后台前端 (job-admin/frontend)**: `http://localhost:5173` (后端同时在此路径做静态托管 `/`)
* **管理后台后端 (job-admin/backend)**: `http://localhost:8000` (交互式 API 文档在 `/docs`)

---

*(Wiki 文档正在由自动化 Agent 编排写入中，点击上方页面链接即可阅读各部分内容)*
