# 如何快速启动岗位后台

## 1. 推荐启动方式

在仓库根目录运行全盘启动器：

```powershell
python .\start_all.py
```

只检查目录和端口，不启动服务：

```powershell
python .\start_all.py --check
```

默认会启动：

- 学生端 React：`http://localhost:3000`
- 学生端 FastAPI：`http://localhost:8001`
- 岗位后台 FastAPI：`http://localhost:8000`
- 岗位后台 React：`http://localhost:5173`

## 2. 只启动岗位后台后端

在仓库根目录运行：

```powershell
python .\job-admin\backend\app.py
```

或者进入岗位后台后端目录运行：

```powershell
cd job-admin\backend
python .\app.py
```

后端默认监听 `127.0.0.1:8000`。

## 3. 启动后能打开什么

启动成功后，通常可以访问：

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/redoc`

其中：

- `/` 是岗位后台静态前端入口
- `/docs` 是 FastAPI Swagger UI
- `/redoc` 是 FastAPI ReDoc

## 4. 启动前会自动做什么

岗位后台启动时会：

- 自动加载仓库根目录 `.env`
- 初始化岗位库文件
- 初始化 tag 资产
- 加载可用 embedding profile
- 启动后台 tag snapshot scheduler

这些逻辑分别散在：

- [project_paths.py](../job-admin/backend/project_paths.py)
- [backend_app/job_data_service.py](../job-admin/backend/backend_app/job_data_service.py)
- [backend_app/app_factory.py](../job-admin/backend/backend_app/app_factory.py)

## 5. 常见依赖

你至少需要确保：

- Python 环境可用
- `dataset/career.json` 存在或能从旧文件 fallback 出来
- 根目录 `.env` 已填好 LLM / embedding key

## 6. 常见问题

### 6.1 启动后接口 500

通常先看：

- `.env` 里的 API key 是否正确
- `baseUrl` 是否能访问
- 模型名是否能在对应服务里查到

### 6.2 启动后前端打不开

确认访问的是：

- 岗位后台 React 开发服务：`http://localhost:5173`
- 或岗位后台 FastAPI 静态入口：`http://127.0.0.1:8000/`

不要直接打开文件系统里的 `index.html`。

### 6.3 岗位库看起来是旧的

检查：

- `dataset/career.json`
- `JOB_SYSTEM_JOB_LIBRARY_PATH`
- `dataset/runtime_data/` 是否被历史数据覆盖

## 7. 推荐的日常操作顺序

1. 配好 `.env`
2. 运行 `python .\start_all.py --check`
3. 启动全盘服务
4. 打开 `http://localhost:5173`
5. 检查 `/api/admin/summary`
6. 再跑 builder 或匹配流程

## 8. 开发调试

岗位后台源码已迁入 `job-admin/`：

- 后端：`job-admin/backend/`
- 前端：`job-admin/frontend/`

仓库根目录的数据资产已迁移到 `dataset/`，`project_paths.py` 会从 `job-admin/backend` 解析 `.env`，并把岗位库、Tag Center、Domain Center、运行日志和临时状态统一落到 `dataset/`。


