# 全量 API 接口参考手册

本页按当前代码实现梳理两套后端的真实 HTTP 接口。管理端后端位于 `job-admin/backend`，默认端口 `8000`；学生端后端位于 `career-planner/backend`，默认端口 `8001`。两者均为 FastAPI + Uvicorn 服务。

> 重要说明：本页以代码为准。历史文档中出现的 `/api/match/basket/active`、`/api/match/profile/sync-event` 当前未在学生端后端注册；学生端保存篮子草稿实际走 `/api/match/workspace`。Builder 相关接口的外部路径均带 `/api/builder` 前缀。

---

## 1. 通用约定

### 1.1 服务与鉴权

| 服务 | 默认地址 | 入口文件 | 说明 |
| --- | --- | --- | --- |
| Job Admin API | `http://127.0.0.1:8000` | `job-admin/backend/app.py` | 岗位库、标签治理、匹配引擎、Builder 跑批 |
| Career Planner API | `http://127.0.0.1:8001` | `career-planner/backend/app.py` | 登录、学生画像、工作区、AI 评估，并代理匹配引擎 |

学生端除 `/api/health`、`/api/auth/register`、`/api/auth/login` 外，均要求请求头：

```http
Authorization: Bearer <token>
```

管理端当前未做登录鉴权，主要依赖本地服务与 CORS 限制。

### 1.2 统一错误格式

两套后端都对 `/api/*` 下主动抛出的 `HTTPException` 做统一包装：

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "错误信息",
    "degraded": false,
    "retry_after": null
  }
}
```

常见状态码映射：

| HTTP 状态 | code |
| --- | --- |
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHORIZED` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 502 | `BAD_GATEWAY` |
| 503 | `SERVICE_UNAVAILABLE` |
| 504 | `GATEWAY_TIMEOUT` |

FastAPI/Pydantic 参数校验失败仍会返回默认 `422 Unprocessable Entity`。

### 1.3 学生画像请求别名

多处请求体兼容这些字段别名：

```text
studentProfile / studentData / student / student_profile / profile
```

前端当前主要发送 `studentProfile` 或 `studentData`。

---

## 2. Job Admin 后端接口

### 2.1 健康检查与岗位查询

| Method | Path | 处理函数 | 请求参数 | 响应摘要 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/health` | `health` | 无 | `{status, service}` |
| `GET` | `/api/metadata` | `get_metadata` | 无 | 方向、行业、岗位类型、标签统计等 `metadata_cache` |
| `GET` | `/api/jobs` | `get_jobs` | `page`, `limit`, `keyword`, `basic_keyword`, `jd_keyword`, `direction`, `industry`, `company_name`, `job_type`, `tag`, `tech_stack`, `tech_capability`, `dev_tool`, `salary_min`, `salary_max`, `sort_by` | 分页岗位列表 |
| `GET` | `/api/jobs/search` | `get_jobs` | 同 `/api/jobs` | 同 `/api/jobs` |
| `GET` | `/api/jobs/{job_id}` | `get_job_detail` | `job_id` | 单个岗位画像，找不到返回 404 |
| `GET` | `/api/careers` | `get_careers` | 同 `/api/jobs` | 兼容别名，同岗位列表 |
| `GET` | `/api/careers/search` | `get_careers` | 同 `/api/jobs` | 兼容别名，同岗位列表 |
| `GET` | `/api/careers/directions` | `get_career_directions` | 无 | `{directions}` |
| `GET` | `/api/careers/industries` | `get_career_industries` | 无 | `{industries}` |
| `GET` | `/api/careers/{job_id}` | `get_career_detail` | `job_id` | 兼容别名，单个岗位画像 |

列表接口的典型响应结构：

```json
{
  "total": 123,
  "page": 1,
  "limit": 24,
  "hasMore": true,
  "data": []
}
```

### 2.2 后台管理、标签与导出

| Method | Path | 处理函数 | 请求 | 响应/行为 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/admin/summary` | `get_admin_summary` | 无 | 看板汇总：岗位数、方向数、行业数、标签数、运行任务概览 |
| `GET` | `/api/admin/tags` | `get_admin_tags` | `q`, `tag_type`, `view`, `min_ratio`, `limit` | 标签列表、固定维度配置、可用视图 |
| `POST` | `/api/admin/tags/normalize` | `normalize_admin_tags` | 无 | 对现有岗位库做严格归一化；运行前创建 checkpoint，失败回滚 |
| `GET` | `/api/admin/frequencies` | `get_admin_frequencies` | `q`, `tag_type`, `view`, `min_ratio`, `limit` | 标签频率分布 |
| `GET` | `/api/admin/tag-center/tags` | `get_admin_tag_center_tags` | `q`, `tag_type`, `limit`, `min_job_count` | Tag Center 检索 |
| `POST` | `/api/admin/tag-center/resolve` | `resolve_admin_tag_center_tag` | `{tag_id, value, tag_type}` | `{matched, tag}` |
| `POST` | `/api/admin/tags/export` | `export_admin_tags` | `TagExportRequest` | 导出标签文本或 JSON，可写入 `dataset/exports` |
| `POST` | `/api/admin/jobs` | `create_job` | `{job}` | 新增岗位；ID 重复返回 409 |
| `POST` | `/api/admin/jobs/export` | `export_admin_jobs` | `JobExportRequest` | 导出岗位文本、JSON 或 JSONL |
| `PUT` | `/api/admin/jobs/{job_id}` | `update_job` | `{job}` | 更新岗位；找不到返回 404 |
| `DELETE` | `/api/admin/jobs/{job_id}` | `delete_job` | `job_id` | `{deleted, jobId, title}` |

`TagExportRequest`：

```json
{
  "tag_type": "techCapabilities",
  "view": "normalized",
  "q": "",
  "min_ratio": 0,
  "limit": 500,
  "format": "txt",
  "output_path": null,
  "output_dir": null,
  "filename": null
}
```

`JobExportRequest` 在岗位查询过滤条件基础上增加 `format`, `export_limit`, `output_path`, `output_dir`, `filename`。

### 2.3 匹配引擎接口

| Method | Path | 处理函数 | 请求 | 响应摘要 |
| --- | --- | --- | --- | --- |
| `POST` | `/api/match` | `match_jobs` | `{studentProfile, top_k, config?, batch_offsets}` | 三赛道岗位推荐、分页状态、统计、耗时与元信息 |
| `POST` | `/api/match/check` | `match_check` | `{studentProfile, job, config?}` | 单岗位准入核查，含学历、毕业年、专业、证书、经历 |
| `POST` | `/api/match/harvest` | `match_harvest` | `{studentProfile, jobs, config?}` | 多岗位最终报告分、竞争力、置信系数、排序与概览 |
| `POST` | `/api/match/internship-recommendations` | `internship_recommendations` | `{studentProfile, gaps, top_k, config?}` | 针对缺口推荐实习岗位 |
| `POST` | `/api/match/insight` | `match_insight` | `{studentProfile, top_k, config?, batch_offsets}` | 只生成深度报告字段，不返回 lanes |
| `POST` | `/api/debug/score` | `debug_score` | `{studentProfile, job_id?, job_index?}` | 调试单岗位详细打分分析 |

`/api/match` 典型响应：

```json
{
  "lanes": {
    "featured": {
      "safety": [],
      "target": [],
      "reach": []
    },
    "interest": [],
    "switch": [],
    "unqualified": []
  },
  "has_more": {},
  "totals": {},
  "topJobs": {
    "safety": [],
    "target": [],
    "reach": []
  },
  "analysis": "",
  "structured_report": null,
  "timing": {},
  "meta": {}
}
```

匹配接口的关键行为：

- `run_match()` 先对岗位库全量评分，再由 `_build_lanes()` 拆出 `featured_safety`、`featured_target`、`featured_reach`、`interest`、`switch`。
- `run_match_check()` 的学历和毕业时间先走规则；专业、证书、经历可走快速 LLM。LLM 不可用时返回 200 降级结果，并在 `sourceMeta` 中标记。
- `run_match_harvest()` 面向“篮子收割”最终报告，融合标签匹配分、JD 分条评估、黄金评估、学生竞争力和置信系数。
- `run_match_insight()` 当前只返回 `structured_report`, `analysis`, `analysisMeta`, `timing`, `meta`，不会返回推荐 lanes。

### 2.4 标准化与标签复查任务

| Method | Path | 处理函数 | 请求 | 响应/行为 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/admin/normalization/runs` | `get_normalization_runs` | 无 | `{activeRunId, data, cacheStatus}` |
| `POST` | `/api/admin/normalization/runs` | `create_normalization_run` | 无 | 创建归一化任务或返回活动任务 snapshot |
| `GET` | `/api/admin/normalization/runs/{run_id}` | `get_normalization_run` | `run_id` | `{runId, manifest, progress, result, logsTail, cacheStatus, isActive}` |
| `GET` | `/api/admin/normalization/cache` | `get_normalization_cache` | 无 | 当前归一化缓存状态 |
| `GET` | `/api/admin/normalization/tag-review/runs` | `get_tag_review_runs` | `review_mode=all|unreviewed_only` | 复查任务列表、统计与 Review Stats 摘要 |
| `POST` | `/api/admin/normalization/tag-review/runs` | `create_tag_review_run` | `{config, maxAttempts, reviewMode}` | 启动标签复查任务 |
| `GET` | `/api/admin/normalization/tag-review/runs/{run_id}` | `get_tag_review_run` | `run_id` | 复查任务 snapshot |
| `POST` | `/api/admin/normalization/tag-review/runs/{run_id}/pause` | `pause_tag_review` | `run_id` | 暂停复查任务 |
| `POST` | `/api/admin/normalization/tag-review/runs/{run_id}/resume` | `resume_tag_review` | `run_id` | 恢复复查任务 |
| `POST` | `/api/admin/normalization/tag-review/runs/{run_id}/restart` | `restart_tag_review` | `run_id` | 重启复查任务 |

`TagReviewStartRequest`：

```json
{
  "config": {
    "id": "fast-llm",
    "name": "Fast LLM",
    "baseUrl": "https://api.example.com/v1",
    "apiKey": "sk-...",
    "model": "gpt-5.4-mini",
    "stageRole": "all",
    "apiMode": "chat_completions",
    "chatCompletionsSystemRole": "system",
    "concurrency": 30,
    "requestsPerMinute": 800,
    "temperature": 0.2,
    "maxTokens": 4000,
    "enabled": true
  },
  "maxAttempts": 3,
  "reviewMode": "all"
}
```

### 2.5 Portrait Builder 跑批接口

Builder 路由由 `portrait_builder_api.py` 注册，外部路径统一为 `/api/builder/*`。

| Method | Path | 处理函数 | 请求 | 响应/行为 |
| --- | --- | --- | --- | --- |
| `POST` | `/api/builder/uploads` | `upload_source_file` | `{fileName, contentBase64, inputMode}` | 上传并解析 JSON/JSONL/CSV/Excel，返回 summary |
| `GET` | `/api/builder/uploads/{upload_id}` | `get_upload` | `upload_id` | 上传 summary |
| `POST` | `/api/builder/models` | `get_remote_models` | `{baseUrl, apiKey}` | `{models}` |
| `POST` | `/api/builder/configs/preflight` | `builder_configs_preflight` | `{configs}` | 批量预检模型配置 |
| `POST` | `/api/builder/configs/test` | `builder_config_test` | `{config}` | 单配置试跑，返回延迟、响应文本和 token usage |
| `POST` | `/api/builder/runs` | `create_run` | `{uploadId, configs, options, inputMode?}` | 创建画像抽取 run |
| `GET` | `/api/builder/runs` | `list_runs` | 无 | `{data: [runIndexRow]}` |
| `GET` | `/api/builder/runs/{run_id}` | `get_run` | `run_id` | run snapshot |
| `POST` | `/api/builder/runs/{run_id}/pause` | `pause_run` | `run_id` | 暂停运行中 run |
| `POST` | `/api/builder/runs/{run_id}/resume` | `resume_run` | `run_id` | 恢复 paused run |
| `POST` | `/api/builder/runs/{run_id}/configs/replace` | `replace_run_configs` | `{configs, pauseFirst}` | 替换运行配置并暂停 |
| `POST` | `/api/builder/runs/{run_id}/configs/recover-circuit` | `recover_run_circuits` | `{configIds}` | 手动恢复熔断配置 |
| `DELETE` | `/api/builder/runs/{run_id}` | `delete_run` | `run_id` | 删除 run 记录 |
| `POST` | `/api/builder/runs/{run_id}/revoke` | `revoke_run` | `run_id` | 撤销最近一次 apply，恢复快照 |
| `POST` | `/api/builder/runs/{run_id}/retry` | `retry_run` | `{mode, configs, options?}` | 对失败/未完成/全量记录重试 |
| `GET` | `/api/builder/runs/{run_id}/apply-progress` | `get_run_apply_progress` | `run_id` | 写回进度 |
| `POST` | `/api/builder/runs/{run_id}/apply` | `apply_run_to_job_library` | `{normalizeWithExistingTags}` | 后台写回岗位库 |
| `GET` | `/api/builder/runs/{run_id}/artifacts/{artifact_name}` | `download_artifact` | allowlist 文件名 | 下载 run 产物 |

`inputMode` 可选：

```text
raw_source
structured_job_json_extract
structured_job_json_fill_missing
structured_job_json_direct_stage4
```

`BuilderConfig`：

```json
{
  "id": "cfg_1",
  "name": "Flagship",
  "baseUrl": "https://api.example.com/v1",
  "apiKey": "sk-...",
  "model": "gpt-5.4",
  "stageRole": "all",
  "apiMode": "chat_completions",
  "chatCompletionsSystemRole": "system",
  "concurrency": 30,
  "requestsPerMinute": 800,
  "temperature": 0.2,
  "maxTokens": 4000,
  "enabled": true
}
```

可下载 artifact：

```text
manifest.json
progress.json
normalized_input.json
results.jsonl
failures.jsonl
logs.jsonl
embedding_logs.jsonl
apply_progress.json
portraits.json
tag_embeddings.jsonl
import_summary.json
apply_history.jsonl
```

---

## 3. Career Planner 后端接口

### 3.1 健康检查与认证

| Method | Path | 处理函数 | 请求 | 响应/错误 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/health` | `health` | 无 | `{status, service}` |
| `POST` | `/api/auth/register` | `register` | `{username, password}`，密码至少 6 位 | `{token, user}`；400/409 |
| `POST` | `/api/auth/login` | `login` | `{username, password}` | `{token, user}`；401 |
| `GET` | `/api/auth/me` | `me` | Bearer token | `{user}`；401 |
| `PUT` | `/api/auth/username` | `update_username` | `{username, currentPassword}` | `{token, user}`；400/401/409 |
| `PUT` | `/api/auth/password` | `update_password` | `{currentPassword, newPassword}` | `{ok, user}`；400/401 |

前端 `career-planner/frontend/src/services/api.js` 会自动从 `localStorage.cp_auth_token` 注入 Bearer Token。

### 3.2 用户画像与工作区

| Method | Path | 处理函数 | 请求 | 响应摘要 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/user-data` | `get_user_data` | Bearer token | `{studentData, aiResults, updatedAt}` |
| `GET` | `/api/student-profile/me` | `get_current_student_profile` | Bearer token | `{ok, source, user, studentProfile, studentData, aiResults, updatedAt}` |
| `PUT` | `/api/user-data` | `save_user_data` | `{studentData|studentProfile|profile, aiResults}` | `{ok, updatedAt}` |
| `POST` | `/api/user-data` | `save_user_data_post` | 同上 | 同上 |
| `POST` | `/api/user-data/reset` | `reset_user_data` | 无 | 清空画像、AI 结果、匹配工作区、提交历史 |
| `GET` | `/api/match/workspace` | `get_match_workspace` | 无 | `{workspace, updatedAt}` |
| `PUT` | `/api/match/workspace` | `save_match_workspace` | `{workspace}` | `{ok, updatedAt}` |
| `POST` | `/api/student-profile/submit-and-evaluate` | `submit_and_evaluate` | `{studentProfile, meta?}` | 保存提交历史，返回 `submissionId`, `nextPage`, `profileSnapshot` |

学生端 SQLite 表由 `storage.py` 初始化：

| 表 | 用途 |
| --- | --- |
| `users` | 用户名、UID、密码哈希、创建/更新时间 |
| `user_data` | 当前学生画像与 AI 结果 JSON |
| `profile_submissions` | 每次提交画像的历史快照与本地评估 |
| `match_workspace` | 推荐 lanes、篮子、收割报告、行动计划等临时工作区 JSON |

### 3.3 学生端匹配代理与报告

这些接口多数会代理到 Job Admin `8000` 的匹配引擎。代理前会探活 `http://127.0.0.1:8000/api/health`；探活失败返回 503，代理失败返回 502。

| Method | Path | 处理函数 | 请求 | 响应/行为 |
| --- | --- | --- | --- | --- |
| `POST` | `/api/match` | `match_proxy` | `{studentProfile, config?, batch_offsets, top_k}` | 透传 Job Admin `/api/match` |
| `POST` | `/api/match/run` | `match_run_proxy` | 同 `/api/match` | `/api/match` 兼容别名 |
| `POST` | `/api/match/check` | `match_check_proxy` | `{studentProfile, job, config?}` | 透传 Job Admin `/api/match/check` |
| `POST` | `/api/match/basket/submit` | `basket_submit` | `{basket, jobsById, studentProfile, analysis?}` | 创建收割记录，尽量内部调用 Job Admin `/api/match/harvest`，失败则本地降级 |
| `GET` | `/api/match/harvest/{basket_id}` | `get_harvest_record` | `basket_id` | 返回工作区内某条 harvest |
| `DELETE` | `/api/match/harvest/{basket_id}` | `delete_harvest_record` | `basket_id` | 删除工作区内某条 harvest |
| `POST` | `/api/match/action-plan` | `save_action_plan` | `{actionPlan?, patch?, targetJobId?, targetHarvestId?, payload?}` | 合并并保存工作区行动计划 |
| `POST` | `/api/match/internship-recommendations` | `internship_recommendations_proxy` | `{studentProfile, gaps, top_k}` | 透传 Job Admin `/api/match/internship-recommendations` |
| `POST` | `/api/match/insight` | `match_insight_proxy` | `{studentProfile, config?, batch_offsets, top_k}` | 透传 Job Admin `/api/match/insight` |
| `POST` | `/api/reports/chat` | `career_report_chat` | `{report, messages, question}` | 职业报告问答，返回 `{ok, model, answer, suggestedActions}` |

`basket_submit` 返回：

```json
{
  "ok": true,
  "workspace": {},
  "harvest": {},
  "basketHistoryRecord": {},
  "updatedAt": "2026-06-07T00:00:00+00:00"
}
```

### 3.4 Tag Center、技能与领域检索

| Method | Path | 处理函数 | 请求参数 | 响应摘要 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/student-profile/tech-capability/recommendations` | `tech_capability_recommendations` | `direction` | 旧版方向能力推荐 |
| `GET` | `/api/student-profile/tech-capability/search` | `tech_capability_search` | `query`, `type`, `direction`, `limit` | 旧版能力搜索 |
| `GET` | `/api/student-profile/professional-skills/search` | `professional_skills_search` | `query`, `category`, `type`, `limit`, `min_similarity` | 中文语义搜索标准标签 |
| `GET` | `/api/student-profile/professional-skills/recommendations` | `professional_skills_recommendations` | `category`, `tag_type`, `type`, `limit`, `offset`, `page`, `random_seed`, `min_frequency`, `exclude_tag_ids`, `exclude_values`, `domain_ids`, `domains` | 技能推荐与分页 |
| `GET` | `/api/student-profile/tech-domains/recommendations` | `tech_domains_recommendations` | `limit`, `page`, `min_frequency` | 领域推荐 |
| `GET` | `/api/student-profile/tech-domains/search` | `tech_domains_search` | `query`, `limit`, `min_frequency` | 领域搜索 |
| `GET` | `/api/student-profile/tag-center/search` | `tag_center_search` | `query`, `tag_type`, `limit`, `min_similarity` | 兼容接口，底层走 professional skills search |
| `GET` | `/api/student-profile/tag-center/resolve` | `tag_center_resolve` | `tag_id`, `value`, `tag_type` | `{source, matched, tag}` |

检索模块主要读取：

- `dataset/db/tag_center/tag_master.json`
- `dataset/db/tag_center/high_frequency_tags.json`
- `dataset/db/domain_center/domain_master.json`
- `dataset/db/domain_center/summary.json`
- 共享 embedding/query cache 与技能搜索索引文件

### 3.5 AI 画像评估接口

| Method | Path | 处理函数 | 请求 | 响应/行为 |
| --- | --- | --- | --- | --- |
| `POST` | `/api/ai/resume/parse` | `parse_resume` | `{dataUrl}` | 调旗舰模型解析图片简历；返回结构化画像片段，并强制清空 `techDomains` |
| `POST` | `/api/ai/profile/completeness` | `profile_completeness` | `{studentProfile}` | 本地完整度 raw score + LLM 建议 |
| `POST` | `/api/ai/profile/skillcheck` | `profile_skillcheck` | `{studentProfile, techNames, capNames, toolNames, appliedNames}` | 技能证据核验 JSON |
| `POST` | `/api/ai/profile/infer-levels` | `profile_infer_levels` | 同 SkillTaskPayload | 推断技能等级 JSON |
| `POST` | `/api/ai/profile/soft-quality` | `profile_soft_quality` | `{studentProfile}` | 软素质五维评估 JSON |
| `POST` | `/api/ai/profile/growth-potential` | `profile_growth_potential` | `{studentProfile}` | 成长潜力五维评估 JSON |

LLM 配置来自根目录 `.env`：

```text
JOB_SYSTEM_FLAGSHIP_LLM_BASE_URL
JOB_SYSTEM_FLAGSHIP_LLM_API_KEY
JOB_SYSTEM_FLAGSHIP_LLM_MODEL
JOB_SYSTEM_FLAGSHIP_LLM_TEMPERATURE
JOB_SYSTEM_FLAGSHIP_LLM_MAX_TOKENS
JOB_SYSTEM_FLAGSHIP_LLM_TIMEOUT_SECONDS
```

### 3.6 静态安全屏蔽

| Method | Path | 处理函数 | 行为 |
| --- | --- | --- | --- |
| `GET` | `/backend/{_path:path}` | `hide_backend_files` | 返回 404，防止暴露后端源码 |
| `GET` | `/data/{_path:path}` | `hide_data_files` | 返回 404，防止暴露数据目录 |

---

## 4. 前端调用关系速查

### 4.1 Career Planner

| 前端模块 | 主要接口 |
| --- | --- |
| `AuthContext.jsx` | `/api/auth/me`, `/api/auth/login`, `/api/auth/register` |
| `DataContext.jsx` | `/api/student-profile/me`, `/api/match/workspace`, `/api/user-data`, `/api/match`, `/api/match/check`, `/api/match/basket/submit` |
| `UploadSection.jsx` | `/api/ai/resume/parse` |
| `ProfilePreview.jsx`, `Profile.jsx` | `/api/student-profile/submit-and-evaluate` |
| `AiEval.jsx` | `/api/ai/profile/completeness`, `/api/ai/profile/skillcheck`, `/api/ai/profile/infer-levels` |
| `AIAnalysisSection.jsx` | `/api/ai/profile/soft-quality`, `/api/ai/profile/growth-potential` |
| `SkillsModule.jsx`, `skillcheck.js` | `/api/student-profile/professional-skills/search`, `/api/student-profile/professional-skills/recommendations` |
| `DirectionSelector.jsx` | `/api/student-profile/tech-domains/recommendations`, `/api/student-profile/tech-domains/search` |
| `JobDetailDrawer.jsx` | `/api/student-profile/tag-center/resolve` |
| `HarvestView.jsx` | `DELETE /api/match/harvest/{basket_id}` |
| `ActionPlan.jsx` | `/api/match/internship-recommendations`, `/api/match/workspace` |
| `Report.jsx` | `/api/reports/chat` |

### 4.2 Job Admin

| 前端页面 | 主要接口 |
| --- | --- |
| `Dashboard.jsx` | `/api/admin/summary` |
| `JobMatrix.jsx` | `/api/metadata`, `/api/jobs`, `/api/admin/jobs`, `/api/admin/jobs/{id}` |
| `Ingestion.jsx` | `/api/builder/uploads`, `/api/builder/configs/preflight`, `/api/builder/runs`, run pause/resume/apply |
| `TagsCenter.jsx` | `/api/admin/summary`, `/api/admin/tags` |
| `RunLogs.jsx` | `/api/admin/summary`, `/api/builder/runs` |
| `Settings.jsx` | `/api/builder/models`, `/api/builder/configs/test` |
| `Normalization.jsx` | `/api/admin/normalization/runs`, `/api/admin/normalization/tag-review/runs` |
| `MatchPage.jsx` | `/api/match`, `/api/match/insight` |
| `BasicMatchPage.jsx` | `/api/match` |

---

## 5. 已知占位与文档差异

| 项 | 当前代码事实 |
| --- | --- |
| `PUT /api/match/basket/active` | 未注册。学生端当前用 `PUT /api/match/workspace` 保存当前篮子。 |
| `POST /api/match/profile/sync-event` | 未注册。前端画像事件在本地 workspace/profileEvents 中维护。 |
| `POST /api/match/harvest` | Job Admin 匹配引擎存在；Career Planner 不直接公开这个 POST，只在 `/api/match/basket/submit` 内部调用。 |
| `/api/match/insight` | 当前只返回报告和元信息，不返回 lanes。 |
| Builder 路径 | 外部路径必须带 `/api/builder`；裸 `/runs`、`/uploads`、`/models` 只是 router 内部相对路径。 |
| 学生端错误读取 | 后端返回 `{error.message}`，但前端 axios 错误拦截器当前未显式读取 `error.response.data.error.message`。 |
