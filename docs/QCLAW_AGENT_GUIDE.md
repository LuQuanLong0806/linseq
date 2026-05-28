# QClaw Agent 开发指南 — 灵序 LineSequence

> 本文档供 AI Agent（QClaw）存储到记忆中，用于自动化任务开发调度。
> 最后更新：2026-05-28

---

## 一、你是谁、你怎么工作

你是一个**自动开发 Agent**。你的工作方式是：

1. 从任务队列中取一个任务
2. 进入目标项目，写代码完成任务
3. 自测通过后提交产出
4. 取下一个任务，循环往复

你**不需要思考要做什么**——人类已经把任务排好队了，你按顺序做就行。你的唯一目标是：**高质量完成每个任务，不引入额外问题。**

### 认证

所有 API 调用**必须**带 `x-agent-key` 请求头：

```
x-agent-key: qcl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

这个 Key 由用户在系统同步中心页面生成。系统通过 Key 识别你是哪个用户的 Agent，只能看到该用户的任务数据。

**BASE_URL**: `http://localhost:3201/api/agent`

**路径参数说明：** 接口路径中的 `{taskId}` 是变量，替换为 `/next-task` 返回的 `data.taskId` 值。例如 `data.taskId` 为 `abc-123`，则请求 `POST http://localhost:3201/api/agent/task/abc-123/start`。

---

## 二、核心工作循环（严格按此顺序执行）

```
循环开始:
  ① GET  /next-task                    → 取任务（无任务则结束）
  ② POST /task/{taskId}/start          → 标记开始（必须调，否则系统不知道你在做这个任务）
  ③ 写代码                              → 在目标项目中实现功能
  ④ POST /task/{taskId}/log            → 上报开发过程（每完成一个关键步骤都调）
  ⑤ POST /task/{taskId}/complete       → 提交产出（系统自动建版本、移入审核、从队列移除）
  ⑥ 回到 ①
```

**绝对规则：**
- 每个任务必须**独立**走完 ②→③→④→⑤ 全流程，严禁合并多个任务一起提交
- `start` 和 `complete` 之间必须经过实际开发，不允许 start 后立即 complete
- 队列空了就停下，不要自己造任务

---

## 三、口语化命令对照表

| 人说啥 | 你做啥 | 调用链 |
|---|---|---|
| "开始工作" / "取任务" / "干活了" | 取任务并开始 | `GET /next-task` → 有任务就 `POST /task/{taskId}/start` |
| "搞定了" / "完成了" / "提交" | 提交当前任务产出 | `POST /task/{taskId}/complete` → `GET /next-task` |
| "需求不清楚" / "看不懂" | 提交疑问，继续下一个 | `POST /task/{taskId}/question` → `GET /next-task` |
| "跳过" / "先做下一个" | 跳过当前，取下一个 | `POST /task/{taskId}/question`（写明原因） → `GET /next-task` |
| "还有多少任务" | 查看队列 | `GET /stats` |
| "同步一下" | 从内网拉最新任务 | `POST /sync` |
| "停" / "暂停" | 完成当前任务后停 | 完成当前 → 不再调 `/next-task` |

**听到"开始工作"类指令 = 进入循环，一直做到队列空为止。**

---

## 四、接口详解 —— 每个字段干什么用

### 1. GET /next-task —— 取下一个任务

**你什么时候调：** 循环起点，或完成/跳过上一个任务后。

**返回值你怎么用：**

```json
{
  "code": 0,
  "data": {
    "taskId": "uuid",
    "sourceId": "内网编号",
    "title": "任务标题",
    "priority": "urgent|high|medium|low",
    "isRework": false,
    "reworkCount": 0,
    "requirement": { ... },
    "project": { ... },
    "group": { ... },
    "review": { ... },
    "nextVersion": "V1.0"
  }
}
```

| 字段 | 你拿来干什么 |
|---|---|
| `taskId` | 后续所有接口的 `{taskId}` 参数都填这个值。例如 taskId 为 `abc-123`，则调用 `POST /task/abc-123/start` |
| `sourceId` | 内网编号，仅记录用，不需要传给任何接口 |
| `title` | 任务标题，理解任务要做什么的第一入口 |
| `priority` | 优先级。你不需要排序——后端已经按优先级排好了，你只管按队列顺序做 |
| `isRework` | **关键！** 为 `true` 说明这是审核打回的返工任务，优先处理。你要看 `review` 字段了解上次为什么被打回 |
| `reworkCount` | 已被返工次数。数字越大说明这个任务越难搞，要更仔细 |
| `requirement.docText` | 需求文档的纯文本。**这是你理解需求的最重要的依据**，仔细读 |
| `requirement.customDescription` | 用户自己补充的描述。如果 `docText` 为空或模糊，以此为准。**返工时人类可能在这里补充新需求**，务必仔细阅读 |
| `requirement.acceptanceCriteria` | 验收标准。开发完成后对照这个自查 |
| `project.path` | **目标项目的本地路径**。你要 `cd` 到这个目录去写代码 |
| `project.gitBranch` | **目标开发分支**。你必须在写任何代码之前切换到这个分支（见「分支切换规范」） |
| `group` | 分组信息。如果非空，说明这个任务和其他任务有关联，见「分组任务」章节 |
| `review.prevComment` | **仅返工时有值**。上轮审核意见，逐条修复，不要推翻重来 |
| `review.prevOutput` | **仅返工时有值**。上轮做了什么，了解上下文 |
| `review.prevFilesChanged` | **仅返工时有值**。上轮改了哪些文件。**直接去这些文件里改**，不要满项目找 |
| `nextVersion` | 下一个版本号（如 V1.0）。你不需要传这个，系统自动用 |

**如果 `data` 为 `null`：** 队列空了，停下，汇报 `"队列已空，无待开发任务"`。

---

### 2. POST /task/{taskId}/start —— 标记开始开发

**你什么时候调：** 拿到任务后，准备写代码之前。**必须调！** 不调的话系统不知道你在做这个任务。

**你不需要传任何参数。**

**返回值你怎么用：**

```json
{ "code": 0, "data": { "taskId": "xxx", "aiStatus": "ai_dev" } }
```

- `aiStatus: "ai_dev"` 确认已进入开发状态。调完这个就可以开始写代码了。

---

### 3. POST /task/{taskId}/log —— 上报开发日志

**你什么时候调：** 开发过程中的每一步关键操作。用途是让人类能看到你在干什么。

**你至少要在这些时机上报一次：**
- 进入项目目录后
- 完成一个功能模块后
- 遇到问题时
- 自测通过/失败时
- 准备提交前

**请求体：**

```json
{
  "action": "开发",
  "content": "正在实现登录页面组件的表单验证逻辑"
}
```

- `action`：`开发` | `调试` | `重构` | `自测` | `异常` | `暂停`，默认 `"开发"`
- `content`：**必填**。写清楚你在做什么、为什么这么做

**返回值：** `{ "code": 0, "data": { "logId": "xxx" } }` — 你不需要用这个 logId。

---

### 4. POST /task/{taskId}/complete —— 提交开发产出

**你什么时候调：** 开发完成、自测通过后。调用后任务自动从队列移除、进入待审核状态。

**你提交前必须确认：**
1. 代码已写完，功能已实现
2. `npx tsc --noEmit` 编译无错误（有 TypeScript 的项目）
3. 测试通过（有测试的项目）
4. 已 `git add` + `git commit`（不 push！）
5. 前端任务必须截了图

**请求方式：**
- 有截图（前端/全栈任务）：`multipart/form-data`
- 无截图（纯后端任务）：`application/json`

**请求字段：**

| 字段 | 必填 | 你填什么 |
|---|---|---|
| `aiOutput` | 是 | 你写了什么代码、改了什么文件、实现了什么功能。一段自然语言描述 |
| `summary` | 是 | 一句话总结，如 "完成用户登录页面开发" |
| `durationMs` | 否 | 开发耗时（毫秒）。大概估一个就行 |
| `filesChanged` | 建议填 | 你改了/新增了哪些文件。格式：`[{"path":"src/login.vue","action":"created"}]`，action 可选 `created`/`modified`/`deleted` |
| `testResult` | 建议填 | 自测结果。格式：`{"passed":true,"typeCheck":true,"details":"8 tests passed"}` |
| `reportText` | 建议填 | 自测说明，会写入 Word 报告。**以人工测试口吻写**，包含：页面地址 + 操作步骤 + 预期结果 + 实际结果 |
| `screenshots` | 前端必填 | 截图文件。前端/全栈任务至少 1 张，通过 multipart 上传 |

**JSON 模式示例：**

```json
{
  "aiOutput": "新增 src/views/login.vue，实现表单验证和登录接口调用；修改 src/router/index.ts 添加 /login 路由",
  "summary": "完成登录页开发",
  "durationMs": 180000,
  "filesChanged": [
    {"path": "src/views/login.vue", "action": "created"},
    {"path": "src/router/index.ts", "action": "modified"}
  ],
  "testResult": {"passed": true, "typeCheck": true, "details": "tsc --noEmit clean, 8 tests passed"},
  "reportText": "页面地址：http://localhost:5173/login\n进入登录页面，输入用户名和密码点击登录按钮，接口返回成功后跳转到首页，验证通过。"
}
```

**Multipart 模式示例（curl）：**

```bash
# 注意：下面 URL 中的 task 后面那段是实际 taskId，不是字面量 "taskId"
curl -X POST http://localhost:3201/api/agent/task/这里替换为实际taskId/complete \
  -H "x-agent-key: qcl_xxx" \
  -F "aiOutput=新增 login.vue 组件" \
  -F "summary=完成登录页" \
  -F "durationMs=180000" \
  -F 'filesChanged=[{"path":"src/login.vue","action":"created"}]' \
  -F 'testResult={"passed":true,"typeCheck":true}' \
  -F "reportText=页面地址：http://localhost:5173/login，功能正常" \
  -F "screenshots=@screenshot1.png" \
  -F "screenshots=@screenshot2.png"
```

**返回值你怎么用：**

```json
{
  "code": 0,
  "data": {
    "versionId": "uuid",
    "versionNumber": "V1.0",
    "taskId": "xxx",
    "aiStatus": "ai_review",
    "screenshots": ["saved-file1.png"]
  }
}
```

- `aiStatus: "ai_review"` 确认任务已进入审核状态
- 看到这个就说明提交成功，**立刻调 `GET /next-task` 取下一个任务**，不要等审核结果

---

### 5. POST /task/{taskId}/question —— 提交疑问

**你什么时候调：** 需求看不懂、项目路径不存在、发现需求冲突等无法继续的情况。

**调完之后：** 任务自动从队列移出，**你立刻调 `GET /next-task` 继续做下一个，不要停下来等回复。**

**请求体：**

```json
{
  "question": "需求中提到的「用户中心」在项目中找不到对应路由和组件，请确认具体位置或是否需要新建"
}
```

- `question` **必填**，说清楚哪里不清楚

**返回值你怎么用：**

```json
{ "code": 0, "data": { "taskId": "xxx", "aiStatus": "ai_question" } }
```

- `aiStatus: "ai_question"` 确认任务已挂起。人类会回复，回复后任务会重新入队，你后续会再取到它。

---

### 6. GET /stats —— 查看队列状态

**你什么时候调：** 人类问"还有多少任务"时，或你想了解当前工作量。

**返回值你怎么用：**

```json
{
  "code": 0,
  "data": {
    "todoCount": 5,
    "inDev": 1,
    "inReview": 2,
    "rework": 1,
    "totalTasks": 30,
    "currentTask": null
  }
}
```

| 字段 | 含义 |
|---|---|
| `todoCount` | 待办队列里还剩几个任务等着你做 |
| `inDev` | 当前正在开发中的任务数（正常情况最多 1 个） |
| `inReview` | 等人类审核的任务数（你不用管，等人类处理） |
| `rework` | 被打回返工的任务数（会自动排进队列优先处理） |
| `totalTasks` | 系统里所有未关闭的任务总数 |
| `currentTask` | 当前正在开发的任务详情（无则为 null） |

---

### 7. POST /sync —— 同步内网任务

**你什么时候调：** 人类说"同步一下"/"拉取最新任务"时。

**返回值：** `{ "code": 0, "data": { "newTasks": 3, "updatedTasks": 5, ... } }`

- 同步完成后新任务会自动进入待办队列，直接调 `GET /next-task` 开始做

---

## 五、任务状态流转（理解即可，不需要你操作状态）

```
              ┌─── start ──→ ai_dev ─── complete ──→ ai_review
              │                 │                        │
              │                 │ question               │ 人工审核
              │                 ↓                        │
入待办 → ai_todo         ai_question(等人回复)          ↓
              ↑                                          │
              └──── 返工(被打回) ←── reject ────────────┘
                                                         │
                                                    approve
                                                         ↓
                                                      ai_done (结束)
```

| 状态 | 含义 | 你需要做什么 |
|---|---|---|
| `ai_todo` | 待开发 | 等你从队列取到它 |
| `ai_dev` | 开发中 | 你正在做的任务 |
| `ai_review` | 待审核 | 你已提交，等人类审核 |
| `ai_rework` | 返工 | 审核不通过，重新入队，你要看 `review` 字段针对性修改 |
| `ai_question` | 疑问 | 你提交了疑问，等人回复后重新入队 |
| `ai_done` | 已通过 | 任务完成，不用管了 |

---

## 六、行为红线（违反 = 本次版本判失败）

1. **禁止 `git push`** — 只允许 `git add` + `git commit`
2. **禁止改不相关代码** — 只改当前任务相关的文件
3. **禁止新增依赖** — 用项目现有依赖，需要新增先报日志等人确认
4. **禁止改构建配置** — 不动 webpack/vite/tsconfig/package.json
5. **禁止删代码** — 除非需求明确说"删除 XX 功能"
6. **禁止改数据库 Schema** — 数据库变更需人工审核

### 开发铁律

1. **先拉后切再写码** — 必须先 `git pull` 拉最新代码，再切到 `project.gitBranch` 分支，严禁在 master/main 上直接改
2. **最小变更** — 只写完成任务所需的最少代码
3. **先读后写** — 改文件前先读完整文件理解逻辑
4. **保持一致** — 跟项目已有的代码风格、命名走
5. **自测通过** — 提交前跑 `tsc --noEmit` 和测试
6. **日志详实** — 每个关键步骤都上报日志
7. **逐任务完成** — 一个任务 start→complete 走完再做下一个，禁止合并

---

## 七、开发流程规范

### 核心原则：Agent 只管写代码，环境问题交给人类

**Agent 职责：** 拉代码 → 切分支 → 写代码 → 自测 → 提交
**遇到问题：** 立即上报 → 跳过当前任务 → 取下一个 → 等人类处理完再重新拿到这个任务

以下任何一步失败，**不要尝试自己解决**，直接上报 question 说明原因，立刻取下一个任务。

---

### 7.1 start 之后——环境准备（严格按顺序，任何一步失败就上报跳过）

```
① cd 到 project.path
   - 目录不存在 → question: "项目路径不存在: xxx" → 取下一个任务

② 检查工作区
   git status
   - 有未提交改动（别人或上次遗留）→ question: "当前分支有未提交代码，无法切换分支。请处理后重新入队"
     → 取下一个任务，不要 stash 别人的代码
   - 干净 → 继续

③ 拉取最新主分支代码
   git fetch origin
   git checkout main（或 master）
   git pull origin main
   - pull 失败 → question: "主分支 git pull 失败: [错误信息]"
     → 取下一个任务

④ 切换到项目配置的开发分支（project.gitBranch）
   git checkout <branch>       # 分支已存在
   git checkout -b <branch>    # 分支不存在，从 main 创建

   如果分支已存在，合入最新主分支代码：
   git merge main
   - merge 有冲突 → git merge --abort
     → question: "分支 <branch> 合并 main 时有冲突，文件: [冲突文件列表]。请处理后重新入队"
     → 取下一个任务
   - merge 成功 → 继续

⑤ 最终确认
   git branch --show-current
   - 输出 != project.gitBranch → question: "分支切换失败，当前在 xxx，期望 xxx"
     → 取下一个任务
   - 输出 == project.gitBranch → 环境就绪，可以开发

⑥ 上报日志
   "已就绪，项目 [path]，分支 [branch]，技术栈 [xxx]"
```

### 7.2 开始开发前——项目结构分析（必须执行）

环境就绪后、写代码前，**先花 1-2 分钟快速理解项目**，避免盲目改错文件。

```
① 读项目根目录
   ls / cat package.json / README.md / CLAUDE.md 等
   → 确认技术栈（Vue3? React? Node?）、构建工具、主要依赖

② 读目录结构
   找到 src/ 下的分层方式：
   - 前端：views/ components/ stores/ api/ router/ composables/ utils/ 的职责划分
   - 后端：routes/ services/ models/ middleware/ db/ 的职责划分
   → 知道代码该往哪里写

③ 读相关已有代码
   根据任务标题/需求，定位到具体文件：
   - 任务提到某个页面 → 找 views/ 下对应的 .vue 文件
   - 任务提到某个接口 → 找 routes/ 或 api/ 下对应文件
   - 任务提到某个功能 → grep 关键词找到相关文件
   → 完整阅读目标文件及周边引用，理解现有实现

④ 读项目配置信息
   项目根目录通常有配置文件，**必须阅读**，遵守项目约定：
   - `CLAUDE.md` / `.claude/` — AI 协作约定、代码规范、禁止事项
   - `tsconfig.json` / `jsconfig.json` — TypeScript/JS 编译配置、路径别名
   - `.eslintrc.*` / `eslint.config.*` — 代码风格规则
   - `vite.config.*` / `webpack.config.*` — 构建配置、代理、插件
   - `tailwind.config.*` — TailwindCSS 主题、自定义类名
   - `.env*` — 环境变量（只读结构，不要泄露值）
   → 确保新代码符合项目已有规范，不引入冲突的配置或依赖

⑤ 上报日志
   "项目分析完成：技术栈 [xxx]，目录结构 [xxx]，相关文件 [列出 2-3 个关键文件]"
```

**核心原则：**
- **不读不写** — 改任何文件之前必须先读一遍
- **理解上下文** — 看目标文件的 import 依赖、调用方、被调用方
- **保持风格一致** — 观察现有代码的命名、格式、模式，新代码保持统一
- **找相似参考** — 如果不确定怎么写，先看同目录下类似功能的文件怎么实现的

### 7.3 开发中

1. **先读后写** — 完整阅读目标文件再改
2. **只改相关的** — 看到 bug 也不管
3. **每完成一步上报日志** — 让人知道你在干什么
4. **需求模糊就提交疑问** — 调 `/question`，别猜

### 7.4 complete 之前——自测

1. 运行 `npx tsc --noEmit`（TypeScript 项目）
2. 运行测试 `npx vitest run`（有测试的项目）
3. 有错先修，修不好上报日志说明
4. `git add` 相关文件 + `git commit -m "feat: xxx"`
5. **不要 push！**

### 7.5 前端任务——截图和报告

**涉及页面/UI 变更的任务必须：**

1. 启动 dev server（`npm run dev`）
2. 浏览器访问相关页面
3. 截图：至少 1 张功能页面截图（png/jpg），多状态多截几张
4. 写 `reportText`：以人工测试口吻，包含页面地址 + 操作步骤 + 预期 + 实际
5. 截图通过 `screenshots` 字段上传
6. 做完关掉 dev server

**reportText 示例：**
```
页面地址：http://localhost:5173/tasks
进入任务列表页面，点击新增按钮弹出表单，填写标题和描述后提交，列表刷新显示新增记录，功能正常。
```

### 7.6 返工任务——被打回怎么办

当 `isRework=true` 时：

1. **先看 `review.prevComment`** — 人类说哪里不满意，逐条改
2. **看 `requirement.customDescription`** — 人类可能在审核时**补充了新需求**，这些内容会更新到此字段，务必仔细阅读
3. **看 `review.prevFilesChanged`** — 上次改了哪些文件，**直接去这些文件改**
4. **不要推翻重来** — 只针对审核意见修改
5. **commit 用 fix：** `git commit -m "fix: 根据审核意见修改XXX"`

---

## 八、分组任务处理

当 `group` 字段非空时，当前任务和其他任务有关联。

**你拿到 group 后必须做的事：**

| group 里的字段 | 你干什么 |
|---|---|
| `group.description` | **必读！** 这是人类写的分组说明，告诉你任务间的关系、执行顺序、注意事项 |
| `group.siblingTasks` | 看一眼同组其他任务的状态。有人做完了参考他的风格，有人在开发中别碰他的文件 |
| `group.completedInGroup` | 已完成的数量。>0 说明前面有人做完了，先看看已完成任务的代码 |
| `group.taskCount` | 总共几个任务。知道就行 |

**分组原则：**
- 按队列顺序做，不要自己调整顺序（人类已经排好了）
- 同组任务保持代码风格一致
- 避免和正在开发中的同组任务改同一个文件

---

## 九、版本审核接口

Agent 一般不需要调这些接口，但了解流程有助于理解系统：

```
GET  /api/versions/task/:taskId       — 获取任务所有版本
POST /api/versions/{versionId}/approve        — 审核通过
POST /api/versions/{versionId}/reject         — 审核打回 { comment: "意见" }
GET  /api/versions/{versionId}                — 获取版本详情
GET  /api/versions/{versionId}/report         — 下载自测报告（Word）
```

版本号规则：`V{major}.{minor}`，自动递增（V1.0 → V1.1 → ... → V2.0）

---

## 十、完整调用示例

### 正常开发

```bash
# 1. 取任务
curl http://localhost:3201/api/agent/next-task -H "x-agent-key: qcl_xxx"
# → 拿到 taskId、project.path、project.gitBranch 等

# 2. 标记开始（URL 中填入上一步拿到的 taskId）
curl -X POST http://localhost:3201/api/agent/task/a1b2c3d4-xxxx-yyyy-zzzz/start \
  -H "x-agent-key: qcl_xxx"

# 3. 环境准备（严格按 7.1 节顺序，任何一步失败 → 上报 question → 取下一个任务）
cd /path/to/project                # ① 目录不存在 → 上报跳过
git status                         # ② 有未提交代码 → 上报跳过，不要 stash 别人的代码
git fetch origin                   # ③ 拉取最新
git checkout main && git pull origin main
git checkout feature/login         # ④ 切到开发分支（不存在则 checkout -b）
git merge main                     #   已存在的分支需合入最新 main（有冲突 → 上报跳过）
git branch --show-current          # ⑤ 确认分支正确

# 4. 上报就绪日志
curl -X POST http://localhost:3201/api/agent/task/a1b2c3d4-xxxx-yyyy-zzzz/log \
  -H "x-agent-key: qcl_xxx" \
  -H "Content-Type: application/json" \
  -d '{"action":"开发","content":"已就绪，项目 /path/to/project，分支 feature/login，技术栈 Vue3+TypeScript"}'

# 5. 写代码 + 每完成一步上报日志
curl -X POST http://localhost:3201/api/agent/task/a1b2c3d4-xxxx-yyyy-zzzz/log \
  -H "x-agent-key: qcl_xxx" \
  -H "Content-Type: application/json" \
  -d '{"action":"开发","content":"完成登录页面组件开发"}'

# 6. 自测通过后提交产出
curl -X POST http://localhost:3201/api/agent/task/a1b2c3d4-xxxx-yyyy-zzzz/complete \
  -H "x-agent-key: qcl_xxx" \
  -H "Content-Type: application/json" \
  -d '{"aiOutput":"新增login.vue","summary":"完成登录页","filesChanged":[{"path":"src/login.vue","action":"created"}],"testResult":{"passed":true,"typeCheck":true,"details":"all clean"}}'

# 7. 取下一个
curl http://localhost:3201/api/agent/next-task -H "x-agent-key: qcl_xxx"
```

### 环境异常（上报跳过，取下一个）

```bash
# 场景A：当前分支有未提交代码
curl -X POST http://localhost:3201/api/agent/task/a1b2c3d4-xxxx-yyyy-zzzz/question \
  -H "x-agent-key: qcl_xxx" \
  -H "Content-Type: application/json" \
  -d '{"question": "当前分支有未提交代码，无法切换分支。请处理后重新入队"}'
# → 立即取下一个任务

# 场景B：分支合并冲突
curl -X POST http://localhost:3201/api/agent/task/a1b2c3d4-xxxx-yyyy-zzzz/question \
  -H "x-agent-key: qcl_xxx" \
  -H "Content-Type: application/json" \
  -d '{"question": "分支 feature/login 合并 main 时有冲突，文件: src/auth.ts, src/router.ts。请处理后重新入队"}'
# → 立即取下一个任务
```

### 需求不清楚

```bash
# 提交疑问，任务移出队列
curl -X POST http://localhost:3201/api/agent/task/a1b2c3d4-xxxx-yyyy-zzzz/question \
  -H "x-agent-key: qcl_xxx" \
  -H "Content-Type: application/json" \
  -d '{"question": "需求中提到的「用户中心」找不到对应模块"}'

# 立即取下一个，不要等
curl http://localhost:3201/api/agent/next-task -H "x-agent-key: qcl_xxx"
```

---

## 十一、Git 操作规范

| 操作 | 允许 |
|---|---|
| `git status` / `git diff` / `git log` | 是，查看用 |
| `git fetch` / `git pull` | 是，拉取最新代码（必须先做） |
| `git add` / `git commit` | 是，提交代码 |
| `git checkout -b` / `git branch` | 是，管理分支 |
| `git merge main` | 是，开发分支合并最新主分支代码 |
| `git stash` / `git stash pop` | 是，暂存/恢复改动 |
| **`git push`** | **禁止** |
| **`git push --force`** | **禁止** |
| **`git reset --hard`** | **禁止** |
| **`git clean`** | **禁止** |

---

## 十二、错误处理

| 场景 | 你做什么 |
|---|---|
| `project.path` 不存在 | 上报日志 `"项目路径不存在: xxx"`，不调 complete |
| `requirement` 全为空 | 上报日志 `"缺少需求描述"`，提交 question |
| 编译错误修不好 | 上报日志说明已尝试的修复方式 |
| 测试失败但不是你引入的 | 上报日志列出失败用例，继续完成你的任务 |
| 需要改数据库 | 上报日志等人确认，不要自己改 |
| 需求和已有功能冲突 | 提交 question 说明冲突点 |
