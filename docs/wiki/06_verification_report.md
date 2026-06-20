# 06 验证报告

生成时间：2026-06-07  
验证范围：根据 `docs/wiki` 与 `docs/code-review` 先做一轮小范围 smoke test，覆盖核心依赖、Job Admin 核心 API、Career Planner 核心 API、关键纯函数。  
约束：初始验证不修改业务代码；用户确认后仅修复 Job Admin 导入期语法 bug；不调用真实外部 LLM；下载 Python 依赖时使用 `http://127.0.0.1:7890` 代理。

## 1. 测试计划

| 阶段 | 测试项 | 预期 |
| --- | --- | --- |
| 环境检查 | 根 `requirements.txt`、两端 `package.json`、`.env.example`、Python/Node 基本可用性 | 依赖清单存在；Node 可用；可使用 Python 环境导入核心库 |
| Job Admin API | `/api/health`、`/api/metadata`、`/api/jobs?limit=1`、`/api/admin/summary`、`/api/admin/tags?limit=3`、`/api/careers/directions`、最小 `/api/match` | FastAPI app 可创建；接口返回 2xx 或文档声明的可解释错误 |
| Career Planner API | `/api/health`、注册、登录、`/api/auth/me`、`GET/PUT /api/user-data`、`GET/PUT /api/match/workspace` | TestClient 下完成认证闭环和用户数据/匹配工作区读写 |
| 核心函数 | `normalize_job_profile()`、`calc_raw_completeness_scores()`、`build_completeness_result()`、密码/token、`parse_llm_json()` | 使用最小样例返回结构化结果，不触发外部服务 |

## 2. 执行方式

| 类型 | 命令或脚本 |
| --- | --- |
| PowerShell UTF-8 前缀 | `$OutputEncoding=[System.Text.Encoding]::UTF8; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; [Console]::InputEncoding=[System.Text.Encoding]::UTF8;` |
| Python 环境 | `C:\Users\18086\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe` |
| 临时依赖安装 | `python -m pip install --proxy http://127.0.0.1:7890 --target C:\tmp\job_system_pydeps -r requirements.txt` |
| Smoke 脚本 | `C:\tmp\job_system_smoke.py` |
| 结果 JSON | `C:\tmp\job_system_smoke_results.json` |
| 修复后严格 Job Admin 断言 | PowerShell 内联 base64 Python 脚本，未落仓库文件 |

脚本路径中加入了：

- `C:\tmp\job_system_pydeps`
- 项目根目录
- `job-admin/backend`
- `career-planner`

脚本设置了以下环境变量来避免真实外部 LLM/embedding 调用：

- `CAREER_PLANNER_JWT_SECRET=smoke-test-secret`
- `CAREER_PLANNER_API_ONLY=true`
- `JOB_SYSTEM_FLAGSHIP_LLM_BASE_URL=`
- `JOB_SYSTEM_FLAGSHIP_LLM_API_KEY=`
- `JOB_SYSTEM_FAST_LLM_BASE_URL=`
- `JOB_SYSTEM_FAST_LLM_API_KEY=`
- `JOB_SYSTEM_EMBEDDING_API_KEY=`
- `JOB_SYSTEM_EMBEDDING_BASE_URL=`

## 3. 环境检查结果

| 测试项 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- |
| `requirements.txt` | 根目录存在 | 存在，397 bytes | 通过 |
| `.env.example` | 根目录存在 | 存在，4437 bytes | 通过 |
| Job Admin `package.json` | `job-admin/frontend/package.json` 存在，含 `dev/build/lint/preview` | 存在，脚本齐全 | 通过 |
| Career Planner `package.json` | `career-planner/frontend/package.json` 存在，含 `dev/build/lint/preview` | 存在，脚本齐全 | 通过 |
| Node | 可运行 | `node v24.9.0`，`npm 11.6.0` | 通过 |
| Python | 可运行并可装依赖 | 系统 `python/py` 不可用，改用 Codex bundled Python 3.12.13；临时安装依赖后可运行 | 通过 |
| `fastapi` | 可导入 | `0.136.3` | 通过 |
| `httpx` | 可导入 | `0.28.1` | 通过 |
| `pydantic` | 可导入 | `2.13.4` | 通过 |
| `numpy` | 可导入 | `2.4.6` | 通过 |
| `pandas` | 可导入 | `3.0.3` | 通过 |
| `sklearn` | 可导入 | `1.9.0` | 通过 |

## 4. 核心函数验证结果

| 测试项 | 文档/预期 | 实际 | 结论 |
| --- | --- | --- | --- |
| `job_profile_schema.normalize_job_profile()` | 岗位画像写入/读取前统一归一化；薪资、岗位类型、学历、技术栈 branch、重复标签应被规范处理 | 样例中 `实习生` 归一为 `实习`；薪资对象归一为 `[10000.0, 20000.0]`；重复 `Python` 去重；branch 保留；`推荐算法` 保留规范标签 | 通过 |
| `career-planner/backend/evaluation.py` `calc_raw_completeness_scores()` | 根据学生画像返回各维度完整度 | 返回 `basicInfo=80`、`summary=0`、`skills=33`、`experiences=25`、`evidence=0`、`direction=0` | 通过 |
| `build_completeness_result()` | 合并原始完整度与 AI/规则结果，返回总分和维度建议 | 返回键包括 `dimensions`、`topSuggestion`、`totalScore`，总分 `25` | 通过 |
| `career-planner/backend/security.py` hash/verify | 密码哈希可验证；错误密码失败 | 正确密码 `true`，错误密码 `false` | 通过 |
| `career-planner/backend/security.py` token create/decode | token 可解出用户信息 | 解出 `sub=123`、`username=smoke-user` | 通过 |
| `shared/llm_resilience.py` `parse_llm_json()` | 从普通文本或 markdown fenced block 中提取 JSON object/array | 成功解析 `{"ok": true, "n": 1}` 和 `[{"a": 1}]` | 通过 |

## 5. Career Planner API 验证结果

| 接口 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- |
| `GET /api/health` | 返回 `{status, service}` | `200`，`{"status":"ok","service":"zhitu-star-student-backend"}` | 通过 |
| `POST /api/auth/register` | 注册临时用户，返回 `{token, user}` | `200`，返回 `token`、`user` | 通过 |
| `POST /api/auth/login` | 登录临时用户，返回 `{token, user}` | `200`，返回 `token`、`user` | 通过 |
| `GET /api/auth/me` | Bearer token 下返回当前用户 | `200`，返回 `user` | 通过 |
| `GET /api/user-data` | 返回学生画像、AI 结果、更新时间 | `200`，返回 `studentData`、`aiResults`、`updatedAt` | 通过 |
| `PUT /api/user-data` | 保存学生画像和 AI 结果 | `200`，返回 `ok`、`updatedAt` | 通过 |
| `GET /api/student-profile/me` | 返回当前用户聚合画像 | `200`，返回 `ok`、`source`、`studentProfile`、`studentData`、`aiResults`、`updatedAt`、`user` | 通过 |
| `GET /api/match/workspace` | 返回匹配工作区 | `200`，返回 `workspace`、`updatedAt` | 通过 |
| `PUT /api/match/workspace` | 保存匹配工作区 | `200`，返回 `ok`、`updatedAt` | 通过 |
| 再次 `GET /api/match/workspace` | 可读回工作区 | `200`，返回 `workspace`、`updatedAt` | 通过 |

副作用：完整 smoke 运行期间创建了临时 SQLite 用户，已观察到 `smoke_ec3610e96b`、`smoke_3920cb3d3f`；数据库为 `dataset/career_planner/career_planner.sqlite3`。

## 6. Job Admin API 验证结果

### 6.1 初始阻塞与修复

初始 smoke 中，Job Admin app 在导入阶段失败：

```text
from backend_app.app_factory import create_app
  -> portrait_builder_api
  -> portrait_builder.api_routes_runs
  -> backend_app.job_data_service
  -> from tag_sync import ...
  -> tag_sync imports backend_app.model_config
  -> backend_app/model_config.py line 159
NameError: name 'Any' is not defined
```

定位结果：

- `job-admin/backend/backend_app/model_config.py` 第 159 行函数签名使用了 `Any`：`def resolve(role: str, request_config: Any = None) -> Dict[str, Any]:`
- 文件顶部原先为 `from typing import Dict, List, Optional`，没有导入 `Any`。
- 函数体内的 `from typing import Any` 太晚，因为类型注解在模块加载时已经需要求值。

已按用户要求做最小语法修复：

- `job-admin/backend/backend_app/model_config.py` 顶部改为 `from typing import Any, Dict, List, Optional`。
- 移除函数体内重复的 `from typing import Any`。

### 6.2 修复后接口 smoke

| 测试项 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- |
| `backend_app.app_factory.create_app()` | 可以创建 FastAPI app | 成功创建 app，并初始化 runtime：岗位 `5`，标签 `25` | 通过 |
| `GET /api/health` | 返回健康状态 | `200`，字段 `status`、`service` | 通过 |
| `GET /api/metadata` | 返回方向、行业、岗位类型、标签统计等元数据 | `200`，字段 `directions`、`industries`，均为数组 | 通过 |
| `GET /api/jobs?limit=1` | 返回分页岗位列表，最多 1 条 | `200`，字段 `data`、`total`、`page`、`limit`、`hasMore`、`sortBy`，返回条数不超过 1 | 通过 |
| `GET /api/admin/summary` | 返回后台概览 | `200`，含 `jobCount`、`directionCount`、`industryCount`、`tagCount` 等看板字段 | 通过 |
| `GET /api/admin/tags?limit=3` | 返回标签列表和视图信息，最多 3 条 | `200`，含 `data`、`total`、`view`、`availableViews`，返回条数不超过 3 | 通过 |
| `GET /api/careers/directions` | 返回 `{directions}` | `200`，`directions` 为数组 | 通过 |
| `POST /api/match` | 最小学生画像返回匹配结果，缺少 embedding key 时应降级而不是崩溃 | `200`，返回 `lanes`、`has_more`、`totals`、`topJobs`、`analysis`、`structured_report`、`timing`、`meta`；`meta.degradation` 记录 2 条 embedding key 缺失降级 | 通过 |

### 6.3 接口行为备注

- `/api/match` 在未配置 embedding key 时仍返回 `200`，匹配结果正常生成，同时 `meta.degradation` 明确记录“Embedding API key is required for embedding normalization”。这符合“可解释降级”的预期。
- `/api/match` 返回中的 `analysisMeta` 与 `structured_report` 在普通 `run_match()` 路径下为 `null`，代码中也是显式返回 `None`；深度分析字段由 `/api/match/insight` 路径负责。
- `docs/wiki/04_api_reference.md` 的 `/api/match` 示例已修正：`topJobs` 按实际接口和 `bucket_match_results()` 类型注解记录为 `{safety, target, reach}` 对象。

## 7. 子 Agent 进度

本轮已并行派出 3 个子 agent，分别负责 Job Admin API、Career Planner API、纯函数验证。到主线程完成报告时，两次等待均超时，随后已关闭。当前报告以主线程已完成的可复现 smoke 与修复后严格断言为准。

## 8. 未覆盖与后续建议

| 项目 | 原因 | 建议 |
| --- | --- | --- |
| Job Admin 写操作 API | 本轮 smoke 主要覆盖只读接口和最小匹配；未触发岗位 CRUD、标签标准化、导出等写操作 | 下一轮使用隔离数据目录或 checkpoint 后验证 |
| `/api/match/insight` 深度分析 | 需要文本模型配置；本轮明确避免真实外部 LLM 调用 | 可用 mock LLM 或本地假服务验证 `analysisMeta` 的 success/failed/skipped 分支 |
| `/api/match` 文档示例 | 原先 `topJobs` 文档示例写成数组，但实际为三桶对象 | 已更新 `docs/wiki/04_api_reference.md` 示例 |
| 标签归一化、builder runs、导出类接口 | 本轮 smoke 控制范围，且部分接口可能写入较多数据或依赖运行任务 | 下一轮使用隔离数据目录或明确 checkpoint 后做扩展验证 |
| 前端构建/页面交互 | 本轮重点是文档声明的后端函数和接口 | 若需要验证 UI wiki，可追加 `npm run build` 和浏览器 smoke |

## 9. 总结

本轮小范围 smoke 结论：

- Career Planner 后端核心认证、用户数据、学生画像、匹配工作区接口符合文档预期。
- 已测试的纯函数符合文档预期。
- 环境依赖在临时目录安装后可用；Node/NPM 可用。
- Job Admin 初始存在导入级失败；已最小修复 `job-admin/backend/backend_app/model_config.py` 顶部缺少 `Any` 导入后，核心 Job Admin API 与最小 `/api/match` 严格断言均通过。
- `/api/match` 的 `topJobs` 已在 wiki 中按 `{safety, target, reach}` 三桶对象更新。
