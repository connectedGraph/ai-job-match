# Matching 路由拆分说明

## 背景

`backend_app/match_routes.py` 原先同时承载岗位召回、LLM 准入核查、洞察解释和 debug score 四类入口。随着 `matching_service.py` 与 `match_check_service.py` 变长，继续把所有接口放在一个 route 文件里会导致维护边界不清，后续新增接口也容易堆到同一个文件。

本次拆分只调整路由组织方式，不改变任何现有 API 路径、请求体、响应体或业务逻辑。

## 入口关系

FastAPI 应用入口仍然在 `backend_app/app_factory.py` 中 include `match_routes.router`。为了兼容旧导入路径，`backend_app/match_routes.py` 现在只作为聚合导出层。

调用链如下：

```text
backend_app/app_factory.py
  -> backend_app/match_routes.py
    -> backend_app/matching_routes/__init__.py
      -> backend_app/matching_routes/run.py
      -> backend_app/matching_routes/check.py
      -> backend_app/matching_routes/insight.py
      -> backend_app/matching_routes/debug.py
```

## 路由文件职责

| 文件 | API | 业务函数 | 职责 |
| --- | --- | --- | --- |
| `backend_app/matching_routes/run.py` | `POST /api/match` | `run_match` | 岗位召回与三梯度推荐入口 |
| `backend_app/matching_routes/check.py` | `POST /api/match/check` | `run_match_check` | 岗位准入核查入口，包含专业、证书、经历的 LLM 复核 |
| `backend_app/matching_routes/insight.py` | `POST /api/match/insight` | `run_match_insight` | 匹配洞察与解释入口 |
| `backend_app/matching_routes/debug.py` | `POST /api/debug/score` | `run_debug_score` | 后台调试评分入口 |
| `backend_app/matching_routes/__init__.py` | 无直接 API | 无 | include 所有 matching 子路由 |
| `backend_app/match_routes.py` | 无直接 API | 无 | 兼容旧导入路径，只导出聚合后的 `router` |

## 服务层边界

当前拆分没有移动业务代码。

`backend_app/matching_service.py` 仍然负责：

- 学生画像解析
- 岗位画像解析
- tag 命中与打分
- 薪资排序
- lane 构建
- match insight
- debug score

`backend_app/match_check_service.py` 仍然负责：

- 学历和毕业年限规则核查
- 专业、证书、经历要求整理
- 学生 evidence 构建
- LLM 准入核查 prompt
- LLM 输出归一化
- check 结果聚合

后续如果继续拆服务层，优先把 `matching_service.py` 拆为 `profile_parser.py`、`scoring.py`、`lane_builder.py`、`insight_service.py`、`debug_score_service.py`。这一步应单独提交，避免把路由拆分和算法拆分混在一起。

## 新增 Matching API 的规则

新增 matching 相关接口时，不要再把 handler 写回 `match_routes.py`。

推荐规则：

- 新接口属于召回、分层、推荐结果刷新：放到 `matching_routes/run.py`
- 新接口属于准入核查、LLM check、证据解释：放到 `matching_routes/check.py`
- 新接口属于报告解释、洞察、分析总结：放到 `matching_routes/insight.py`
- 新接口只服务后台调试或内部验证：放到 `matching_routes/debug.py`
- 如果出现新的稳定业务域，新增一个子路由文件，并在 `matching_routes/__init__.py` include

route handler 应尽量保持薄层，只做三件事：

- 声明 API path 与 request schema
- 调用 service 层业务函数
- 返回 service 层结果

不要在 route handler 中直接写评分、筛选、LLM prompt、数据库读写等业务逻辑。

## 兼容性要求

以下接口路径必须保持不变，因为 `career-planner/backend/app.py` 和前端联调已经依赖这些路径：

```text
POST /api/match
POST /api/match/check
POST /api/match/insight
POST /api/debug/score
```

`career-planner` 学生端当前代理关系：

```text
career-planner/frontend
  -> career-planner/backend/app.py
    -> http://127.0.0.1:8000/api/match
    -> http://127.0.0.1:8000/api/match/check
```

因此，拆分 route 文件时只能改变 Python 文件组织，不应改变 URL。

## 验证命令

修改 matching 路由后，至少运行：

```powershell
& 'C:\Users\18086\AppData\Local\Programs\Python\Python311\python.exe' -m py_compile `
  job-admin\backend\backend_app\match_routes.py `
  job-admin\backend\backend_app\matching_routes\__init__.py `
  job-admin\backend\backend_app\matching_routes\run.py `
  job-admin\backend\backend_app\matching_routes\check.py `
  job-admin\backend\backend_app\matching_routes\insight.py `
  job-admin\backend\backend_app\matching_routes\debug.py
```

确认路由仍然注册：

```powershell
& 'C:\Users\18086\AppData\Local\Programs\Python\Python311\python.exe' -c "import sys, pathlib; sys.path.insert(0, str(pathlib.Path.cwd() / 'job-admin' / 'backend')); from backend_app.match_routes import router; print('\n'.join(sorted(f'{route.path} {sorted(route.methods)}' for route in router.routes)))"
```

期望输出：

```text
/api/debug/score ['POST']
/api/match ['POST']
/api/match/check ['POST']
/api/match/insight ['POST']
```

## 当前拆分状态

本次已完成：

- `match_routes.py` 收敛为兼容导出层
- 新增 `matching_routes` 子路由目录
- 四个现有接口按职责拆到独立文件
- API 路径保持不变
- Python 语法检查通过
- 路由注册列表验证通过

未在本次处理：

- `matching_service.py` 服务层拆分
- `match_check_service.py` 服务层拆分
- 请求/响应 schema 重命名
- 前端调用路径调整
