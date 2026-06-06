# job_system 运行、编号与归一设计

这份文档描述当前 `job_system` 已落地的 embedding 用法、共享缓存、编号规则、Tag 归一规则和批次追踪方式。

适用范围：

- `job_system/job-admin/backend/backend_app/`
- `job_system/job-admin/backend/portrait_builder_api.py`
- `job_system/job-admin/backend/tag_sync.py`

## 1. 当前系统的两条主链

当前系统有两条核心链路：

1. 人岗匹配链
2. 岗位画像构建链

两条链都会使用标签，但 embedding 的作用不同。

## 2. Embedding 的实际用途

### 2.1 人岗匹配链

embedding 在匹配链里是主算法基础设施，用于：

- 启动时加载和补齐标签向量
- 学生标签的语义扩展召回
- 候选岗位标签的精排相似度打分

### 2.2 岗位画像构建链

embedding 不参与岗位画像抽取本身。

岗位画像构建是：

1. Stage 1：LLM 把原始岗位对象转成标准岗位壳
2. Stage 2：LLM 抽技术画像和软素质画像

embedding 只在“结果写回岗位库时的 Tag 自动归一”阶段使用。

## 3. Embedding 获取路径约束

当前系统统一规定：

- LLM 调用可以继续使用 LangChain
- embedding 获取一律只使用 direct HTTP
- LangChain embedding 不进入生产缓存

原因不是模型名不同，而是工程契约不同。之前已经用本地脚本验证过：

- 默认 LangChain OpenAI embedding 路径
- direct HTTP 请求智谱 embedding

这两条路径可能得到明显不同的向量结果。

因此，当前生产口径固定为：

- provider：`zhipu`
- model：`embedding-3`
- dimensions：`2048`
- normalization：L2
- acquisition path：`direct_http`

相关对比脚本：

- `scripts/compare_zhipu_embedding_http_vs_langchain.py`

## 4. 向量缓存结构

### 4.1 当前真源

共享持久化缓存真源是：

- `job_system/dataset/db/tag_center/tag_embedding_cache.jsonl`

它是 builder 和 matcher 共用的 embedding 资产文件。

### 4.2 运行时镜像

匹配服务在内存中维护：

- `tag_vectors_cache`

它不是独立真源，而是共享缓存的运行时镜像。

### 4.3 当前行为

- builder 写回岗位库时，新增标签会先补 embedding，并写入共享缓存
- matcher 启动时会加载共享缓存
- 岗位库变更后，matcher 会重新同步共享缓存
- matcher 如果发现岗位库里仍有缺失标签，也会补 embedding，并反写共享缓存

这意味着现在已经不是“两套互不相通的向量空间”，而是：

- 一套共享持久化缓存
- 一套 matcher 内存镜像

## 5. 编号系统

当前系统有三类编号：

- `job_id`
- `tagId`
- `groupId`

### 5.1 job_id

岗位编号采用递增格式：

- `Job_1`
- `Job_2`
- `Job_10813`

规则：

- 扫描当前岗位主表里的 `Job_数字`
- 取最大值加一

### 5.2 tagId

普通标签的 `tagId` 采用稳定哈希生成。

你可以把它理解成：

- 同类同名标签会生成同一个 ID
- 不依赖数据库自增
- 只要标签名和类别不变，ID 就稳定

实现细节这里不展开，只保留结论。

### 5.3 groupId

`techStack` 内 `type: "branch"` 节点的 `groupId` 也是稳定哈希生成。

只要组名和选项集合不变，`groupId` 就保持不变。

## 6. 归一与编号的关系

embedding 决定“新 Tag 应该并到谁”，编号决定“最终保存成哪个实体 ID”。

### 6.1 未归一成功

如果：

- 没有历史高频 canonical Tag 池
- 或关闭了 `normalizeWithExistingTags`
- 或相似度未过阈值

则：

- 为该新 Tag 生成自己的新 `tagId`
- 岗位画像中保留新的原始标签，等待后处理归一

### 6.2 归一成功

如果：

- exact 命中历史 canonical Tag
- 或 embedding Top1 超过当前类别阈值

则：

- 不再生成新 `tagId`
- 直接复用目标 canonical Tag 的旧 `tagId`
- 直接复用既有 canonical tag

因此当前系统里：

- embedding 不负责生成编号
- embedding 负责决定归一目标
- 编号一旦归一成功，直接继承 canonical `tagId`

### 6.3 归一痕迹字段

当前岗位画像侧只回填这些归一结果字段：

- `techCapabilities[].normalizedTag`
- `devTools[].normalizedTag`
- `techStack[].freq`

## 7. 自动归一规则

### 7.1 开关

构建批次与手动 apply 时有两个关键选项：

- `autoApplyToJobLibrary`
- `normalizeWithExistingTags`

含义：

- `autoApplyToJobLibrary=false`：只构建，不自动写回岗位库
- `autoApplyToJobLibrary=true`：构建后自动写回岗位库
- `normalizeWithExistingTags=true`：写回时尝试与已有 Tag 自动归一
- `normalizeWithExistingTags=false`：写回时保留新 Tag，不复用历史 canonical

### 7.2 归一目标集合

当前自动归一不是对全量历史 Tag 做，而是只对：

- `techStack` 叶子节点
- `techStack` 内 `type: "branch"` 分支节点的 `options`
- `techCapabilities`
- `devTools`

做自动归一。

### 7.3 类别阈值

当前自动归一阈值以代码里的 `NORMALIZE_THRESHOLDS` 为准，当前生效的是：

- `techStack`: `0.90`
- `techCapabilities`: `0.90`
- `devTools`: `0.90`

说明：

- `certifications` 不属于自动归一对象
- `softQuality` / `growthPotential` 是固定维度，不走这张自动归一阈值表
- `techStack` 分支节点和普通叶子节点共用 `techStack` 阈值，不单独作为一个归一大类
- 兜底默认阈值仍以代码行为为准

### 7.4 soft/growth 的当前口径

业务上：

- `softQuality`
- `growthPotential`

应视为固定维度，而不是普通技术标签池。

当前系统现状是：

- 展示层已经把它们单独拆出来
- 入库兼容逻辑里仍保留旧字段兼容

因此当前口径应理解为：

- 展示与管理按固定维度处理
- 存储兼容层暂时仍允许携带标签字段

## 8. Builder 运行追踪

当前 builder 已经是可追溯运行系统，而不是一次性脚本。

### 8.1 上传层

上传文件会落：

- `uploads/{upload_id}/records.json`
- `uploads/{upload_id}/summary.json`

### 8.2 运行层

每个 run 目录包含：

- `manifest.json`
- `progress.json`
- `normalized_input.json`
- `results.jsonl`
- `failures.jsonl`
- `logs.jsonl`
- `portraits.json`
- `import_summary.json`
- `apply_history.jsonl`

### 8.3 后端索引

后端级索引文件：

- `job_system/dataset/runtime_data/portrait_builder_data/db/runs_index.json`
- `job_system/dataset/runtime_data/portrait_builder_data/db/run_events.jsonl`

### 8.4 状态

当前运行状态：

- `queued`
- `running`
- `completed`
- `partial`
- `failed`
- `interrupted`

### 8.5 关键时间字段

当前系统会记录：

- `createdAt`
- `startedAt`
- `completedAt`
- `buildQueuedAt`
- `buildStartedAt`
- `buildCompletedAt`
- `latestApplyAt`
- `importedAt`

### 8.6 原 run 内重试

当前系统支持：

- 在原 run 内重试
- 不新建新的 run 记录

支持模式：

- `failed_only`
- `unfinished_only`
- `full`

重试成功后会回写原 run 的：

- 成功数
- 失败数
- 状态

### 8.7 配置预检

当前 builder 在开跑前必须预检配置：

- 检查 API 可用性
- 检查模型路由可访问性
- 检查配置模型是否存在

若预检失败：

- run 不启动

## 9. 后续 Java + SQL 迁移建议

当前这套编号仍可保留，但数据库阶段建议改成双轨：

1. 数据库主键：

- `id bigint`

2. 业务稳定编号：

- `job_code`
- `tag_code`
- `group_code`

建议未来表至少包括：

- `job_master`
- `tag_master`
- `tag_group_master`
- `job_tag_relation`
- `builder_run`
- `builder_run_event`
- `builder_run_apply`

向量层最重要的迁移约束只有一条：

- 即使未来迁移到 Java / LangChain4j，也应先复现当前 direct HTTP 契约，不要直接把框架 embedding 并入现有生产缓存

补充：

- 匹配召回与分档阈值当前集中在 `job_system/job-admin/backend/backend_app/match_config.py`
- 旧版分档阈值也保留在同一文件中，方便继续做 A/B 和校准
## 11. 向量资产拆分

为了避免把“干净标签缓存”和“待处理向量空间”混在一起，运行时约定如下：

- `job_system/dataset/db/tag_center/tag_embedding_cache.jsonl`
  - 当前运行使用的干净缓存
  - 只保留可直接复用的标签 embedding
- `job_system/dataset/db/tag_center/tag_embedding_cache.clean.jsonl`
  - 清洗后的缓存快照
  - 作为审计和回放依据
- `job_system/dataset/db/tag_center/tag_vector_space.jsonl`
  - 预留的空文件
  - 专门用于后续的标签向量空间落盘

配套检查脚本放在：

- `job_system/test/tag_embedding_audit.py`

它负责：

- 扫描现有 embedding jsonl，找出带 `:` / `：` 的脏标签
- 生成 clean cache 快照
- 保留空的向量空间占位文件
- 统计非自匹配的相似度阈值分布


