# Match 人岗匹配机制与接口契约

这份文档描述 `job-admin/frontend/legacy/match.html` 当前调用的学生人岗匹配 demo。代码实现以以下文件为准：

- `job-admin/backend/backend_app/match_routes.py`
- `job-admin/backend/backend_app/matching_service.py`
- `job-admin/backend/backend_app/match_config.py`

## 1. 接口总览

当前匹配相关接口只有两个：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/match` | 输入学生画像，返回 Safety / Target / Reach 三档岗位和 LLM 报告 |
| `POST` | `/api/debug/score` | 输入学生画像和单个岗位标识，返回该岗位的逐标签打分明细 |

## 2. `POST /api/match`

请求体：

```json
{
  "student": {
    "student_id": "STU_202602",
    "direction": "Web开发",
    "techStack": [],
    "techCapabilities": [],
    "devTools": [],
    "softQuality": [],
    "growthPotential": []
  },
  "top_k": 5
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `student` | object | 是 | 完整学生画像对象 |
| `top_k` | number | 否 | 每个档位最多返回多少个岗位，默认 `5` |

`student` 里真正参与匹配计分的是五个标签数组：

| 学生画像字段 | 作用 | 标签名读取优先级 |
| --- | --- | --- |
| `techStack[]` | 具体技术栈 | `normalizedTag > skill/name > rawExtractedText` |
| `techCapabilities[]` | 抽象技术能力 | 新数据用 `normalizedTag > name`；旧数据兼容 `skill/skillZh/displayName/rawExtractedText` |
| `devTools[]` | 开发工具 | 新数据用 `normalizedTag > name`；旧数据兼容 `skill/skillZh/displayName/rawExtractedText` |
| `softQuality[]` | 软素质 | `name` |
| `growthPotential[]` | 成长潜力 | `name` |

技术三类会先做 Tag Center 反解：

- 如果学生端选中了标准词并提交 `normalizedTag`，匹配直接使用该英文 `normalizedTag`。
- 如果只提交了 `tagId`，匹配会从 Tag Center 找回对应英文 `normalizedTag`。
- 如果只提交了中文明文 `name`，匹配会先尝试按中文标准名反解成英文 `normalizedTag`；`skillZh / displayName` 仅用于旧数据兼容。
- 如果是学生自填词且 Tag Center 无法命中，才回退为原明文参与相似度匹配；自填词不会写入 Tag Center 标准库。

注意：学生端“专业技能构建”搜索可以用中文 embedding 余弦相似度做候选召回，默认下界 `0.70`，并按相似度与 `jobCount` 热度返回约 5 个候选。候选池是同类标准词全集，候选向量从 `dataset/db/tag_center` 缓存构建 `skill_search_index_*_v2.json/.npy` 本地索引；搜索时只补 query 向量。这是“选词体验层”。真正的人岗匹配仍然使用英文 `normalizedTag` 进入同类目匹配，避免中文译名影响技术边界。

每个标签至少要能读到：

```json
{
  "name": "React",
  "level": 3
}
```

`techCapabilities` 需要保留 `type`，用于能力归因：

```json
{
  "name": "前端工程化",
  "level": 3,
  "type": "engineering"
}
```

允许的 `type` 建议是：

| `type` | 含义 |
| --- | --- |
| `principle` | 基础知识、原则、方法论 |
| `engineering` | 工程能力、架构、性能、工具链 |
| `scene` | 业务场景、跨端场景、应用场景 |

注意：

- `summary/basicInfo/preference/learningTime/experiences` 可以保留在画像里，但当前 match 精排不直接读取这些文本加分。
- 匹配主要看学生画像里的标签名和 `level`，不是看经历文本写得多不多。
- `expectedSalaryMin/expectedSalaryMax` 不参与匹配，不降档。

响应体：

```json
{
  "topJobs": {
    "safety": [],
    "target": [],
    "reach": []
  },
  "analysis": "LLM 生成的 Markdown 推荐报告"
}
```

`topJobs.safety/target/reach` 里的每个岗位是原始岗位 JSON 加上匹配字段。核心字段如下：

```json
{
  "id": "Job_001",
  "title": "前端开发实习生",
  "companyName": "示例公司",
  "score": 72.5,
  "tier": "精准岗 (Target)",
  "exact_match_ratio": 0.42,
  "tech_sim_coverage": 0.73,
  "score_tech": 75.0,
  "score_quality": 65.0,
  "score_tech_stack": 80.0,
  "score_tech_capability": 76.0,
  "score_dev_tool": 60.0,
  "score_soft": 70.0,
  "score_growth": 60.0,
  "overflows": [],
  "similars": [],
  "missings": [],
  "level_mismatches": [],
  "low_frequency_matches": [],
  "technical_match_details": {},
  "match_details": {},
  "tag_details": [],
  "tier_checks": {},
  "status_counts": {},
  "category_counts": {},
  "total_tag_count": 18,
  "effective_coverage_tag_count": 15,
  "coverage_counts": {}
}
```

## 3. `POST /api/debug/score`

请求体：

```json
{
  "student": {},
  "job_id": "Job_001",
  "job_index": null
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `student` | object | 是 | 完整学生画像对象 |
| `job_id` | string | 否 | 指定岗位 ID |
| `job_index` | number | 否 | 指定岗位库下标 |

`job_id` 和 `job_index` 二选一。优先使用 `job_index`，否则按 `job_id` 查找。

响应体：

```json
{
  "job": {},
  "analysis": {
    "score": 72.5,
    "tier": "精准岗 (Target)",
    "tag_details": [],
    "match_details": {},
    "technical_match_details": {}
  }
}
```

这个接口不会分桶，也不会生成 LLM 报告，适合调试单个岗位为什么命中或缺失。

## 4. 返回明细结构

### 4.1 `technical_match_details`

`technical_match_details` 只包含技术三类：

```json
{
  "techStack": {
    "policy": {
      "exact_threshold": 0.9,
      "fuzzy_threshold": 0.9,
      "fuzzy_enabled": false,
      "score_threshold": 0.9
    },
    "exact": [],
    "fuzzy": [],
    "missing": [],
    "level_mismatch": []
  },
  "techCapabilities": {
    "policy": {
      "exact_threshold": 0.9,
      "fuzzy_threshold": 0.84,
      "fuzzy_enabled": true,
      "score_threshold": 0.84
    },
    "exact": [],
    "fuzzy": [],
    "missing": [],
    "level_mismatch": []
  },
  "devTools": {
    "policy": {
      "exact_threshold": 0.9,
      "fuzzy_threshold": 0.9,
      "fuzzy_enabled": false,
      "score_threshold": 0.9
    },
    "exact": [],
    "fuzzy": [],
    "missing": [],
    "level_mismatch": []
  }
}
```

分组含义：

| 分组 | 含义 |
| --- | --- |
| `exact` | 精确覆盖，`base_similarity >= 0.90` 且 `level_delta >= 0` |
| `fuzzy` | 模糊覆盖，仅 `techCapabilities` 允许，`base_similarity >= 0.84` 且 `level_delta >= -1` |
| `missing` | 未覆盖，包括相似度不足、硬标签模糊被拒、等级不足 |
| `level_mismatch` | 最佳学生标签存在，但学生 level 低于 JD 要求 |

### 4.2 `match_details`

`match_details` 是全量五类明细：

```text
techStack
techCapabilities
devTools
softQuality
growthPotential
```

每类结构和 `technical_match_details` 一致。

### 4.3 单条明细

单条明细形状：

```json
{
  "jd_tag": "C++",
  "best_stu": "Java",
  "status": "Missing",
  "base_similarity": 0.8482,
  "score_similarity": 0.0,
  "score": 0.0,
  "jd_level": 3,
  "best_stu_level": 3,
  "level_delta": 0,
  "level_modifier": 1.0,
  "score_threshold": 0.9,
  "similar_enabled": false,
  "block_reason": "similar_disabled_for_hard_tag",
  "freq": 20,
  "freq_weight": 1.0,
  "low_frequency": false
}
```

关键字段：

| 字段 | 含义 |
| --- | --- |
| `base_similarity` | 同类目最佳学生标签与 JD 标签的原始语义相似度 |
| `score_similarity` | 通过类目计分阈值后的相似度，没过阈值就是 `0` |
| `score_threshold` | 当前类目的最低计分阈值 |
| `similar_enabled` | 当前类目是否允许 `0.84` 模糊命中 |
| `level_delta` | `student_level - jd_required_level` |
| `level_modifier` | 等级折损系数 |
| `block_reason` | 缺失原因 |
| `freq_weight` | 低频标签降权系数 |

`block_reason` 常见值：

| 值 | 说明 |
| --- | --- |
| `similar_disabled_for_hard_tag` | `techStack/devTools` 硬标签不接受 `0.84` 模糊命中 |
| `below_similarity_threshold` | 相似度低于当前类目计分阈值 |
| `level_mismatch` | 相似度够，但学生等级低于 JD 要求 |
| `missing_level` | 无法判断等级 |
| `not_covered` | 其他未覆盖情况 |

## 5. 总体链路

匹配不是“学生整体向量 vs 岗位整体向量”的一次性匹配，也不是把简历全文丢给 LLM 判断。当前链路是：

```text
学生画像标签池
-> 技术三类 embedding 召回 Top50
-> 逐岗位、逐标签精排
-> 计算全局 100 分
-> 按总分、精确覆盖率、技术覆盖率切 Safety / Target / Reach
-> LLM 只基于已算好的结构化结果生成报告
```

LLM 不参与分数计算，也不参与档位判定。

## 6. 召回阶段

召回只负责从岗位库里找候选岗位，不决定最终分数。

当前召回只使用技术三类：

| 学生池 | 召回阈值 | 命中分 |
| --- | ---: | ---: |
| `tech_stack` | `0.90` | `9` |
| `tech_capability` | `0.84` | `7` |
| `dev_tool` | `0.90` | `4` |

设计原因：

- `techStack/devTools` 是硬标签，召回阶段也不应该让 `Java/C++` 或 `Webpack/Vite` 这种 0.84 语义近邻混进来。
- `techCapabilities` 是抽象能力，可以允许 `0.84` 相似召回。
- `softQuality/growthPotential` 不参与召回，只参与精排。

如果完全召回不到岗位，系统退化取岗位库前 50 个，避免页面无结果。

## 7. 单标签精排

对 JD 里的每个标签，只在学生同类目池里找最佳匹配：

```text
JD techStack -> 学生 techStack
JD techCapabilities -> 学生 techCapabilities
JD devTools -> 学生 devTools
JD softQuality -> 学生 softQuality
JD growthPotential -> 学生 growthPotential
```

公式：

```text
base_similarity = same-category best cosine similarity
score_similarity = base_similarity if base_similarity >= category_score_threshold else 0
level_delta = student_level - jd_required_level
tag_score = score_similarity * level_modifier * freq_weight
```

类目计分阈值：

| 类目 | `category_score_threshold` | 是否允许 0.84 模糊覆盖 |
| --- | ---: | --- |
| `techStack` | `0.90` | 否 |
| `techCapabilities` | `0.84` | 是 |
| `devTools` | `0.90` | 否 |
| `softQuality` | `0.84` | 是 |
| `growthPotential` | `0.84` | 是 |

等级折损：

| `level_delta` | 含义 | `level_modifier` |
| ---: | --- | ---: |
| `>= 0` | 完全覆盖或降维覆盖 | `1.00` |
| `-1` | 差一级，勉强能用 | `0.75` |
| `-2` | 差两级，差距明显 | `0.20` |
| `<= -3` | 完全脱节 | `0.00` |

例子：

| JD | 学生最佳标签 | 类目 | `base_similarity` | `level_delta` | `tag_score` | 结果 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `C++ Lv3` | `Java Lv3` | `techStack` | `0.8482` | `0` | `0` | 硬技术栈拒绝 0.84 模糊 |
| `C++ Lv3` | `C++ Lv2` | `techStack` | `1.0` | `-1` | `0.75` | 有排序分，但不算覆盖，进入等级不足 |
| `工程化 Lv3` | `前端工程化 Lv3` | `techCapabilities` | `0.85` | `0` | `0.85` | 算模糊覆盖 |
| `Webpack Lv3` | `Vite Lv3` | `devTools` | `0.85` | `0` | `0` | 工具硬标签拒绝 0.84 模糊 |

## 8. 覆盖率

覆盖率只看技术三类：

```text
techStack + techCapabilities + devTools
```

不包含：

```text
softQuality + growthPotential
```

精确覆盖：

```text
base_similarity >= 0.90
and level_delta >= 0
```

模糊覆盖：

```text
category allows fuzzy
and base_similarity >= 0.84
and level_delta >= -1
```

当前只有 `techCapabilities` 允许技术模糊覆盖。`techStack/devTools` 不允许。

`tech_sim_coverage` 是精确覆盖或模糊覆盖的总覆盖率。`exact_match_ratio` 只统计精确覆盖。

## 9. 覆盖率有效分母上限

为避免冗长 JD 把覆盖率分母拖爆，技术覆盖率使用有效分母上限：

| 类目 | 有效分母上限 |
| --- | ---: |
| `techStack` | `10` |
| `techCapabilities` | `8` |
| `devTools` | `3` |

计算：

```text
effective_total += min(raw_total_of_category, cap_of_category)
effective_hits += min(raw_hits_of_category, effective_category_total)
```

注意：覆盖率分母会截断，但分项得分仍按逐标签平均反映长尾缺口。

## 10. 总分

总分 100 分，分为：

| 大类 | 权重 |
| --- | ---: |
| 技术要求 | `80%` |
| 素质要求 | `20%` |

技术内部按 `7:9:4`：

| 技术子项 | 技术内部权重 | 全局理论占比 |
| --- | ---: | ---: |
| `techStack` | `7 / 20` | `28%` |
| `techCapabilities` | `9 / 20` | `36%` |
| `devTools` | `4 / 20` | `16%` |

素质内部按 `1:1`：

| 素质子项 | 全局理论占比 |
| --- | ---: |
| `softQuality` | `10%` |
| `growthPotential` | `10%` |

动态重分配规则：

- 如果岗位没有 `devTools`，技术内部只在 `techStack:techCapabilities = 7:9` 间分配。
- 如果岗位没有素质要求，技术要求承接全局 100 分。
- 如果只有 `growthPotential`，它承接整个素质池。
- 不存在的维度不会按 0 分处理。

## 11. 档位

档位只看三项：

| 指标 | 含义 |
| --- | --- |
| `score` | 全局总分 |
| `exact_match_ratio` | 技术三类精确覆盖率 |
| `tech_sim_coverage` | 技术三类精确或模糊覆盖率 |

当前规则：

| 档位 | 语义 | 总分 | 精确覆盖 | 技术覆盖 |
| --- | --- | ---: | ---: | ---: |
| Safety | 守岗，稳操胜券 | `>= 75` | `>= 0.40` | `>= 0.70` |
| Target | 精准岗，核心匹配 | `>= 65` | `>= 0.25` | `>= 0.50` |
| Reach | 冲刺岗，方向相关但需补齐 | `>= 55` | `>= 0.10` | `>= 0.30` |

判定顺序是 Safety -> Target -> Reach。

## 12. 低频标签

技术标签在岗位库中出现次数低于 10 个岗位时，会被降权：

```text
freq >= 10 -> freq_weight = 1.0
freq < 10 -> freq_weight = 0.3 + 0.7 * (freq / 10)
```

低频命中仍可参与匹配，但不能被报告说成高置信结论。低频命中会进入 `low_frequency_matches`。

## 13. OR 技术组

岗位 `techStack` 支持 branch 结构表达“多选一”：

```json
{
  "type": "branch",
  "groupName": "前端框架",
  "options": [
    { "name": "React", "levelRequired": 3 },
    { "name": "Vue", "levelRequired": 3 }
  ],
  "sum": 1
}
```

当前实现：组选项分别打分，取最高分选项代表这个组。该组作为一个 `techStack` 技术要求计入技术覆盖和技术栈得分。

## 14. 非计分字段

以下字段不参与 match 精排计分：

| 字段 | 当前用途 |
| --- | --- |
| `experiences` | 可用于画像生成或展示，不直接加分 |
| `summary` | 可用于展示，不直接加分 |
| `basicInfo` | 可用于展示，不直接加分 |
| `preference.expectedSalaryMin/Max` | 不参与降档 |
| `metadata.salaryRange` | 岗位展示用，不参与降档 |

新版匹配已经删除薪资处理。

## 15. LLM 报告约束

LLM 只拿结构化结果生成解释，不重新算分。

报告生成三原则：

| 原则 | 要求 |
| --- | --- |
| 核心优先 | 80% 篇幅分析 `techStack`，`techCapabilities/devTools/素质` 作为补充 |
| 客观定性 | 低频标签只允许末尾一句带过，不得使用“极其难得”“完美契合”等措辞 |
| 直面差距 | 必须指出 `level_mismatches` 里的等级不足，并给出务实补课建议 |

额外约束：

- 不改 `Safety/Target/Reach` 档位。
- 不捏造分数。
- 不把经历文本当作额外计分依据。
- 必须知道 `techStack/devTools` 不接受 0.84 模糊命中，只有 `techCapabilities` 可以。

## 16. 性能边界

`/api/match` 精排阶段不跑 LLM。它读取：

```text
state.tag_vectors_cache
state.global_tag_freq
state.inverted_index
```

当前 demo 会通过 `embed_batch(...)` 补齐本地演示缓存。生产形态建议：

```text
标准化标签库
-> 离线计算 JD 标签向量
-> 离线计算标签相似度
-> Redis/KV 缓存
-> /api/match 在线查表
```

线上未命中缓存时，应直接给 0，避免接口期实时向量化拖慢 1000+ 岗位匹配。


