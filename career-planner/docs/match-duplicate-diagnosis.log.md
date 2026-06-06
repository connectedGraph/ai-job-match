# Match Duplicate Diagnosis Log

- Generated at: 2026-04-18 10:10 CST
- Workspace: `C:\Users\18086\Desktop\job_system`
- Source data: `C:\Users\18086\Desktop\job_system - 副本 (2)\dataset\career.json`
- Career planner proxy: `career-planner/backend/app.py` -> `http://127.0.0.1:8000`
- Match engine: `job-admin/backend/backend_app/matching_service.py`

## 结论

这次看到的“像重复”的岗位，不是 career-planner 前端重新生成时没有清空旧结果，也不是 proxy 打到了另一个后端。

`career-planner` 的 `/api/match` 会代理到 `job-admin` 的 `http://127.0.0.1:8000/api/match`。前端在 `performMatch()` 里会用本次返回的 fresh `jobsById` 和 fresh `lanes` 覆盖匹配结果，不会把旧 lanes 追加进去。

真正的问题是：岗位库里存在大量“标题、公司、方向相同，但 JD 要求不同”的岗位。它们看起来像重复卡片，但只要 `job.id` 不同，就应该按不同岗位保留，学生需要回看具体要求差异。

## 重要修正

之前尝试过按 `title + companyName + direction` 做业务合并，这个规则太粗，会误伤你指出的场景。现在已经撤掉这种相似合并。

当前规则：

- `job.id` 是正统身份。
- 不同 `job.id` 一律保留，即使标题、公司、方向、分数很像。
- 只在同一个 `job.id` 被重复返回时去重。
- 如果极少数数据没有 `job.id`，才退回到内容签名兜底。

## 用户样本复核

以下 ID 都按 canonical `job.id` 分开保留，不再因为公司/标题/方向相同而合并。

| job.id | 标题 | 公司 | 方向 | 薪资 | 要求摘要 |
|---|---|---|---|---|---|
| `JOB_run_20260404_155856_70ca0639_00241` | Java | 外企德科数字技术有限公司 | 增长运营 / 数据运营（偏技术侧） | `[18667, 37333]` | 熟练掌握 Java/Python；掌握数据结构；了解软件工程/敏捷开发 |
| `JOB_run_20260404_155856_70ca0639_00384` | Java | 外企德科数字技术有限公司 | Web开发 | `[17500, 35000]` | 扎实编程能力；熟悉算法和数据结构；熟悉计算机基础理论；熟练使用 JAVA |
| `JOB_run_20260404_155856_70ca0639_00514` | Java | 外企德科数字技术有限公司 | Web开发 | `[17500, 35000]` | 扎实编程能力；熟悉算法和数据结构；熟悉计算机基础理论；熟练使用 Java |
| `JOB_run_20260404_155856_70ca0639_02496` | Java | 外企德科数字技术有限公司 | Web开发 | `[19833, 35000]` | 与 Web 开发组相似，但技能栈额外包含 JavaScript/C/C++ 等要求 |
| `JOB_run_20260404_155856_70ca0639_00453` | Java | 外企德科数字技术有限公司 | 增长运营 / 数据运营（偏技术侧） | `[16333, 32667]` | 扎实编程能力；熟悉算法和数据结构；熟悉计算机基础理论；熟练使用 java/c/c++/python/js |
| `JOB_run_20260404_155856_70ca0639_02495` | Java | 外企德科数字技术有限公司 | 增长运营 / 数据运营（偏技术侧） | `[16333, 32667]` | 在相似基础上包含 Spring 生态开源框架等不同要求 |

## 代码路径证据

- 前端重新生成：`career-planner/frontend/src/context/DataContext.jsx` 的 `performMatch()` 调 `POST /api/match`，然后保存本次 `normalizeMatchJobs()` 生成的新 `jobsById` 与 `lanes`。
- 前端 ID 归一：`career-planner/frontend/src/services/matchWorkspace.js` 使用后端返回的 `job.id` 作为 stable ID。
- proxy 路径：`career-planner/backend/app.py` 的 `proxy_match_engine()` 转发到 `http://127.0.0.1:8000{path}`。
- job-admin 匹配入口：`job-admin/backend/backend_app/matching_routes/run.py` -> `run_match()`。
- job-admin 匹配逻辑：`job-admin/backend/backend_app/matching_service.py`。

## 验证记录

- `python -m py_compile job-admin\backend\backend_app\matching_service.py`：通过。
- 用用户样本 ID 直接计算 duplicate key：6 个 ID 全部各自成组。
- 重启 job-admin 8000 服务：当前监听 PID `8604`，启动完成。
- 真实调用 `POST http://127.0.0.1:8000/api/match`：返回可见岗位 50 条，`exact_duplicate_ids = {}`，`dedupe_meta_groups = []`。
- 真实调用结果里，上方 6 个样本 `job.id` 全部仍作为独立岗位出现。

## 后续建议

如果产品上仍想合并“不同 ID 但完全同一份发布”的岗位，不能再用标题/公司/方向合并。需要上游生成一个明确的 `postingFingerprint` 或 `jdHash`，基于完整 JD 原文/要求/薪资/地点/公司做可解释合并，并在 UI 上允许展开“同源岗位”。在这个字段出来之前，前端和后端都应该尊重 `job.id`。
