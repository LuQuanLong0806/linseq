# Agent 实时通讯 — 现状分析与改造方案

> 目标：让你一看就懂现在是什么情况、要改什么、改完有什么用。

---

## 一、先说结论：改完能达到什么效果

### 改造前（现在的状态）

你在 LineSequence 聊天框给 Agent 发了补充说明 → Agent **不知道你发了**，只能等它每 5 秒轮询一次才发现，最慢延迟 5 秒。如果 Agent 当前没有在跑任务（比如它已经做完了在等你审核），那它根本不会轮询，你的补充说明就躺在那里没人处理。

### 改造后（预期效果）

你在聊天框发补充说明 → LineSequence **立刻通过 OpenClaw 唤醒 Agent** → Agent 收到通知后马上查询并处理你的补充说明。

**具体效果：**

| 场景 | 改造前 | 改造后 |
|---|---|---|
| Agent 正在开发，你发补充 | 最慢 5 秒后发现 | **秒级响应**，Agent 立刻收到通知 |
| Agent 做完在等审核，你发补充 | **不会被发现**，直到下次取任务 | 立刻唤醒，Agent 马上处理 |
| Agent 做完自测等你确认，你发补充 | 5 秒轮询可能发现 | 秒级发现，不用等轮询 |
| Agent 空闲状态（没有任务），你发补充 | 完全不会被发现 | 唤醒后立即处理 |

**对你的项目有什么实际帮助：**

1. **你和 Agent 的沟通变成实时的** — 发了补充说明不用干等，Agent 秒级响应
2. **Agent 空闲时也能被叫起来干活** — 不用等它自己轮询发现新任务
3. **减少 Agent 无意义的空轮询** — 没有补充时不用白跑 API，有补充时才唤醒
4. **整体开发效率提升** — 纠偏更快，返工更少，你和 Agent 之间的延迟从"秒级轮询"变成"即时通知"

---

## 二、现在的代码有什么问题

### 问题 1：调用格式完全不对

LineSequence 后端 `triggerWebhook` 函数（发补充说明时自动触发）：

```
当前代码发的请求：
POST http://localhost:3000/v1/chat/completions      ← 端口和路径可能对
Headers: { "x-agent-key": "qcl_xxx" }               ← ✗ OpenClaw 不认识这个头
Body: {
  "model": "agent",                                  ← ✗ 格式不对
  "messages": [{ "role": "user", "content": "..." }],
  "stream": false
}
```

OpenClaw Gateway 实际要求的格式：

```
正确的请求：
POST http://localhost:50439/v1/chat/completions      ← 默认端口是 50439
Headers: { "Authorization": "Bearer <openclaw-token>" }  ← ✓ 必须用这个认证方式
Body: {
  "model": "openclaw/agent-209e563a",                ← ✓ 灵序 LINSEQ 的 Agent ID
  "messages": [{ "role": "user", "content": "..." }],
  "stream": false
}
```

**三个关键错误：**
- `model: "agent"` → 应该是 `"openclaw/agent-209e563a"`（灵序 LINSEQ 的 Agent ID）
- `x-agent-key` 头 → 应该是 `Authorization: Bearer <token>`（OpenClaw 的认证 token）
- 默认端口提示 `3000` → 实际是 `50439`

### 问题 2：把两个不同的 Key 搞混了

```
LineSequence Agent Key（qcl_xxx）     → 用于 Agent 调用 LineSequence API 的身份认证
                                       例如：GET /api/agent/next-task 时带在 x-agent-key 头里

OpenClaw Gateway Token（一串十六进制） → 用于调用 OpenClaw Gateway 的认证
                                       在 ~/.qclaw/openclaw.json 的 gateway.auth.token 里
```

现在代码把 LineSequence 的 Agent Key 当作 OpenClaw 的 Token 发了，OpenClaw 根本不认识。

### 问题 3：配置界面缺少 OpenClaw Token 输入

当前同步页面的「Agent 唤醒地址」只配置了 URL，没有地方填 OpenClaw 的认证 Token。没有 Token 就没法调通。

---

## 三、需要改什么（3 处代码改动）

### 改动 1：后端 `server/src/routes/tasks.ts` — `triggerWebhook` 函数

**改什么：** 修正调用格式，让它符合 OpenClaw Gateway 的实际 API 规范。

```
改动前：
  model: "agent"
  headers: { "x-agent-key": agentKey }

改动后：
  model: "openclaw/agent-209e563a"
  headers: { "Authorization": "Bearer " + openclawToken }
```

同时从 `sync_config` 读 `openclawToken` 而不是 `agentApiKey`。

### 改动 2：同步配置 — 新增 `openclawToken` 和 `agentTarget` 字段

在 `sync_config` 表里新增两个 key：

| key | value | 说明 |
|---|---|---|
| `webhookUrl` | `http://localhost:50439/v1/chat/completions` | 已有，OpenClaw Gateway 地址 |
| `openclawToken` | `34b619355da794f9d0eef24ed565ad51396eb64d588d7df1` | **新增**，OpenClaw 认证 Token |
| `agentTarget` | `agent-209e563a` | **新增**，唤醒目标 Agent ID（默认灵序 LINSEQ） |

Token 来源：`~/.qclaw/openclaw.json` → `gateway.auth.token`

### 改动 3：前端同步页 — 新增 OpenClaw 配置

在「Agent 唤醒地址」下面新增：

1. **OpenClaw Token 输入框**
2. **唤醒目标 Agent 下拉框**（可选不同 Agent，默认灵序 LINSEQ）

```
┌─ 同步配置 ──────────────────────────┐
│                                      │
│  Agent 唤醒地址:                     │
│  [http://localhost:50439/v1/chat/..] │
│  OpenClaw 认证 Token:     ← 新增     │
│  [34b619355da794f9d0eef2...   ]  👁  │
│  唤醒目标 Agent:         ← 新增      │
│  ┌────────────────────────────────┐  │
│  │ 灵序 LINSEQ  (agent-209e563a)▼│  │
│  └────────────────────────────────┘  │
│                                      │
│  [保存配置]                          │
└──────────────────────────────────────┘
```

---

## 四、完整通讯流程（改完后的工作方式）

```
你（人类）                LineSequence 后端              OpenClaw Gateway         Agent (QClaw)
   |                          |                              |                       |
   | 在聊天框发补充说明        |                              |                       |
   | ───────────────────→     |                              |                       |
   |                          | 保存到数据库                  |                       |
   |                          | WebSocket 推送到前端          |                       |
   | 看到自己的消息 ←────      |                              |                       |
   |                          |                              |                       |
   |                          | POST /v1/chat/completions    |                       |
   |                          | Authorization: Bearer xxx    |                       |
   |                          | model: "openclaw/main"       |                       |
   |                          | ──────────────────────────→  |                       |
   |                          |                              | 唤醒 QClaw Agent      |
   |                          |                              | ───────────────────→  |
   |                          |                              |                       |
   |                          |                              |                       | Agent 收到通知
   |                          |                              |                       | "任务 xxx 有新补充"
   |                          |                              |                       |
   |                          |                              |                       | GET /supplements
   |                          | ←───────────────────────────────────────────────────  |
   |                          | 返回补充内容                  |                       |
   |                          | ──────────────────────────────────────────────────→  |
   |                          |                              |                       |
   |                          |                              |                       | POST /log "收到补充"
   |                          | ←───────────────────────────────────────────────────  |
   |                          | WebSocket 推送               |                       |
   | 看到 Agent 回复 ←────    |                              |                       |
   |                          |                              |                       | 处理补充...
   |                          |                              |                       |
   |                          |                              |                       | POST /log "已处理"
   |                          | ←───────────────────────────────────────────────────  |
   | 看到处理结果 ←────       |                              |                       |
   |                          |                              |                       | 继续开发
```

**关键变化：** 唤醒请求走 OpenClaw Gateway → Agent 被主动叫醒 → 不再依赖被动轮询。

---

## 五、配置说明（你需要做什么）

改完代码后，你在同步中心配置两项：

1. **Agent 唤醒地址**：填你的 OpenClaw Gateway 地址，默认 `http://localhost:50439/v1/chat/completions`
2. **OpenClaw Token**：从 `~/.qclaw/openclaw.json` 里的 `gateway.auth.token` 复制过来填上

填完保存，之后每次你在聊天框发补充说明，系统就会自动唤醒 Agent。

如果不填这两项，系统照常工作，只是没有实时唤醒，Agent 仍然靠 5 秒轮询发现补充说明（和现在一样）。

---

## 六、改动量和风险

| 项目 | 说明 |
|---|---|
| 改动文件数 | 4 个（后端 1、前端 1、类型 1、API 1） |
| 改动代码量 | 约 30 行 |
| 风险等级 | **极低** — 只是修正 API 调用格式 + 加一个配置字段 |
| 不影响现有功能 | 没配 Token 时行为和现在完全一样 |
| 不需要改数据库结构 | `sync_config` 是 key-value 表，加个 key 就行 |

---

## 七、总结

**一句话：** 现在的唤醒代码格式写错了，调不通 OpenClaw。改 3 处就能让你的 Agent 实现秒级响应，你和 Agent 的沟通从"5秒轮询"变成"即时通知"。
