# Matching / Orchard 评分字段契约

本文档定义岗位匹配工作台的最新评分口径。核心原则：果园探索和采摘只看岗位原始匹配，只有提交篮子生成丰收报告时，才引入学生背景竞争力与置信度系数。

## 1. 总原则

| 阶段 | 主分 | 是否看学生背景竞争力 | 排序依据 |
|---|---|---:|---|
| 探索 `/api/match` | `match_score` | 否 | 原始岗位匹配分 |
| 采摘入篮 | `match_score` | 否 | 用户选择，不重新打背景分 |
| 丰收报告 `/api/match/harvest` | `reportScore` | 是 | `matchScore * confidenceCoefficient` |
| 行动计划 | 缺口与 level delta | 否 | 技术/素质缺口，不用背景分生成任务 |

旧字段 `competitiveness_score / competitivenessScore` 只作为历史快照兼容。新代码不要把它当探索页主字段。

## 2. 原始岗位匹配分

`match_score` 回答的问题是：当前画像能力与 JD 标签本身有多匹配。

```text
match_score = weighted_average(
  tech_match = score_tech,
  quality_match = score_quality,
  weights = { tech: 90, quality: 10 }
)
```

`score_tech` 来自技术栈、技术能力、开发工具聚合。`score_quality` 来自职业素养与成长潜力聚合。探索页卡片、详情抽屉、沉浸式浏览都必须使用这个分数作为主数字。

## 3. 学生背景竞争力

学生背景竞争力只在丰收报告阶段计算，总分 100。

```text
studentCompetitivenessScore =
  educationCompetitiveness 0-50
  + experienceCompetitiveness 0-50
```

学历竞争力关注院校层级、学历层级、专业相关度、毕业新鲜度。经历竞争力关注大厂/头部机构实习、顶尖高校实验室/科研、竞赛级别、项目复杂度、成果影响力。

模型配置读取根目录 `.env` 的 `JOB_SYSTEM_MATCH_LLM_*`，当前模型应为：

```text
JOB_SYSTEM_MATCH_LLM_MODEL=gemini-3-flash-preview-search
```

## 4. 置信度系数与最终报告分

背景竞争力映射为 0.5 到 1.0 的置信度系数。

```text
confidenceCoefficient = 0.5 + studentCompetitivenessScore / 200

0 分   -> 0.500
50 分  -> 0.750
100 分 -> 1.000

reportScore = matchScore * confidenceCoefficient
```

前端可显示名建议使用“置信度系数”。它不是岗位匹配分，也不是含金量主分。

## 5. JD Split 深度评估

丰收报告必须对每条 `jdSplit` 原文做逐条评估。

| 字段 | 类型 | 含义 |
|---|---|---|
| `section` | string | JD 原文所属区块，例如工作内容、岗位要求、加分项 |
| `text` | string | JD Split 原文，不改写 |
| `stars` | number | 1/2/3 星 |
| `label` | string | `达到`、`达到一部分`、`未达到` |
| `reason` | string | 可解释性理由 |
| `evidence` | string | 候选人证据或缺口 |

星级规则：

| 星级 | 标签 | 含义 |
|---:|---|---|
| 3 | 达到 | 当前画像有明确证据覆盖该 JD 条目 |
| 2 | 达到一部分 | 有相近能力或部分经历，但证据不完整 |
| 1 | 未达到 | 当前画像缺少可靠证据，应进入补强清单 |

## 6. API 表

| 功能 | Method | Path | 请求要点 | 返回要点 |
|---|---|---|---|---|
| 生成探索推荐 | POST | `/api/match` | `{ student, top_k?, batch_offsets? }` | lanes 中每个岗位返回 `match_score / score_tech / score_quality / exact_match_ratio / match_details` |
| 兼容探索推荐 | POST | `/api/match/run` | 同 `/api/match` | 同 `/api/match` |
| 后台丰收深度分析 | POST | `/api/match/harvest` | `{ student, jobs }` | `studentCompetitiveness / confidenceCoefficient / rankings / jdSplitAssessment` |
| 学生端提交篮子 | POST | `/api/match/basket/submit` | `{ basket, jobsById, student }` | 写入 `harvest`、`basketHistoryRecord`、重置当前篮子 |
| 获取某次收割记录 | GET | `/api/match/harvest/{basket_id}` | 无 | 返回对应 `harvest` 与 `basketHistoryRecord` |
| 删除某次收割记录 | DELETE | `/api/match/harvest/{basket_id}` | 无 | 删除收割记录；若包含当前 target，会清空行动计划 |

## 7. 推荐接口字段

`POST /api/match` 的岗位对象应至少包含：

```json
{
  "id": "JOB_run_xxx",
  "title": "后端开发工程师",
  "companyName": "Demo Company",
  "tier": "保守岗 (Safety)",
  "match_score": 88.2,
  "score_tech": 89.5,
  "score_quality": 76.0,
  "exact_match_ratio": 0.56,
  "score_breakdown": {
    "match": 88.2,
    "contributions": {
      "tech_match": 80.55,
      "quality_match": 7.6
    },
    "raw": {
      "tech_match": 89.5,
      "quality_match": 76.0
    }
  }
}
```

探索接口不应输出新的背景竞争力主字段；即便历史兼容字段存在，前端也不能把它显示为探索主分。

## 8. 丰收接口字段

`POST /api/match/harvest` 返回：

```json
{
  "studentCompetitiveness": {
    "total_score": 84,
    "confidence_coefficient": 0.92,
    "dimensions": {
      "education": { "total": 42, "grade": "A" },
      "experience": { "total": 42, "grade": "A" }
    }
  },
  "confidenceCoefficient": 0.92,
  "rankings": [
    {
      "stableId": "JOB_xxx",
      "rank": 1,
      "title": "后端开发工程师",
      "companyName": "Demo Company",
      "matchScore": 88.2,
      "studentCompetitivenessScore": 84,
      "confidenceCoefficient": 0.92,
      "reportScore": 81.14,
      "jdStarCounts": { "three": 5, "two": 2, "one": 1 },
      "jdSplitAssessment": [
        {
          "section": "岗位要求",
          "text": "熟悉 Redis 缓存与 MySQL 优化",
          "stars": 2,
          "label": "达到一部分",
          "reason": "画像中有 MySQL 与 Redis 标签，但缺少高并发缓存治理证据。",
          "evidence": "可补充缓存穿透、击穿、雪崩治理项目。"
        }
      ]
    }
  ]
}
```

## 9. 前端显示要求

| 页面 | 主展示 | 次展示 |
|---|---|---|
| 探索卡片 | `match_score`，文案“匹配分/原始匹配” | 技术分、通用素质、精确覆盖、Job ID |
| 详情抽屉 | 原始匹配分、技术分、通用素质、精确覆盖 | 匹配贡献拆解；不展示背景含金量 |
| 篮子页 | 当前篮子对比 `match_score` | 提示提交后才计算背景竞争力与置信度系数 |
| 收割记录 | `reportScore`，文案“最终报告分” | `matchScore`、`studentCompetitivenessScore`、`confidenceCoefficient`、JD 星级 |
| 行动计划 | target 岗位与缺口任务 | 不用背景竞争力决定任务优先级 |

## 10. 禁用读法

| 禁用读法 | 原因 | 替代 |
|---|---|---|
| 探索页读 `competitiveness_score` | 背景竞争力不参与采摘前推荐 | `match_score` |
| 探索页展示 `gold_score` | 背景评估只能在丰收阶段出现 | 不展示 |
| 把 `gold_weight_k` 叫含金量主分 | 它实际是分数系数 | `confidenceCoefficient` |
| 收割记录按 `matchScore` 排名 | 丰收阶段要看系数后的最终报告分 | `reportScore` |
| 行动计划用背景分生成任务 | 任务应来自 JD 缺口 | `match_details` 与 level delta |
