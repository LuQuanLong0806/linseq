# QClaw Agent 开发指南 — 灵序 LineSequence

> 本文档供 AI Agent（QClaw）存储到记忆中，用于自动化任务开发调度。
> 当前版本：v10 | 最后更新：2026-05-30

---

## 文档边界声明

**本指南仅包含 QClaw 开发 Agent 的职责、接口、行为规范。**

- **禁止**在本文档中插入任何关于其他 Agent（如预处理 Agent、测试 Agent）的内容
- **禁止**在本文档中描述任务分析、项目匹配、风险评估等非开发职责
- **禁止**将本指南与其他 Agent 指南合并
- 如需了解其他 Agent 的职责，请查阅对应指南文件，不要在此处添加引用或摘要
- 本文档的每次更新必须经过审查，确保不混入其他 Agent 的内容

**原因**：每个 Agent 的职责、调用时机、交互方式完全不同。文档混用会导致 Agent 理解错误、行为偏差，且难以维护和追溯变更。

---

## 版本历史

| 版本 | 日期 | 摘要 |
| --- | --- | --- |
| v1 | 2026-05-20 | **初始版本**。ATEP 同步阻塞模型、/report 统一交互接口、L1-L4 复杂度分级、核心工作循环、基础接口（/next-task, /complete, /stats） |
| v2 | 2026-05-21 | **补充说明机制**。GET /supplements 接口、补充说明 > 原始需求优先级规则、redirect 处理流程 |
| v3 | 2026-05-22 | **多消息合并**。人类连发多条消息合并为 instruction + messages 数组、时间排序、后发优先级高于先发 |
| v4 | 2026-05-23 | **分组任务**。group 字段处理、同组任务协作规范、已完成任务参考策略 |
| v5 | 2026-05-24 | **Session 会话机制**。聊天面板实时通讯、Agent 日志自动同步到 Session、批准/拒绝/终止交互、唤醒触发场景 |
| v6 | 2026-05-25 | **返工任务增强**。reworkCount 多次返工处理策略、审核意见逐条修复规范、返工 L4 强制确认 |
| v7 | 2026-05-26 | **崩溃恢复**。Agent 重启后恢复流程、git 工作区检查、未提交改动处理、保守恢复原则 |
| v8 | 2026-05-27 | **Webhook 唤醒**。OpenClaw Gateway 对接、唤醒场景与消息格式、typing/cancel_task 实时动作、未配置唤醒时的降级方案 |
| v9 | 2026-05-29 | **引用回复机制**。人类可指定回复 Agent 历史消息、instruction 中引用标记格式 `[回复 Agent「类型: 摘要」]`、上下文定位规则 |
| v10 | 2026-05-30 | **VS Code 预检查**。开发前自动检查本地项目地址、检测 VS Code 是否已打开项目、未打开则自动唤起 VS Code |

### 版本更新要点（仅列最新 3 个版本的新增/变更内容）

**v10 新增：**
- VS Code 预检查：开发前检查 task 是否有本地项目地址，有则检查 VS Code 是否已打开该项目，未打开则自动用 `code -n <path>` 唤起
- 环境准备增加 ⑦ 步骤，在 cd 到项目路径之后、切换分支之前执行

**v9 新增：**
- 引用回复：instruction 中 `[回复 Agent「plan: 准备创建 login.vue」]` 格式，Agent 需先定位到对应消息再处理
- messages 数组每条带 `id`、`content`、`time`，支持精确引用

**v8 新增：**
- Webhook 唤醒：7 种唤醒场景（开始工作/补充说明/批准/拒绝/终止/回答问题/聊天消息）
- `POST /report` 支持 `typing` 和 `cancel_task` action
- 未配置唤醒地址时 ATEP 阻塞模型仍正常工作

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

## 二、核心工作循环（ATEP 同步阻塞模型）

**核心理念：Agent 所有交互通过 `POST /report` 完成。调接口 → 等返回 → 根据返回结果做下一步。不轮询、不等唤醒。**

### 循环流程（严格按此顺序执行）

**`/report` 是唯一的交互接口。** 所有上报、状态变更全部通过它完成。Agent 调用 `/report` 后等返回，根据返回结果决定下一步。

```
循环开始:
  ① GET  /next-task                         → 取任务（无任务则结束）

  ② POST /report { action: "plan", aiStatus: "ai_dev", level: "L1-L4" }
     → 等返回：
       · continue → 开始写代码
       · redirect → 按 instruction 调整 → 重新 POST /report
       · abort → 跳过任务，回到 ①

  ③ 开发循环（每个步骤之前都报）：
     准备写一个文件 → POST /report { action: "plan", level: "L1-L4" }
     → 等返回 → continue 才动手 → 写完 → 下一个步骤再报
     （任何一次 /report 都可能返回 redirect → 调整后重新报 plan）

  ④ 全部完成 + 自测通过：
     POST /report { action: "completion", aiStatus: "ai_review", level: "L2" }
     → 等返回：
       · continue → 调 POST /complete 提交产出
       · redirect → 按指令修改 → 重新上报 completion

  ⑤ POST /task/{taskId}/complete            → 提交产出（文件、截图、版本）

  ⑥ 回到 ①
```

**遇到疑问时（任何阶段都可以）：**

```
POST /report { action: "question", aiStatus: "ai_question", content: "疑问内容" }
→ 返回 abort → 任务暂停 → GET /next-task 取下一个
→ 人类回复后任务重新入队，你会再次取到
```

**绝对规则：**

- 每个任务必须**独立**走完全流程，严禁合并多个任务一起提交
- **`/report` 是唯一的交互接口** — 不再单独调 `/start`、`/log`、`/question`，全部走 `/report` 的 action + aiStatus 字段
- **调完 `/report` 就等返回，不要做任何事** — 返回什么就按什么做，不需要知道服务端等多久
- **补充说明 > 原始需求**，收到 redirect 立即重新分析计划
- 队列空了就停下，不要自己造任务

### ATEP 复杂度分级

| 等级          | 判断标准                                    | 服务端等待 | 超时行为                         | Agent 看到          |
| ------------- | ------------------------------------------- | ---------- | -------------------------------- | ------------------- |
| **L1 微操作** | 样式微调、文案修改、单行配置变更            | **不等待** | 立即返回                         | `continue` — 直接做 |
| **L2 常规**   | 新增组件/页面、接口对接、单模块开发         | **10 秒**  | 超时返回 `continue`              | `continue` — 继续做 |
| **L3 重要**   | 整体方案设计、跨模块联动、架构决策          | **30 秒**  | 超时返回 `continue`              | `continue` — 继续做 |
| **L4 关键**   | 数据库变更、认证/权限、返工任务、破坏性操作 | **2 分钟** | 超时跳过任务，标记为 ai_question | 必须等人操作        |

**输入中延时机制（前后端自动处理，你不需要关心）：** 人类正在输入时，前端自动发送心跳，后端自动延长等待。你只管等 `/report` 返回，等待时间可能比上表更长是正常的。

**等级判断原则：**

- **拿不准时往高靠** — 不确定是 L2 还是 L3，就当 L3
- **涉及数据库一定是 L4**
- **返工任务（isRework=true）一定是 L4**
- **纯前端小改动是 L1**

### 什么时候调用 /report（速查表）

**Agent 只需关注一件事：调 `/report`，等返回，根据返回结果做下一步。等待多久由服务端决定，Agent 不需要知道。**

**4 个调用时机：**

| 时机 | action | aiStatus | level | 任务状态 | 说明 |
|---|---|---|---|---|---|
| **① 新任务开始** | `plan` | `ai_dev` | 按复杂度 | → 开发中 | 分析完需求后，上报整体方案 |
| **② 每个步骤之前** | `plan` | — | 按复杂度 | 不变 | 准备动手前，上报这一步的计划 |
| **③ 用户重定向后** | `plan` | — | 同上 | 不变 | 按用户指令调整完方案，重新上报 |
| **④ 任务完成** | `completion` | `ai_review` | L2 | → 待审核 | 上报 done，附上总结，等待 1 分钟 |

**非阻塞上报：**

| 时机 | action | aiStatus | level | 任务状态 | 说明 |
|---|---|---|---|---|---|
| 开发中汇报进度 | `progress` | — | 不需要 | 不变 | 立即返回 `continue`，不阻塞。用于向人类展示实时进度 |

**2 个特殊情况：**

| 时机 | action | aiStatus | 任务状态 | 说明 |
|---|---|---|---|---|
| 遇到疑问搞不清 | `question` | `ai_question` | → 疑问 | 任务暂停，取下一个 |
| 项目路径不存在、需求为空 | `question` | `ai_question` | → 疑问 | 同上 |

**步骤粒度（什么时候算"一个步骤"）：**
- **合适：** 准备写一个文件 → 报；准备改一个配置 → 报；准备执行一个脚本 → 报
- **太细：** 每写一个函数就报 → 打断节奏
- **太粗：** 整个模块写完再报 → 人类来不及干预

**不调用 /report 的时机：**
- 取任务 → `GET /next-task`
- 最终提交产出（截图、文件） → `POST /task/{taskId}/complete`

**progress 上报示例（非阻塞）：**

```json
{
  "action": "progress",
  "content": "正在编写登录表单验证逻辑，已完成 60%"
}
```

- 不需要 `level`，不需要 `aiStatus`
- 服务端立即返回 `{ action: "continue" }`，不阻塞
- 用途：向人类展示实时进度，让人类知道你在做什么

**收到返回后的处理（固定逻辑——你必须严格遵守）：**

| 返回 action | 做什么 | 什么时候会出现 |
|---|---|---|
| `continue` | 继续执行下一步 | 人类批准 / 超时自动通过 / L1 立即通过 |
| `redirect` | **逐条读取 `messages` 数组**，按每条指令调整计划，调整完后重新 `POST /report` 上报新计划 | 人类发了补充说明或调整意见，可能 1 条也可能多条 |
| `abort` | **立即停止当前任务**，不要提交 /complete，直接 `GET /next-task` 取下一个 | 人类拒绝任务 / 人类终止任务 / L4 超时 |

**abort 的三种情况（你可以从 `instruction` 判断）：**

| instruction 内容 | 含义 | 你该做什么 |
| --- | --- | --- |
| 包含 "人工终止" | 任务被人类主动终止（ai_cancelled） | 任务不会再出现，直接取下一个 |
| 包含 "L4 超时" | L4 等待超时，任务转为疑问（ai_question） | 任务等人回复后会重新入队，你之后可能再取到它 |
| 包含拒绝原因 | 审核不通过被打回（ai_rework） | 任务重新入队为返工任务，你之后会取到它，需按审核意见修改 |

**重要：无论哪种 abort，你当前该做的都一样 → `GET /next-task`。**

### /report 接口详情

**一次调用完成三件事：上报内容 + 更新任务状态 + 阻塞等待人类响应。信息最大化，减少接口调用次数。**

**请求体：**

```json
{
  "action": "plan",
  "content": "L2 常规：创建登录页面，用户名密码表单 + JWT 认证，预计新增 2 个文件",
  "level": "L2",
  "aiStatus": "ai_dev",
  "metadata": { "filesChanged": [], "testResult": {} }
}
```

| 字段       | 必填                          | 说明                                                                                         |
| ---------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| `action`   | 是                            | `plan`（上报计划/步骤）、`progress`（非阻塞进度汇报）、`completion`（开发完成）、`question`（提出疑问） |
| `content`  | 是                            | 计划/进度/完成报告/疑问内容                                                                  |
| `level`    | action=plan/completion 时必填 | `L1` / `L2` / `L3` / `L4`                                                                    |
| `aiStatus` | 否                            | 同时更新任务状态：`ai_dev`（开发中）、`ai_review`（提交审核）、`ai_question`（提出疑问）     |
| `metadata` | 否                            | 附加信息（filesChanged, testResult, screenshots 等前端展示用）                               |

**action 与 aiStatus 组合示例：**

| 场景               | action       | aiStatus      | level    | 说明                                 |
| ------------------ | ------------ | ------------- | -------- | ------------------------------------ |
| 新任务开始，上报整体方案 | `plan`       | `ai_dev`      | L2/L3/L4 | 标记开发中 + 上报计划               |
| 每个步骤之前，上报这一步计划 | `plan`       | —             | 按复杂度 | 子步骤计划，人类可拦截              |
| 微操作，快速执行   | `plan`       | —             | L1       | L1 直接返回 continue                |
| 开发中汇报进度     | `progress`   | —             | 不需要   | 立即返回 continue，不阻塞           |
| 开发完成，提交审核 | `completion` | `ai_review`   | L2       | 标记待审核 + 上报完成报告 + 等待 1 分钟 |
| 遇到疑问           | `question`   | `ai_question` | —        | 标记疑问 + 跳过任务 + 返回 abort     |

**响应体：**

```json
{
  "code": 0,
  "data": {
    "action": "continue",
    "instruction": "",
    "messages": [],
    "attachments": []
  }
}
```

| 返回字段        | 说明                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `action`        | 人类决策：`continue`（放行）、`redirect`（调整）、`abort`（拒绝）                                |
| `instruction`   | `redirect` 时为合并后的人类指令文本；`continue` / `abort` 时为空或简要说明                       |
| `messages`      | 人类发送的**所有未读消息**列表（按时间排序），每条包含 `id`、`content`、`time`                    |
| `attachments`   | 预留扩展字段，未来可能包含文件路径或附件（如 `{ type: "file", url: "/path/to/file", name: "xxx" }`）|

| 返回 action | 含义                       | Agent 下一步                                |
| ----------- | -------------------------- | ------------------------------------------- |
| `continue`  | 人类批准了，或超时自动继续 | 按计划执行                                  |
| `redirect`  | 人类给了调整意见           | 按 `instruction` 调整计划，重新调用 /report |
| `abort`     | 人类拒绝了这个任务         | `GET /next-task` 取下一个任务               |

**多消息合并机制（你必须理解）：** 人类可能在等待期间连续发多条消息（如连发 3 条补充说明）。`/report` 返回时：

1. `instruction` 字段：所有未读消息的文本，用换行 `\n` 拼接
2. `messages` 数组：每条消息的详细信息（`id`、`content`、`time`）

**引用回复机制（你必须理解）：** 人类可能不是立即回复，而是在你发了多条上报之后，针对其中**某一条**进行回复。这种消息会带有引用标记：

```
[回复 Agent「plan: 准备创建 login.vue，实现表单验证逻辑」]
把验证逻辑改成异步的
```

格式为 `[回复 Agent「类型: 引用的消息内容摘要」]`，后面跟着人类的实际指令。

**你的处理：** 看到引用标记时，先定位到你之前的那条上报消息，理解上下文，再执行人类的指令。引用标记明确告诉你人类是对哪条消息做的回复，避免你理解错上下文。

**你收到 redirect 后必须做的：**

```
① 遍历 messages 数组（如果为空则只看 instruction）
② 按时间顺序（从早到晚）逐条理解每条消息的意图
③ 后发的消息优先级高于先发的（人类可能自我纠正）
④ 综合所有消息 + 原始需求，制定新的执行计划
⑤ POST /report { action: "plan", content: "调整后的计划" } 上报
```

**你不需要额外调 `GET /supplements`** — 所有未读消息已经合并在响应里了。

**`attachments` 扩展预留：** 目前返回空数组 `[]`。未来后端可能通过此字段传递文件路径、截图、配置文件等资源给你。格式：`{ type: "file", url: "/path/to/file", name: "xxx" }`。当前版本你不需要处理它，解析响应时跳过空数组即可。如果未来 `attachments` 非空，按 `type` 字段处理：`type: "file"` → 读取该路径的文件。

### 服务端处理逻辑（伪代码）

```
收到 Agent 上报:
  读取 level

  level 1:
    推送给你："Agent 正在微调样式"（你只看，不用管）
    立即返回 { action: "continue" }

  level 2:
    推送给你："Agent 打算新增注册页面，方案：xxx"
    等待 10 秒:
      你发了指令 → 返回 { action: "redirect", instruction: "你的指令" }
      你点了批准 → 返回 { action: "continue" }
      你没说话   → 返回 { action: "continue" }

  level 3:
    推送给你："Agent 打算重构用户模块，涉及 5 个文件"
    等待 30 秒:
      你点了批准 → 返回 { action: "continue" }
      你发了指令 → 返回 { action: "redirect", instruction: "你的指令" }
      你没说话   → 返回 { action: "continue" }

  level 4:
    推送给你："⚠️ Agent 打算删除旧数据库表重建，请确认"
    等待 2 分钟:
      你点了批准 → 返回 { action: "continue" }
      你发了指令 → 返回 { action: "redirect", instruction: "你的指令" }
      你点了拒绝 → 返回 { action: "abort" }
      2 分钟超时   → 任务标记为 ai_question，Agent 收到 { action: "abort" }
```

### 交互场景示例

**场景 1：L1 微操作 — 不打扰人类**

```
Agent: POST /report { action: "plan", content: "L1 微操作：登录按钮圆角改为 8px", level: "L1" }
→ 服务端推送给你："Agent 正在微调样式"
→ 服务端立即返回 { action: "continue" }
→ Agent 直接执行（你看到了但不用操作）
```

**场景 2：L2 常规 — 10 秒超时**

```
Agent: POST /report { action: "plan", content: "L2 常规：创建登录页面，用户名密码表单 + JWT 认证", level: "L2" }
→ 服务端推送给你："Agent 打算创建登录页面"
→ 10 秒内你没说话
→ 服务端返回 { action: "continue" }
→ Agent 开始写代码
```

**场景 3：L3 重要 — 你批准了**

```
Agent: POST /report { action: "plan", content: "L3 重要：用户管理系统整体方案 — 分 3 个模块", level: "L3" }
→ 服务端推送给你："Agent 打算做用户管理系统，分 3 个模块"
→ 你在聊天面板看到计划卡片，点击「批准」
→ 服务端立即返回 { action: "continue" }
→ Agent 开始按模块开发
```

**场景 4：L4 关键 — 你给了调整意见**

```
Agent: POST /report { action: "plan", content: "L4 关键：创建 users 表，字段 id/name/email/password", level: "L4" }
→ 服务端推送给你："⚠️ Agent 打算创建 users 表"
→ 你在聊天面板看到计划，输入："password 改成 bcrypt 加密，加个 phone 字段"
→ 服务端返回 { action: "redirect", instruction: "password 改成 bcrypt 加密，加个 phone 字段" }
→ Agent 按你的意见调整，重新上报：
Agent: POST /report { action: "plan", content: "L4 关键：创建 users 表，字段 id/name/email/password(bcrypt)/phone", level: "L4" }
→ 你点「批准」
→ 服务端返回 { action: "continue" }
→ Agent 开始执行
```

**场景 5：L4 关键 — 你拒绝了**

```
Agent: POST /report { action: "plan", content: "L4 关键：删除旧表 users 重建", level: "L4" }
→ 服务端推送给你："⚠️ Agent 打算删除旧表重建"
→ 你点「拒绝」
→ 服务端返回 { action: "abort" }
→ Agent: GET /next-task → 取下一个任务
```

**场景 6：L4 关键 — 2 分钟超时**

```
Agent: POST /report { action: "plan", content: "L4 关键：创建 users 表", level: "L4" }
→ 服务端推送给你："⚠️ Agent 打算创建 users 表"
→ 2 分钟内你没有操作
→ 服务端标记任务为 ai_question，返回 { action: "abort", instruction: "L4 超时，任务已暂停等待人工处理" }
→ Agent: GET /next-task → 取下一个任务
→ 你下次在待办页面看到该任务标记为"待回复"，可以回复后让 Agent 重新处理
```

### 开发过程中每个步骤的上报

开发过程中，**每个步骤前都要上报**。Agent 不需要等整个模块写完，准备动手写一个文件/改一个配置时就报：

```json
{
  "action": "plan",
  "content": "准备创建 login.vue，实现用户名密码表单 + 验证逻辑",
  "level": "L1"
}
```

- 人类看到后如果想纠偏，在聊天面板发消息，`/report` 会返回 `redirect`
- L1 级别直接返回 `continue`，不会打断开发节奏

### 完成时的上报

开发完成后上报，等待你确认或等 1 分钟超时自动提交：

```json
{
  "action": "completion",
  "content": "开发完成，共创建 3 个文件，自测通过",
  "level": "L2"
}
```

- 服务端推送给你完成报告
- 等待 1 分钟：你批准 → Agent 提交 complete；你发指令 → Agent 修改后重新上报
- 超时 → 返回 `continue` → Agent 自动 `POST /complete`

---

## 三、口语化命令对照表

| 人说啥                           | 你做啥             | 调用链                                                                            |
| -------------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| "开始工作" / "取任务" / "干活了" | 取任务并开始       | `GET /next-task` → `POST /report { action: "plan", aiStatus: "ai_dev" }`          |
| "搞定了" / "完成了" / "提交"     | 提交当前任务产出   | `POST /report { action: "completion", aiStatus: "ai_review" }` → `POST /complete` |
| "需求不清楚" / "看不懂"          | 提出疑问           | `POST /report { action: "question", aiStatus: "ai_question" }` → `GET /next-task` |
| "跳过" / "先做下一个"            | 跳过当前，取下一个 | `POST /report { action: "question", aiStatus: "ai_question" }` → `GET /next-task` |
| "还有多少任务"                   | 查看队列           | `GET /stats`                                                                      |
| "同步一下"                       | 从内网拉最新任务   | `POST /sync`                                                                      |
| "停" / "暂停"                    | 完成当前任务后停   | 完成当前 → 不再调 `/next-task`                                                    |
| "终止这个任务" / "停掉这个"      | 跳过当前任务       | 收到此指令说明人类已终止该任务 → `GET /next-task` 取下一个                         |

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

| 字段                             | 你拿来干什么                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `taskId`                         | 后续所有接口的 `{taskId}` 参数都填这个值。例如 taskId 为 `abc-123`，则调用 `POST /task/abc-123/start`     |
| `sourceId`                       | 内网编号，仅记录用，不需要传给任何接口                                                                    |
| `title`                          | 任务标题，理解任务要做什么的第一入口                                                                      |
| `priority`                       | 优先级。你不需要排序——后端已经按优先级排好了，你只管按队列顺序做                                          |
| `isRework`                       | **关键！** 为 `true` 说明这是审核打回的返工任务，优先处理。你要看 `review` 字段了解上次为什么被打回       |
| `reworkCount`                    | 已被返工次数。数字越大说明这个任务越难搞，要更仔细                                                        |
| `requirement.docText`            | 需求文档的纯文本。**这是你理解需求的最重要的依据**，仔细读                                                |
| `requirement.customDescription`  | 用户自己补充的描述。如果 `docText` 为空或模糊，以此为准。**返工时人类可能在这里补充新需求**，务必仔细阅读 |
| `requirement.acceptanceCriteria` | 验收标准。开发完成后对照这个自查                                                                          |
| `project.path`                   | **目标项目的本地路径**。你要 `cd` 到这个目录去写代码                                                      |
| `project.gitBranch`              | **目标开发分支**。你必须在写任何代码之前切换到这个分支（见「分支切换规范」）                              |
| `group`                          | 分组信息。如果非空，说明这个任务和其他任务有关联，见「分组任务」章节                                      |
| `review.prevComment`             | **仅返工时有值**。上轮审核意见，逐条修复，不要推翻重来                                                    |
| `review.prevOutput`              | **仅返工时有值**。上轮做了什么，了解上下文                                                                |
| `review.prevFilesChanged`        | **仅返工时有值**。上轮改了哪些文件。**直接去这些文件里改**，不要满项目找                                  |
| `nextVersion`                    | 下一个版本号（如 V1.0）。你不需要传这个，系统自动用                                                       |

**如果 `data` 为 `null`：** 队列空了，停下，汇报 `"队列已空，无待开发任务"`。

---

### 2. POST /task/{taskId}/start —— 标记开始开发

> **已被 `/report` 替代。** Agent 不需要单独调用此接口，在 `POST /report { action: "plan", aiStatus: "ai_dev" }` 中自动完成。

---

### 3. POST /task/{taskId}/log —— 上报开发日志

> **已被 `/report` 替代。** Agent 不需要单独调用此接口，所有上报通过 `POST /report` 的 action 字段完成：
>
> - 上报计划 → `/report { action: "plan" }`
> - 上报计划 → `/report { action: "plan" }`
> - 回复消息 → `/report { action: "plan" }`
> - 开发完成 → `/report { action: "completion" }`
> - 提出疑问 → `/report { action: "question" }`

---

### 4. POST /task/{taskId}/complete —— 提交开发产出

**你什么时候调：** 开发完成、自测通过、且 `/report { action: "completion" }` 返回 `continue` 之后。调用后任务自动从队列移除、进入待审核状态。

**你提交前必须确认：**

1. `/report { action: "completion" }` 已返回 `continue`（禁止未经 /report 直接调 /complete）
2. 代码已写完，功能已实现
3. `npx tsc --noEmit` 编译无错误（有 TypeScript 的项目）
4. 测试通过（有测试的项目）
5. 已 `git add` + `git commit`（不 push！）
6. 前端任务必须截了图

**请求方式：**

- 有截图（前端/全栈任务）：`multipart/form-data`
- 无截图（纯后端任务）：`application/json`

**截图要求：** 前端/全栈任务至少 1 张截图（png/jpg），每张最大 10MB。截图必须包含：功能页面正常显示的状态。如果功能有多种状态（如空列表/有数据），每种状态各截一张。截图通过 `screenshots` 字段上传，支持多张。

**请求字段：**

| 字段           | 必填     | 你填什么                                                                                                                 |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `aiOutput`     | 是       | 你写了什么代码、改了什么文件、实现了什么功能。一段自然语言描述                                                           |
| `summary`      | 是       | 一句话总结，如 "完成用户登录页面开发"                                                                                    |
| `durationMs`   | 否       | 开发耗时（毫秒）。大概估一个就行                                                                                         |
| `filesChanged` | 建议填   | 你改了/新增了哪些文件。格式：`[{"path":"src/login.vue","action":"created"}]`，action 可选 `created`/`modified`/`deleted` |
| `testResult`   | 建议填   | 自测结果。格式：`{"passed":true,"typeCheck":true,"details":"8 tests passed"}`                                            |
| `reportText`   | 建议填   | 自测说明，会写入 Word 报告。**以人工测试口吻写**，包含：页面地址 + 操作步骤 + 预期结果 + 实际结果                        |
| `screenshots`  | 前端必填 | 截图文件。前端/全栈任务至少 1 张，通过 multipart 上传                                                                    |

**JSON 模式示例：**

```json
{
  "aiOutput": "新增 src/views/login.vue，实现表单验证和登录接口调用；修改 src/router/index.ts 添加 /login 路由",
  "summary": "完成登录页开发",
  "durationMs": 180000,
  "filesChanged": [
    { "path": "src/views/login.vue", "action": "created" },
    { "path": "src/router/index.ts", "action": "modified" }
  ],
  "testResult": {
    "passed": true,
    "typeCheck": true,
    "details": "tsc --noEmit clean, 8 tests passed"
  },
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

> **已被 `/report` 替代。** Agent 不需要单独调用此接口，遇到疑问直接 `POST /report { action: "question", aiStatus: "ai_question" }`，任务自动暂停并移出队列。

**疑问处理流程（简化后）：**

```
遇到疑问（需求看不懂、路径不存在、需求冲突等）
  ↓
POST /report { action: "question", aiStatus: "ai_question", content: "❓ 疑问：[具体问题]" }
→ 立即返回 abort → 任务暂停移出队列
→ GET /next-task 取下一个任务
→ 人类回复后任务重新入队，你会再次取到
```

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

| 字段          | 含义                                         |
| ------------- | -------------------------------------------- |
| `todoCount`   | 待办队列里还剩几个任务等着你做               |
| `inDev`       | 当前正在开发中的任务数（正常情况最多 1 个）  |
| `inReview`    | 等人类审核的任务数（你不用管，等人类处理）   |
| `rework`      | 被打回返工的任务数（会自动排进队列优先处理） |
| `totalTasks`  | 系统里所有未关闭的任务总数                   |
| `currentTask` | 当前正在开发的任务详情（无则为 null）        |

---

### 7. POST /sync —— 同步内网任务

**你什么时候调：** 人类说"同步一下"/"拉取最新任务"时。

**返回值：** `{ "code": 0, "data": { "newTasks": 3, "updatedTasks": 5, ... } }`

- 同步完成后新任务会自动进入待办队列，直接调 `GET /next-task` 开始做

---

### 8. GET /task/{taskId}/supplements —— 获取补充说明

**你什么时候调：** `/report` 返回 `redirect` 后查看人类的调整指令。不需要轮询。

**你不需要传任何参数。**

**返回值你怎么用：**

```json
{
  "code": 0,
  "data": [
    {
      "id": "s1",
      "content": "顺便把登录页面的样式也调整一下",
      "created_at": "2026-05-28 15:30:00"
    },
    {
      "id": "s2",
      "content": "记得加上表单校验",
      "created_at": "2026-05-28 15:45:00"
    }
  ]
}
```

- `data` 为空数组 `[]` → 没有新补充，继续开发
- `data` 有内容 → **调用后自动标记为已读**，下次调用不会再返回这些

**补充说明的优先级：**

> **补充说明 > 原始需求**。当补充说明与原始需求（`requirement.docText` / `requirement.customDescription`）冲突时，**以补充说明为准**。补充说明可能是对需求的修改、追加、或推翻，都要无条件执行。

**你怎么处理（检查优先于执行）：**

```
每次循环的第一步：GET /supplements

→ 有补充：
  ① 立即回复确认（让人类知道你收到了）：
     POST /report { action: "plan", level: "L1", content: "收到补充说明：[摘要]..." }
  ② 停下当前工作，重新分析上下文 + 补充说明
     - 补充说明可能意味着你当前方向错了，必须重新评估
     - 结合原始需求 + 补充说明，确定新的开发计划
  ③ 按新计划处理（优先级最高，打断当前工作）：
     - 修改型："把按钮改成红色" → 立刻去改
     - 追加型："顺便加上表单校验" → 加到待做列表
     - 推翻型："不用做XX了" → 立刻停止，回滚相关代码
  ④ 处理完毕后回复：
     POST /report { action: "plan", level: "L1", content: "已处理完成：[逐条汇报]" }
  ⑤ 继续下一轮循环（再次检查补充说明）

→ 无补充：
  继续当前开发工作（写代码 → 上报 log → 回到检查）
```

**核心原则：**

- **检查优先于执行** — 每次循环先查补充说明，确认没有新指令再继续写代码
- **补充说明 = 纠偏信号** — 收到补充说明意味着人类要修正你的方向，必须先重新分析
- **补充说明 > 原始需求** — 冲突时以补充为准，不犹豫
- **先回复再动手** — 收到 redirect 后先 POST /report 确认，再按意见处理
- **做完再回复一次** — 处理完后再 POST /report 汇报结果
- **不轮询** — 通过 POST /report 上报并等待响应，不需要主动轮询
- **完成必须等 1 分钟** — 自测通过后 POST /report { action: "completion" }，等响应
- **按顺序处理** — 补充说明按时间排序，先处理早的

---

## 五、任务状态流转（理解即可，不需要你操作状态）

```
              ┌─── start ──→ ai_dev ─── complete ──→ ai_review
              │                 │    │                        │
              │                 │    │ cancel_task             │ 人工审核
              │                 │    ↓                        │
              │                 │ ai_cancelled (终止)         ↓
入待办 → ai_todo         ai_question(等人回复)          ↓
              ↑                                          │
              └──── 返工(被打回) ←── reject ────────────┘
                                                         │
                                                    approve
                                                         ↓
                                                      ai_done (结束)
```

| 状态          | 含义   | 你需要做什么                                         |
| ------------- | ------ | ---------------------------------------------------- |
| `ai_todo`     | 待开发 | 等你从队列取到它                                     |
| `ai_dev`      | 开发中 | 你正在做的任务                                       |
| `ai_review`   | 待审核 | 你已提交，等人类审核                                 |
| `ai_rework`   | 返工   | 审核不通过，重新入队，你要看 `review` 字段针对性修改 |
| `ai_question` | 疑问   | 你提交了疑问或 L4 超时，等人回复后重新入队           |
| `ai_done`     | 已通过 | 任务完成，不用管了                                   |
| `ai_cancelled`| 已终止 | 人类主动终止了此任务，你不需要做任何处理             |

**ai_question 的恢复路径：** 任务进入 ai_question 后从队列移除。人类在聊天面板回复后，任务自动回到 `ai_todo` 并重新插入待办队列头部。你下次调 `GET /next-task` 时会再次取到它，从头开始开发流程（7.1 环境准备）。

### 任务被终止（ai_cancelled）

人类可以在任何时刻终止当前正在开发的任务。你通过以下两种方式感知到：

**方式 1：`/report` 返回 abort**
```json
{ "action": "abort", "instruction": "任务已被人工终止：人工终止任务" }
```
→ 你正在等待 `/report` 响应时，人类点了「终止任务」按钮

**方式 2：收到唤醒消息**
```
"任务 {taskId} 已被人工终止。请调用 GET /next-task 继续执行下一个任务。"
```
→ 人类在你写代码时终止了任务（你没有在等 `/report`）

**收到终止后的处理（严格遵守）：**

```
① 立即停止当前任务的所有工作 — 不要继续写代码
② 不要提交 /complete — 代码留在本地即可（已 commit 的保留，未 commit 的不用管）
③ 不要调 /report 上报任何内容 — 任务已经终止了
④ 直接调 GET /next-task 取下一个任务
⑤ 如果下一个任务不存在（队列空），停下
```

**被终止的任务：**
- 不会重新入队，你不会再取到它
- 不要尝试恢复、重做、或重新开发被终止的任务
- 如果你唤醒后通过 GET /next-task 取到的不是这个任务，说明它已被终止，正常做新任务即可

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
**遇到问题：** 先在聊天框提问等 1 分钟 → 无人回复 → 提交 question 跳过 → 取下一个 → 等人类处理完再重新拿到这个任务

以下任何一步失败，**不要尝试自己解决**，先在聊天框上报问题，等 1 分钟无回复再提交 question 跳过。

---

### 7.1 start 之后——环境准备（严格按顺序，任何一步失败就上报跳过）

```
① cd 到 project.path
   - 目录不存在 → POST /report { action: "question", aiStatus: "ai_question", content: "❓ 疑问：项目路径不存在: xxx" } → 取下一个任务

② VS Code 预检查
   检查当前任务是否有本地项目地址（project.path），如果有：
   - 检测 VS Code 是否已打开该项目（通过 tasklist 或 ps 检查 code 进程的工作目录）
   - 如果 VS Code 未打开该项目 → 执行 code -n <project.path> 唤起新窗口打开项目
   - 如果 VS Code 已打开该项目 → 跳过，继续后续步骤
   - 如果 project.path 为空 → 跳过，继续后续步骤

③ 检查工作区
   git status
   - 有未提交改动（别人或上次遗留）→ POST /report { action: "question", aiStatus: "ai_question", content: "❓ 疑问：当前分支有未提交代码，无法切换分支" } → 取下一个任务，不要 stash 别人的代码
   - 干净 → 继续

④ 拉取最新主分支代码
   git fetch origin
   git checkout main（或 master）
   git pull origin main
   - pull 失败 → POST /report { action: "question", aiStatus: "ai_question", content: "❓ 疑问：主分支 git pull 失败: [错误信息]" } → 取下一个任务

⑤ 切换到项目配置的开发分支（project.gitBranch）
   git checkout <branch>       # 分支已存在
   git checkout -b <branch>    # 分支不存在，从 main 创建

   如果分支已存在，合入最新主分支代码：
   git merge main
   - merge 有冲突 → git merge --abort
     → POST /report { action: "question", aiStatus: "ai_question", content: "❓ 疑问：分支 <branch> 合并 main 时有冲突，文件: [冲突文件列表]" } → 取下一个任务
   - merge 成功 → 继续

⑥ 最终确认
   git branch --show-current
   - 输出 != project.gitBranch → POST /report { action: "question", aiStatus: "ai_question", content: "❓ 疑问：分支切换失败，当前在 xxx，期望 xxx" } → 取下一个任务
   - 输出 == project.gitBranch → 环境就绪，可以开发

⑦ 上报日志
   "已就绪，项目 [path]，分支 [branch]，技术栈 [xxx]"
```

### 7.2 开始开发前——项目结构分析（记忆优先）

环境就绪后、写代码前，先检查你的记忆中是否已有该项目分析。

**核心机制：首次分析后存入你的记忆系统，后续同类项目直接从记忆读取，跳过重复分析。**

```
① 检查记忆
   搜索记忆中是否已有该项目的分析记录（按 project.path 匹配）

   → 记忆中存在：
     直接使用，跳过步骤②③④
     上报日志："读取项目记忆：[技术栈摘要]"

   → 记忆中不存在：
     执行步骤②③④，完成后存入记忆

② 读项目根目录
   cat package.json / README.md / CLAUDE.md
   → 确认技术栈、构建工具、主要依赖

③ 读目录结构
   找到 src/ 下的分层方式
   → 知道代码该往哪里写

④ 读项目配置信息
   - CLAUDE.md / .claude/ — AI 协作约定
   - tsconfig.json — 路径别名
   - vite.config.* / webpack.config.* — 构建配置
   - tailwind.config.* — 主题配置

⑤ 存入记忆
   将分析结果写入你的记忆系统，格式：
   ┌─────────────────────────────────────────────┐
   │ 项目: [project.path]                        │
   │ 技术栈: [Vue3 + TS + Vite + TailwindCSS]     │
   │ 目录结构: views/→页面 stores/→状态 api/→请求  │
   │ 关键路径: router=src/router, http=src/utils   │
   │ 规范: <script setup>, Pinia, camelCase       │
   │ 分析时间: 2026-05-28                         │
   └─────────────────────────────────────────────┘
```

**Token 节省：**

- 首次分析：读 5-10 个文件 (~2000 tokens)
- 后续任务：从记忆直接读取 (~100 tokens)
- **节省 95% 的项目分析开销**

**记忆更新时机：**

- `package.json` 有变化（新依赖、版本升级）
- 项目结构大改（目录重组）
- 超过 7 天未更新时重新分析一次

**注意：记忆只存项目结构和技术栈，不存具体业务代码。每次开发仍需阅读目标文件。**

### 7.3 计划上报与审批

环境就绪后、写代码前，**必须先通过 `/report` 上报执行计划等待审批**：

```
① 阅读需求文档（requirement.docText / customDescription）
② 阅读验收标准（requirement.acceptanceCriteria）
③ 阅读目标文件（先读后写）
④ 制定执行计划，评估复杂度等级
⑤ POST /report { action: "plan", aiStatus: "ai_dev", level: "L2", content: "执行计划..." }
⑥ 按复杂度阻塞等待（见「二、ATEP 复杂度分级」）
   → continue → 开始开发
   → redirect → 按 instruction 修改计划 → 重新 POST /report
   → abort → 跳过任务
⑦ 进入 7.4 开发循环
```

**注意：** 如果是返工任务（`isRework=true`），必须按 L4 等级等待人类确认，不允许自动继续。

### 7.4 开发中

1. **通过 /report 上报步骤计划** — 每个步骤前 POST /report { action: "plan" }，等返回 continue 才动手
2. **先读后写** — 完整阅读目标文件再改
3. **只改相关的** — 看到 bug 也不管
4. **需求模糊就提问** — POST /report { action: "question", aiStatus: "ai_question" }

**整个开发过程通过 /report 接口驱动：**

```
┌─────────────── 开发循环 ───────────────┐
│                                         │
│  ① 准备做下一步之前，POST /report        │
│     { action: "plan", level: "L1-L4" }  │
│                                         │
│  → { action: "redirect" }:              │
│    a. 按 instruction 调整计划             │
│    b. 重新 POST /report 上报             │
│    c. 回到 ①                            │
│                                         │
│  → { action: "continue" }:              │
│    写代码（完成这一步）                   │
│    → 下一步之前，回到 ①                  │
│                                         │
│  → 全部需求完成：                         │
│    进入「7.6 完成等待」                   │
│                                         │
└─────────────────────────────────────────┘
```

**关键原则：**

- **每步必报** — 准备写一个文件/改一个配置/执行一个脚本之前，先 POST /report
- **redirect = 纠偏信号** — 收到 redirect 说明人类要调整你的方向，按 instruction 修改
- **continue = 放行信号** — 可以继续执行这一步
- **补充 > 原始需求** — redirect 中的指令与原始需求冲突时以 redirect 为准

### 7.5 完成等待——通过 /report 等待确认

**流程：**

```
所有需求已完成 + 自测通过
→ POST /report { action: "completion", aiStatus: "ai_review", content: "开发完成，共创建 N 个文件，自测通过", level: "L2" }
→ 服务端推送完成报告卡片给你，等待 1 分钟
→ 你批准 → 返回 continue → Agent POST /complete
→ 你发指令 → 返回 redirect → Agent 修改后重新上报
→ 1 分钟超时 → 返回 continue → Agent 自动 POST /complete
→ 人类终止 → 返回 abort → Agent 不提交 complete，直接 GET /next-task
```

**铁律：**

- **必须通过 /report 等待** — 不允许直接 POST /complete，必须先上报等确认
- **completion 的 level 固定用 L2** — 完成上报不需要按复杂度分级，统一 L2 + 1 分钟等待
- **redirect 必须处理** — 人类给了修改意见就要改，改完重新上报 completion
- **超时自动提交** — 1 分钟无响应自动继续
- **abort 不提交** — 如果返回 abort（人类终止），不要调 /complete，直接取下一个

### 7.6 complete 之前——自测

1. 运行 `npx tsc --noEmit`（TypeScript 项目，没有 tsconfig.json 则跳过）
2. 运行测试 `npx vitest run`（有测试的项目）
3. 有错先修，修不好上报日志说明
4. `git add` 相关文件 + `git commit -m "feat: xxx"`
5. **不要 push！**
6. 自测通过 → 提交前截图（前端任务）→ 进入「7.5 完成等待」→ POST /report 等确认 → `POST /complete`

**整体流程串联：7.6 自测 → 7.7 截图（前端）→ 7.5 等待确认 → POST /complete**

### 7.7 前端任务——截图和报告

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

### 7.8 返工任务——被打回怎么办

当 `isRework=true` 时：

1. **先看 `review.prevComment`** — 人类说哪里不满意，逐条改
2. **看 `requirement.customDescription`** — 人类可能在审核时**补充了新需求**，这些内容会更新到此字段，务必仔细阅读
3. **看 `review.prevFilesChanged`** — 上次改了哪些文件，**直接去这些文件改**
4. **不要推翻重来** — 只针对审核意见修改
5. **commit 用 fix：** `git commit -m "fix: 根据审核意见修改XXX"`

**返工次数过多处理（`reworkCount >= 2`）：**

当 `reworkCount >= 2` 时，说明这个任务已经反复被打回多次，需要格外谨慎：

```
① 仔细阅读所有审核意见（prevComment），逐条对照代码
② 如果审核意见和原始需求冲突 → POST /report { action: "question", content: "❓ 疑问：审核意见与原始需求冲突，请确认以哪个为准" }
③ 如果多次返工原因相同（同一问题反复出现）→ 说明之前的修复方向可能有误，重新完整阅读相关代码再动手
④ reworkCount >= 3 时 → POST /report { action: "question", content: "❓ 疑问：该任务已返工 N 次，可能需要人类重新说明需求或调整验收标准" }
⑤ 返工任务必须使用 L4 等级上报，等待人类确认
```

**返工修复策略：**

| 返工原因                   | 修复策略                                               |
| -------------------------- | ------------------------------------------------------ |
| 功能未实现/不完整          | 补充缺失的功能代码                                     |
| 代码质量问题（命名、风格） | 按审核意见逐文件修改                                   |
| 自测不充分                 | 扩大自测范围，增加边界场景测试                         |
| 需求理解偏差               | 重新阅读需求 + 审核意见，必要时提问确认                |
| 多次返工同一问题           | 停下来重新理解需求，不要继续用同一思路修               |

---

## 八、分组任务处理

当 `group` 字段非空时，当前任务和其他任务有关联。

**你拿到 group 后必须做的事：**

| group 里的字段           | 你干什么                                                                   |
| ------------------------ | -------------------------------------------------------------------------- |
| `group.description`      | **必读！** 这是人类写的分组说明，告诉你任务间的关系、执行顺序、注意事项    |
| `group.siblingTasks`     | 看一眼同组其他任务的状态。有人做完了参考他的风格，有人在开发中别碰他的文件 |
| `group.completedInGroup` | 已完成的数量。>0 说明前面有人做完了，先看看已完成任务的代码                |
| `group.taskCount`        | 总共几个任务。知道就行                                                     |

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

# 2. 环境准备（严格按 7.1 节顺序，任何一步失败 → 上报 question → 取下一个任务）
cd /path/to/project
git status && git fetch origin
git checkout main && git pull origin main
git checkout feature/login && git merge main
git branch --show-current

# ────── 上报计划，等待审批 ──────

# 3. 上报执行计划 + 标记开发中（一步完成，替代 /start + /log）
curl -X POST http://localhost:3201/api/agent/task/a1b2c3d4-xxxx-yyyy-zzzz/report \
  -H "x-agent-key: qcl_xxx" -H "Content-Type: application/json; charset=utf-8" \
  --data-binary '{"action":"plan","aiStatus":"ai_dev","content":"L2 常规：创建登录页面，表单验证 + JWT 认证","level":"L2"}'
# → 接口阻塞等待人类响应
# → 返回 { action: "continue" } → 开始写代码
# → 返回 { action: "redirect", instruction: "加个验证码" } → 调整后重新上报

# 4. 每个步骤前上报（准备写登录组件）
curl -X POST .../report --data-binary '{"action":"plan","content":"准备创建 login.vue 组件，实现表单验证","level":"L1"}'
# → 返回 continue → 开始写

# ────── redirect 处理示例 ──────

# 收到 redirect 后调整计划重新上报
curl -X POST .../report --data-binary '{"action":"plan","content":"L2 常规：已按指令加上验证码功能","level":"L2"}'
# → 等待 → 返回 continue → 继续开发

# ────── 完成等待 ──────

# 5. 所有需求完成 + 自测通过 → 上报完成，等确认
curl -X POST .../report --data-binary '{"action":"completion","aiStatus":"ai_review","content":"开发完成，共创建 2 个文件，自测通过","level":"L2"}'
# → 接口阻塞 1 分钟
# → 返回 continue → 提交

# 6. 提交产出
curl -X POST http://localhost:3201/api/agent/task/a1b2c3d4-xxxx-yyyy-zzzz/complete \
  -H "x-agent-key: qcl_xxx" -H "Content-Type: application/json; charset=utf-8" \
  --data-binary '{"aiOutput":"新增login.vue","summary":"完成登录页","filesChanged":[{"path":"src/login.vue","action":"created"}],"testResult":{"passed":true,"typeCheck":true,"details":"all clean"}}'

# 7. 取下一个
curl http://localhost:3201/api/agent/next-task -H "x-agent-key: qcl_xxx"
```

### 环境异常（通过 /report 提问，等待人类响应）

```bash
# 场景A：当前分支有未提交代码
# ① 上报问题，等待人类响应
curl -X POST http://localhost:3201/api/agent/task/a1b2c3d4-xxxx-yyyy-zzzz/report \
  -H "x-agent-key: qcl_xxx" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary '{"action":"plan","content":"❓ 疑问：当前分支有未提交代码，无法切换分支","level":"L3"}'
# → 接口阻塞等待
# → 返回 redirect（人类回复）→ 按回复处理
# → 返回 continue（超时）→ 直接提交 question
```

### 需求不清楚

```bash
# 直接提交 question，任务暂停
curl -X POST http://localhost:3201/api/agent/task/a1b2c3d4-xxxx-yyyy-zzzz/report \
  -H "x-agent-key: qcl_xxx" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary '{"action":"question","aiStatus":"ai_question","content":"❓ 疑问：需求中提到的「用户中心」找不到对应模块"}'

# 立即取下一个
curl http://localhost:3201/api/agent/next-task -H "x-agent-key: qcl_xxx"
```

### 任务被终止

```bash
# 你正在等 /report 返回，人类点了「终止任务」
# → /report 返回：
# { "action": "abort", "instruction": "任务已被人工终止：人工终止任务", "messages": [], "attachments": [] }
#
# 你要做的事：什么都不做，直接取下一个
curl http://localhost:3201/api/agent/next-task -H "x-agent-key: qcl_xxx"
```

### 收到多条合并消息

```bash
# 你上报了 L3 计划，等待期间人类连发了 3 条消息
# → /report 返回：
# {
#   "action": "redirect",
#   "instruction": "把按钮改成红色\n顺便加个验证码\n颜色用 #FF0000",
#   "messages": [
#     { "id": "s1", "content": "把按钮改成红色", "time": "14:30:01" },
#     { "id": "s2", "content": "顺便加个验证码", "time": "14:30:15" },
#     { "id": "s3", "content": "颜色用 #FF0000", "time": "14:30:22" }
#   ],
#   "attachments": []
# }
#
# 你要做的事：
# ① 逐条阅读 messages（s1 → s2 → s3），综合理解意图
# ② s3 是最新的，优先级最高（人类可能在纠正之前的说法）
# ③ 调整计划：按钮颜色 #FF0000 + 加验证码
# ④ 重新上报
curl -X POST .../report --data-binary '{"action":"plan","content":"L3：已按指示调整 — 按钮颜色改为 #FF0000，并增加验证码功能","level":"L3"}'
# → 返回 continue → 开始写代码
```

---

## 十一、Git 操作规范

| 操作                                  | 允许                                                |
| ------------------------------------- | --------------------------------------------------- |
| `git status` / `git diff` / `git log` | 是，查看用                                          |
| `git fetch` / `git pull`              | 是，拉取最新代码（必须先做）                        |
| `git add` / `git commit`              | 是，提交代码                                        |
| `git checkout -b` / `git branch`      | 是，管理分支                                        |
| `git merge main`                      | 是，开发分支合并最新主分支代码                      |
| `git stash` / `git stash pop`         | 是，**仅用于暂存自己的改动**，禁止 stash 别人的代码 |
| **`git push`**                        | **禁止**                                            |
| **`git push --force`**                | **禁止**                                            |
| **`git reset --hard`**                | **禁止**                                            |
| **`git clean`**                       | **禁止**                                            |

---

## 十二、与人类的实时通讯机制

你和人类通过**聊天会话面板 + 补充说明 + 开发日志**三重通讯，同时系统提供 Webhook 唤醒机制实现实时通知。

### 聊天会话（Session）机制

**你不需要主动管理 Session，系统自动处理。** 但理解这个概念有助于你知道人类看到了什么。

```
人类点击「开始工作」
  → 系统创建一个新 Session（如 "05-29 14:30"）
  → 你被唤醒，开始执行任务

你执行任务时：
  → 你的 log（开始开发、进度、完成）自动同步到当前 Session 的消息流
  → 人类在聊天面板实时看到你的进度
  → 每个任务的消息按任务分组展示

人类点击「停止工作」或你完成所有任务：
  → Session 归档（status = archived）
  → 人类可随时回看历史 Session 中的完整对话和任务进度
```

**Session 内的消息按任务分组：**

```
── Session "05-29 14:30" (进行中) ──

── Task #1: 用户管理页面 ──
  Agent: [开始] 开始开发任务
  Agent: [进度] 实现表单组件...
  Agent: [完成] 完成开发，V1.0
  User: [批准]

── Task #2: 权限配置 ──
  Agent: [进度] 正在开发...
```

**核心要点：**

- Session 是人类的工作周期概念，你不需要关心，继续按原来的方式调用 `/report`、`/complete`
- 你的每条 log（action 为 开始开发/开发/调试/回复/开发完成/疑问/plan）都会自动出现在聊天面板
- 人类在聊天面板的操作（批准、拒绝、补充说明）会通过补充说明和唤醒机制传达给你
- 人类可以看到历史 Session 中所有任务的完整对话记录

### 通讯通道

```
人类 → 你（三种方式）：
  ① 聊天面板发消息 → 系统保存为补充说明 + 唤醒你 → 你通过 GET /supplements 收到
  ② 任务卡片点「补充说明」→ 保存到 task_supplements 表 → 唤醒你 → 你通过 GET /supplements 收到
  ③ 聊天面板点「批准/拒绝」→ 更新任务状态 → 唤醒你继续下一个任务

你 → 人类：
  POST /report { action: "plan", level: "L1", content: "..." }
  → 自动同步到当前 Session 的聊天面板
  → 人类实时看到你的消息（进度、回复、提问）
```

### 人类的聊天面板操作

人类在顶栏点击聊天图标，打开全屏聊天面板，可以：

| 操作     | 人类在面板做什么                     | 对你的影响                                                 |
| -------- | ------------------------------------ | ---------------------------------------------------------- |
| 开始工作 | 点击「开始工作」按钮                 | 创建新 Session → 唤醒你 → `GET /next-task`                 |
| 停止工作 | 点击「停止工作」按钮                 | Session 归档 → 你完成当前任务后不再自动拉取下一个          |
| 批准任务 | 计划卡片或完成报告卡片点击「批准」   | 计划：解除阻塞继续开发；完成报告：任务变 ai_done → 唤醒你取下一个任务 |
| 拒绝任务 | 任务完成报告卡片点击「拒绝」+ 填原因 | 任务变 ai_rework → 重新入队 → 你后续会再取到               |
| 终止任务 | 点击「终止任务」按钮                 | 任务变 ai_cancelled → /report 返回 abort → 调 GET /next-task 跳过 |
| 补充说明 | 输入框发消息                         | 保存为 task_supplement → 作为 /report 的 redirect 返回给你 |
| 回答问题 | Agent 提问卡片回复                   | 清除 ai_question → 任务重新入队 → 唤醒你                   |
| 查看历史 | Session 下拉切换                     | 只读查看，不影响你                                         |

**等待时间可能比预期长：** 人类正在输入时，系统会自动延长等待。你不需要关心等待了多久，继续等 `/report` 返回即可。

**你的行为：** 所有交互通过 `POST /report` 完成，最终提交通过 `POST /complete`。系统自动把你的消息同步到聊天面板。

人类在同步中心配置「Agent 唤醒地址」（OpenClaw Gateway 的 Chat API 地址，如 `http://localhost:50439/v1/chat/completions`）+ OpenClaw Token + 目标 Agent 后，系统会在以下场景自动唤醒你：

1. 人类在聊天面板点「开始工作」时
2. 人类在聊天面板发消息/补充说明时
3. 人类在聊天面板批准/拒绝任务时
4. 人类回答 Agent 提问时
5. 人类在 AI 待办页点「唤醒 Agent 开始任务」按钮时

**唤醒流程（你不需要主动调用任何唤醒接口）：**

```
LineSequence 后端调用 OpenClaw Gateway Chat API：
  POST http://localhost:50439/v1/chat/completions
  Authorization: Bearer <openclaw-token>
  {
    "model": "openclaw/{agentTarget}",
    "messages": [{
      "role": "user",
      "content": "唤醒消息内容"
    }],
    "stream": false
  }
  ↓
OpenClaw Gateway 唤醒目标 Agent
  ↓
你收到唤醒消息后执行对应操作
```

**不同场景的唤醒消息和你的响应：**

| 唤醒场景 | 消息内容                                                                                          | 你做什么                                                                        |
| -------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 开始工作 | `开始工作。队列中有 N 个待办任务，请调用 GET /next-task 开始执行。`                               | `GET /next-task` → 进入开发循环                                                 |
| 补充说明 | `[系统通知] 任务 {taskId} 收到新的补充说明：{内容}。请立即 GET /task/{taskId}/supplements 检查。` | `GET /task/{taskId}/supplements` → 处理补充                                     |
| 批准任务 | `任务 {taskId} 已批准。请调用 GET /next-task 继续执行下一个任务。`                                | `GET /next-task` → 继续开发                                                     |
| 拒绝任务 | `任务 {taskId} 被拒绝，原因: {comment}。请调用 GET /next-task 重新开发。`                         | `GET /next-task` → 取到返工任务重新开发                                         |
| 终止任务 | `任务 {taskId} 已被人工终止。请调用 GET /next-task 继续执行下一个任务。`                           | `GET /next-task` → 跳过被终止的任务，取下一个                                   |
| 回答问题 | `用户回答了问题: {answer}。请调用 GET /next-task 继续执行。`                                      | `GET /next-task` → 任务已重新入队                                               |
| 聊天消息 | `{用户原话}`                                                                                      | 理解意图，执行操作，`POST /report { action: "plan", content: "结果" }` 回复 |

### 补充说明完整处理步骤（收到 /report 返回 redirect 后）

```
收到 /report 返回 { action: "redirect", instruction: "人类的指令" }

① 立即回复确认（让人类知道你收到了）
   POST /report { action: "plan", level: "L1", content: "收到补充说明：[摘要]。正在处理..." }

② 停下当前工作，重新分析上下文
   - 结合原始需求 + 补充说明，确定新方向
   - 补充说明 > 原始需求，冲突时以补充为准

③ 判断补充类型并处理
   修改型："把按钮改成红色" → 立刻去改
   追加型："顺便加上表单校验" → 加到待做列表
   推翻型："不用做XX了" → 立刻停止，回滚相关代码
   疑问型："XX参数是做什么的" → POST /report { plan, L1 } 回答

④ 处理完毕后重新上报计划
   POST /report { action: "plan", content: "调整后计划", level: "L2" }

⑤ 收到 /report 返回 { action: "continue" } → 继续开发
```

### 补充说明获取方式（ATEP 同步阻塞模型）

Agent **不轮询**。所有交互通过 `POST /report` 同步阻塞完成：

- Agent 上报计划/进度/完成 → `/report` 阻塞等待 → 人类在聊天面板操作 → 结果返回 Agent
- 人类的补充说明作为 `/report` 的 `redirect` 返回
- Agent 也可以主动调 `GET /task/{taskId}/supplements` 查看历史补充（如唤醒后首次检查）

### 补充说明通讯时序图

```
时间线  人类(聊天面板)          LineSequence              Agent
  |      |                       |                       |
  |   点「开始工作」────→ 创建 Session                  |
  |      |                  唤醒 Agent ──────→ 收到 "开始工作" |
  |      |                       |                  GET /next-task
  |      |                  ←── 返回任务               |
  |      |                       |                  POST /report { plan, ai_dev }
  |      |                  推送到面板 ────→ 面板显示计划卡片    |
  |      |                  阻塞等待...                    |
  |   点「批准」────→ 更新任务状态                    |
  |      |                  返回 continue ────→ Agent 收到  |
  |      |                       |                  开始写代码
  |      |                       |                  POST /report { plan } (下一步骤)
  |      |                  推送到面板 ────→ 面板显示步骤计划    |
  |      |                       |                       |
  |   发补充说明 ──────→ 保存到数据库               |
  |      |                  作为 redirect 返回给阻塞中的 /report |
  |      |                       |                  Agent 收到 redirect
  |      |                       |                  调整方向 → POST /report { plan }
  |      |                       |                       |
  |      |                       |                  POST /report { completion, ai_review }
  |      |                  推送到面板 ────→ 面板显示完成报告    |
  |      |                  阻塞等待...                    |
  |   点「批准」────→ 更新任务状态                    |
  |      |                  返回 continue ────→ Agent 收到  |
  |      |                       |                  POST /complete 提交产出
  |      |                       |                  GET /next-task 取下一个
  v      v                       v                       v
```

### 未配置唤醒地址时

如果人类没有配置唤醒地址，ATEP 同步阻塞模型仍然正常工作——`/report` 接口本身不依赖唤醒，它直接阻塞 HTTP 请求等待人类响应。人类在聊天面板的操作会直接解析阻塞中的 `/report` 请求。

---

## 十三、错误处理

**所有错误先在聊天框提问，等 1 分钟无响应再提交 question 跳过。**

### 13.1 业务场景错误

| 场景                   | 你做什么                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `project.path` 不存在  | POST /report { action: "question", aiStatus: "ai_question", content: "❓ 疑问：项目路径不存在: xxx" } → 取下一个 |
| `requirement` 全为空   | POST /report { action: "question", aiStatus: "ai_question", content: "❓ 疑问：缺少需求描述" } → 取下一个        |
| 编译错误修不好         | 上报日志说明已尝试的修复方式，继续尝试其他方案                                                                   |
| 测试失败但不是你引入的 | 上报日志列出失败用例，继续完成你的任务                                                                           |
| 需要改数据库           | 上报日志等人确认，不要自己改                                                                                     |
| 需求和已有功能冲突     | 提交 question 说明冲突点                                                                                         |
| `complete` 提交失败    | 上报日志记录错误信息，重试一次，仍失败则提交 question                                                            |
| 任务被终止（cancel）   | `/report` 返回 `{ action: "abort", instruction: "任务已被人工终止" }` → `GET /next-task` 取下一个               |

### 13.2 API 层错误处理

**所有接口返回的 `code` 字段：`0` = 成功，非 `0` = 失败。**

| HTTP 状态 / 错误        | 含义                     | 你做什么                                                                                      |
| ----------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `code: 0`               | 成功                     | 按正常流程继续                                                                                |
| HTTP 401 / `code: 401`  | 认证失败（agent-key 无效或过期） | **停止所有操作**，报告："❌ 认证失败，agent-key 无效或已过期，请联系人类重新配置" → 停止循环 |
| HTTP 404 / `code: 404`  | 任务不存在或已被删除     | `GET /next-task` 取下一个任务，不要重试                                                       |
| HTTP 500 / `code: 500`  | 服务端内部错误           | 等待 30 秒后重试一次，仍失败则提交 question 说明错误信息                                      |
| 网络连接失败（ECONNREFUSED） | 后端服务未启动       | 等待 60 秒后重试，连续 3 次失败则停止循环，报告："❌ 无法连接后端服务"                         |
| 网络超时（ETIMEDOUT）   | 请求超时                 | 区分接口：`/report` 超时是正常的（阻塞等待），重试即可；其他接口超时按 500 处理                |
| 返回格式异常（非 JSON） | 服务端异常               | 记录原始响应内容，等待 30 秒后重试，连续 3 次则提交 question                                  |

**重试规则：**

- 非认证错误最多重试 **3 次**，间隔 30 秒
- 认证错误（401）**不重试**，直接停止
- `/report` 接口超时可能是因为人类还在操作，等待后自动重连即可
- 重试期间可通过 `POST /report { action: "progress" }` 上报重试状态（非阻塞，不等待）

### 13.3 /report 返回异常格式处理

如果 `/report` 返回的 `data.action` 不是 `continue` / `redirect` / `abort` 三者之一：

```
① 记录原始响应内容（code, data, message）
② 当作 continue 处理（宁可多做不少做）
③ 通过 POST /report { action: "progress", content: "⚠️ 收到异常响应：[原始内容]，按 continue 处理" } 上报
④ 继续正常开发流程
```

**如果响应体完全无法解析：**

```
① 等待 30 秒
② 重新发送相同的 /report 请求（幂等）
③ 连续 3 次异常 → POST /report { action: "question", aiStatus: "ai_question", content: "❓ 疑问：/report 接口返回异常格式" }
```

### 13.4 Agent 崩溃/重启恢复

**Agent 可能在任何步骤崩溃（进程被杀、OOM、机器重启等）。恢复后执行以下流程：**

```
Agent 重启后：

① 调 GET /stats 查看当前状态
   → inDev > 0：有未完成的任务

② 调 GET /next-task 尝试取任务
   → 返回任务数据：正常开发流程（从 7.1 环境准备开始）
   → 返回 null：队列空，停止

③ 检查 git 工作区状态（cd 到上次的项目路径）
   → 有未提交的改动：检查改动内容
     - 改动属于当前任务 → 继续，上报 POST /report { action: "progress", content: "恢复开发：检测到上次未提交的改动" }
     - 改动不确定来源 → POST /report { action: "question", content: "❓ 疑问：工作区有未提交改动，不确定是否为上次遗留" }
   → 干净：正常开始新任务

④ 如果不记得上次在做什么
   → 调 GET /next-task，按正常流程开始
   → 之前的任务如果还在开发中，系统会自动排回队列
```

**恢复原则：**

- **不猜测状态** — 不知道在做什么就从头开始
- **先查后做** — 先检查 git 状态、队列状态，再决定下一步
- **保守处理** — 有未提交改动先确认再继续，不盲目 stash 或 reset
- **系统兜底** — 即使 Agent 崩溃，任务不会丢失。未完成的任务会保持在原状态（ai_dev/ai_question），人类可以手动处理或等 Agent 恢复后重新取到
