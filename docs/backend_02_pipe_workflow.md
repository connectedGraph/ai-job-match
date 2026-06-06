# pipe 工作流抽取画像完整过程

这份文档讲的是 builder / pipe 如何把原始岗位资料变成标准画像。代码入口主要在 [portrait_builder/](../job-admin/backend/portrait_builder/) 下，核心是 [api_processing.py](../job-admin/backend/portrait_builder/api_processing.py) 和 [pipeline_core.py](../job-admin/backend/portrait_builder/pipeline_core.py)。

## 1. 输入模式

当前支持 4 种输入模式：

- `raw_source`
- `structured_job_json_extract`
- `structured_job_json_fill_missing`
- `structured_job_json_direct_stage4`

这些模式的区别是：

- `raw_source` 是最完整的原始文本模式
- `structured_job_json_extract` 适合已经有一定结构的 JD JSON
- `structured_job_json_fill_missing` 只补缺项，不重做已有结构
- `structured_job_json_direct_stage4` 直接跳到第 4 阶段抽取

## 2. 总体流程

一个 run 的主链路可以理解为：

1. 上传原始文件
2. 标准化成记录数组
3. 选择模型配置并做 preflight
4. 创建 run manifest / progress
5. 按配置并发处理每条记录
6. 生成画像结果
7. 可选写回岗位库
8. 记录日志、执行历史和 apply 历史

## 3. 上传阶段

上传入口是 `POST /api/builder/uploads`。

后端会：

- 读取 `contentBase64`
- 按文件类型解析 `json/jsonl/csv/xls/xlsx`
- 生成标准记录数组
- 写入 `uploads/{upload_id}/records.json`
- 写入 `uploads/{upload_id}/summary.json`

summary 里通常包含：

- `uploadId`
- `fileName`
- `inputMode`
- `recordCount`
- `fields`
- `preview`
- `createdAt`

## 4. preflight 阶段

run 启动前会先对所有启用配置做 preflight：

- 检查模型服务可达
- 拉取远端模型列表
- 确认指定 `model` 是否存在

这一步对应：

- `POST /api/builder/configs/preflight`
- `POST /api/builder/runs`

如果 preflight 不通过，run 不会启动。

## 5. 运行时配置与并发

`BuilderConfig` 里最关键的是：

- `baseUrl`
- `apiKey`
- `model`
- `stageRole`
- `apiMode`
- `concurrency`
- `requestsPerMinute`
- `temperature`
- `maxTokens`

当前这套项目里，任务运行时建议保持：

- `concurrency = 30`
- `requestsPerMinute = 800`

`maxTokens` 和 `temperature` 仍然按任务单独调整，不强制统一。

## 6. 画像抽取的阶段

### 6.1 Stage 1: 字段恢复

针对原始文本型 JD，先让模型把原始字段名映射到标准字段。

输出的是字段映射，目的是把乱七八糟的列名先恢复成可读的标准字段。

### 6.2 Stage 1: 基础信息抽取

从恢复后的文本里抽取：

- `title`
- `companyName`
- `direction`
- `industry`
- `metadata`

其中 `metadata.jobType` 只允许三类：

- `实习`
- `社招全职`
- `校招全职`

抽取规则：

- 明确实习、Intern、见习、日常实习、实习生，归 `实习`
- 明确校招、应届、毕业生、校园招聘、人才计划，归 `校招全职`
- 社招、博士后、OD、混合口径或无法确定，统一归 `社招全职`

这条规则直接写在 [pipeline_core.py](../job-admin/backend/portrait_builder/pipeline_core.py) 的 Stage 1 基础信息抽取提示词里。写入画像前，[job_profile_schema.py](../job-admin/backend/job_profile_schema.py) 还会通过 `normalize_job_type()` 做兜底归一。

### 6.3 Stage 2: 结构拆分

把 JD 拆成：

- `jdSplit.jobDescriptions`
- `jdSplit.jobRequirements`
- `jdSplit.bonusPoints`
- `jdSplit.notes`

并补出基础要求：

- `education_min`
- `major`
- `graduationYearRange`
- `certifications`
- `experiences`

### 6.4 Stage 3: 句子分类

如果需要继续抽取，模型会先把 `jobRequirements` 句子分到：

- `tech`
- `soft`
- `noise`

这样后续 Stage 4 才知道哪些句子送去抽技术，哪些句子送去抽软素质。

### 6.5 Stage 4: 技术与软素质抽取

最后会抽出：

- `techStack`
- `techCapabilities`
- `devTools`
- `softQuality`
- `growthPotential`

Stage 4 有两种做法：

- 分类后再抽取
- 直接从 JD 结构里抽取

`structured_job_json_direct_stage4` 会跳过 Stage 3，直接进入 Stage 4 的直取逻辑。

## 7. 结果合并

最终画像是把多段输出合并成标准岗位画像：

- 原始文本 -> 字段恢复 -> 基础信息 -> 结构拆分 -> 句子分类 -> 技术抽取 -> 软素质抽取
- 最后统一走 `normalize_job_profile()`

在结构化输入模式下，会尽量复用输入里已有的结构，只补缺失部分。

## 8. 运行产物

每个 run 会写到：

- `dataset/runtime_data/portrait_builder_data/runs/{run_id}/manifest.json`
- `dataset/runtime_data/portrait_builder_data/runs/{run_id}/progress.json`
- `dataset/runtime_data/portrait_builder_data/runs/{run_id}/normalized_input.json`
- `dataset/runtime_data/portrait_builder_data/runs/{run_id}/results.jsonl`
- `dataset/runtime_data/portrait_builder_data/runs/{run_id}/failures.jsonl`
- `dataset/runtime_data/portrait_builder_data/runs/{run_id}/logs.jsonl`
- `dataset/runtime_data/portrait_builder_data/runs/{run_id}/embedding_logs.jsonl`
- `dataset/runtime_data/portrait_builder_data/runs/{run_id}/portraits.json`
- `dataset/runtime_data/portrait_builder_data/runs/{run_id}/import_summary.json`
- `dataset/runtime_data/portrait_builder_data/runs/{run_id}/apply_history.jsonl`

## 9. 什么时候会写回岗位库

写回是可选动作，不是 run 必做动作。

常见路径是：

- 先跑 pipe
- 查看结果
- 再执行 apply

apply 入口是 `POST /api/builder/runs/{run_id}/apply`。

如果 `autoApplyToJobLibrary` 打开，运行结束后会自动进入写回逻辑。

## 10. 这个流程里最重要的约束

- 每个任务内的 `concurrency` 和 `requestsPerMinute` 要一致，不要同一批 run 里随意混值
- `temperature` 和 `maxTokens` 可以按任务调
- 结构化输入不要强行走原始文本抽取路径
- 如果输入已经有足够字段，优先用 `fill_missing` 或 `direct_stage4`
- 结果落盘后再做 apply，不要边跑边手工改数据


