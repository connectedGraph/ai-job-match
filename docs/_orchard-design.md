# 🍅 智聘（SmartHiring）— 系统行为与算法设计精简版

---

## 一、系统总览与核心隐喻

### 1.1 设计隐喻映射

| 隐喻元素 | 系统对应 | 行为含义 |
|---|---|---|
| 🌳 果园 | 岗位推荐池 | 算法生成候选岗位集合 |
| 🍎 果实（Slot） | 单个匹配岗位 | 包含匹配分数与 Tag 对比数据 |
| ✅ 验熟（Check） | LLM 准入核查 | 基于规则 + 模型判断硬性门槛 |
| 🧺 篮子（Basket） | 岗位收藏/提交单元 | 临时容器，提交后触发报告生成 |
| 🌾 收割（Harvest） | 生成竞争力报告 | 调用 LLM 批量分析并排名 |
| 🍅 番茄钟（Action Plan） | 游戏化提升系统 | 基于 Gap 生成任务并追踪画像更新 |

---

## 二、全局导航与页面架构

### 2.1 一级导航结构

| Tab | 功能定位 | 核心行为 |
|---|---|---|
| 🌳 探索 | 岗位推荐主战场 | 加载推荐列表、执行 Check、Pick 入篮 |
| 🧺 篮子 | 购物车 + 提交管理 | 增删岗位、查看对比、提交生成报告 |
| 🌾 收割记录 | 报告查看 + 历史 | 浏览历史篮子、查看 AI Overview 与单岗深度报告 |
| 🍅 行动计划 | 游戏化提升 | 偏好录入、任务生成、打卡、画像同步 |
| 👤 我的画像 | 个人能力画像 | 展示技术栈、三维能力、软素质、含金量 |

### 2.2 页面层级关系

```
探索 → Slot 详情 → Check 结果页
篮子 → 提交确认页
收割记录 → 历史篮子列表 → 单篮子报告总览 → 单岗位深度报告
行动计划 → 偏好设置 → 主界面（热力图/任务/打卡/事件记录）
我的画像 → 各维度展示页
```

---

## 三、核心数据结构定义（JSON 字段说明）

### 3.1 用户画像（UserProfile）

```json
{
  "user_id": "string",
  "basic_info": {
    "education": {
      "school": "string",
      "degree": "本科 | 硕士 | 博士",
      "major": "string",
      "graduation_year": "number",
      "school_tier": "A | B | C | D",    // 学校档次
      "prestige_score": "number"          // 学历含金量加权分
    },
    "experience": [
      {
        "type": "internship | work | project | opensource",
        "company": "string",
        "duration_months": "number",
        "complexity": "高 | 中 | 低",
        "tech_tags": ["string"],
        "impact_score": "number"
      }
    ],
    "certificates": ["string"]
  },
  "tech_stack": {
    "languages": { "tag_name": "level" },    // level: 0-3 (0=无,1=初级,2=中级,3=高级)
    "frameworks": { "tag_name": "level" },
    "databases": { "tag_name": "level" },
    "cloud_container": { "tag_name": "level" },
    "tools": { "tag_name": "level" }
  },
  "three_dimension": {
    "engineering": "number",    // 0-100
    "scene": "number",
    "principle": "number"
  },
  "soft_skills": {
    "沟通能力": "number",      // 1-3 星对应分值
    "团队协作": "number",
    "抗压能力": "number",
    "自驱力": "number",
    "技术热情": "number",
    "问题解决": "number",
    "跨团队协调": "number",
    "项目管理": "number",
    "创新思维": "number",
    "学习能力": "number"
  },
  "profile_completeness": "number",   // 0-100
  "last_updated": "timestamp"
}
```

### 3.2 岗位（Slot / Job）

```json
{
  "job_id": "string",
  "title": "string",
  "company": "string",
  "city": "string",
  "jd_text": "string",                         // 原始JD全文
  "jd_split": {
    "responsibilities": ["string"],             // 工作内容拆分
    "requirements": ["string"],                 // 岗位要求拆分
    "bonus": ["string"]                         // 加分项拆分
  },
  "required_tags": {
    "tech_stack": { "tag_name": "required_level" },
    "three_dimension": {
      "engineering": "number",
      "scene": "number",
      "principle": "number"
    },
    "soft_skills": ["string"],                  // 要求的软素质列表
    "hard_filters": {                           // 硬性门槛
      "min_degree": "本科 | 硕士 | 博士",
      "graduation_year_range": [number, number],
      "required_certs": ["string"],
      "min_work_years": "number"
    }
  },
  "recommend_metadata": {
    "source": "algorithm | collaborative | transfer",  // 推荐来源
    "base_match_score": "number",                 // 0-100 初筛分
    "migrate_path_from": "string | null"          // 换岗推荐时的原岗位
  }
}
```

### 3.3 岗位匹配结果（SlotMatchResult）

```json
{
  "slot_id": "string",
  "user_id": "string",
  "job_id": "string",
  "status": "locked | pickable | rejected | picked | ranked | targeted",
  "check_result": {
    "passed": "boolean",
    "fail_reasons": ["string"],
    "hard_filter_details": {
      "degree_match": "boolean",
      "grad_year_match": "boolean",
      "cert_match": "boolean",
      "work_years_match": "boolean"
    }
  },
  "tag_gap": {
    "tech_stack": [
      {
        "tag": "string",
        "user_level": "number",
        "required_level": "number",
        "gap": "number"                     // required - user
      }
    ],
    "three_dimension": {
      "engineering_gap": "number",
      "scene_gap": "number",
      "principle_gap": "number"
    },
    "soft_skills_match_rate": "number"      // 匹配比例
  },
  "competitiveness_score": "number",        // 竞争力综合分 (含金量加权后)
  "confidence": "number",                   // 置信度 0-1
  "score_breakdown": {
    "tech_match_contribution": "number",
    "education_premium": "number",
    "experience_premium": "number",
    "soft_skill_contribution": "number",
    "bonus_contribution": "number"
  }
}
```

### 3.4 篮子（Basket）

```json
{
  "basket_id": "string",
  "user_id": "string",
  "status": "draft | queueing | ripening | harvested",
  "created_at": "timestamp",
  "last_edited_at": "timestamp",
  "submitted_at": "timestamp | null",
  "completed_at": "timestamp | null",
  "slot_ids": ["string"],
  "ripening_progress": {
    "total_jobs": "number",
    "processed_jobs": "number",
    "current_job_id": "string | null"
  },
  "report_summary": {                        // 收割完成后填充
    "ai_overview": "string",
    "ranked_slots": [
      {
        "slot_id": "string",
        "rank": "number",
        "competitiveness_score": "number"
      }
    ],
    "best_match_slot_id": "string"
  }
}
```

### 3.5 单岗位深度报告（InsightReport）

```json
{
  "report_id": "string",
  "slot_id": "string",
  "generated_at": "timestamp",
  "competitiveness": {
    "total_score": "number",
    "confidence": "number",
    "breakdown": { ... }                     // 同 SlotMatchResult
  },
  "jd_scoring": {
    "responsibilities": [
      {
        "item": "string",
        "score_level": 1 | 2 | 3,            // 1=差距大,2=部分达标,3=完全达标
        "match_evidence": "string",
        "ai_explanation": "string"
      }
    ],
    "requirements": [ ... ],
    "bonus": [ ... ],
    "statistics": {
      "full_match_count": "number",
      "partial_match_count": "number",
      "gap_count": "number",
      "bonus_hit_count": "number"
    }
  },
  "tag_gap_full": { ... },                   // 同 SlotMatchResult 的 tag_gap
  "ai_interpretation": {
    "why_fit": ["string"],
    "challenges": ["string"]
  },
  "future_value": {
    "growth_forecast_6m": [
      { "tag": "string", "from_level": "number", "to_level": "number" }
    ],
    "growth_forecast_12m": [ ... ],
    "recommended_tenure_months": "number",
    "career_path": {
      "vertical": ["string"],
      "horizontal_migration": [
        {
          "target_slot_id": "string",
          "current_competitiveness": "number",
          "projected_competitiveness": "number"
        }
      ]
    }
  }
}
```

### 3.6 行动计划（ActionPlan）

```json
{
  "plan_id": "string",
  "user_id": "string",
  "target_slot_id": "string",
  "created_at": "timestamp",
  "preferences": {
    "delivery_cycle": "2周 | 1个月 | 2个月 | 3个月+ | custom_days",
    "weekly_hours": {
      "monday": "number",
      "tuesday": "number",
      ...
    },
    "expected_start_date": "date"
  },
  "tasks": [
    {
      "task_id": "string",
      "gap_tag": "string",
      "current_level": "number",
      "target_level": "number",
      "priority": "number",
      "estimated_hours": "number",
      "suggested_deadline": "date",
      "progress": "number",
      "sub_tasks": [
        {
          "sub_id": "string",
          "type": "theory | project | interview",
          "title": "string",
          "estimated_hours": "number",
          "completed": "boolean",
          "completed_at": "timestamp | null",
          "linked_tags": ["string"]
        }
      ]
    }
  ],
  "checkin_records": [
    {
      "date": "date",
      "hours": "number",
      "notes": "string",
      "completed_task_ids": ["string"]
    }
  ],
  "events": [
    {
      "event_id": "string",
      "type": "course | project | internship | certificate | other",
      "title": "string",
      "description": "string",
      "tech_tags": ["string"],
      "image_update_preview": {               // 提交时生成的画像变更预览
        "tag_changes": [
          { "tag": "string", "old_level": "number", "new_level": "number" }
        ],
        "dimension_changes": {
          "engineering_delta": "number",
          "scene_delta": "number",
          "principle_delta": "number"
        }
      },
      "synced": "boolean",
      "created_at": "timestamp"
    }
  ],
  "gamification": {
    "growth_points": "number",
    "current_tier": "种子 | 萌芽 | 生长 | 茁壮 | 丰收 | 果园之王",
    "tier_level": "number",                   // 1-10
    "continuous_checkin_days": "number",
    "badges": ["string"]
  }
}
```

---

## 四、核心算法与行为逻辑

### 4.1 岗位推荐算法

**三种推荐路径差异化逻辑：**

| 路径 | 排序依据 | 数据来源 |
|---|---|---|
| 🎯 精选推荐 | `base_match_score` 降序 | 基于用户画像与岗位标签的余弦相似度 + 硬性匹配加权 |
| 💡 猜你喜欢 | 协同过滤 + 用户历史偏好 | 用户历史 Pick/查看记录，相似用户行为 |
| 🔀 换岗推荐 | 技能可迁移性评分 | 基于当前岗位 Tag 向量计算可迁移度，过滤硬性门槛不匹配项 |

### 4.2 初筛分（Base Match Score）计算

```
BaseScore = Σ( tech_tag_match_weight * tag_level_match_ratio )
          + three_dimension_match_weight * dimension_cosine
          + soft_skill_overlap_weight * overlap_ratio
```
- 技术栈标签：根据等级差扣分（差 1 级扣 20%，差 2 级扣 50%，缺失扣 100%）
- 三维能力：采用欧氏距离归一化
- 软素质：交集比例

### 4.3 Check 准入核查逻辑

**流程：**
1. 提取岗位 `hard_filters` 字段。
2. 逐一比对用户画像：
   - 学历：`degree` 是否 ≥ `min_degree`
   - 毕业年份：`graduation_year` 是否在 `graduation_year_range` 内
   - 证书：`certificates` 是否包含全部 `required_certs`
   - 工作年限：根据 `experience` 累计月数判断是否 ≥ `min_work_years`
3. 任一硬性条件不满足则返回 `passed: false`，并记录 `fail_reasons`。
4. 全部通过则状态变为 `pickable`。

### 4.4 竞争力综合分（Competitiveness Score）

```
Competitiveness = BaseMatchScore * 0.6
                + EducationPremium * 0.15
                + ExperiencePremium * 0.15
                + SoftSkillScore * 0.05
                + BonusScore * 0.05
```
- `EducationPremium` 根据学校档次、学历、专业匹配度计算
- `ExperiencePremium` 根据经历复杂度、相关度、影响力计算
- `SoftSkillScore` 为软素质匹配度归一化值
- `BonusScore` 为加分项命中比例

**置信度函数：**
```
Confidence = min( 1.0, 
    (标签覆盖率 * 0.5) + (画像完整度 * 0.3) + (等级差数据质量 * 0.2) 
)
```
- 标签覆盖率 = 岗位要求的 Tag 中用户画像有对应数据的比例

### 4.5 篮子提交与报告生成

1. 用户提交篮子，状态变为 `queueing`，系统创建异步任务。
2. 进入 `ripening` 状态，逐个调用 LLM 生成单岗位深度报告。
3. 所有报告生成完毕后，调用 LLM 生成 `AI Overview` 总览。
4. 按竞争力综合分降序生成排行榜。
5. 状态变更为 `harvested`，用户可查看。

### 4.6 行动计划生成逻辑

1. 用户选定目标岗位后，系统提取 `tag_gap` 中差距最大的标签。
2. 根据差距标签类型（技术栈 / 三维能力 / 软素质）匹配任务模板库：
   - 理论任务：在线课程、文档阅读
   - 工程项目：代码实践、Demo 开发
   - 实习推荐：基于标签匹配外部实习库
3. 根据用户填写的投递周期和每周时间，计算任务优先级和截止日期。
4. 生成结构化的 `tasks` 数组。

### 4.7 画像自动更新机制

用户通过「添加事件」或完成打卡任务时：
1. 系统解析事件关联的 `tech_tags`。
2. 依据事件复杂度（项目 > 实习 > 课程）和描述长度，由 Agent 模型评估等级提升幅度。
3. 更新用户画像对应标签等级及三维能力分数。
4. 触发依赖画像的所有数据重算（如已入篮岗位的竞争力分数刷新提示）。

---

## 五、全局状态机定义

### 5.1 Basket 状态机

```
Draft (编辑中) → [提交] → Queueing (排队) → [系统开始处理] → Ripening (成熟中) → [全部报告完成] → Harvested (已收割)
                                                                                        │
                                                                                        ▼
                                                                              系统自动创建新 Draft
```

### 5.2 Slot（岗位果实）状态机

```
Locked (待核查) → [Check通过] → Pickable (可采摘) → [Pick] → Picked (已入篮)
                ↘ [Check未过] → Rejected (不可采摘)

Picked → [篮子提交] → Ranked (已排名) → [选定为目标] → Targeted (已锁定目标)
```

---

## 六、关键行为规则摘要

| 规则项 | 说明 |
|---|---|
| 唯一活跃篮子 | 用户同时只能拥有一个 `draft` 状态篮子，提交后自动新建 |
| Slot 四态展示 | Locked / Pickable / Rejected / Picked，状态变更基于 Check 结果与用户操作 |
| 画像同步触发 | 打卡、添加事件、完成任务均触发画像更新，更新后相关竞争力分数标记为需重算 |
| 成长值获取 | 打卡 +5，完成理论任务 +10，工程项目 +25，记录实习 +50，连续打卡额外奖励 |
| 置信度展示 | 报告总览页展示综合置信度及构成因子，JD 评分页展示每条依据 |

---

## 七、系统闭环逻辑

```
画像构建 → 智能推荐 → 准入核查 → 差距分析 → 行动提升 → 画像更新 → (循环)
```

每次用户行为均沉淀为画像数据，提升推荐与评分精度，形成数据飞轮。

---

> **文档版本**：系统行为与算法设计精简版 v1.0  
> **适用范围**：后端开发、算法工程师、产品经理  
> **包含**：数据结构定义、算法逻辑、状态机、行为规则  
> **不包含**：UI 布局、视觉设计、交互动效