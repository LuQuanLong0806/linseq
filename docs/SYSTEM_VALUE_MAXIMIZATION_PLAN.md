# 灵序 LineSequence — 系统价值最大化方案

> 目标：将"任务管理 + Agent 开发"连成一条直线，减少手动操作，让任务从进入到完成自动流转，用户只做关键决策。
> 日期：2026-05-30

---

## 重要说明：新 Agent 需独立指南

本方案涉及新 Agent（**预处理 Agent** / **分析 Agent**），与现有开发 Agent（QClaw）职责不同：

| Agent | 职责 | 指南文件 |
| --- | --- | --- |
| **QClaw（开发 Agent）** | 任务开发、写代码、ATEP 交互 | `docs/QCLAW_AGENT_GUIDE.md`（现有） |
| **预处理 Agent（新增）** | 任务分析、项目匹配、风险评估、模板推荐 | `docs/PREPROCESS_AGENT_GUIDE.md`（新建） |

**为什么要分开**：
1. 两个 Agent 的职责、调用时机、交互方式完全不同 — 开发 Agent 用 ATEP 阻塞模型，预处理 Agent 是一次性分析请求
2. 合并会让单个指南过长（当前 QClaw 指南已 1500 行），影响 Agent 理解
3. 独立指南便于单独迭代，互不影响
4. 未来可能接入更多专用 Agent（测试 Agent、部署 Agent），每类 Agent 独立指南是更可扩展的架构

**预处理 Agent 指南 `docs/PREPROCESS_AGENT_GUIDE.md` 需包含**：
- 职责边界：仅做任务分析和推荐，不做开发
- 输入格式：任务元数据（title, description, module, customer, history）
- 输出格式：项目推荐、风险评估、模板匹配、置信度评分
- 调用方式：系统内部 API 调用，不经过 ATEP 协议
- 更新版本历史机制：与 QClaw 指南一致，每次更新记录版本摘要

---

---

## 一、现状分析

### 已有能力

| 能力 | 说明 | 关键文件 |
| --- | --- | --- |
| 内网同步 | Puppeteer 抓取内网任务，Cookie 管理，定时同步 | `server/src/scraper/intranet.ts` |
| 任务管理 | 40+ 字段，多种视图（表格/全息HUD/星球轨道） | `src/views/task/` |
| 项目配置 | 项目名 → 本地路径/Git分支 映射，CRUD | `server/src/routes/projects.ts` |
| 同步时自动关联 | 同步后按 `tasks.project = project_configs.name` 精确匹配自动填充路径和分支 | `server/src/routes/agent.ts:510-516` |
| ATEP 协议 | L1-L4 分级、/report 统一交互、超时处理、打字心跳延长 | `server/src/routes/agent.ts` |
| Agent 交互 | 聊天会话、审批流、实时 WebSocket 推送 | `src/composables/useAgentChat.ts` |
| 版本管理 | V1.0/V1.1 迭代、审核通过/打回、截图、Word 报告 | `server/src/routes/versions.ts` |
| 开发日志 | 每步操作留痕，`dev_logs` 表 | `server/src/routes/devlogs.ts` |

### 缺失能力

| 缺失 | 影响 |
| --- | --- |
| 无规则引擎 / 关键词匹配 | 非精确匹配的任务无法自动关联项目 |
| 无任务模板 | Agent 每次重新理解需求，信息结构不统一 |
| 无风险评估 | 复杂度完全靠 Agent 自行判断，缺乏预警 |
| 无步骤级回滚 | 只能整体回退版本，无法回到某个中间步骤 |
| 无验收清单 | 完成后需人工逐条对照验收标准 |
| 无成功率统计 | 无法量化 Agent 表现、无法优化瓶颈 |
| 无习惯学习 | 用户反复做相同的手动配置 |
| 无文档拆分 | 产品一个文档放多任务，无法自动拆分为独立任务 |

---

## 二、技术方案：规则优先 + Agent 兜底

**核心思路**：先规则匹配（快、准、可解释），匹配不上才让 Agent 帮你判断，判断结果记下来变成新规则。

```
任务进入系统
  ↓
规则引擎匹配（关键词/模块/客户/历史）
  ↓ 匹配成功（confidence > 0.8）
自动关联项目、分支、模板
  ↓ 匹配失败
任务进入"待确认"状态，Agent 辅助分析
  ↓ 用户确认
结果写入历史记录 → 下次直接用
```

---

## 三、9 大功能方案

### 3.1 自动项目识别（规则引擎 + 历史学习 + Agent 兜底）

**可行性：高**

**现状**：同步后仅做精确匹配 `tasks.project = project_configs.name`，大量任务因项目名不一致而无法自动关联。

**三层方案**：

**第一层：规则匹配**

新增 `project_rules` 表：

```sql
CREATE TABLE project_rules (
  id TEXT PRIMARY KEY,
  project_config_id TEXT NOT NULL,
  rule_type TEXT NOT NULL,    -- 'keyword' | 'module' | 'customer' | 'regex'
  pattern TEXT NOT NULL,      -- 匹配内容
  field TEXT NOT NULL,        -- 匹配哪个字段: title, project, module, customer
  priority INTEGER DEFAULT 0, -- 越大越优先
  enabled INTEGER DEFAULT 1,
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

规则示例：
```json
[
  { "field": "module", "pattern": "用户", "project_config_id": "xxx", "rule_type": "keyword" },
  { "field": "customer", "pattern": "XX科技", "project_config_id": "yyy", "rule_type": "keyword" },
  { "field": "title", "pattern": "登录|注册|认证", "project_config_id": "xxx", "rule_type": "regex" }
]
```

**第二层：历史学习**

新增 `project_history` 表，记录每次手动关联的决策：

```sql
CREATE TABLE project_history (
  id TEXT PRIMARY KEY,
  task_module TEXT NOT NULL,
  task_project TEXT NOT NULL,
  task_customer TEXT NOT NULL,
  task_title_keyword TEXT DEFAULT '',
  assigned_project_config_id TEXT NOT NULL,
  match_method TEXT DEFAULT 'manual',  -- 'manual' | 'rule' | 'agent'
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

用户手动关联项目时自动记录。下次同类任务进来，按 module + customer 模糊匹配历史，频率最高的优先推荐。

**第三层：Agent 兜底**

规则和历史都匹配不上时，任务 `projectPath` 留空。系统调用**预处理 Agent**（非 QClaw）分析任务内容，推荐最可能的项目配置。用户确认后结果写入 `project_history`。预处理 Agent 有独立指南 `docs/PREPROCESS_AGENT_GUIDE.md`。

**工作量**：第一层 3-4 天，第二层 2 天，第三层 1 天（含预处理 Agent 指南编写）

---

### 3.2 任务模板

**可行性：高**

新增 `task_templates` 表：

```sql
CREATE TABLE task_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,           -- 'Bug修复' / '新功能' / '重构'
  task_type TEXT NOT NULL,      -- 对应 bug_or_req 字段
  description_template TEXT,    -- 自动填充 customDescription
  acceptance_template TEXT,     -- 自动填充 acceptanceCriteria
  priority_hint TEXT DEFAULT 'medium',
  risk_level TEXT DEFAULT 'L2',
  default_tags TEXT DEFAULT '[]',
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

**使用流程**：

1. 用户在任务详情选择模板 → 自动填充简述、验收标准
2. Agent 通过 `/next-task` 拿到任务时包含模板信息，需求理解更精准
3. 同类任务信息结构统一，Agent 开发效率更高

**工作量**：1.5-2 天

---

### 3.3 一键启动

**可行性：非常高**（主要复用现有 API）

**现状流程**：同步 → 找任务 → 加待办 → 设项目路径 → 设分支 → 写简述 → 唤醒 Agent（7 步）

**目标流程**：看到任务 → 点"启动" → 完成（1 步）

**方案**：

新增 `POST /api/agent/quick-start`：

```
输入: { taskId }
逻辑:
  1. 检查任务是否存在
  2. 若 projectPath 为空 → 调规则引擎自动匹配
  3. 若仍为空 → 返回 { needConfig: true, candidates: [...] } 前端弹窗选
  4. 设置 aiStatus = 'ai_todo'，加入待办队列头部
  5. 唤醒 Agent
  6. 返回 { started: true, taskId, projectPath, gitBranch }
```

前端：任务卡片加"启动"按钮，点击走 quick-start 流程。

**工作量**：1-2 天

---

### 3.4 风险评估

**可行性：中高**

基于规则的风险评分，自动建议 ATEP 等级：

```typescript
// 风险规则配置（存在 sync_config JSON 字段）
{
  "risk_rules": [
    { "pattern": "数据库|schema|migration", "fields": ["title","description"], "risk": "high", "level": "L4" },
    { "pattern": "UI|样式|颜色|字体", "fields": ["title","description"], "risk": "low", "level": "L1" },
    { "pattern": "重构|重写|优化", "fields": ["title","description"], "risk": "high", "level": "L3" },
    { "condition": "reworkCount >= 2", "risk": "high", "level": "L4" },
    { "condition": "bugOrReq = bug", "risk": "medium", "level": "L2" }
  ]
}
```

**集成点**：
- `/next-task` 返回值增加 `riskAssessment` 字段
- Agent 根据建议等级上报 `/report`
- 前端任务卡片显示风险标签
- 高风险任务自动弹出确认框

**工作量**：2-3 天

---

### 3.5 步骤级回滚

**可行性：中**

新增 `task_step_snapshots` 表：

```sql
CREATE TABLE task_step_snapshots (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  version_id TEXT,
  step_number INTEGER NOT NULL,
  commit_before TEXT DEFAULT '',
  commit_after TEXT DEFAULT '',
  files_changed TEXT DEFAULT '[]',
  report_action TEXT DEFAULT '',
  report_content TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

**方案**：
1. Agent 每次上报 `/report` 时附上当前 git commit hash
2. 服务端记录每步的 before/after commit
3. 回滚端点 `POST /api/agent/task/:id/rollback/:step` → 执行 `git checkout <commit_before> -- .`
4. 需更新 QClaw 开发指南（v10）要求 L3+ 操作必须步骤级 commit（预处理 Agent 相关变更写在独立指南 `PREPROCESS_AGENT_GUIDE.md` 中，不合并到 QClaw 指南）

**工作量**：3-4 天（含 Agent 指南更新）

---

### 3.6 验收清单

**可行性：高**

新增 `task_checklists` 表：

```sql
CREATE TABLE task_checklists (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  version_id TEXT,
  items TEXT NOT NULL,           -- JSON: [{ text, checked, autoVerified }]
  auto_check_result TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

**自动生成逻辑**：
1. Agent 提交 `/report { action: "completion" }` 时
2. 解析任务的 `acceptanceCriteria` 为清单项
3. 与 `filesChanged` 交叉验证（提到的文件/组件是否确实改了）
4. 测试结果映射到"测试通过"清单项
5. 推送给用户做最终勾选确认

**工作量**：2-3 天

---

### 3.7 成功率统计

**可行性：非常高**（所有原始数据已在数据库中）

**新增端点** `GET /api/agent/performance-stats`：

```typescript
{
  totalTasks: number          // 参与 AI 开发的任务总数
  completedTasks: number      // 成功完成的任务数
  approvedRate: number        // 一次通过率
  reworkRate: number          // 返工率
  avgDurationMs: number       // 平均开发耗时
  avgReworkCount: number      // 平均返工次数
  byProject: [{ project, total, approved, rejected, avgDuration }]
  byModule: [{ module, total, approved, rejected, avgDuration }]
  timeline: [{ date, completed, rejected }]  // 趋势图
  commonFailureReasons: [{ reason, count }]   // 常见失败原因
}
```

**前端**：在 Dashboard 集成 ECharts 图表（已有依赖），展示趋势、分布、瓶颈。

**工作量**：2-3 天

---

### 3.8 习惯学习

**可行性：高**

新增 `user_preferences` 表：

```sql
CREATE TABLE user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  preference_type TEXT NOT NULL,  -- 'project_mapping' | 'branch_strategy' | 'priority_override'
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL, -- JSON
  confidence REAL DEFAULT 0.5,   -- 0.0-1.0
  usage_count INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(user_id, preference_type, preference_key)
);
```

**学习点**：
- 用户手动关联项目 → 记录 module/customer → project 映射
- 用户选择分支 → 记录项目 → 常用分支
- 用户调整优先级 → 记录任务类型 → 优先级偏好

**使用**：
- confidence > 0.8 → 自动应用
- confidence > 0.5 → 建议但不自动
- confidence ≤ 0.5 → 不提示

**工作量**：2-3 天

---

### 3.9 文档拆分（多任务提取）

**可行性：高**

**痛点**：产品把多个任务的需求写在同一个文档/内网工单里，同步进来是一条记录，实际包含 N 个独立任务。不拆分就无法正确关联项目、估算工时、分配给 Agent。

**方案**：预处理 Agent 新增"文档拆分"职责，自动识别并拆分多任务文档。

**触发判断**：

```typescript
const needsSplit = (task) => {
  // 线索1：描述里有编号（1. 2. 3. 或 一、二、三、或 - 开头）
  const hasNumbering = /\n\s*(\d+[.、)）]|\s[-•‣]\s)/.test(task.description)
  // 线索2：描述超长（>500字大概率是多任务）
  const isLong = task.description.length > 500
  // 线索3：标题含版本/迭代/批次/需求包
  const hasVersion = /V\d|版本|迭代|批次|需求包|合集/.test(task.title)
  return (hasNumbering && isLong) || (hasVersion && isLong)
}
```

**新增 API `POST /api/preprocess/split`**：

```typescript
// 输入
{
  "taskId": "原始任务ID",
  "task": {
    "title": "XX系统V2.1需求",
    "description": "1. 登录页面增加验证码...\n2. 用户列表加导出功能...\n3. 权限管理增加角色分配...",
    "module": "XX系统",
    "customer": "XX科技"
  }
}

// 输出：拆分后的子任务数组
{
  "parentTaskId": "原始任务ID",
  "subTasks": [
    {
      "title": "登录页面增加验证码",
      "description": "在现有登录页面增加图形验证码功能...",
      "module": "登录模块",
      "bugOrReq": "req",
      "estimatedHours": 4,
      "riskLevel": "L2",
      "acceptanceCriteria": "1. 验证码正常显示\n2. 验证失败有提示\n3. 刷新验证码可用"
    },
    {
      "title": "用户列表加导出功能",
      "description": "...",
      "riskLevel": "L2"
    }
  ],
  "confidence": 0.85,
  "splitReason": "按序号和功能模块拆分为3个独立任务"
}
```

**数据库改动**：

```sql
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT DEFAULT '';
ALTER TABLE tasks ADD COLUMN split_source TEXT DEFAULT '';  -- 'manual' | 'agent'
```

- 子任务的 `parent_task_id` 指向原始任务
- 原始任务标记为 `status: 'split'`，不再进入开发队列
- 子任务各自独立流转（各自关联项目、唤醒 Agent）

**前端交互**：

1. 任务详情页检测到需要拆分时，显示"智能拆分"按钮
2. 点击后调用 `/split`，弹出确认面板（可编辑每个子任务的标题、描述、模块）
3. 用户确认后批量创建子任务，原始任务标记为已拆分
4. 子任务各自走正常的关联项目 → 启动流程

**关联项目维度（从强到弱）**：

| 维度 | 数据来源 | 匹配方式 | 置信度 |
| --- | --- | --- | --- |
| project 精确匹配 | `tasks.project` = `project_configs.name` | 精确 | 0.95 |
| module 匹配 | `tasks.module` ∈ `project_configs.tags` | 模糊 | +0.3 |
| customer 匹配 | `tasks.customer` = 历史中同客户关联的项目 | 统计 | +0.2 |
| 路径匹配 | `tasks.project_path` 前缀匹配 `project_configs.localPath` | 精确 | 0.95 |
| Agent 语义分析 | 标题/描述 vs 项目标签/路径 | AI | 辅助 |

**字段映射关系**：

```
tasks.project        → 内网项目名（只读，同步来源）
tasks.project_path   → 本地项目路径（用户/规则/Agent 填充）
tasks.module         → 模块名（辅助匹配维度）
tasks.customer       → 客户名（辅助匹配维度）

project_configs.name → 本地项目配置名
project_configs.localPath → 本地路径
project_configs.tags → 标签（匹配关键词）
```

关联的本质：根据上述维度找到 `project_configs.id`，取其 `localPath` 和 `gitBranch` 填入 task。

**关联流转链**：

```
任务同步进来
  ↓
① tasks.project 精确匹配 project_configs.name → 直接关联（现有逻辑）
  ↓ 失败
② 规则引擎：keyword/regex 匹配 → 命中则关联
  ↓ 失败
③ 历史学习：module + customer 组合查历史 → 命中则推荐
  ↓ 失败
④ 预处理 Agent 语义分析 → 推荐候选（confidence 0.5-0.9）
  ↓ 失败
⑤ 标记 project_path 为空，等待用户手动配置
  ↓ 用户手动选择
⑥ 记录到 project_history，下次同类任务自动匹配
```

**工作量**：2-3 天（含预处理 Agent 指南更新）

---

## 四、分阶段实施计划

### 第一阶段：立竿见影（第 1-2 周）

| 优先级 | 功能 | 工作量 | 价值 |
| --- | --- | --- | --- |
| P0 | 一键启动 | 1-2 天 | 极高 — 从 7 步减到 1 步 |
| P0 | 成功率统计 | 2-3 天 | 高 — 量化 Agent 表现 |
| P1 | 任务模板 | 1.5-2 天 | 高 — 标准化需求信息 |

**交付物**：
- `server/src/services/quick-start.ts`
- `server/src/services/performance-stats.ts`
- `server/src/routes/templates.ts`
- 前端：任务卡片"启动"按钮、Dashboard 统计图表、模板选择器

**无新依赖**，纯复用现有技术栈。

---

### 第二阶段：智能引擎（第 3-4 周）

| 优先级 | 功能 | 工作量 | 价值 |
| --- | --- | --- | --- |
| P0 | 文档拆分（多任务提取） | 2-3 天 | 极高 — 解决产品一个文档放多任务的痛点 |
| P0 | 项目自动识别（规则+历史） | 4-5 天 | 极高 — 消除大部分手动配置 |
| P1 | 风险评估 | 2-3 天 | 中高 — 预警 + Agent 安全 |
| P2 | 习惯学习 | 2-3 天 | 中 — 越用越准 |

**交付物**：
- `server/src/routes/preprocess.ts`（拆分 API）
- `server/src/routes/rules.ts`
- `server/src/services/project-matcher.ts`
- `server/src/services/risk-assessor.ts`
- `server/src/services/habit-learner.ts`
- 前端：任务详情"智能拆分"按钮、规则编辑器、风险标签、智能推荐

**新增 3 张表**：`project_rules`、`project_history`、`user_preferences`。
**tasks 表新增 2 字段**：`parent_task_id`、`split_source`。

---

### 第三阶段：深度自动化（第 5-8 周）

| 优先级 | 功能 | 工作量 | 价值 |
| --- | --- | --- | --- |
| P1 | 验收清单 | 2-3 天 | 中 — 半自动验收 |
| P1 | 步骤级回滚 | 3-4 天 | 高 — 安全网（需更新 QClaw 指南 v10） |
| P2 | Agent 兜底识别 | 1 天 | 低中 — 极端场景 |

**风险控制**：
- 步骤级回滚需更新 QClaw 指南（v10），预处理 Agent 变更写在独立指南 `PREPROCESS_AGENT_GUIDE.md`，不合并

---

## 五、风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 规则匹配过度激进，关联错项目 | 任务路由到错误仓库 | 低置信度时必须用户确认；所有自动操作可撤销 |
| Agent 协议变更（步骤级 commit）破坏兼容性 | 功能 5 影响现有 Agent | 步骤 commit 可选，仅新版 Agent 启用；向后兼容 |
| 大量规则影响同步性能 | 同步变慢 | 只对新任务/未匹配任务执行规则；结果缓存 |
| SQLite 并发写入 | DB 锁竞争 | 规则匹配在同步事务内执行，复用 better-sqlite3 同步模型 |
| 文档拆分不准确 | 拆出错误的子任务 | 拆分结果必须用户确认才生效；Agent 置信度 < 0.7 时不自动拆分 |

---

## 六、技术约束

- **不新增第三方依赖** — 全部用现有技术栈
- **不破坏现有架构** — 新增模块，不重构核心
- **向后兼容** — Agent 指南变更不影响旧版 Agent
- **数据安全** — 所有自动操作可追溯、可撤销

---

## 七、完整流程愿景

```
┌──────────────────────────────────────────────────────────────┐
│ 内网系统                                                      │
│ 自动拉取任务                                                  │
└───────────────┬──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────┐
│ 文档拆分（P2 新增）                                            │
│ 检测多任务文档 → 预处理 Agent 拆分为独立子任务 → 用户确认       │
│ 单任务文档直接通过                                             │
└───────────────┬──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────┐
│ 智能预处理（P2）                                               │
│ 规则匹配项目 → 历史学习推荐 → 风险评估 → 自动填充模板          │
│ 匹配不上 → 标记"待确认"                                       │
└───────────────┬──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────┐
│ 一键启动（P1）                                                 │
│ 点"启动" → 自动配好项目/分支/模板 → 唤醒 Agent                 │
└───────────────┬──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────┐
│ Agent 执行（ATEP 协议）                                        │
│ 上报方案 → 人类审批 → 写代码 → 步骤级快照 → 自动 commit       │
│ 人类随时补充说明、审批、终止                                    │
└───────────────┬──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────┐
│ 验收闭环（P3）                                                 │
│ 自动生成验收清单 → 人类勾选确认 → 统计成功率 → 优化规则        │
└──────────────────────────────────────────────────────────────┘
```

**核心一句话：减少手动操作，任务从进入到完成自动流转，用户只做关键决策。**
