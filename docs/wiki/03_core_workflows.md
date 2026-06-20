# 核心工作流与逻辑引擎 (Core Workflows & Logic Engine)

本页面详细探讨了 **岗位数据管理后台 (Job Admin)** 与 **职途星 (Career Planner)** 系统中运行的三大核心业务逻辑和算法引擎。这些模块通过大模型级联抽取、多维语义校正、以及确定性数学匹配模型，确保人岗适配度具有高度的可解释性和工程高可用度。

---

## 1. 岗位画像抽取流水线 (Portrait Ingestion Pipeline / Portrait Builder)

本系统使用级联的大模型抽取链路将非结构化的招聘简章（Job Description, JD）转换为标准结构化的岗位画像，整个处理过程由 [api_processing.py](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/portrait_builder/api_processing.py) 进行整体编排。

### 1.1 标准文件上传与解析
用户可以通过控制台上传原始招聘岗位文件，支持四类标准格式。在上传接口 [api_routes_uploads.py](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/portrait_builder/api_routes_uploads.py#L21-L36) 中，上传的文件内容以 Base64 编码传输，解析逻辑封装在 [api_utils.py](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/portrait_builder/api_utils.py#L172-L204) 中的 `normalize_records` 函数：
* **JSON (`.json`) / JSONL (`.jsonl`)**：按 UTF-8-sig 解码并反序列化为 Python 对象列表。
* **CSV (`.csv`)**：轮询常见中文编码格式（`utf-8-sig`, `utf-8`, `gb18030`, `gbk`）解码，通过 `pd.read_csv` 将数据读取为 Pandas DataFrame。
* **Excel (`.xls`, `.xlsx`)**：通过 `pd.read_excel` 解析表格。
DataFrame 结构转换为 List[Dict] 后，由 `sanitize_value` 清理 NaN 值，最终调用 `build_upload_summary` 生成包含字段集、数据预览和行数的数据集摘要存盘。

### 1.2 预检配置机制 (Preflight Configs)
在正式启动大规模抽取任务前，系统必须保证大模型提供商服务的可用性和调用参数正确：
1. **模型发现 (Model Discovery)**：客户端发起 POST 请求至外部接口 `/api/builder/models`，调用 [api_client.py](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/portrait_builder/api_client.py#L252-L265) 中的 `discover_models` 函数，再向远端模型提供商的 `/models` 端点发送 GET 请求以获取该 API Key 权限下的可用模型列表。
2. **预检测试 (Preflight & Test)**：外部接口 `/api/builder/configs/preflight` 校验配置是否启用。`/api/builder/configs/test` 向远端发送一条超轻量测试 Prompt (`测试，请直接回复1`)。
3. 如果模型处于返回列表外但测试成功，则以 Warning 标记（`/models 接口失败但会话成功`）；如二者皆失败，则报错拦截，阻止无效任务创建。

### 1.3 三阶段 LLM 级联抽取架构
为了避免长文本输入引起的 LLM 幻觉与关键信息遗漏，抽取流程被设计为三个核心物理阶段，详细的 System Prompt 组装由 [pipeline_core.py](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/portrait_builder/pipeline_core.py) 实现：

```
[ 原始简章数据 Ingestion ]
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  阶段 1：原始 JD 切分与基本事实提取 (Field Mapping & Base Facts)  │
│  - Field Mapper (FIELD_RESTORE_REFERENCE) 建立字段映射   │
│  - 抽取 title, companyName, direction, metadata        │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  阶段 2：结构化拆分与对齐 (Structure & Classification)   │
│  - 拆分为 Descriptions, Requirements, Bonus, Notes    │
│  - 句子分类器 (SENTENCE_CLASSIFICATION_REFERENCE)        │
│  - 区分技术要求 (tech)、软性素质 (soft) 与杂讯 (noise)     │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  阶段 3：标签化提取与多维度细化 (Tag Extraction & Scoring)  │
│  - 提取 techStack 叶子节点与 branch 条件分支            │
│  - 提取 devTools 与 techCapabilities (含 type 强校验)    │
│  - 打分 softQuality 与 growthPotential 五维数值         │
└────────────────────────────────────────────────────────┘
         │
         ▼
[ 标准岗位画像 JSON (Normal Profile) ]
```

* **第一阶段：字段映射与基本事实提取 (Field Mapping & Base Facts)**
  * **作用**：解析用户上传的非标字段。利用大模型提取基本事实。
  * **逻辑**：LLM 扮演 `Field Mapper`，解析原始 JSON 的所有 KV 样本，生成映射表：`{"standardKey": ["rawFieldA", "rawFieldB"]}`。
  * **基本信息提取**：基于映射规范化的文本段落，LLM 对齐岗位方向（如前端开发、后端开发、算法工程等 20+ 方向）和岗位类型（`实习`、`校招全职`、`社招全职`）。

* **第二阶段：结构化拆分与分类对齐 (Structure & Classification)**
  * **作用**：将非结构化 JD 切分为事实句数组，进行初步对齐。
  * **逻辑**：LLM 将 JD 精细切割为 `jdSplit` 模块下的 `jobDescriptions`、`jobRequirements`、`bonusPoints` 和 `notes`。
  * **句子分类 (Classifier)**：句子分类器 LLM 对 `jobRequirements` 的每句话进行分类，打上 `tech` (技术栈/能力)、`soft` (团队/协作/表达)、`noise` (地点限制/政策福利等) 三类标签。`noise` 句段自动转移至 notes 数组，清洗非技能杂讯。

* **第三阶段：标签细化与数值打分 (Tag Extraction & Scoring)**
  * **技术抽取**：对于 `tech` 段落，LLM 执行深度提取，输出三类标签：
    * `techStack`：可导入/安装/配置的具体技术，叶子节点保存为 `[name, levelRequired, note]`；条件组使用 `branch` 分支结构：`["branch", groupName, options, levelRequired, sum, note]`。
    * `techCapabilities`：抽象出的开发、架构、场景应用能力。**此项必须输出 `type`（principle/scene/engineering/soft_flag），下游反序列化时若不匹配四大类型之一将被直接丢弃**。
    * `devTools`：协作与工程支撑工具（Git、Jira、Webpack 等）。
  * **软素质打分**：基于 `soft` 句段，打分器 LLM 针对 softQuality (沟通表达, 团队协作, 责任心, 执行力, 职业意识) 和 growthPotential (学习能力, 创新能力, 抗压能力, 迁移能力, 目标清晰度) 各维度评出 1~4 级（1=无/未提及, 2=基本要求, 3=明确要求, 4=核心重点强调）。

### 1.4 记录合并模式 (Record Merging)
当导入的数据包含已有结构化定义时，系统支持不同的合并写回机制（逻辑见 [api_record_merge.py](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/portrait_builder/api_record_merge.py)）：
1. **覆盖式合并 (`merge_structured_extract_results`)**：
   * 技术栈叶子与分支节点以 `name` 和 `groupName` 作为唯一性 Hash 键去重合并。
   * 技术能力以 `skill` + `rawExtractedText` + `type` 作为复合主键进行去重。
   * 工具链以 `skill` + `rawExtractedText` 去重。
   * 素质水平则在原有权值不为空时予以保留，为空时接收 LLM 预测值。
2. **缺口填充式合并 (`merge_structured_missing_only_results`)**：
   * 通过 `source_has_explicit_tech` 检查，如发现源数据中已经存在哪怕一个显式填写的技术栈元素，则**彻底保留旧版技术栈定义，跳过当前整个字段的合并写入**。同理适用于 `techCapabilities`、`devTools` 和素质打分项。

### 1.5 运行状态机管理
为了处理大规模拉批处理时的网络抖动，[api_run_state.py](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/portrait_builder/api_run_state.py) 与 [api_processing.py](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/portrait_builder/api_processing.py#L900-L956) 维护了一套执行状态机：

* **状态流转**：`queued` (排队) -> `running` (运行) -> `completed` / `partial` (部分成功，即有失败记录) / `failed` (致命异常终止) / `paused` (主动挂起)。
* **多并发协程锁**：任务启动时会按模型并发额度 (`BuilderConfig.concurrency`) 创建 `asyncio.Semaphore` 信号量，并配置滑动窗口限频器 `AsyncRequestRateLimiter` 控制并发和 RPM。
* **自动熔断机制**：为每个模型配置统计失败计数。若单一模型配置连续报错超过 `CONFIG_FAILOVER_THRESHOLD = 5` 次，触发熔断器（`circuitOpen = True`）。系统将检测该阶段其他可用模型配置，进行**自动切流避灾 (Config Failover)**；若当前阶段所有模型配置全部熔断，任务会自动强制转为 `paused` (挂起)，状态持久化写入磁盘快照，保障大范围导入时的稳定。
* **主动挂起与继续**：用户触发暂停，工作协程在处理完当前行记录后会卡在 `wait_for_run_resume` 等待事件触发；恢复时重载 checkpoint 进度并重设速率限制器。

### 1.6 归入写回逻辑 (Apply / Write-Back)
当导入批次执行完毕后，可通过 [api_apply_service.py](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/portrait_builder/api_apply_service.py) 异步执行写回操作：
1. **快照备份**：执行数据变动前，系统对现有岗位主库 `dataset/career.json` 执行文件系统级全拷贝快照，记录 `snapshotId` 以备回滚。
2. **关系持久化**：新岗位画像记录注入至 `dataset/career.json`，打上操作戳（`createdAt`, `updatedAt`, `lastRunId`）。
3. **标签同步与向量初始化**：遍历新导入的画像集，导出对应的标签元数据，通过 `import_portraits_into_jobs` 全局触发 `ensure_embeddings` 接口为新增的非标英文标签请求并补充向量数据库索引，自动更新本地配对语义匹配缓存。

---

## 2. 标签对齐治理与归一化 (Tag Governance & Normalization)

由于不同 HR 与面试官在描述同一种技能时措辞各异（如 JS/JavaScript，Vue/Vue.js/Vuejs），为保证精细打分的客观性，系统设计了以语义相似度为核心的标签自动归一治理机制。

### 2.1 标签数据资产同步 (`tag_sync.py`)
整个岗位库标签依赖 [tag_sync.py](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/tag_sync.py) 周期性维护。其主要包含四类资产文件的重建与同步：
* **`tag_master_normalized.json` (主字典)**：汇总当前库内所有已对齐归一的英文标准标签字典。
* **`high_frequency_tags_normalized.json` (高频库)**：针对岗位中出现频率超过设定阈值（`NORMALIZATION_MIN_JOB_COUNT = 10`）的标签进行筛选建库。
* **`job_tag_relations_normalized.jsonl` (关系映射)**：维护每个岗位 ID (jobId) 到其所有具体标签的倒排关联表。
* **`summary_normalized.json` (统计简报)**：记录不同品类标签（`techStack`, `techCapabilities`, `devTools` 等）的统计分布和系统健康度。

### 2.2 语义归一算法与阈值聚类
语义归一由 [normalization_service.py](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/backend_app/normalization_service.py) 和 `tag_sync.py` 驱动，计算过程依赖于相似度卡口。
系统内置了 `NORMALIZE_THRESHOLDS` (归一化阈值限制)：
* **技术栈与开发工具 (TechStack & DevTools)**：设置 **0.90 严格阈值**（非模糊匹配模式）。因为具体语言或工具不可泛化，要求文本的 Embedding 余弦值必须在极高层级对齐才能合并为别名（如 `js` 归一为 `JavaScript`）。
* **技术能力 (TechCapabilities) 及其他素质维度**：设置 **0.84 模糊阈值**。技术能力多为抽象描述（如高并发设计、分布式存储、关系型数据库优化），使用 0.84 可以更宽泛地将语义相似的能力段（如“高并发数据库调优”与“大数据吞吐量优化”）归集，提供合理的能力平移和迁移可能。

### 2.3 自动化中文翻译缓存机制
标签主键统一使用标准英文标签以方便向量对齐，因此前台显示及学生浏览时必须有高水准的汉化名称。
* **对齐版本校验**：`tag_translation_cache.json` 中使用以 SHA-1 算法计算的 Key：
  
  $$\text{Key} = \text{SHA1}(\text{JSON}(\text{version} = \text{"tag\_zh\_translation\_v1"}, \text{tagType}, \text{normalizedTag}))$$

* **批量合并翻译**：系统自动轮询无中文译名的英文标签。以 `TAG_TRANSLATION_BATCH_SIZE = 500` 条为单位组成批次送给 LLM 执行翻译。翻译生成后直接回写至本地 JSON 缓存。重构标签资产时，`apply_tag_translation_cache_to_tag_asset_files` 将直接检索此翻译映射，更新主库与高频库中所有对应标签的 `canonicalNameZh` 与 `tagNameZh` 字段，杜绝重复向 LLM 发起翻译请求。

### 2.4 标签审核/审计机制 (Tag Review/Audit)
为了确保系统的灵活性，当自动归一化的合并决策产生争议时，可以通过管理后台进入标签审计流，逻辑维护在 [tag_review_runtime.py](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/backend_app/tag_review_runtime.py) 中：
1. **任务控制**：开启审计时，审计服务扫描系统内待治理非标标签，生成运行 ID (`tag_review_YYYYMMDD_...`)，创建控制结构：
   ```python
   # tag_review_runtime.py L166-203
   async def maybe_pause(current_next_index: int) -> bool: ...
   ```
2. **运行时动作 (Action Machine)**：
   * **`pause` (暂停)**：用户可在管理控制台触发暂停。在处理当前候选词完毕后，工作协程调用 `save_run_checkpoint` 写入下一候选词位置 (`nextIndex`)、已确认结果、决策汇总表等状态信息，接着更新任务为 `paused`，挂起协程。
   * **`resume` (恢复)**：管理员更正配置或大模型异常恢复后，可重新触发继续。系统读取 checkpoint 反序列化进度，并以 `resume=True` 重建 worker。
   * **`restart` (重启)**：允许废弃当前审计进度，重置所有中间决策，从第一个标签起重试 LLM 推荐操作。
3. **最终决定写入**：审计中大模型和人工审核确认的动作有四类：`unchanged` (保持非标现状)、`replace` (对齐为标准词)、`split` (一拆多)、`delete` (废除当前标签)。执行 Commit 写回时，`apply_review_decisions` 将以全局排他写锁（`IMPORT_LOCK`）对岗位主数据库 `dataset/career.json` 执行原位遍历替换，并将变动的具体决策项存盘至 `review_stats` 归一统计中心，通知内存更新。

---

## 3. 确定性人岗匹配算法 (Deterministic Matching Engine)

整个系统的终筛排序完全摒弃了不可控制的黑盒 LLM 文本对齐，改用精确可解释的数学匹配打分模型。匹配算法的执行中心为 [matching_service.py](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/backend_app/matching_service.py)。

### 3.1 核心匹配度打分公式
匹配度评判依据由两大部分组成：**技术匹配** ($Score_{\text{tech}}$) 与 **软性素质匹配** ($Score_{\text{quality}}$)。系统内置两类打分策略权重：
* **系统默认权重（90% 技术权重 / 10% 素质权重）**
* **标准多维权重（80% 技术权重 / 20% 素质权重）**

下面以标准 80-20 权重方案为例，整体公式如下：

$$Score_{\text{overall}} = 0.80 \times Score_{\text{tech}} + 0.20 \times Score_{\text{quality}}$$

#### 1) 技术评分公式 ($Score_{\text{tech}}$)
技术评分基于岗位技术要求的三个层次进行细分，各个子项采用 **7:9:4** 的固定权重进行加权平均：

$$Score_{\text{tech}} = \frac{7 \times Score_{\text{tech\_stack}} + 9 \times Score_{\text{tech\_capability}} + 4 \times Score_{\text{dev\_tool}}}{20}$$

每个子项的得分计算公式为：

$$Score_{\text{subcategory}} = \frac{1}{|T_{\text{required}}|} \sum_{i \in T_{\text{required}}} \left( \text{Sim}(i, j) \times \text{Mod}(\Delta L_i) \times W_{f}(i) \right) \times 100$$

其中：
* $i$ 为岗位要求的某个具体标签。
* $j$ 为学生最接近该要求的对应已具备标签。
* $\text{Sim}(i, j)$ 为两者的 Embedding 余弦值相似度（不达准入相似度阈值的计为 $0.0$）。
* $\text{Mod}(\Delta L_i)$ 为技术水平（等级）差异系数。
* $W_{f}(i)$ 为低频标签调节权重系数。

#### 2) 素质评分公式 ($Score_{\text{quality}}$)
软性素质评分基于软性指标与成长潜力的五维打分，权重为 **1:1** 平权加权：

$$Score_{\text{quality}} = \frac{Score_{\text{soft}} + Score_{\text{growth}}}{2}$$

由于素质指标为确定性五维模型，所以不加低频降权调节，仅评估相似匹配与等级要求水平。

### 3.2 等级差调节因子 (Level Delta Modifier)
岗位画像中每个技能要求的最低级别为 $Level_{\text{job}}$ (1~4)，学生画像中对应持有等级为 $Level_{\text{student}}$ (1~4)。等级差为：

$$\Delta L = Level_{\text{student}} - Level_{\text{job}}$$

为鼓励学生技能优势，同时不过于严苛折损，调节器 [matching_service.py:L71-80](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/backend_app/matching_service.py#L71-L80) 依据下述折损阶梯实施扣减：

$$\text{Mod}(\Delta L) = \begin{cases} 
1.0 & \text{if } \Delta L \ge 0 \quad (\text{完全达标或超越}) \\
0.75 & \text{if } \Delta L = -1 \quad (\text{基本达标/略低一级}) \\
0.20 & \text{if } \Delta L = -2 \quad (\text{相差较远/略低两级}) \\
0.0 & \text{if } \Delta L \le -3 \quad (\text{完全不符}) 
\end{cases}$$

> [!NOTE]
> 如果岗位要求的某个标签未标注具体等级，或者学生的最优相似标签未包含等级，则系统默认该等级调节因子 $\text{Mod}(\Delta L) = 1.0$。

### 3.3 覆盖率有效分母上限 (Coverage Denominator Caps)
为防止岗位画像中标签数量极多而稀释了核心技能权重，或者少量缺失拉低整体覆盖率，系统在覆盖率计算中引入了针对不同类别标签的分母封顶上限限制 `COVERAGE_DENOMINATOR_CAPS`：
* **技术栈 (techStack)**：最大有效分母封顶为 **10**。
* **技术能力 (techCapabilities)**：最大有效分母封顶为 **8**。
* **开发工具 (devTools)**：最大有效分母封顶为 **3**。

对于各个分类，有效分母与有效分子分别进行封顶处理。设某技术分类的实际总要求标签数为 $N_{\text{total}}$，被判定为匹配成功（分为精确匹配 Standard 与相似匹配 Similar）的标签数为 $N_{\text{hit}}$，封顶上限为 $Cap$。则计算覆盖率时的折算比值为：

$$Ratio_{\text{capped}} = \frac{\min(N_{\text{hit}}, Cap)}{\min(N_{\text{total}}, Cap)}$$

此机制在大范围匹配召回时具有保护作用，有效防止了由于冷门工具缺失引起的总分大幅抖动。

### 3.4 低频标签惩罚公式 (Low Frequency Penalty)
为了防止画像抽取出的非标准化“噪音标签”（如拼写错误的临时非标标签或过窄的业务标签）因在库中总数小而在计算均分时占据同等权重，匹配引擎引入了低频惩罚项。
系统将库中标签出现频率 $f$ 与阈值 `LOW_FREQUENCY_TAG_THRESHOLD = 10` 进行比对：

$$W_{f}(f) = \begin{cases} 
1.0 & \text{if } f \ge 10 \\
0.3 + 0.7 \times \left( \frac{f}{10} \right) & \text{if } f < 10 
\end{cases}$$

由公式可知，极低频的非标标签在得分计算中相似度得分最大会被折扣至 **0.3**，从而极大地弱化了杂乱标签对系统排名的干扰，引导岗位画像和学生画像向高频、标准的标签治理体系靠拢。

### 3.5 大模型评估报告生成约束
打分引擎不仅输出具体匹配分数，同时支持向学生提供由大模型润色的匹配定性报告和面试建议。当前实现中，`POST /api/match` 主要返回推荐 lanes 和确定性打分结果；深度报告由 `POST /api/match/insight` 或 harvest 流程生成。为了杜绝大模型过度发挥或胡乱推测，深度复核报告接口 [run_match_insight](file:///D:/1/CS&AI/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/ALL/job_system%20-%20%E4%BA%A4%E4%BB%98%E7%89%88%E6%9C%AC/job-admin/backend/backend_app/matching_service.py#L2635-L2729) 执行了严格的边界限制：
1. **核心技术优先原则**：报告必须首要列出技术匹配的具体证据，面试建议必须基于 STAR 原则，围绕打分计算出的真实缺口提供（技术栈缺失或等级差偏低）。
2. **严禁捏造分数与星级**：系统会将确定性打分划分后的星级（$\ge 85$ 分计为 3 星；$65 \sim 84$ 计为 2 星；$<65$ 计为 1 星）做静态序列化传入 LLM。大模型**仅被允许对其做文字性成因解释，严禁修改星级和捏造、二次计算匹配分数**。
3. **等级缺口显式呼出**：在学历最低标准（如要求硕士，学生为本科）或毕业时间范围出现硬不符，或者核心等级差达到严重等级缺口时，LLM **必须在 `tenure_growth` (入职成长路径) 或建议中以最前序的醒目语句对不符条件进行红色警示和显式指出**，保证报告的客观度和诚实度。

---

## 4. 当前外部接口入口速查

核心流程对应的外部 HTTP 入口如下，完整字段契约见 [04_api_reference.md](file:///D:/1/CS&AI/个人项目/ALL/job_system - 交付版本/docs/wiki/04_api_reference.md)。

| 流程 | 外部接口 |
| --- | --- |
| Builder 上传 | `POST /api/builder/uploads` |
| Builder 模型发现/测试 | `POST /api/builder/models`, `POST /api/builder/configs/preflight`, `POST /api/builder/configs/test` |
| Builder run 控制 | `POST /api/builder/runs`, `GET /api/builder/runs`, `GET /api/builder/runs/{run_id}`, `pause/resume/retry/apply/revoke/delete` |
| 标签归一任务 | `GET/POST /api/admin/normalization/runs` |
| 标签复查任务 | `GET/POST /api/admin/normalization/tag-review/runs`, `pause/resume/restart` |
| 推荐匹配 | `POST /api/match` |
| 单岗位准入核查 | `POST /api/match/check` |
| 篮子深度收割 | `POST /api/match/harvest` |
| 深度报告 | `POST /api/match/insight` |
| 实习补缺推荐 | `POST /api/match/internship-recommendations` |
