# 后端模块用途说明

这份文档只讲“每个后端模块是干什么的”，不深入讲系统如何运作。

## 1. `backend_app/app_factory.py`

职责：

- 组装 FastAPI 应用
- 挂载所有 router
- 加 CORS
- 注册启动和关闭钩子
- 把前端静态文件挂到 `/`

## 2. `backend_app/config.py`

职责：

- 定义运行时路径
- 提供日志配置
- 暴露岗位库文件路径、tag 路径、builder 路径
- 暴露固定维度和后端通用配置

## 3. `project_paths.py`

职责：

- 定义仓库根目录和各类子目录
- 自动加载根目录 `.env`
- 决定岗位库、runtime 数据、docs、tools 的标准路径
- 处理岗位库文件的 materialize / fallback

## 4. `job_profile_schema.py`

职责：

- 定义标准岗位画像 schema
- 负责岗位画像归一
- 处理字段清洗、数组去重、默认值补齐
- 定义 `techStack` / `techCapabilities` / `devTools` / 固定维度的归一规则

## 5. `backend_app/job_data_service.py`

职责：

- 读取和保存岗位库
- 构建岗位列表和筛选结果
- 统计方向、行业、标签频次
- 维护运行时内存状态
- 做岗位 CRUD
- 刷新 tag 资产和 embedding 缓存

## 6. `backend_app/matching_service.py`

职责：

- 读取岗位库和向量缓存
- 把学生画像解析成可匹配标签
- 计算岗位评分、tier 和解释信息
- 输出 `POST /api/match` 和 `POST /api/debug/score`

## 7. `backend_app/admin_routes.py`

职责：

- 提供后台管理接口
- 查询岗位总览、标签、频次
- 手动触发标签归一
- 提供岗位 CRUD

## 8. `backend_app/normalization_service.py`

职责：

- 启动全量归一 run
- 记录归一 progress / result / logs
- 管理 embedding cache 状态
- 提供归一任务快照和列表

## 9. `backend_app/tag_review_service.py`

职责：

- 收集 tag review 候选集
- 管理复查 run 的 manifest / progress / result / logs
- 保存 review stats 和 checkpoint
- 提供复查快照和列表

## 10. `backend_app/tag_review_runtime.py`

职责：

- 真正执行 tag review 任务
- 调用 LLM 审核每个候选 tag
- 支持暂停、恢复、重启
- 在结束时回写岗位库和 tag 资产

## 11. `backend_app/model_config.py`

职责：

- 读取文本模型配置
- 读取统一 embedding 配置
- 维护模型主机、模型名、key、限速、并发等配置
- 区分旗舰 LLM、快速 LLM、向量模型三类任务配置

## 12. `tag_sync.py`

职责：

- 重建 tag 资产
- 写 `tag_master`、`job_tag_relation`、`high_frequency_tags`
- 管理 embedding cache
- 处理全量归一后的同步动作

## 13. `portrait_builder/`

这整个目录是 pipe / builder 的实现。

核心职责：

- 接收上传文件
- 生成 run
- 逐条处理记录
- 调用多个 LLM 阶段
- 生成画像
- 可选 apply 回岗位库

常见文件：

- `api_routes_uploads.py`
- `api_routes_runs.py`
- `api_processing.py`
- `api_run_service.py`
- `api_run_metadata.py`
- `api_storage.py`
- `pipeline_core.py`

## 14. `backend_app/runtime_state.py`

职责：

- 保存运行时内存态
- 缓存岗位库、标签频次、向量缓存
- 给匹配和管理页面提供统一状态

## 15. 这些模块之间的关系

可以把它理解成三层：

1. 数据层
   - `job_profile_schema.py`
   - `tag_sync.py`
   - `project_paths.py`
2. 服务层
   - `job_data_service.py`
   - `matching_service.py`
   - `normalization_service.py`
   - `tag_review_service.py`
3. API / 编排层
   - `app_factory.py`
   - `admin_routes.py`
   - `job_routes.py`
   - `match_routes.py`
   - `normalization_routes.py`
   - `portrait_builder/`

如果只记一句话：

- `job_profile_schema.py` 定格式
- `portrait_builder/` 负责抽画像
- `tag_sync.py` 负责把 tag 资产落盘
- `matching_service.py` 负责推荐
- `normalization_service.py` 和 `tag_review_service.py` 负责数据治理


