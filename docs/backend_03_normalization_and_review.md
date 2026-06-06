# 归一与画像复查完整过程

这份文档讲两条独立但相关的流程：

- 岗位库全量归一
- Tag / 画像复查

两者都属于后端的“数据治理”流程，但目的不同。

## 1. 全量归一在做什么

全量归一主要做三件事：

1. 读取岗位库
2. 重新跑标准化和向量缓存
3. 重建 tag 资产

代码入口主要在：

- [backend_app/normalization_service.py](../job-admin/backend/backend_app/normalization_service.py)
- [tag_sync.py](../job-admin/backend/tag_sync.py)

## 2. 归一接口

相关接口：

- `GET /api/admin/normalization/runs`
- `POST /api/admin/normalization/runs`
- `GET /api/admin/normalization/runs/{run_id}`
- `GET /api/admin/normalization/cache`

其中：

- `POST /api/admin/normalization/runs` 会启动一个新的归一 run
- 如果已经有活跃 run，会直接返回当前活跃 run 的快照

## 3. 归一 run 的过程

run 启动后会经历：

1. 创建 `manifest.json`
2. 创建 `progress.json`
3. 写入初始 `result.json`
4. 后台执行 `normalize_existing_job_library_strict()`
5. 更新进度、日志和 cache 状态
6. 完成后刷新岗位库和 tag 资产

## 4. 归一的核心结果

归一 run 的快照里通常能看到：

- `manifest`
- `progress`
- `result`
- `logsTail`
- `cacheStatus`
- `isActive`

`progress` 里常见字段：

- `status`
- `percent`
- `stage`
- `message`
- `startedAt`
- `completedAt`
- `changed`
- `normalized`
- `embeddingModel`

## 5. 归一和 embedding 缓存

归一流程会同时关注 embedding 缓存状态。

`GET /api/admin/normalization/cache` 会返回当前缓存信息，常见字段包括：

- `profileId`
- `provider`
- `model`
- `dimensions`
- `cacheFile`
- `exists`
- `sizeBytes`
- `matchedRows`
- `totalRows`
- `updatedAt`
- `apiUrl`

这一步的意义是确认当前 embedding profile 和缓存文件是否匹配。

## 6. 画像复查是什么

画像复查指的是对 tag 资产做 LLM 审核，决定某个 tag：

- 保留
- 替换
- 拆分
- 删除

它不是通用的岗位抽取，而是针对已存在 tag 的治理流程。

相关接口：

- `GET /api/admin/normalization/tag-review/runs`
- `POST /api/admin/normalization/tag-review/runs`
- `GET /api/admin/normalization/tag-review/runs/{run_id}`
- `POST /api/admin/normalization/tag-review/runs/{run_id}/pause`
- `POST /api/admin/normalization/tag-review/runs/{run_id}/resume`
- `POST /api/admin/normalization/tag-review/runs/{run_id}/restart`

## 7. 复查的输入和候选集

复查会先从当前岗位库里收集候选 tag，再按 review mode 过滤。

review mode 目前有两种：

- `all`
- `unreviewed_only`

候选集会统计：

- `totalCandidates`
- `byType`
- `reviewedBeforeCandidates`
- `repeatReviewedCandidates`

## 8. 复查的配置

复查使用的是一份 `BuilderConfig`，但会被强制收紧为复查专用策略：

- `temperature = 0`
- `maxTokens <= 256`
- `requestsPerMinute` 仍按配置执行

所以它和普通 pipe 的目标不同：

- pipe 侧更关注抽取质量
- review 侧更关注稳定、保守、可重复

## 9. 复查的执行逻辑

每个候选 tag 的处理过程大致是：

1. 取 tag 类型和当前名称
2. 组装 system prompt / user prompt
3. 调用 LLM
4. 解析返回的方括号响应
5. 形成决策
6. 更新 review stats
7. 继续下一个候选

支持的决策包括：

- unchanged
- replace
- split
- delete

## 10. 复查的 checkpoint

复查 run 会保留 checkpoint，方便暂停后恢复。

相关产物包括：

- `manifest.json`
- `progress.json`
- `result.json`
- `logs.jsonl`
- `checkpoint.json`
- `request.json`
- `candidates.json`
- `control.json`

暂停后可以：

- `pause`
- `resume`
- `restart`

## 11. 复查结束后会做什么

当复查完成时，后端会：

- 把 tag 决策写回岗位库
- 重建 tag 资产
- 标记 review stats 已应用
- 刷新岗位和向量缓存

因此复查不是“只看日志”，它会真正影响后续匹配和统计。

## 12. 这两条流程的区别

| 项目 | 全量归一 | 画像复查 |
| --- | --- | --- |
| 目标 | 统一岗位库结构和缓存 | 审核并治理 tag 资产 |
| 输入 | 整个岗位库 | tag 候选集 |
| 输出 | 归一后的岗位库、缓存、统计 | 复查决策和更新后的 tag 体系 |
| 是否用 LLM | 会用 | 会用 |
| 是否可暂停恢复 | 归一通常是一次性任务 | 支持 pause/resume/restart |

如果你只想理解“为什么前端里有个归一按钮”，答案就是：

- 它是对整库做标准化和缓存刷新
- 它不是普通的画像抽取


