# API 配置（LLM / embedding / 限速）与 `.env` 格式

这份文档说明后端 LLM 和 embedding 的配置方式。当前项目已经把根目录 `.env` 作为主配置入口，并且在启动早期自动加载。

## 1. 配置优先级

当前读取顺序大致是：

1. 环境变量
2. 根目录 `.env`
3. 少量 JSON 文件兜底

根目录自动加载逻辑在 [project_paths.py](../job-admin/backend/project_paths.py) 里。

## 2. 为什么要放在根目录 `.env`

这样做的好处是：

- 不用把密钥写死在代码里
- 不用靠前端管理页来维持核心调用配置
- 所有后端任务能共享同一套环境变量
- 可以把“普通任务流”和“pipe / 管理流”区分开

你前面提到的“不要和 pipe 流混在一起”是对的，这里就是把**运行时固定配置**和**前端管理配置**分开。

## 3. 文本模型配置

文本模型相关变量以 `JOB_SYSTEM_TEXT_` 开头：

- `JOB_SYSTEM_TEXT_BASE_URL`
- `JOB_SYSTEM_TEXT_API_KEY`
- `JOB_SYSTEM_TEXT_MODEL`
- `JOB_SYSTEM_TEXT_TEMPERATURE`
- `JOB_SYSTEM_TEXT_MAX_TOKENS`
- `JOB_SYSTEM_TEXT_REQUESTS_PER_MINUTE`
- `JOB_SYSTEM_TEXT_MAX_CONCURRENCY`

含义：

- `BASE_URL`
  - 模型主机地址
  - 代码会自动补 `/v1`
- `API_KEY`
  - 访问密钥
- `MODEL`
  - 模型名
- `TEMPERATURE`
  - 生成温度
- `MAX_TOKENS`
  - 最大输出长度
- `REQUESTS_PER_MINUTE`
  - 每分钟请求数
- `MAX_CONCURRENCY`
  - 并发数

## 4. embedding 配置

当前主用 embedding profile 是 `bigmodel_embedding_3`，通过：

- `JOB_SYSTEM_VECTOR_PROFILE=bigmodel_embedding_3`

来选择。

对应的配置变量是：

- `JOB_SYSTEM_BIGMODEL_VECTOR_BASE_URL`
- `JOB_SYSTEM_BIGMODEL_VECTOR_API_KEY`
- `JOB_SYSTEM_BIGMODEL_VECTOR_MODEL`
- `JOB_SYSTEM_BIGMODEL_VECTOR_DIMENSIONS`
- `JOB_SYSTEM_BIGMODEL_VECTOR_REQUESTS_PER_MINUTE`
- `JOB_SYSTEM_BIGMODEL_VECTOR_MAX_CONCURRENCY`
- `JOB_SYSTEM_BIGMODEL_VECTOR_BATCH_SIZE`

## 5. 归一 / 复查专用 LLM 配置

归一与 tag review 还会用一套单独的 LLM 配置：

- `JOB_SYSTEM_NORMALIZATION_LLM_BASE_URL`
- `JOB_SYSTEM_NORMALIZATION_LLM_API_KEY`
- `JOB_SYSTEM_NORMALIZATION_LLM_MODEL`
- `JOB_SYSTEM_NORMALIZATION_LLM_CACHE_FILE`
- `JOB_SYSTEM_NORMALIZATION_LLM_RPM`
- `JOB_SYSTEM_NORMALIZATION_LLM_MAX_WORKERS`

这套配置是单独的，不要和普通 `JOB_SYSTEM_TEXT_*` 混用。

这套配置也会被 Tag Center 的中文名补齐复用。纯翻译任务不需要强推理模型，推荐填 `gpt-5.4-mini`；如果不配置 API key，中文名补齐会跳过并 fallback 到英文标准词。

Domain Center 的中文名补齐是 job-admin 后台任务，但优先复用学生端画像 AI 的 OpenAI-compatible 配置：

- `CAREER_PLANNER_AI_LLM_BASE_URL`
- `CAREER_PLANNER_AI_LLM_API_KEY`
- `CAREER_PLANNER_AI_LLM_MODEL`
- `CAREER_PLANNER_AI_LLM_TEMPERATURE`
- `CAREER_PLANNER_AI_LLM_MAX_TOKENS`
- `CAREER_PLANNER_AI_LLM_TIMEOUT_SECONDS`

推荐值是 `CAREER_PLANNER_AI_LLM_MODEL=gemini-3-flash-preview`、`CAREER_PLANNER_AI_LLM_TEMPERATURE=0.2`。如果 `CAREER_PLANNER_AI_LLM_API_KEY` 留空，Domain Center 翻译才会兜底使用 `JOB_SYSTEM_NORMALIZATION_LLM_*`。

可选开关：

- `JOB_SYSTEM_TAG_TRANSLATION_ENABLED=0`：关闭 Tag Center 中文翻译
- `JOB_SYSTEM_DOMAIN_TRANSLATION_ENABLED=0`：关闭 Domain Center 中文翻译

## 6. 学生端专业技能搜索 embedding 配置

“我的画像 / 专业技能构建”的中文语义搜索使用单独的 OpenAI-compatible embedding 配置：

- `CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_BASE_URL`
- `CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_API_KEY`
- `CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_MODEL`
- `CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_DIMENSIONS`
- `CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_BATCH_SIZE`
- `CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_TIMEOUT_SECONDS`
- `CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_CACHE_FILE`
- `CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_USE_JOB_SYSTEM_VECTOR`

这组配置只服务学生端中文候选词搜索，不参与后台 Tag Center 归一，也不参与最终人岗匹配。最终匹配仍使用英文 `normalizedTag`。

默认留空。留空时会复用 `JOB_SYSTEM_VECTOR_*` 和 `dataset/db/tag_center/embedding_cache.json`，响应里会返回 `embedding.provider=job-system-vector` 和 `fallbackToJobSystemVector=true`。候选向量会落成本地索引 `dataset/db/tag_center/skill_search_index_*_v2.json/.npy`；query 向量优先读 `dataset/career_planner/skill_search_query_embedding_cache_<profile>.jsonl`，避免每次搜索都解析 200MB 级别的大缓存。

如果设置 `CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_USE_JOB_SYSTEM_VECTOR=0`，则关闭 fallback。此时专用 embedding 配置为空时不会调用 API，只做字面兜底，并在响应里的 `embedding.status` 返回 `missing_config`。

## 7. 当前建议值

你前面要求统一任务运行的并发和 RPM，这里推荐：

- `MAX_CONCURRENCY = 30`
- `REQUESTS_PER_MINUTE = 800`

对 embedding、普通 LLM、归一 LLM 都建议保持这个默认基线，除非某个特殊任务明确要更低。

## 8. `.env` 示例

下面是建议格式，密钥请自己替换成真实值：

```env
JOB_SYSTEM_TEXT_BASE_URL=https://test.lemonapi.ai/v1
JOB_SYSTEM_TEXT_API_KEY=<YOUR_API_KEY>
JOB_SYSTEM_TEXT_MODEL=gpt-5.4
JOB_SYSTEM_TEXT_TEMPERATURE=0.3
JOB_SYSTEM_TEXT_MAX_TOKENS=4000
JOB_SYSTEM_TEXT_REQUESTS_PER_MINUTE=800
JOB_SYSTEM_TEXT_MAX_CONCURRENCY=30

JOB_SYSTEM_VECTOR_PROFILE=bigmodel_embedding_3
JOB_SYSTEM_BIGMODEL_VECTOR_BASE_URL=https://open.bigmodel.cn/api/paas/v4
JOB_SYSTEM_BIGMODEL_VECTOR_API_KEY=<YOUR_API_KEY>
JOB_SYSTEM_BIGMODEL_VECTOR_MODEL=embedding-3
JOB_SYSTEM_BIGMODEL_VECTOR_DIMENSIONS=2048
JOB_SYSTEM_BIGMODEL_VECTOR_REQUESTS_PER_MINUTE=800
JOB_SYSTEM_BIGMODEL_VECTOR_MAX_CONCURRENCY=30
JOB_SYSTEM_BIGMODEL_VECTOR_BATCH_SIZE=60

JOB_SYSTEM_NORMALIZATION_LLM_BASE_URL=https://test.lemonapi.ai/v1/
JOB_SYSTEM_NORMALIZATION_LLM_API_KEY=<YOUR_API_KEY>
JOB_SYSTEM_NORMALIZATION_LLM_MODEL=gpt-5.4-mini
JOB_SYSTEM_NORMALIZATION_LLM_CACHE_FILE=normalized_cluster_llm_cache_v2.json
JOB_SYSTEM_NORMALIZATION_LLM_TEMPERATURE=0
JOB_SYSTEM_NORMALIZATION_LLM_MAX_TOKENS=4096
JOB_SYSTEM_NORMALIZATION_LLM_TIMEOUT_SECONDS=180
JOB_SYSTEM_NORMALIZATION_LLM_RPM=800
JOB_SYSTEM_NORMALIZATION_LLM_MAX_WORKERS=30
JOB_SYSTEM_TAG_TRANSLATION_ENABLED=1
JOB_SYSTEM_DOMAIN_TRANSLATION_ENABLED=1

CAREER_PLANNER_AI_LLM_BASE_URL=https://test.lemonapi.ai/v1
CAREER_PLANNER_AI_LLM_API_KEY=<YOUR_API_KEY>
CAREER_PLANNER_AI_LLM_MODEL=gemini-3-flash-preview
CAREER_PLANNER_AI_LLM_TEMPERATURE=0.2
CAREER_PLANNER_AI_LLM_MAX_TOKENS=4000
CAREER_PLANNER_AI_LLM_TIMEOUT_SECONDS=120

CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_BASE_URL=
CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_API_KEY=
CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_MODEL=
CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_DIMENSIONS=
CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_BATCH_SIZE=64
CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_TIMEOUT_SECONDS=30
CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_CACHE_FILE=
CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_USE_JOB_SYSTEM_VECTOR=1
```

## 9. 代码里的读取方式

### 文本模型

读取逻辑在 [backend_app/model_config.py](../job-admin/backend/backend_app/model_config.py)：

- 先读环境变量
- 再读 `dataset/tools/text_model_config.json`
- 最后回退默认值

### embedding

embedding 也是同一套逻辑：

- 当前 profile 由 `JOB_SYSTEM_VECTOR_PROFILE` 控制
- 具体参数按 profile 读取

### 归一 / 复查

归一和复查在 [tag_sync.py](../job-admin/backend/tag_sync.py) 里读取专用 LLM 配置。

### 学生端专业技能搜索

专业技能构建搜索在 [tech_capability.py](../career-planner/backend/tech_capability.py) 里读取 `CAREER_PLANNER_SKILL_SEARCH_EMBEDDING_*` 配置。

## 10. 不要再把密钥写回 JSON

现在更推荐：

- `.env` 放主配置
- JSON 只做历史兼容或本地调试
- 真实 API key 不要回填到前端管理页导出的文件里

## 11. 一个实用约束

你提到的“同一个任务工作时 concurrency 和 rpm 保持一致”是正确的。落地上建议：

- 一个 run 内不要混用不同 rpm
- 一个 run 内不要混用不同 concurrency 级别
- `temperature` 和 `maxTokens` 允许任务级差异
- pipe 和管理流分开配置，不要互相覆盖


