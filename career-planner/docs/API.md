# Career Planner API 表

最后更新：2026-04-18

本文档按 `career-planner/backend/app.py` 当前实际注册路由整理。默认后端同源访问；如果前端配置了 `VITE_API_BASE_URL`，则以该值作为 API Base URL。

## 通用约定

| 项 | 说明 |
|---|---|
| 认证方式 | 除注册、登录、健康检查外，所有业务接口都需要 `Authorization: Bearer <token>` |
| 请求格式 | 默认 `Content-Type: application/json` |
| 成功格式 | 多数本地接口返回 `{ "ok": true, ... }` 或业务对象 |
| 错误格式 | FastAPI 默认错误：`{ "detail": "错误信息" }` |
| 用户数据存储 | `studentData` 与 `aiResults` 存在 `user_data` 表 |
| 匹配工作台存储 | `matchWorkspace` 存在 `match_workspace.workspace_json` |
| 匹配引擎代理 | `/api/match`、`/api/match/check`、`/api/match/insight` 会代理到 `http://127.0.0.1:8000` |

## 请求体模型

| 名称 | 字段 | 用途 |
|---|---|---|
| `Credentials` | `username: string`, `password: string` | 注册、登录 |
| `UsernameUpdatePayload` | `username: string`, `currentPassword: string` | 修改用户名 |
| `PasswordUpdatePayload` | `currentPassword: string`, `newPassword: string` | 修改密码 |
| `UserDataPayload` | `studentData: object`, `aiResults: object` | 保存用户画像与 AI 结果 |
| `ProfileSubmitPayload` | `studentProfile: object`, `meta: object` | 提交学生画像并生成基础评估 |
| `ResumeParsePayload` | `dataUrl: string` | 简历图片解析 |
| `StudentDataPayload` | `studentData: object` | AI 画像评估类接口 |
| `SkillTaskPayload` | `studentData: object`, `techNames: string`, `capNames: string`, `toolNames: string`, `appliedNames: string[]` | 技能核查、掌握深度推断 |
| `MatchWorkspacePayload` | `workspace: object` | 保存岗位匹配工作台 |
| `MatchProxyPayload` | `student: object`, `config?: object`, `batch_offsets: object`, `top_k: number` | 匹配推荐、洞察代理 |
| `MatchCheckPayload` | `student: object`, `job: object`, `config?: object` | 单岗位准入核查 |
| `ActiveBasketPayload` | `basket: object`, `jobsById: object` | 保存当前篮子草稿 |
| `BasketSubmitPayload` | `basket: object`, `jobsById: object`, `student: object`, `analysis: string` | 提交篮子并生成收割记录 |
| `ReservedMatchPayload` | `payload: object` | 预留接口 |

## 认证与账号

| 场景 | 方法 | 路径 | Auth | 请求 | 返回重点 | 状态 |
|---|---:|---|---|---|---|---|
| 健康检查 | GET | `/api/health` | 否 | 无 | `{ status, service }` | 可用 |
| 注册 | POST | `/api/auth/register` | 否 | `Credentials`，密码至少 6 位 | `{ token, user }` | 可用 |
| 登录 | POST | `/api/auth/login` | 否 | `Credentials` | `{ token, user }` | 可用 |
| 当前用户 | GET | `/api/auth/me` | 是 | 无 | `{ user }` | 可用 |
| 修改用户名 | PUT | `/api/auth/username` | 是 | `UsernameUpdatePayload` | `{ token, user }`，会返回新 token | 可用 |
| 修改密码 | PUT | `/api/auth/password` | 是 | `PasswordUpdatePayload`，新密码至少 6 位 | `{ ok, user }` | 可用 |

## 用户画像数据

| 场景 | 方法 | 路径 | Auth | 请求 | 返回重点 | 状态 |
|---|---:|---|---|---|---|---|
| 获取用户数据 | GET | `/api/user-data` | 是 | 无 | `{ studentData, aiResults, updatedAt }` | 可用 |
| 获取当前学生画像 | GET | `/api/student-profile/me` | 是 | 无 | `{ studentData, aiResults, updatedAt }` 格式的当前画像响应 | 可用 |
| 保存用户数据 | PUT | `/api/user-data` | 是 | `UserDataPayload`，也兼容 `{ studentProfile, aiResults }` | `{ ok, updatedAt }` | 可用 |
| 保存用户数据 | POST | `/api/user-data` | 是 | 同 PUT | `{ ok, updatedAt }` | 可用 |
| 重置用户数据 | POST | `/api/user-data/reset` | 是 | 无 | `{ ok, message }`，清空画像、AI 结果、匹配工作台、提交历史 | 可用 |
| 提交画像并评估 | POST | `/api/student-profile/submit-and-evaluate` | 是 | `ProfileSubmitPayload` | `{ source, submissionId, submittedAt, nextPage, profileSnapshot, message }` | 可用 |

## AI 画像评估工具

| 场景 | 方法 | 路径 | Auth | 请求 | 返回重点 | 状态 |
|---|---:|---|---|---|---|---|
| 简历图片解析 | POST | `/api/ai/resume/parse` | 是 | `ResumeParsePayload`，`dataUrl` 为图片 data URL | 结构化简历解析结果 | 可用，调用 LLM |
| 画像完整度评估 | POST | `/api/ai/profile/completeness` | 是 | `StudentDataPayload` | 完整度分数、维度评分、优先补充建议 | 可用，调用 LLM |
| 技能声明核查 | POST | `/api/ai/profile/skillcheck` | 是 | `SkillTaskPayload` | 技能增删建议 `changes` | 可用，调用 LLM |
| 掌握深度推断 | POST | `/api/ai/profile/infer-levels` | 是 | `SkillTaskPayload` | 技能等级推断 `inferences` | 可用，调用 LLM |
| 职业素养分析 | POST | `/api/ai/profile/soft-quality` | 是 | `StudentDataPayload` | 职业素养分析结果 | 可用，调用 LLM |
| 成长潜力分析 | POST | `/api/ai/profile/growth-potential` | 是 | `StudentDataPayload` | 成长潜力分析结果 | 可用，调用 LLM |

## 岗位匹配工作台

| 场景 | 方法 | 路径 | Auth | 请求 | 返回重点 | 状态 |
|---|---:|---|---|---|---|---|
| 获取匹配工作台 | GET | `/api/match/workspace` | 是 | 无 | `{ workspace, updatedAt }` | 可用 |
| 保存匹配工作台 | PUT | `/api/match/workspace` | 是 | `MatchWorkspacePayload` | `{ ok, updatedAt }` | 可用 |
| 生成/重新生成推荐 | POST | `/api/match` | 是 | `MatchProxyPayload` | 匹配引擎返回的岗位推荐、分析、分页信息等 | 可用，代理到 `localhost:8000/api/match` |
| 生成/重新生成推荐别名 | POST | `/api/match/run` | 是 | `MatchProxyPayload` | 同 `/api/match` | 可用，内部复用 |
| 单岗位准入核查 | POST | `/api/match/check` | 是 | `MatchCheckPayload` | 匹配引擎返回的准入核查结果 | 可用，代理到 `localhost:8000/api/match/check` |
| 匹配洞察 | POST | `/api/match/insight` | 是 | `MatchProxyPayload` | 匹配引擎返回的洞察分析 | 可用，代理到 `localhost:8000/api/match/insight` |

评分字段契约见 [`matching-score-contract.md`](./matching-score-contract.md)。新前端应以 `competitiveness_score` 作为岗位排序和主分，以 `gold_score` / `gold_assessment` 展示含金量，不再把旧 `score` 当业务主字段。

## 篮子、收割记录、行动计划

| 场景 | 方法 | 路径 | Auth | 请求 | 返回重点 | 状态 |
|---|---:|---|---|---|---|---|
| 保存当前篮子草稿 | PUT | `/api/match/basket/active` | 是 | `ActiveBasketPayload` | `{ ok, workspace, updatedAt }`，合并 `currentBasket` 与 `jobsById` | 可用 |
| 提交篮子并生成分析 | POST | `/api/match/basket/submit` | 是 | `BasketSubmitPayload` | `{ ok, workspace, harvest, basketHistoryRecord, updatedAt }` | 可用 |
| 获取某次收割记录 | GET | `/api/match/harvest/{basket_id}` | 是 | 路径参数 `basket_id`，例如 `basket-001` | `{ ok, harvest, basketHistoryRecord }` | 可用 |
| 删除某次收割记录 | DELETE | `/api/match/harvest/{basket_id}` | 是 | 路径参数 `basket_id` | `{ ok, workspace, updatedAt }`，若删除当前 target 所属记录会清空行动计划 | 可用 |
| 保存行动计划 | POST | `/api/match/action-plan` | 是 | `{ actionPlan?, patch?, targetJobId?, targetHarvestId? }`，也兼容 `{ payload: {...} }` | `{ ok, workspace, actionPlan, updatedAt }` | 可用 |
| 缺口驱动实习推荐 | POST | `/api/match/internship-recommendations` | 是 | `{ student, gaps, top_k }` | `{ ok, gapProfile, jobs, totals, timing }`，只在实习岗位池中按行动计划缺口匹配 | 可用 |
| 画像同步事件预留 | POST | `/api/match/profile/sync-event` | 是 | `ReservedMatchPayload` | `{ reserved, endpoint, payload }` | 占位 |

### 篮子提交后的数据结构要点

| 字段 | 位置 | 说明 |
|---|---|---|
| `workspace.currentBasket` | 工作台 | 当前草稿篮子。提交成功后会重置为新的空篮子 |
| `workspace.basketHistory[]` | 工作台 | 每次提交过的篮子历史，包含岗位快照、提交时间、最佳岗位、置信度 |
| `workspace.harvests[]` | 工作台 | 每次提交篮子产生的收割分析记录 |
| `harvest.rankings[]` | 收割记录 | 按岗位竞争力 `score` 从高到低排序 |
| `workspace.selectedHarvestId` | 工作台 | 当前查看的收割记录 ID |
| `workspace.targetJobId` | 工作台 | 当前主攻目标岗位 ID |
| `workspace.targetHarvestId` | 工作台 | 当前主攻目标来源收割记录 ID |
| `workspace.actionPlan` | 工作台 | 当前行动计划。切换 target 会提示覆盖旧进度 |
| `workspace.actionPlan.tasks[].sub_tasks[]` | 行动计划 | 子任务勾选状态。理论任务 +10，工程项目 +25 |
| `workspace.actionPlan.checkin_records[]` | 行动计划 | 打卡日期、投入时长、心得。每次打卡 +5 |
| `workspace.actionPlan.growth_points` | 行动计划 | 成长值，用于果园称号从“种子”晋升到“果园之王” |
| `workspace.actionPlan.internshipRecommendations[]` | 行动计划 | 基于缺口反向匹配得到的实习岗位推荐缓存 |

## 学生画像标签、能力、方向推荐

| 场景 | 方法 | 路径 | Auth | 查询参数 | 返回重点 | 状态 |
|---|---:|---|---|---|---|---|
| 技术能力推荐 | GET | `/api/student-profile/tech-capability/recommendations` | 是 | `direction?: string` | `{ source, direction, recommendations }` | 可用 |
| 技术能力搜索 | GET | `/api/student-profile/tech-capability/search` | 是 | `query?: string`, `type?: string`, `direction?: string`, `limit?: 1..50` | `{ source, query, type, direction, options }` | 可用 |
| 专业技能搜索 | GET | `/api/student-profile/professional-skills/search` | 是 | `query?: string`, `category?: string`, `type?: string`, `limit?: 1..50`, `min_similarity?: 0..1` | 专业技能匹配结果 | 可用 |
| 专业技能推荐 | GET | `/api/student-profile/professional-skills/recommendations` | 是 | `category`, `tag_type`, `type`, `limit`, `offset`, `page`, `random_seed`, `min_frequency`, `exclude_tag_ids`, `exclude_values`, `domain_ids`, `domains` | 专业技能推荐列表 | 可用 |
| 技术领域推荐 | GET | `/api/student-profile/tech-domains/recommendations` | 是 | `limit?: 1..50`, `page?: number`, `min_frequency?: number` | 技术领域推荐列表 | 可用 |
| 技术领域搜索 | GET | `/api/student-profile/tech-domains/search` | 是 | `query?: string`, `limit?: 1..50`, `min_frequency?: number` | 技术领域搜索结果 | 可用 |
| 标签中心搜索 | GET | `/api/student-profile/tag-center/search` | 是 | `query?: string`, `tag_type?: string`, `limit?: 1..50`, `min_similarity?: 0..1` | `{ ...result, source: "professional-skills", compat: "tag-center/search" }` | 可用 |
| 标签中心解析 | GET | `/api/student-profile/tag-center/resolve` | 是 | `tag_id?: string`, `value?: string`, `tag_type?: string` | `{ source, matched, tag }` | 可用 |

## 非业务 API / 静态路由

| 方法 | 路径 | 说明 |
|---:|---|---|
| GET | `/backend/{_path:path}` | 静态文件挂载，不进入业务 API 表 |
| GET | `/data/{_path:path}` | 静态数据文件挂载，不进入业务 API 表 |
| GET | `/` | 前端入口或服务欢迎页 |

## 常用调用示例

### 登录并保存 token

```bash
curl -X POST http://localhost:5173/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"******\"}"
```

### 重新生成岗位推荐

```bash
curl -X POST http://localhost:5173/api/match \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d "{\"student\":{},\"batch_offsets\":{},\"top_k\":5}"
```

### 提交篮子生成收割记录

```bash
curl -X POST http://localhost:5173/api/match/basket/submit \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d "{\"basket\":{\"id\":\"basket-001\",\"jobIds\":[\"job-1\"]},\"jobsById\":{\"job-1\":{\"stableId\":\"job-1\",\"title\":\"后端开发\",\"companyName\":\"Demo\",\"score\":88}},\"student\":{},\"analysis\":\"\"}"
```

### 获取某次收割记录

```bash
curl http://localhost:5173/api/match/harvest/basket-001 \
  -H "Authorization: Bearer <token>"
```

### 删除某次收割记录

```bash
curl -X DELETE http://localhost:5173/api/match/harvest/basket-001 \
  -H "Authorization: Bearer <token>"
```
