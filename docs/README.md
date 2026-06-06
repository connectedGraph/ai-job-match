# 后端文档索引

这套文档按“先理解画像格式，再看 pipe 流，再看归一/复查，最后查配置和接口”的顺序组织。当前岗位后台源码位于 `job-admin/backend/`，学生端源码位于 `career-planner/`。

## 必看顺序

1. [岗位画像 JSON 字段、格式介绍](./backend_01_job_profile_schema.md)
2. [pipe 工作流抽取画像完整过程](./backend_02_pipe_workflow.md)
3. [归一与画像复查完整过程](./backend_03_normalization_and_review.md)
4. [API 配置（LLM / embedding / 限速）与 `.env` 格式](./backend_04_llm_env_config.md)
5. [后端全量接口和返回类型](./backend_05_api_catalog.md)
6. [后端模块用途说明](./backend_06_backend_overview.md)
7. [如何快速启动后端](./backend_07_quick_start.md)

## 相关补充

- 旧版设计说明仍保留在：
  - [runtime_and_id_design.md](./runtime_and_id_design.md)
  - [matching_algorithm.md](./matching_algorithm.md)
  - [student_profile_ai_schema.md](./student_profile_ai_schema.md)

- 说明：
  - 本批 7 份文档是当前岗位后台的最新说明，优先级高于旧版文档
  - 旧版文档只作为历史参考和补充背景
  - 如果旧版内容与本批文档冲突，以本批文档为准

## 代码入口

- 岗位后台后端启动入口: [../job-admin/backend/app.py](../job-admin/backend/app.py)
- 应用工厂: [../job-admin/backend/backend_app/app_factory.py](../job-admin/backend/backend_app/app_factory.py)
- 画像 schema: [../job-admin/backend/job_profile_schema.py](../job-admin/backend/job_profile_schema.py)
- pipe 工作流: [../job-admin/backend/portrait_builder/](../job-admin/backend/portrait_builder/)
- 归一与复查: [../job-admin/backend/backend_app/normalization_service.py](../job-admin/backend/backend_app/normalization_service.py), [../job-admin/backend/backend_app/tag_review_service.py](../job-admin/backend/backend_app/tag_review_service.py)
- API 配置: [../job-admin/backend/backend_app/model_config.py](../job-admin/backend/backend_app/model_config.py), [../job-admin/backend/project_paths.py](../job-admin/backend/project_paths.py)
- Tag 同步: [../job-admin/backend/tag_sync.py](../job-admin/backend/tag_sync.py)


