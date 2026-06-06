# 岗位画像 JSON 字段、格式介绍

这份文档对应后端的标准岗位画像结构。实际规范化逻辑在 [job_profile_schema.py](../job-admin/backend/job_profile_schema.py) 里，核心入口是 `normalize_job_profile()`。

## 1. 画像的用途

岗位画像不是“原始 JD 文本”的简单搬运，而是一个可被后续模块稳定消费的结构化对象。它会被：

- builder pipe 用来生成画像
- `tag_sync.py` 用来写回 tag 体系
- `matching_service.py` 用来做岗位匹配
- admin 页面用来做岗位 CRUD 和标签统计

## 2. 标准顶层字段

标准画像至少包含下面这些顶层字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 岗位 ID |
| `title` | string | 岗位名称 |
| `companyName` | string | 公司名称 |
| `direction` | string | 岗位方向 |
| `industry` | string | 行业 |
| `metadata` | object | 岗位附加元数据 |
| `jdSplit` | object | JD 拆分结果 |
| `basicRequirements` | object | 基础要求 |
| `techStack` | array | 技术栈要求 |
| `techCapabilities` | array | 抽象技术能力 |
| `devTools` | array | 工具/平台/工程能力 |
| `softQuality` | array | 固定软素质维度 |
| `growthPotential` | array | 固定成长潜力维度 |
| `systemMeta` | object | 系统内部元信息 |

`normalize_job_profile()` 会先补默认结构，再把输入清洗成这套形状。

## 3. `metadata` 字段

`metadata` 的标准结构：

```json
{
  "jobType": "社招全职",
  "salaryRange": [20, 35],
  "departmentAtmosphere": "扁平化"
}
```

含义：

- `jobType`
  - 岗位类型
  - 这里只定义字段和标准取值范围，不在文档里写死默认值
  - 标准取值仅保留：`实习`、`社招全职`、`校招全职`
  - 归并规则：明确实习/Intern/见习归 `实习`；明确校招/应届/毕业生/校园招聘归 `校招全职`；混合或无法确定的口径统一归 `社招全职`
  - 后台批处理抽取阶段要求 LLM 直接输出这三类；写入标准画像前，后端仍会通过 `normalize_job_type()` 做一次兜底归一，避免旧口径进入岗位库
- `salaryRange`
  - 统一为 `[min, max]`
  - 单位是 `元/月`
  - 这里的数值表示月薪区间，不是年薪、时薪或税前税后混写
  - 只有两端都能确认时才保留，否则是 `null`
- `departmentAtmosphere`
  - 部门/团队氛围描述
  - 没有就置空

## 4. `jdSplit` 字段

`jdSplit` 用来承载 JD 的文本拆分结果，标准结构如下：

```json
{
  "jobDescriptions": [],
  "jobRequirements": [],
  "bonusPoints": [],
  "notes": []
}
```

规则：

- `jobDescriptions`
  - 工作内容、职责、任务
- `jobRequirements`
  - 任职要求、技能要求、经验要求
- `bonusPoints`
  - 加分项、优先项、额外要求
- `notes`
  - 备注、补充说明、无法归类但仍有价值的信息

`jdSplit` 只保留句子级事实，不保留大段广告文案。

## 5. `basicRequirements` 字段

标准结构：

```json
{
  "education_min": "本科",
  "major": ["计算机相关"],
  "graduationYearRange": [2023, 2026],
  "certifications": [],
  "experiences": []
}
```

说明：

- `education_min`
  - 最低学历要求
  - 允许值通常是 `大专 / 本科 / 硕士 / 博士 / null`
- `major`
  - 专业要求列表
- `graduationYearRange`
  - 毕业年份范围
  - 形态为 `[min, max]`，缺一端时也允许保留为 `null`
- `certifications`
  - 证书要求
  - 每项通常是 `{name, level, note}`
- `experiences`
  - 经验要求
  - 只保留硬性经验或项目经验

## 6. `techStack` 字段

`techStack` 是最重要的技术要求字段，支持两种结构：

### 6.1 叶子节点

```json
{
  "name": "Python",
  "rawExtractedText": "Python",
  "normalizedTag": "Python",
  "levelRequired": 3,
  "note": ""
}
```

字段含义：

- `name`
  - 规范后的技术名
- `rawExtractedText`
  - 原始抽取的 `jdSplit.jobRequirements` 文本
  - 用来保留模型从 JD 中直接抽出来的那句原文
- `normalizedTag`
  - 归一标签
- `levelRequired`
  - 要求等级，范围 1 到 4
- `note`
  - 补充说明

### 6.2 分支节点

分支节点也是 `techStack` 数组里的元素，用来表达同一组技术选项里“满足其中若干个即可”的要求。当前标准结构不再为 OR 技术组保留单独的顶层字段。

```json
{
  "type": "branch",
  "groupName": "前端框架",
  "options": [
    {
      "name": "React",
      "levelRequired": 3
    },
    {
      "name": "Vue",
      "levelRequired": 3
    }
  ],
  "levelRequired": 3,
  "sum": 1,
  "note": ""
}
```

适合表达“二选一”“多选一”“任一满足”的技术要求。

### 6.3 `techStack` 的定义

`techStack` 是最重要的技术要求字段，指的是支撑软件运行、数据处理及逻辑实现的基础构建块。它描述的是**具体的、可安装、可调用、可依赖**的 IT 实体技术，而不是抽象能力。

#### 核心定义

`techStack` 里应该放：

- 编程语言
- 开发框架
- 类库
- 数据库
- 中间件
- AI 编排工具

它们通常满足这些判断标准：

- 代码级调用：需要在代码中 `import` 或通过 SDK 调用
- 运行时支撑：直接参与业务逻辑执行或数据持久化
- 版本依赖：通常会出现在 `pom.xml`、`requirements.txt`、`package.json` 等依赖文件里

#### 典型示例

| 分类 | 示例 |
| --- | --- |
| 基础开发层 | Java、Python、Go、Spring Boot、React、Vue、MySQL、Redis |
| AI 工程化 | LangChain、LlamaIndex、LangGraph、CrewAI、Milvus、PyTorch、vLLM |
| 中间件 | Kafka、RabbitMQ、gRPC、Dubbo、Ollama |

#### 写入原则

- 具体技术名写进 `techStack`
- 如果是能直接安装、依赖、调用的实体技术，就优先放这里
- 如果是抽象能力，不要放这里，应该放到 `techCapabilities`

## 7. `techCapabilities` 字段

`techCapabilities` 用来放抽象技术能力，而不是具体工具名。

#### 核心定义

`techCapabilities` / `core tech features` 指的是抽象的工程解决能力、架构思维、业务场景实战经验、底层理论或特定方向的算法概念。它们不能被直接“安装”，而是开发者利用技术栈组合出来的经验与能力。

常见类别：

- 系统架构设计
- 高并发处理
- 微服务拆分
- NLP 基础理论
- 大模型微调
- 特征工程
- 前端工程化

判断标准：

- 能力本身是“怎么做、为什么这样做”，不是“用什么做”
- 不能直接出现在依赖文件里
- 不是一个可安装的具体软件实体

单项结构通常是：

```json
{
  "rawExtractedText": "负责复杂系统架构设计",
  "normalizedTag": "架构设计",
  "type": "principle",
  "domain": null,
  "skill": "架构设计",
  "skillZh": "架构设计",
  "levelRequired": 3
}
```

## 8. `devTools` 字段

`devTools` 用来放工程工具、平台、开发协作工具等。

#### 核心定义

`devTools` 指的是软件生命周期中用于版本控制、项目管理、构建部署、环境隔离等辅助开发和团队配合的工具，不直接承担业务逻辑。

#### 典型示例

- Git
- Docker
- Kubernetes
- Jira
- Maven
- Webpack

示例结构：

```json
{
  "rawExtractedText": "GitHub Actions",
  "normalizedTag": "GitHub Actions",
  "skill": "GitHub Actions",
  "skillZh": "GitHub Actions",
  "levelRequired": 2
}
```

## 9. `softQuality` 和 `growthPotential`

这两类是固定维度，不是自由扩展字段。

- `softQuality`
  - 沟通表达
  - 团队协作
  - 责任心
  - 执行力
  - 职业意识
- `growthPotential`
  - 学习能力
  - 创新能力
  - 抗压能力
  - 迁移能力
  - 目标清晰度

它们的维度定义来自 [portrait_builder/taxonomy.py](../job-admin/backend/portrait_builder/taxonomy.py)，后端会固定补全这些维度，不允许随意增删。

每项通常长这样：

```json
{
  "name": "沟通表达",
  "levelRequired": 2
}
```

## 10. `systemMeta` 字段

`systemMeta` 只放系统内部字段，不建议业务层手工依赖。

常见值包括：

- 创建时间
- 更新时间
- 创建序号
- 来源
- 最近一次写回来源

## 11. 归一规则

`normalize_job_profile()` 会做这些事：

- 补默认骨架
- 清洗字符串空白
- 统一数组格式
- 修正 `salaryRange` 和 `graduationYearRange`
- 规范 `certifications`、`experiences`
- 把旧版顶层 OR 技术组输入兼容为 `techStack` 内的 `type: "branch"` 节点
- 把明显的软性技术表达从 `techStack` 提升到 `techCapabilities`
- 把 `softQuality` / `growthPotential` 强制归一到固定维度

## 12. 你写入画像时的建议

- 只写规范 JSON，不要写自然语言大段描述
- 具体技术写 `techStack`
- “二选一”“多选一”“任一满足”的要求写成 `techStack` 内的 `type: "branch"` 节点
- 抽象能力写 `techCapabilities`
- 工具类写 `devTools`
- `salaryRange` 一律按 `元/月` 记，不要混成其他单位
- 软素质和成长潜力不要自定义新维度，直接按固定维度写
- 如果只有半结构化文本，先交给 pipe 流，不要手动硬拼字段


