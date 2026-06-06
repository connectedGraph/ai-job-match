# API 配置（LLM / Embedding / 限速）与 `.env` 格式

这份文档说明当前交付版的模型配置方式。后端统一读取仓库根目录 `.env`，模型配置只保留三组：旗舰 LLM、快速 LLM、向量模型。

## 1. 配置入口

根目录自动加载逻辑在 [project_paths.py](../job-admin/backend/project_paths.py) 和 [career-planner/backend/config.py](../career-planner/backend/config.py) 中。真实 API key 只应写入本地 `.env`，不要提交到仓库。

当前不再使用旧的 provider fallback 链，也不再拆分多个历史前缀。服务端环境变量固定为：

- `JOB_SYSTEM_FLAGSHIP_LLM_*`
- `JOB_SYSTEM_FAST_LLM_*`
- `JOB_SYSTEM_EMBEDDING_*`

## 2. 旗舰 LLM

旗舰模型用于需要复杂推理、稳定结构化输出或长文本分析的任务。

变量：

- `JOB_SYSTEM_FLAGSHIP_LLM_BASE_URL`
- `JOB_SYSTEM_FLAGSHIP_LLM_API_KEY`
- `JOB_SYSTEM_FLAGSHIP_LLM_MODEL`
- `JOB_SYSTEM_FLAGSHIP_LLM_TEMPERATURE`
- `JOB_SYSTEM_FLAGSHIP_LLM_MAX_TOKENS`
- `JOB_SYSTEM_FLAGSHIP_LLM_TIMEOUT_SECONDS`
- `JOB_SYSTEM_FLAGSHIP_LLM_REQUESTS_PER_MINUTE`
- `JOB_SYSTEM_FLAGSHIP_LLM_MAX_CONCURRENCY`

主要用途：

- 学生端简历解析、画像 AI 评估、技能核验、软素质和成长潜力分析
- 岗位画像生成、JD 结构化抽取、深度匹配报告
- 图片输入转回答、复杂 JSON、竞争力评估等高价值任务

推荐模型：`GPT-5.4`、`Claude Sonnet 4.5`、`DeepSeek V4 Pro`。

## 3. 快速 LLM

快速模型用于短文本、低风险、低成本任务。它和旗舰模型拥有独立的 `BASE_URL` 与 `API_KEY`，可以接不同供应商。

变量：

- `JOB_SYSTEM_FAST_LLM_BASE_URL`
- `JOB_SYSTEM_FAST_LLM_API_KEY`
- `JOB_SYSTEM_FAST_LLM_MODEL`
- `JOB_SYSTEM_FAST_LLM_TEMPERATURE`
- `JOB_SYSTEM_FAST_LLM_MAX_TOKENS`
- `JOB_SYSTEM_FAST_LLM_TIMEOUT_SECONDS`
- `JOB_SYSTEM_FAST_LLM_REQUESTS_PER_MINUTE`
- `JOB_SYSTEM_FAST_LLM_MAX_CONCURRENCY`

主要用途：

- 简单分类、广告/异常判定、低风险复核
- Tag Center / Domain Center 英文标准词到中文显示名的轻量翻译
- 不需要旗舰模型深度推理的短任务

推荐模型：`GPT-5.4-mini`、`Claude Haiku 4.5`、`DeepSeek V4 Flash`。

如果快速模型没有配置 API key，Tag Center 和 Domain Center 的自动中文显示名补齐会跳过，显示层回退为英文标准词。

## 4. 向量模型

向量模型用于语义表示与召回，接口按 `{BASE_URL}/embeddings` 调用。注意不要把所有 embedding 服务都强行补成 `/v1`；例如智谱示例地址是 `https://open.bigmodel.cn/api/paas/v4`，最终请求为 `https://open.bigmodel.cn/api/paas/v4/embeddings`。

变量：

- `JOB_SYSTEM_EMBEDDING_BASE_URL`
- `JOB_SYSTEM_EMBEDDING_API_KEY`
- `JOB_SYSTEM_EMBEDDING_MODEL`
- `JOB_SYSTEM_EMBEDDING_DIMENSIONS`
- `JOB_SYSTEM_EMBEDDING_BATCH_SIZE`
- `JOB_SYSTEM_EMBEDDING_TIMEOUT_SECONDS`
- `JOB_SYSTEM_EMBEDDING_REQUESTS_PER_MINUTE`
- `JOB_SYSTEM_EMBEDDING_MAX_CONCURRENCY`

默认示例使用智谱 `embedding-3`，维度 `2048`。

向量模型具体用于：

- 学生端“专业技能构建”中文语义搜索：把中文 query 映射到 Tag Center 英文标准标签
- Tag Center 标签归一：相似标签聚类、标准词对齐、缓存补齐
- 匹配链路：语义召回、相似标签补齐、英文 `normalizedTag` 对齐

向量模型不用于报告生成，也不直接决定最终分数。最终分档和分数仍由确定性规则、英文 `normalizedTag`、能力等级与权重矩阵计算。

## 5. `.env` 示例

```env
CAREER_PLANNER_JWT_SECRET=replace-with-a-long-random-secret

JOB_SYSTEM_FLAGSHIP_LLM_BASE_URL=https://api.example.com/v1
JOB_SYSTEM_FLAGSHIP_LLM_API_KEY=<YOUR_FLAGSHIP_KEY>
JOB_SYSTEM_FLAGSHIP_LLM_MODEL=gpt-5.4
JOB_SYSTEM_FLAGSHIP_LLM_TEMPERATURE=0.3
JOB_SYSTEM_FLAGSHIP_LLM_MAX_TOKENS=4000
JOB_SYSTEM_FLAGSHIP_LLM_TIMEOUT_SECONDS=120
JOB_SYSTEM_FLAGSHIP_LLM_REQUESTS_PER_MINUTE=800
JOB_SYSTEM_FLAGSHIP_LLM_MAX_CONCURRENCY=30

JOB_SYSTEM_FAST_LLM_BASE_URL=https://api.example.com/v1
JOB_SYSTEM_FAST_LLM_API_KEY=<YOUR_FAST_KEY>
JOB_SYSTEM_FAST_LLM_MODEL=gpt-5.4-mini
JOB_SYSTEM_FAST_LLM_TEMPERATURE=0
JOB_SYSTEM_FAST_LLM_MAX_TOKENS=2000
JOB_SYSTEM_FAST_LLM_TIMEOUT_SECONDS=60
JOB_SYSTEM_FAST_LLM_REQUESTS_PER_MINUTE=800
JOB_SYSTEM_FAST_LLM_MAX_CONCURRENCY=30

JOB_SYSTEM_EMBEDDING_BASE_URL=https://open.bigmodel.cn/api/paas/v4
JOB_SYSTEM_EMBEDDING_API_KEY=<YOUR_EMBEDDING_KEY>
JOB_SYSTEM_EMBEDDING_MODEL=embedding-3
JOB_SYSTEM_EMBEDDING_DIMENSIONS=2048
JOB_SYSTEM_EMBEDDING_BATCH_SIZE=64
JOB_SYSTEM_EMBEDDING_TIMEOUT_SECONDS=180
JOB_SYSTEM_EMBEDDING_REQUESTS_PER_MINUTE=800
JOB_SYSTEM_EMBEDDING_MAX_CONCURRENCY=30
```

完整模板见根目录 [.env.example](../.env.example)。

## 6. 代码读取位置

- 统一模型配置：[model_config.py](../job-admin/backend/backend_app/model_config.py)
- 学生端旗舰 LLM 读取：[config.py](../career-planner/backend/config.py)
- Tag / Domain 轻量翻译：[tag_sync.py](../job-admin/backend/tag_sync.py)
- 学生端专业技能语义搜索：[tech_capability.py](../career-planner/backend/tech_capability.py)

## 7. 历史说明

本项目早期开发时模型生态仍以 DeepSeek V3.2 等旧版能力为主要参照。当前交付版已经改为旗舰/快速/向量三组配置，不再推荐维护历史 provider 前缀或多层 fallback。
