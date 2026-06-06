# 后端全量接口和返回类型

这份文档列出当前岗位后台后端对外提供的主要接口。后端入口在 [app.py](../job-admin/backend/app.py)，应用工厂在 [backend_app/app_factory.py](../job-admin/backend/backend_app/app_factory.py)。

## 1. 先说结论

后端有三类对外入口：

1. 业务 API，前缀主要是 `/api/...`
2. FastAPI 自带文档页面 `/docs`、`/redoc`、`/openapi.json`
3. 静态前端站点，挂在根路径 `/`

## 2. FastAPI 自带页面

默认可用：

- `GET /docs`
- `GET /redoc`
- `GET /openapi.json`

另外，前端静态文件被挂载在：

- `GET /`

也就是说，后端不只是 API，还同时托管了前端页面。

## 3. 路由总览

### 3.1 Job / 基础数据

| 方法 | 路径 | 返回类型 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/metadata` | JSON object | 返回方向、行业等元数据 |
| `GET` | `/api/jobs` | JSON object | 分页岗位列表，支持高级条件搜索 |
| `GET` | `/api/jobs/search` | JSON object | `/api/jobs` 的搜索别名 |
| `GET` | `/api/jobs/{job_id}` | JSON object / 404 | 单个岗位详情 |

### 3.2 匹配

| 方法 | 路径 | 返回类型 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/api/match` | JSON object | 学生画像匹配岗位 |
| `POST` | `/api/debug/score` | JSON object | 单岗位精细打分 |

### 3.3 后台管理

| 方法 | 路径 | 返回类型 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/admin/summary` | JSON object | Tag / 岗位总览 |
| `GET` | `/api/admin/tags` | JSON object | Tag 列表 |
| `GET` | `/api/admin/tag-center/tags` | JSON object | Tag Center 标准词搜索，支持中文 / 英文 / tagId |
| `POST` | `/api/admin/tag-center/resolve` | JSON object | 通过 tagId 或明文反解标准词 |
| `POST` | `/api/admin/tags/export` | JSON object | 导出 Tag 到 txt / json |
| `POST` | `/api/admin/tags/normalize` | JSON object / 409 | 触发全量 tag 归一 |
| `GET` | `/api/admin/frequencies` | JSON object | Tag 频次统计 |
| `POST` | `/api/admin/jobs` | JSON object | 新建岗位 |
| `POST` | `/api/admin/jobs/export` | JSON object | 导出岗位到 txt / json / jsonl |
| `PUT` | `/api/admin/jobs/{job_id}` | JSON object | 更新岗位 |
| `DELETE` | `/api/admin/jobs/{job_id}` | JSON object | 删除岗位 |

### 3.4 归一

| 方法 | 路径 | 返回类型 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/admin/normalization/runs` | JSON object | 归一任务列表 |
| `POST` | `/api/admin/normalization/runs` | JSON object | 启动归一任务 |
| `GET` | `/api/admin/normalization/runs/{run_id}` | JSON object / 404 | 归一任务快照 |
| `GET` | `/api/admin/normalization/cache` | JSON object | embedding 缓存状态 |

### 3.5 画像复查

| 方法 | 路径 | 返回类型 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/admin/normalization/tag-review/runs` | JSON object | 复查任务列表 |
| `POST` | `/api/admin/normalization/tag-review/runs` | JSON object / 409 | 启动复查任务 |
| `GET` | `/api/admin/normalization/tag-review/runs/{run_id}` | JSON object / 404 | 复查任务快照 |
| `POST` | `/api/admin/normalization/tag-review/runs/{run_id}/pause` | JSON object / 409 | 暂停复查 |
| `POST` | `/api/admin/normalization/tag-review/runs/{run_id}/resume` | JSON object / 409 | 恢复复查 |
| `POST` | `/api/admin/normalization/tag-review/runs/{run_id}/restart` | JSON object / 409 | 重启复查 |

### 3.6 Builder / pipe

| 方法 | 路径 | 返回类型 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/api/builder/uploads` | JSON object | 上传原始文件并生成 summary |
| `GET` | `/api/builder/uploads/{upload_id}` | JSON object / 404 | 读取上传 summary |
| `POST` | `/api/builder/models` | JSON object | 拉取远端模型列表 |
| `POST` | `/api/builder/configs/preflight` | JSON object | 配置预检 |
| `POST` | `/api/builder/configs/test` | JSON object | 单配置测试调用 |
| `POST` | `/api/builder/runs` | JSON object / 4xx | 创建 run |
| `GET` | `/api/builder/runs` | JSON object | run 列表 |
| `GET` | `/api/builder/runs/{run_id}` | JSON object / 404 | run 快照 |
| `POST` | `/api/builder/runs/{run_id}/pause` | JSON object / 409 | 暂停 run |
| `POST` | `/api/builder/runs/{run_id}/resume` | JSON object / 409 | 恢复 run |
| `POST` | `/api/builder/runs/{run_id}/configs/replace` | JSON object / 4xx | 替换 run 配置 |
| `POST` | `/api/builder/runs/{run_id}/configs/recover-circuit` | JSON object / 404/409 | 恢复熔断配置 |
| `DELETE` | `/api/builder/runs/{run_id}` | JSON object / 404 | 删除 run |
| `POST` | `/api/builder/runs/{run_id}/revoke` | JSON object / 4xx | 撤销已 apply 的快照 |
| `POST` | `/api/builder/runs/{run_id}/retry` | JSON object / 4xx | 在原 run 内重试 |
| `GET` | `/api/builder/runs/{run_id}/apply-progress` | JSON object / 404 | 读取 apply 进度 |
| `POST` | `/api/builder/runs/{run_id}/apply` | JSON object / 4xx | 手动写回岗位库 |
| `GET` | `/api/builder/runs/{run_id}/artifacts/{artifact_name}` | `FileResponse` / 404 | 下载 run 产物 |

### 3.7 学生端专业技能构建

Career Planner 学生端后端提供面向“我的画像 / 专业技能构建”的搜索接口。Tag Center 只是背后的标准词来源，不暴露为学生端主语义。

| 方法 | 路径 | 返回类型 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/student-profile/professional-skills/search` | JSON object | 专业技能构建中文语义搜索 |
| `GET` | `/api/student-profile/professional-skills/recommendations` | JSON object | 专业技能构建高频标准词推荐 |
| `GET` | `/api/student-profile/tech-domains/recommendations` | JSON object | 技术方向 Domain Center 推荐 |
| `GET` | `/api/student-profile/tech-domains/search` | JSON object | 技术方向 Domain Center 关键词搜索 |
| `GET` | `/api/student-profile/tag-center/search` | JSON object | 兼容旧入口，内部转到专业技能构建搜索 |
| `GET` | `/api/student-profile/tag-center/resolve` | JSON object | 学生端通过 tagId 或明文反解标准标签 |
| `GET` | `/api/student-profile/tech-capability/search` | JSON object | 技术能力搜索；优先返回 Tag Center 标准词，缺失时回退旧目录 |

注意：这些接口在 `career-planner/backend/app.py`，不是 `job-admin/backend/app.py`。

## 4. 关键返回类型

### 4.1 `GET /api/jobs`

返回形状：

```json
{
  "total": 123,
  "page": 1,
  "limit": 24,
  "sortBy": "default",
  "hasMore": true,
  "data": []
}
```

`GET /api/jobs` 和 `GET /api/jobs/search` 共用同一套条件参数。基础参数保留兼容，新增参数如下：

- `keyword`：通用关键词，命中岗位 ID、标题、公司、方向、行业、JD 文本、标签
- `company_name`：公司名包含匹配
- `job_type`：岗位类型包含匹配；标准值仅为 `实习`、`社招全职`、`校招全职`
- `tag`：任意标签命中，覆盖 `techStack / techCapabilities / devTools`
- `tech_stack`：只在 `techStack` 内搜索
- `tech_capability`：只在 `techCapabilities` 内搜索
- `dev_tool`：只在 `devTools` 内搜索
- `salary_min` / `salary_max`：按薪资区间过滤，和岗位薪资区间做重叠匹配

原有参数仍可用：

- `basic_keyword`
- `jd_keyword`
- `direction`
- `industry`
- `sort_by`

推荐用法：

- 只看技术能力：`/api/jobs?keyword=LLM&tech_capability=架构`
- 按公司和方向组合：`/api/jobs?company_name=腾讯&direction=后端`
- 按标签条件收窄：`/api/jobs?tag=Python&salary_min=20&salary_max=40`

### 4.2 `POST /api/match`

请求形状：

```json
{
  "student": {},
  "top_k": 5
}
```

返回形状：

```json
{
  "topJobs": {
    "safety": [],
    "target": [],
    "reach": []
  },
  "analysis": "..."
}
```

`topJobs` 是按 tier 分桶后的岗位列表，`analysis` 是 LLM 生成的解释文本。

每个岗位会在原始岗位 JSON 上追加匹配字段：

- `score`
- `tier`
- `exact_match_ratio`
- `tech_sim_coverage`
- `score_tech`
- `score_quality`
- `score_tech_stack`
- `score_tech_capability`
- `score_dev_tool`
- `score_soft`
- `score_growth`
- `overflows`
- `similars`
- `missings`
- `level_mismatches`
- `low_frequency_matches`
- `technical_match_details`
- `match_details`
- `tag_details`
- `tier_checks`
- `coverage_counts`

`technical_match_details` 按 `techStack / techCapabilities / devTools` 拆分，每类都有：

- `policy`
- `exact`
- `fuzzy`
- `missing`
- `level_mismatch`

注意：`techStack` 和 `devTools` 是硬标签，`fuzzy_enabled=false`，只接受 `0.90` 精确语义阈值；只有 `techCapabilities` 允许 `0.84` 模糊技术命中。

完整机制见 [matching_algorithm.md](./matching_algorithm.md)。

### 4.3 `POST /api/debug/score`

请求形状：

```json
{
  "student": {},
  "job_id": "Job_001",
  "job_index": null
}
```

返回形状：

```json
{
  "job": {},
  "analysis": {
    "score": 0,
    "tier": "",
    "match_details": {},
    "technical_match_details": {},
    "tag_details": [],
    "status_counts": {},
    "category_counts": {}
  }
}
```

`job_id` 和 `job_index` 二选一。该接口只返回单岗位精排结果，不做分桶，不生成 LLM 报告。

### 4.4 `POST /api/builder/uploads`

返回的是 upload summary，字段核心是：

- `uploadId`
- `fileName`
- `inputMode`
- `recordCount`
- `fields`
- `preview`
- `createdAt`

这部分由 [build_upload_summary](../job-admin/backend/portrait_builder/api_utils.py) 生成。

### 4.5 `POST /api/builder/configs/preflight`

返回形状：

```json
{
  "checkedAt": "...",
  "ok": true,
  "reports": [],
  "invalidConfigs": []
}
```

单条 report 一般会带：

- `configId`
- `configName`
- `status`
- `baseUrl`
- `latencyMs`
- `model`
- `modelFound`
- `modelCount`
- `sampleModels`
- `checkedAt`

### 4.6 `POST /api/builder/runs` 和 `GET /api/builder/runs/{run_id}`

run 核心快照通常包含：

- `manifest`
- `progress`
- `execution`
- `applyProgress`
- `logsTail`
- `embeddingLogPreview`
- `resultPreview`
- `failurePreview`
- `attemptTracePreview`
- `applyHistory`
- `importSummary`
- `revokeReady`

这些来自 [safe_run_snapshot](../job-admin/backend/portrait_builder/api_run_service.py)。

### 4.7 导出接口

#### `POST /api/admin/tags/export`

请求形状：

```json
{
  "tag_type": "techCapabilities",
  "view": "normalized",
  "q": "",
  "min_ratio": 0,
  "limit": 500,
  "format": "txt",
  "output_path": "C:\\Users\\you\\Desktop\\job_system\\dataset\\exports\\tech_capabilities_top500.txt"
}
```

说明：

- `tag_type` 默认 `techCapabilities`
- `format=txt` 时，一行一个 tag
- `format=json` 时输出完整 tag rows
- `output_path` 为空时，后端会默认写到 `dataset/exports/` 目录

#### `POST /api/admin/jobs/export`

请求形状：

```json
{
  "keyword": "",
  "basic_keyword": "",
  "jd_keyword": "",
  "direction": "",
  "industry": "",
  "company_name": "",
  "job_type": "",
  "tag": "Python",
  "tech_stack": "",
  "tech_capability": "",
  "dev_tool": "",
  "salary_min": 0,
  "salary_max": 0,
  "sort_by": "default",
  "format": "txt",
  "export_limit": 0,
  "output_path": "C:\\Users\\you\\Desktop\\job_system\\dataset\\exports\\jobs_export.txt"
}
```

说明：

- `format=txt` 时导出为制表符分隔文本，字段是 `id / title / companyName / direction / industry / jobType`
- `format=json` 时导出 JSON array
- `format=jsonl` 时导出 JSON Lines
- `export_limit=0` 表示不过滤数量上限，导出全部匹配结果

#### PowerShell 示例

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:8000/api/admin/tags/export" `
  -ContentType "application/json" `
  -Body (@{
    tag_type = "techCapabilities"
    view = "normalized"
    limit = 500
    format = "txt"
    output_path = "C:\Users\you\Desktop\job_system\dataset\exports\tech_capabilities_top500.txt"
  } | ConvertTo-Json)
```

### 4.8 Tag Center 标准词接口

#### `GET /api/admin/tag-center/tags`

查询参数：

- `q`：搜索词，可传中文名、英文 `normalizedTag` 或 `tagId`
- `tag_type`：可选，`techStack` / `techCapabilities` / `devTools`
- `limit`：默认 `20`，最大 `500`
- `min_job_count`：按岗位出现数过滤

返回形状：

```json
{
  "total": 1,
  "data": [
    {
      "tagId": "TC_0001",
      "tagType": "techCapabilities",
      "normalizedTag": "Data Structures and Algorithms",
      "name": "Data Structures and Algorithms",
      "nameZh": "算法与数据结构",
      "displayName": "算法与数据结构",
      "jobCount": 2144,
      "jobRatio": 0.33,
      "isHighFrequency": true,
      "groupId": "..."
    }
  ]
}
```

#### `POST /api/admin/tag-center/resolve`

请求形状：

```json
{
  "tag_id": "TC_0001",
  "value": "",
  "tag_type": "techCapabilities"
}
```

也可以不传 `tag_id`，只传英文或中文明文：

```json
{
  "tag_id": "",
  "value": "算法与数据结构",
  "tag_type": "techCapabilities"
}
```

返回形状：

```json
{
  "matched": true,
  "tag": {
    "tagId": "TC_0001",
    "tagType": "techCapabilities",
    "normalizedTag": "Data Structures and Algorithms",
    "nameZh": "算法与数据结构",
    "displayName": "算法与数据结构"
  }
}
```

#### `GET /api/student-profile/professional-skills/search`

查询参数：

- `query`：学生端输入的中文或英文关键词
- `category`：默认 `techCapability`，也支持 `techStack` / `devTools`
- `limit`：默认 `5`，最大 `50`
- `min_similarity`：默认 `0.70`

返回形状：

```json
{
  "source": "professional-skills",
  "query": "算法",
  "category": "techCapability",
  "tagType": "techCapabilities",
  "minSimilarity": 0.7,
  "total": 12,
  "candidateCount": 2124,
  "missingCandidateVectors": 0,
  "indexFile": "C:\\Users\\18086\\Desktop\\job_system\\db\\tag_center\\skill_search_index_techCapabilities_v2.json",
  "indexMatrixFile": "C:\\Users\\18086\\Desktop\\job_system\\db\\tag_center\\skill_search_index_techCapabilities_v2.npy",
  "indexStatus": "disk",
  "options": [
    {
      "tagId": "TC_0001",
      "tagType": "techCapabilities",
      "name": "算法与数据结构",
      "skill": "Data Structures and Algorithms",
      "skillZh": "算法与数据结构",
      "displayName": "算法与数据结构",
      "normalizedTag": "Data Structures and Algorithms",
      "level": 1,
      "jobCount": 2144,
      "source": "tag-center",
      "similarity": 0.91,
      "rankScore": 0.91,
      "scoreSource": "embedding"
    }
  ],
  "embedding": {
    "status": "ok",
    "provider": "job-system-embedding",
    "baseUrlConfigured": true,
    "apiKeyConfigured": true,
    "model": "embedding-3",
    "cacheFile": "C:\\Users\\18086\\Desktop\\job_system\\dataset\\career_planner\\skill_search_query_embedding_cache_job_system_embedding.jsonl",
    "sourceCacheFile": "C:\\Users\\18086\\Desktop\\job_system\\dataset\\db\\tag_center\\embedding_cache.json",
    "missingBeforeFetch": 0,
    "dbCacheHits": 0,
    "apiHits": 0,
    "unresolved": 0,
    "usesSharedJobSystemEmbedding": true
  }
}
```

中文搜索按 `rankScore` 排序：先计算中文 query 和同类标准词中文显示名的 embedding cosine，默认过滤 `< 0.70` 的候选；字面精确 / 前缀 / 包含命中会作为兜底加权。`scoreSource` 标明分数来自 `embedding` 还是 `lexical`。相同分数下按 `jobCount` 热度降序。

候选池是当前同类标准词全集，例如 `techCapabilities` 当前约 2k 条。候选向量不在搜索请求里批量调用 embedding API；默认从 `dataset/db/tag_center/embedding_cache.json` 读取，构建 `skill_search_index_*_v2.json/.npy` 本地索引。搜索时只需要 query 向量：优先读 Career Planner 轻量 query cache，其次按 key 从 `dataset/db/tag_center` 大缓存流式读取，仍缺失时才调用 `JOB_SYSTEM_EMBEDDING_*` 配置的向量 API。

学生端选中标准词时，新数据只写 `name / tagId / normalizedTag`，并保留 `level/type/domain` 这类画像元信息。`skill / skillZh / displayName` 只作为历史数据兼容读取，不再作为新写入字段。后端匹配时优先使用英文 `normalizedTag`；如果只有中文明文，也会先通过 Tag Center 反解成英文 `normalizedTag` 再进入人岗匹配 embedding。

自填词只保存明文，不写入 Tag Center 标准库。

#### `GET /api/student-profile/tech-domains/recommendations`

查询参数：

- `limit`：默认 `10`，最大 `50`
- `page`：默认 `0`；前端“换一批”使用响应里的 `nextPage`
- `min_frequency`：默认 `5`；只返回 `jobCount >= min_frequency` 的标准 domain

返回形状：

```json
{
  "source": "tech-domains-recommendations",
  "minFrequency": 5,
  "page": 0,
  "nextPage": 1,
  "totalCandidateCount": 220,
  "options": [
    {
      "tagId": "DM_7367F322AAB0",
      "domainId": "DM_7367F322AAB0",
      "name": "计算机视觉",
      "domain": "Computer Vision",
      "normalizedTag": "Computer Vision",
      "jobCount": 317,
      "mentionCount": 513,
      "tagCount": 93,
      "source": "domain-center"
    }
  ]
}
```

#### `GET /api/student-profile/tech-domains/search`

查询参数：

- `query`：关键词；只做英文 `domain`、中文 `name`、`domainId` 的字面命中
- `limit`：默认 `8`
- `min_frequency`：默认 `5`

该接口不做 embedding 语义搜索，不允许返回自由自填项。学生端只能选择 Domain Center 中存在的标准方向 tag，写入 `studentData.techDomains[]`：

```json
{
  "name": "计算机视觉",
  "tagId": "DM_7367F322AAB0",
  "normalizedTag": "Computer Vision"
}
```

#### `GET /api/student-profile/professional-skills/recommendations`

查询参数：

- `category`：默认 `techCapability`；学生端当前只展示 `techCapability` 和 `devTools` 推荐
- `tag_type`：可选，直接指定 `techCapabilities` / `devTools`
- `limit`：默认 `10`，最大 `50`
- `page`：默认 `0`；前端“换一批”使用响应里的 `nextPage`
- `offset`：兼容旧参数
- `domain_ids`：逗号分隔的 Domain Center ID，仅 `techCapability` 使用
- `domains`：逗号分隔的英文 domain 或中文 domain name，仅 `techCapability` 使用
- `random_seed`：可选，控制随机探索项
- `min_frequency`：默认 `10`；只推荐 `jobCount > min_frequency` 的标准词
- `exclude_tag_ids`：逗号分隔，排除学生已选标准词
- `exclude_values`：逗号分隔，按中文名或英文 `normalizedTag` 排除

返回形状：

```json
{
  "source": "professional-skills-recommendations",
  "category": "techCapability",
  "tagType": "techCapabilities",
  "minFrequency": 10,
  "offset": 0,
  "nextOffset": 10,
  "page": 0,
  "nextPage": 1,
  "totalCandidateCount": 42,
  "domainFiltered": true,
  "groups": {
    "high": [],
    "mid": [],
    "tail": [],
    "random": []
  },
  "options": [
    {
      "tagId": "TC_0EE299666A9E",
      "tagType": "techCapabilities",
      "name": "算法与数据结构",
      "normalizedTag": "Data Structures and Algorithms",
      "type": "principle",
      "typeCounts": {
        "principle": 1989,
        "engineering": 17
      },
      "jobCount": 2144
    }
  ]
}
```

该接口不调用 LLM / embedding API。`category=techCapability` 且传入 domain 时，只从命中 domain 的能力中推荐，不回退全局；`devTools` 仍走全局高频推荐。默认按高频 / 中频 / 长尾 / 随机探索分组返回。

`techCapabilities` 推荐项会带 `type`，值来自岗位 leaf 的 `typeCounts` 主类型。学生端点击单个推荐卡片时，会按该字段落入 `engineering / scene / principle` 对应分组；批量填入也遵循同一字段。前端写入学生画像时只保存 `name / tagId / normalizedTag` 和必要画像元信息，例如 `level / type / domain`。

`GET /api/student-profile/tag-center/search` 仅保留兼容，返回结构和专业技能构建搜索一致，`source=professional-skills` 且带 `compat=tag-center/search`。

#### `GET /api/student-profile/tag-center/resolve`

查询参数：

- `tag_id`：标准词 ID，可选
- `value`：中文显示名或英文 `normalizedTag`，可选
- `tag_type`：默认 `techCapabilities`

返回形状：

```json
{
  "source": "tag-center",
  "matched": true,
  "tag": {
    "tagId": "TC_0001",
    "tagType": "techCapabilities",
    "name": "算法与数据结构",
    "skill": "Data Structures and Algorithms",
    "skillZh": "算法与数据结构",
    "displayName": "算法与数据结构",
    "normalizedTag": "Data Structures and Algorithms"
  }
}
```

### 4.9 Tag Center 自动中文翻译

全量归一任务会在重建 Tag Center 资产后尝试补齐中文字段：

- 只处理 `techStack / techCapabilities / devTools`
- 单批最多 `500` 个英文 `normalizedTag`
- Prompt 要求 LLM 只返回字符串数组 JSON，并且长度和输入行数一致
- 翻译缓存写入 `dataset/db/tag_center/tag_translation_cache.json`
- 缓存会回填到 `tag_master_normalized.json`、高频 tag 文件和 job-tag relations 文件

环境变量：

- `JOB_SYSTEM_FAST_LLM_BASE_URL`
- `JOB_SYSTEM_FAST_LLM_API_KEY`
- `JOB_SYSTEM_FAST_LLM_MODEL`
- `JOB_SYSTEM_FAST_LLM_TEMPERATURE`
- `JOB_SYSTEM_FAST_LLM_MAX_TOKENS`
- `JOB_SYSTEM_FAST_LLM_TIMEOUT_SECONDS`

Tag Center 翻译存在且 `JOB_SYSTEM_FAST_LLM_API_KEY` 已配置时才会调用 LLM；如果没有配置 key，中文显示名补齐会跳过，前端显示层回退为英文标准词。

Domain Center 会在同一轮归一资产重建中从 `dataset/career.json` 的 `techCapabilities[].domain` 生成：

- `dataset/db/domain_center/domain_master.json`
- `dataset/db/domain_center/domain_tag_stats.json`
- `dataset/db/domain_center/domain_translation_cache.json`

Domain Center 英文 domain 到中文 `name` 的翻译同样在 job-admin 后台执行，并复用 `JOB_SYSTEM_FAST_LLM_*`。如果快速模型未配置 key，`name` 回退为英文 domain。

`dataset/career.json` 是主岗位库；`dataset/db/tag_center/*` 与 `dataset/db/domain_center/*` 都是可从 `dataset/career.json` 重建的派生资产。

### 4.10 归一 run 返回

归一快照主要字段：

- `runId`
- `manifest`
- `progress`
- `result`
- `logsTail`
- `cacheStatus`
- `isActive`

### 4.11 画像复查 run 返回

复查快照主要字段：

- `runId`
- `manifest`
- `progress`
- `result`
- `logsTail`
- `isActive`
- `canPause`
- `canResume`
- `canRestart`

### 4.12 `GET /api/builder/runs/{run_id}/artifacts/{artifact_name}`

这是文件下载接口，返回 `FileResponse`。

支持的产物名包括：

- `manifest.json`
- `progress.json`
- `normalized_input.json`
- `results.jsonl`
- `failures.jsonl`
- `logs.jsonl`
- `embedding_logs.jsonl`
- `apply_progress.json`
- `portraits.json`
- `tag_embeddings.jsonl`
- `import_summary.json`
- `apply_history.jsonl`

## 5. 前端挂载说明

后端在 `backend_app/app_factory.py` 里会把 `job-admin/frontend/` 挂到 `/`，所以：

- `/` 是静态前端入口
- `/jobs.html`、`/runs.html`、`/settings.html` 等都直接由 FastAPI 提供

这不是模板渲染，而是静态文件托管。

## 6. 你最常用的接口

如果只看日常最常用的，基本就是：

- `/api/jobs`
- `/api/match`
- `/api/admin/summary`
- `/api/admin/tags`
- `/api/admin/normalization/runs`
- `/api/builder/uploads`
- `/api/builder/runs`


