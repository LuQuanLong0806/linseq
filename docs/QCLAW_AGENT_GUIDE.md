# QClaw Agent 开发指南 — 灵序 LineSequence

> 本文档供 AI Agent（QClaw）存储到记忆中，用于自动化任务开发调度。
> 最后更新：2026-05-27

---

## 一、服务地址

```
BASE_URL = http://localhost:3201/api/agent
```

---

## 〇、口语化命令对照表

以下是人类可能说的自然语言指令，以及对应的 API 调用。收到这类指令时直接执行对应操作。

| 人类说 | AI 应该做 | 调用链 |
|---|---|---|
| "开始工作" / "继续开发" / "取任务" / "干活了" | 从待办队列取任务并开始 | `GET /next-task` → 如果有任务 → `POST /task/:id/start` |
| "跳过这个" / "先做下一个" | 放弃当前任务，取下一个 | `POST /task/:id/question`（记录跳过原因） → `GET /next-task` |
| "这个需求不清楚" / "我没看懂需求" | 提交疑问，移出队列，继续取下一个 | `POST /task/:id/question` → `GET /next-task` |
| "完成了" / "搞定了" / "提交" | 提交开发产出，移入审核 | `POST /task/:id/complete` → `GET /next-task` |
| "还有多少任务" / "队列情况" | 查看队列统计 | `GET /stats` |
| "同步一下" / "拉取最新任务" | 从内网同步任务数据 | `POST /sync` |
| "停一下" / "暂停" | 完成当前任务后停止，不再取新任务 | `POST /task/:id/complete`（如有进行中任务），不再调 `/next-task` |

**执行原则：**
- 人类说话通常包含多余信息，提取核心意图即可
- 如果不确定意图，上报日志询问而不是猜测
- "开始工作"类指令应循环执行：取任务→开发→提交→取下一个，直到队列为空
- 遇到需求不明确的任务，调用 `/question` 后立即继续取下一个，不要等

---

## 二、核心开发循环

```
1. GET  /next-task          → 获取下一个待开发任务（含完整上下文）
2. POST /task/:id/start     → 标记开始开发
3. POST /task/:id/log       → 上报开发日志（可多次）
4. POST /task/:id/complete  → 提交开发产出，自动建版本，移入审核
5. 回到步骤 1
```

---

## 三、行为约束规则（强制）

### 开发红线（违反即判定为失败版本）

1. **禁止 git push** — 只允许 `git add` + `git commit`，推送由人工手动完成
2. **禁止修改不相关功能** — 只修改与当前任务直接相关的代码，不得"顺手"重构、优化、清理无关模块
3. **禁止新增 npm 依赖** — 使用项目现有依赖，如需新增必须先在日志中说明原因等待人工确认
4. **禁止修改构建配置** — 不允许修改 webpack/vite/tsconfig/package.json 等配置文件
5. **禁止删除已有代码** — 除非需求明确要求删除某个功能，否则只能新增或修改
6. **禁止修改数据库迁移/Schema** — 后端数据库结构变更需人工审核后执行

### 开发原则

1. **最小变更** — 只写完成任务所需的最少代码，不做过度设计
2. **先读后写** — 修改任何文件前，先完整阅读该文件理解现有逻辑
3. **保持一致** — 遵循目标项目已有的代码风格、命名规范、目录结构
4. **自测通过** — 提交前必须运行目标项目的测试和类型检查，确保不引入编译错误
5. **日志详实** — 每个关键步骤都通过 `/task/:id/log` 上报，便于人工审核追溯

### 遇到以下情况应提交疑问并继续下一个任务

- 需求描述模糊，无法确定具体实现方案
- 发现需求与现有功能冲突
- 需要修改数据库结构
- 发现目标项目有编译错误（非本次引入）
- 任务的项目路径不存在或无代码

**处理方式：** 调用 `POST /task/:id/question` 提交疑问，任务自动从待办队列移出，然后调用 `GET /next-task` 继续取下一个任务。**不要停等工作。**

---

## 四、接口详细说明

### 1. GET /api/agent/next-task

获取待办队列中的下一个任务，返回完整开发上下文。

**响应示例：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "taskId": "uuid-string",
    "sourceId": "内网编号",
    "title": "任务标题",
    "priority": "urgent|high|medium|low",
    "isRework": false,
    "reworkCount": 0,

    "requirement": {
      "docText": "需求文档解析后的纯文本内容（可能为空）",
      "customDescription": "用户自定义补充描述",
      "acceptanceCriteria": "验收标准"
    },

    "project": {
      "path": "F:\\your-project",
      "gitBranch": "feature/xxx"
    },

    "group": {
      "id": "group-uuid 或空字符串",
      "name": "分组名称",
      "taskCount": 3,
      "completedInGroup": 1,
      "siblingTasks": [
        { "taskId": "xxx", "title": "同组任务A", "aiStatus": "ai_review" },
        { "taskId": "yyy", "title": "同组任务B", "aiStatus": "ai_todo" }
      ]
    },

    "review": {
      "prevComment": "上轮审核意见（仅返工时有值）",
      "prevVersion": "V1.0（仅返工时有值）",
      "prevOutput": "上轮开发产出描述（仅返工时有值）"
    },

    "nextVersion": "V1.0"
  }
}
```

**特殊说明：**
- 返工任务（`isRework=true`）优先返回
- 如果队列为空，`data` 为 `null`
- `requirement.docText` 可能不完整或为空，需结合 `customDescription` 综合判断
- `group` 为分组信息：如果任务属于分组，应参考同组其他任务避免重复开发
- `review.prevOutput` 仅在返工时返回上轮开发产出的代码描述

### 2. POST /api/agent/task/:id/start

标记任务开始开发。

**响应：**

```json
{
  "code": 0,
  "message": "已开始开发",
  "data": { "taskId": "xxx", "aiStatus": "ai_dev" }
}
```

### 3. POST /api/agent/task/:id/log

上报开发日志，可多次调用记录开发过程。

**请求体：**

```json
{
  "action": "开发",
  "content": "正在实现登录页面组件..."
}
```

- `action` 可选值：`开发`、`调试`、`重构`、`自测`、`暂停`、`异常` 等，默认 `"开发"`
- `content` 必填，日志内容
- **建议**：关键决策、遇到的问题、方案选择都应记录

### 4. POST /api/agent/task/:id/complete

开发完成，提交产出物。支持两种请求格式：
- **JSON**（无截图时）：`Content-Type: application/json`
- **Multipart**（有截图时）：`Content-Type: multipart/form-data`

系统会自动：
- 创建版本记录（自动递增版本号）
- 保存截图到服务器
- 生成 Word 自测报告到配置的输出目录
- 将任务状态设为 `ai_review`（待审核）
- 从待办队列移除

**请求体（JSON 模式）：**

```json
{
  "aiOutput": "开发产出的代码/文件描述",
  "summary": "完成了XXX功能的开发",
  "durationMs": 120000,
  "filesChanged": [
    { "path": "src/views/login.vue", "action": "created" },
    { "path": "src/api/auth.ts", "action": "modified" },
    { "path": "src/router/index.ts", "action": "modified" }
  ],
  "testResult": {
    "passed": true,
    "typeCheck": true,
    "details": "8 tests passed, 0 failed. tsc --noEmit clean."
  },
  "reportText": "完成了登录页面的开发，包括表单验证、接口对接和错误提示。"
}
```

**请求体（Multipart 模式）：**

表单字段与 JSON 相同，额外增加 `screenshots` 文件字段（支持多张，最多 10 张）：

```bash
curl -X POST http://localhost:3201/api/agent/task/{taskId}/complete \
  -F "aiOutput=开发产出描述" \
  -F "summary=完成摘要" \
  -F "durationMs=120000" \
  -F 'filesChanged=[{"path":"src/login.vue","action":"created"}]' \
  -F 'testResult={"passed":true,"typeCheck":true,"details":"8 tests passed"}' \
  -F "reportText=自测说明文字" \
  -F "screenshots=@screenshot1.png" \
  -F "screenshots=@screenshot2.png"
```

**字段说明：**
- `aiOutput`（必填）：开发产出描述，包含主要变更内容
- `summary`（必填）：一句话完成摘要
- `durationMs`（可选）：开发耗时毫秒
- `filesChanged`（建议填写）：结构化文件变更列表，`action` 可选值 `created`/`modified`/`deleted`
- `testResult`（建议填写）：自测结果摘要
- `reportText`（建议填写）：自测说明文字，将写入 Word 自测报告。内容应去除 AI 痕迹，以人工测试口吻描述
- `screenshots`（建议提供）：页面截图文件，支持 png/jpg/jpeg/gif/bmp，单张最大 10MB

**响应：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "versionId": "uuid",
    "versionNumber": "V1.0",
    "taskId": "xxx",
    "aiStatus": "ai_review",
    "screenshots": ["1706123456789-abc123.png", "1706123456790-def456.png"]
  }
}
```

### 5. POST /api/agent/task/:id/question

遇到需求不明确、无法继续开发时调用。任务自动从待办队列移出，AI 应立即继续取下一个任务。

**请求体：**

```json
{
  "question": "需求文档中提到的「用户中心」是指哪个模块？当前项目中没有找到对应的路由和组件。"
}
```

- `question` 必填，描述具体不明确的点

**响应：**

```json
{
  "code": 0,
  "message": "已提交疑问并移至待回复列表",
  "data": { "taskId": "xxx", "aiStatus": "ai_question" }
}
```

**流程：**
1. AI 调用 `/question` 提交疑问
2. 任务状态变为 `ai_question`，从待办队列移出
3. AI 立即调用 `GET /next-task` 取下一个任务继续工作
4. 用户在前端看到 AI 的疑问，填写回复
5. 回复后任务重新加入待办队列（状态变回 `ai_todo`）
6. AI 后续取到该任务时继续开发

---

## 五、辅助接口

### GET /api/agent/stats

获取队列统计信息。

```json
{ "code": 0, "data": { "todoCount": 5, "inDev": 1, "inReview": 2, "rework": 1, "totalTasks": 30, "currentTask": null } }
```

### GET /api/agent/todo-order

获取当前待办队列排序。

### POST /api/agent/todo-order

保存待办队列排序（前端调用，Agent 一般不需要）。

### POST /api/agent/sync

触发从内网同步任务数据。

---

## 六、任务状态流转

```
(空) ──入待办──→ ai_todo ──start──→ ai_dev ──complete──→ ai_review
                  ↑                    │                      │
                  │                    │ question              │
                  │                    ↓                      │
                  │              ai_question ──人工回复──→ ai_todo
                  │                                           │
                  └──── reject (返工) ←──────────────────────┘
                                                              │
                                                        approve (通过)
                                                              │
                                                              ↓
                                                           (结束)
```

| 状态值 | 含义 |
|---|---|
| `ai_todo` | 待开发 |
| `ai_dev` | 开发中 |
| `ai_review` | 待审核 |
| `ai_rework` | 返工（审核不通过，需重新开发） |
| `ai_question` | AI 有疑问，等待人工回复（已从待办队列移出） |
| `ai_done` | 已通过 |

---

## 七、版本号规则

版本号格式 `V{major}.{minor}`：
- `iteration` 从 0 递增
- `major = floor(iteration / 10) + 1`
- `minor = iteration % 10`
- 示例：V1.0 → V1.1 → ... → V1.9 → V2.0

---

## 八、开发流程规范

### 8.1 开始前（start 之后）

1. 进入 `project.path` 目录，确认目录存在
2. 读取项目 `package.json` 了解技术栈
3. 浏览项目目录结构，理解分层（src/views, src/api, src/stores 等）
4. 检查 `project.gitBranch`，如需新建分支则创建并切换
5. 上报日志：`"已进入项目，技术栈为 Vue3 + TypeScript + Pinia"`

### 8.2 开发中

1. **先读后写** — 修改前完整阅读目标文件
2. **最小改动** — 只改任务相关的代码
3. **每完成一个关键步骤上报日志**
4. **不相关代码不碰** — 即使看到 bug、性能问题、代码异味也不管
5. **遇到模糊需求** — 通过日志上报 `"需求不明确：XXX，请补充"` 并暂停等待

### 8.3 完成前（complete 之前）

1. 运行目标项目的类型检查：`npx tsc --noEmit`
2. 运行目标项目的测试：`npx vitest run`
3. 如有编译错误或测试失败，先修复再提交
4. 将变更提交到本地 Git：
   ```
   git add <相关文件>
   git commit -m "feat: <简要描述>"
   ```
5. **不做 `git push`**

### 8.4 返工场景

当 `isRework=true` 时：
1. 阅读 `review.prevComment` 了解审核意见
2. 阅读 `review.prevOutput` 了解上轮做了什么
3. **只针对审核意见修改**，不要推翻重来
4. 提交时 commit message 标注 fix：`git commit -m "fix: <针对审核意见的修改>"`

---

## 九、分组任务处理

当 `group` 字段非空时，说明当前任务属于一个分组：

- **同组任务共享同一份需求文档**，避免重复实现相同功能
- **同组任务共享项目配置**（project_path / git_branch）
- **查看 siblingTasks**：了解同组其他任务的进度，如果已完成类似功能可参考
- **同组任务应保持代码风格一致**

---

## 十、版本审核接口（人工/Agent 均可调用）

```
GET  /api/versions/task/:taskId       — 获取任务所有版本
POST /api/versions/:id/approve        — 审核通过
POST /api/versions/:id/reject         — 审核打回 { comment: "修改意见" }
GET  /api/versions/:id                — 获取版本详情
```

---

## 十一、完整调用示例

### 正常开发流程

```bash
# 1. 取任务
curl http://localhost:3201/api/agent/next-task

# 2. 开始开发
curl -X POST http://localhost:3201/api/agent/task/{taskId}/start

# 3. 上报日志
curl -X POST http://localhost:3201/api/agent/task/{taskId}/log \
  -H "Content-Type: application/json" \
  -d '{"action":"开发","content":"开始实现核心逻辑"}'

# 4. 完成开发
curl -X POST http://localhost:3201/api/agent/task/{taskId}/complete \
  -H "Content-Type: application/json" \
  -d '{
    "aiOutput": "新增 login.vue 组件，实现表单验证和登录接口调用",
    "summary": "完成登录页开发",
    "durationMs": 180000,
    "filesChanged": [
      {"path": "src/views/login.vue", "action": "created"},
      {"path": "src/api/auth.ts", "action": "modified"}
    ],
    "testResult": {"passed": true, "typeCheck": true, "details": "all clean"}
  }'

# 5. 继续下一个
curl http://localhost:3201/api/agent/next-task
```

### 遇到需求不明确时

```bash
# 1. 提交疑问，任务移出队列
curl -X POST http://localhost:3201/api/agent/task/{taskId}/question \
  -H "Content-Type: application/json" \
  -d '{"question": "需求中提到的「用户中心」找不到对应模块，请确认具体位置"}'

# 2. 立即取下一个任务继续工作
curl http://localhost:3201/api/agent/next-task
```

---

## 十二、Git 操作规范

| 操作 | 允许 | 说明 |
|---|---|---|
| `git status` | 是 | 查看变更状态 |
| `git diff` | 是 | 查看具体改动 |
| `git add` | 是 | 暂存变更文件 |
| `git commit` | 是 | 提交到本地 |
| `git checkout -b` | 是 | 创建新分支 |
| `git branch` | 是 | 查看/切换分支 |
| `git stash` | 是 | 暂存未完成改动 |
| `git log` | 是 | 查看提交历史 |
| **`git push`** | **禁止** | 由人工手动推送 |
| **`git push --force`** | **禁止** | 绝对禁止 |
| **`git reset --hard`** | **禁止** | 不可逆操作 |
| **`git clean`** | **禁止** | 会删除未追踪文件 |

---

## 十三、错误处理

| 场景 | 处理方式 |
|---|---|
| 项目路径不存在 | 上报日志 `"项目路径不存在: xxx"`，不上报 complete |
| 需求文档为空且无 customDescription | 上报日志 `"缺少需求描述，无法开始开发"`，暂停等待 |
| 编译错误无法修复 | 上报日志 `"遇到编译错误: xxx"`，说明已尝试的修复方式 |
| 测试失败且非本次引入 | 上报日志 `"已有测试失败: xxx"`，列出失败用例 |
| 发现需要修改数据库 | 上报日志 `"需要修改数据库: xxx"`，等待人工确认 |
