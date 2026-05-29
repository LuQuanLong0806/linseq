# AI 任务调度中心 — 双模式改造方案

> 目标：让 Agent 既能按任务队列自动干活，也能直接听你说话做事。

---

## 一、你能得到什么

改完后，AI 任务调度中心变成两个模式，顶部用 Tab 切换：

```
┌──────────────────────────────────────────────────────────┐
│  [📋 任务模式]    [💬 对话模式]                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   （两个模式的内容，下面分别说明）                           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 模式 1：任务模式（现有的 AI 任务调度中心，增强）

你把任务排好队 → 点「开始任务」→ Agent 被唤醒 → 自动取任务、开发、提交，一个接一个做完。

**和现在的区别：**
- 现在没有"开始"按钮，Agent 要自己轮询发现任务
- 改完后你点一下就能把 Agent 叫起来干活
- Agent 做任务过程中，你随时可以通过聊天发补充说明纠偏

**交互流程：**

```
你在前端：
  排好任务队列 → 点击「▶ 开始任务」按钮
                    ↓
Agent 被唤醒（通过 OpenClaw Gateway）：
  收到消息 "开始工作"
                    ↓
  Agent 自动调用 GET /next-task → 取到第一个任务
                    ↓
  Agent 进入开发循环：start → 检查补充 → 写代码 → 自测 → complete → 下一个
                    ↓
  你在前端实时看到 Agent 的开发日志、状态变化
                    ↓
  你觉得方向不对 → 打开聊天终端 → 发补充说明 → Agent 立刻收到并调整
                    ↓
  Agent 做完所有任务 → 停下来等你审核或派新任务
```

### 模式 2：对话模式（新增）

一个纯粹的聊天界面，你和 Agent 直接对话。输入任何需求，Agent 被唤醒后直接处理。

**适合的场景：**
- "帮我看看这个报错是什么原因" — Agent 分析代码后回答
- "把登录页的按钮改成红色" — Agent 直接去改代码
- "当前项目还有哪些待办任务" — Agent 查询后汇报
- "帮我重构一下这个函数" — Agent 直接干活

**交互流程：**

```
你在前端：
  输入框打字："把登录页的按钮改成红色"
  按回车发送
                    ↓
LineSequence 后端：
  把你的消息通过 OpenClaw Gateway 发给 Agent
  同时保存到数据库（保留对话记录）
                    ↓
Agent 被唤醒：
  收到消息 "把登录页的按钮改成红色"
  Agent 理解意图 → 执行操作 → 回复结果
                    ↓
你在前端：
  实时看到 Agent 的回复（通过 WebSocket 推送）
  "已完成：修改 src/views/login.vue，将主按钮颜色改为红色"
```

### 两个模式的关系

```
任务模式 ←→ 对话模式  可以随时切换，互不影响

任务模式中 Agent 在跑任务 → 你切到对话模式问个问题 → Agent 处理完 → 切回任务模式继续看进度

对话模式中你让 Agent 做件事 → Agent 做着做着需要排进任务队列 → 你切到任务模式添加任务 → 点「开始」让 Agent 继续
```

---

## 二、具体要改什么

### 改动 1：AI 任务调度中心页面顶部加 Tab 切换

在 `src/views/ai-todo/index.vue` 页面顶部加两个 Tab：

```html
<!-- 顶部模式切换 -->
<div class="mode-tabs">
  <button class="mode-tab" :class="{ active: mode === 'task' }" @click="mode = 'task'">
    📋 任务模式
  </button>
  <button class="mode-tab" :class="{ active: mode === 'chat' }" @click="mode = 'chat'">
    💬 对话模式
  </button>
</div>
```

选"任务模式"时显示现有的双面板 + 任务队列（和现在一样，增加「开始任务」按钮）。
选"对话模式"时显示聊天界面。

### 改动 2：任务模式增加「开始任务」按钮

在开发引擎面板（右侧"开发中"面板）增加一个唤醒按钮：

```
┌─ 开发引擎 ──────────── [▶ 唤醒 Agent 开始] ──┐
│                                                │
│  队列中有 5 个待办任务                          │
│  点击唤醒后 Agent 将按顺序自动执行              │
│                                                │
└────────────────────────────────────────────────┘
```

按钮点击后的动作：
1. 前端调 `POST /api/agent/wake`，传 `{ command: "开始工作" }`
2. 后端通过 OpenClaw Gateway 发送唤醒消息给 Agent
3. Agent 收到后自动执行 `GET /next-task` → 进入开发循环

### 改动 3：对话模式 — 全新聊天界面

对话模式是一个独立的聊天面板，不需要绑定特定任务：

```
┌─ 对话模式 ────────────────────────────────────┐
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ 🤖 Agent: 我在，有什么需要我做的？        │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ 👤 你: 帮我把登录页的按钮改成红色         │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ 🤖 Agent: 收到，正在处理...              │ │
│  │    已修改 src/views/login.vue            │ │
│  │    按钮颜色已改为红色                     │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ 👤 你: 顺便把字体也调大一点               │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ┌─────────────────────────────────────────┐  │
│  │ 输入消息...                    [发送]   │  │
│  └─────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

和任务模式中的"聊天终端"的区别：
- 任务聊天终端：绑定某个具体任务，发的消息是"补充说明"
- 对话模式：自由对话，不绑定任务，直接和 Agent 交流

### 改动 4：后端新增唤醒接口

在 `server/src/routes/agent.ts` 新增：

```typescript
// POST /api/agent/wake — 唤醒 Agent
// 请求体：{ command: string, taskId?: string }
// 调用 OpenClaw Gateway 把消息发给 Agent
```

这个接口做两件事：
1. 通过 OpenClaw Gateway 的 Chat API 把你的指令发给 Agent
2. 把消息保存到数据库，用于前端展示对话历史

### 改动 5：修复 OpenClaw 调用格式

把现有的 `triggerWebhook` 和新的唤醒接口统一，修正调用格式：

```
修正前（调不通）：
  model: "agent"
  headers: { "x-agent-key": "qcl_xxx" }

修正后：
  model: "openclaw/{agentTarget}"
  headers: { "Authorization": "Bearer <openclaw-token>" }
```

`agentTarget` 从 `sync_config` 表读取，默认值 `agent-209e563a`（灵序 LINSEQ）。

### 改动 6：同步配置页新增 OpenClaw 配置

在同步中心的"Agent 唤醒地址"下面，新增：

1. **OpenClaw Token 输入框** — 从 `~/.qclaw/openclaw.json` 的 `gateway.auth.token` 复制
2. **唤醒目标 Agent 下拉框** — 可选要唤醒哪个 Agent：

```
唤醒目标 Agent:
┌──────────────────────────────────┐
│ 灵序 LINSEQ  (agent-209e563a)  ▼│  ← 默认选中
│   QClaw       (main)            │
│   AI工程师    (ua58rsb93ve...)   │
│   Python全栈  (tfxjjhfnji...)   │
│   Unity架构师 (jwag9yx1mr...)   │
│   游戏设计师  (uafru5gofd...)   │
│   小说创作    (ds4ygtfdv3...)   │
└──────────────────────────────────┘
```

配置存到 `sync_config` 表：
| key | 说明 | 默认值 |
|---|---|---|
| `webhookUrl` | OpenClaw Gateway 地址 | 空 |
| `openclawToken` | 认证 Token | 空 |
| `agentTarget` | 目标 Agent ID | `agent-209e563a` |

---

## 三、文件改动清单

| 文件 | 改什么 | 工作量 |
|---|---|---|
| `src/views/ai-todo/index.vue` | 加 Tab 切换 + 对话模式 UI + 唤醒按钮 | 中（主要 UI 工作） |
| `src/api/agent.ts` | 新增 `wake()` 和 `chat()` 方法 | 小 |
| `server/src/routes/agent.ts` | 新增 `POST /wake` 和 `POST /chat` 接口 | 小 |
| `server/src/routes/tasks.ts` | 修复 `triggerWebhook` 调用格式 | 小 |
| `src/views/sync/index.vue` | 新增 OpenClaw Token 输入框 | 小 |
| `src/types/index.ts` | SyncConfig 加 `openclawToken` 字段 | 小 |
| `docs/QCLAW_AGENT_GUIDE.md` | 更新唤醒和对话模式说明 | 小 |

总计约 7 个文件，主要工作量在前端页面的对话模式 UI 上。

---

## 四、唤醒机制详解 — Agent 怎么被叫起来

所有唤醒都走同一条路：

```
前端操作（点按钮 / 发消息）
  ↓
LineSequence 后端 POST /api/agent/wake
  ↓
读取 sync_config 里的 webhookUrl 和 openclawToken
  ↓
调用 OpenClaw Gateway:
  POST http://localhost:50439/v1/chat/completions
  Authorization: Bearer 34b619...
  {
    "model": "openclaw/agent-209e563a",
    "messages": [{ "role": "user", "content": "你的指令" }]
  }
  ↓
OpenClaw Gateway 唤醒「灵序 LINSEQ」Agent
  ↓
Agent 收到消息，根据内容决定做什么：
  - "开始工作" → GET /next-task → 进入开发循环
  - "把XX改成YY" → 直接去改代码
  - "帮我看看XX" → 分析代码后回复
```

**不同场景的唤醒消息：**

| 触发场景 | 发给 Agent 的消息 |
|---|---|
| 任务模式点「开始任务」 | "开始工作。队列中有 N 个待办任务，请调用 GET /next-task 开始执行。" |
| 任务模式发补充说明 | "[系统通知] 任务 xxx 收到新的补充说明：{内容}。请立即 GET /supplements 检查。" |
| 对话模式发消息 | "{用户输入的原话}" — 原封不动传给 Agent |

---

## 五、数据流 — 消息怎么在前端和 Agent 之间传递

### 任务模式的补充说明（已有，修复唤醒）

```
前端输入 → POST /task/{id}/supplements → 保存数据库
  → WebSocket 推送（前端即时显示）
  → triggerWebhook → OpenClaw 唤醒 Agent
  → Agent 查 GET /supplements → 收到你的补充
  → Agent 回复 POST /log → WebSocket 推送 → 前端显示
```

### 对话模式的自由聊天（新增）

```
前端输入 → POST /api/agent/chat → 保存数据库
  → OpenClaw 唤醒 Agent → Agent 回复
  → Agent 回复通过 POST /log 写入 → WebSocket 推送 → 前端显示
```

或者也可以让 Agent 的回复直接通过 OpenClaw Gateway 的 HTTP 响应返回，再由后端保存并推送。两种方案各有优缺点：

| 方案 | 优点 | 缺点 |
|---|---|---|
| Agent 回复走 POST /log | 和现有系统一致，前端不用改展示逻辑 | Agent 需要知道对话 ID |
| Agent 回复走 HTTP 响应 | 实时性好，对话即回答 | 需要新增展示逻辑 |

建议先用方案 1（走 POST /log），后续再优化。

---

## 六、对你的项目的预期效果

### 短期（改完就能用）

1. **Agent 不再是"黑盒"** — 你点一下就能叫起来，不用等它自己轮询
2. **补充说明即时生效** — 发了补充 Agent 秒级收到，不用等 5 秒轮询
3. **能直接和 Agent 对话** — 不用非得绑任务，想问什么直接问
4. **开发过程完全透明** — Agent 每一步都在前端实时展示

### 中期（用起来之后）

1. **减少返工** — 发现方向不对立刻纠偏，不用等 Agent 做完再打回
2. **提高 Agent 利用率** — Agent 空闲时也能被叫起来干活
3. **任务和自由对话结合** — 复杂需求走任务队列，小改动直接对话搞定

### 长期（可扩展方向）

1. **多 Agent 协作** — 不同 Agent 处理不同类型任务（OpenClaw 已支持多 Agent）
2. **对话历史积累** — Agent 的所有回复都保存，形成开发知识库
3. **语音指令** — 对话模式的基础上可以加语音输入
