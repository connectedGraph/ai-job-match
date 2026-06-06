# 职途星

本目录是学生端应用，保持 React/Vite 前端与 FastAPI 后端解耦。学生端负责登录注册、学生画像持久化、简历解析、AI 画像完整度分析、技能核查、技能等级推断、职业素养和发展潜力评估。

## 快速启动

在 `career-planner/` 目录下运行：

```powershell
python .\start.py
```

默认端口：

- 前端 React/Vite：`http://localhost:3000`
- 后端 FastAPI：`http://127.0.0.1:8001`

`python start.py` 会启动 Vite 热更新服务。前端请求 `/api/*` 时，由 Vite 代理到 `8001` 端口的 FastAPI 后端。

如需从仓库根目录启动全盘服务，使用：

```powershell
python .\start_all.py
```

## 架构

- `frontend/`：React 19 + Vite + Tailwind CSS + Lucide Icons。
- `backend/`：FastAPI + SQLite3。
- `data/`：学生端本地 SQLite 数据库。
- `raw/`：迁移前的旧版 HTML/JS 备份。

开发模式下前端运行在 `3000`，API 运行在 `8001`。生产模式下先构建 `frontend/dist`，再由 FastAPI 托管静态资源。

## 单独启动

只启动前端：

```powershell
cd frontend
npm install
npm run dev
```

只启动后端：

```powershell
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8001 --reload
```

## 生产构建

```powershell
cd frontend
npm run build
cd ..
python start.py --prod
```
