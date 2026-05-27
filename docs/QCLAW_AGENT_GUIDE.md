# QClaw Agent 开发指南 — 灵序 LineSequence

> 本文档供 AI Agent（QClaw）存储到记忆中，用于自动化任务开发调度。

## 服务地址

```
BASE_URL = http://localhost:3201/api/agent
```

## 核心开发循环

```
1. GET  /next-task          → 获取下一个待开发任务（含完整上下文）
2. POST /task/:id/start     → 标记开始开发
3. POST /task/:id/log       → 上报开发日志（可多次）
4. POST /task/:id/complete  → 提交开发产出，自动建版本，移入审核
5. 回到步骤 1
```

---

## 接口详细说明

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

    "review": {
      "prevComment": "上轮审核意见（仅返工时有值）",
      "prevVersion": "V1.0（仅返工时有值）"
    },

    "nextVersion": "V1.0"
  }
}
```

**特殊说明：**
- 返工任务（`isRework=true`）优先返回
- 如果队列为空，`data` 为 `null`
- `requirement.docText` 是从需求文档 PDF 提取的文本，可能需要结合 `customDescription` 理解需求

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

- `action` 可选值：`开发`、`调试`、`重构`、`自测` 等，默认 `"开发"`
- `content` 必填，日志内容

### 4. POST /api/agent/task/:id/complete

开发完成，提交产出物。系统会自动：
- 创建版本记录（自动递增版本号）
- 将任务状态设为 `ai_review`（待审核）
- 从待办队列移除

**请求体：**

```json
{
  "aiOutput": "开发产出的代码/文件描述",
  "summary": "完成了XXX功能的开发",
  "durationMs": 120000
}
```

- `aiOutput`：开发产出描述（代码变更、生成文件等）
- `summary`：完成摘要
- `durationMs`：开发耗时（毫秒）

**响应：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "versionId": "uuid",
    "versionNumber": "V1.0",
    "taskId": "xxx",
    "aiStatus": "ai_review"
  }
}
```

---

## 辅助接口

### GET /api/agent/stats

获取队列统计信息。

**响应：**

```json
{
  "code": 0,
  "data": {
    "todoCount": 5,
    "inDev": 1,
    "inReview": 2,
    "rework": 1,
    "totalTasks": 30,
    "currentTask": { "id": "xxx", "title": "xxx", "ai_status": "ai_dev" }
  }
}
```

### GET /api/agent/todo-order

获取当前待办队列排序。

### POST /api/agent/todo-order

保存待办队列排序（前端调用，Agent 一般不需要）。

**请求体：**

```json
{ "todoList": ["taskId1", "taskId2", "taskId3"] }
```

### POST /api/agent/sync

触发从内网同步任务数据。

---

## 任务状态流转

```
(空) ──入待办──→ ai_todo ──start──→ ai_dev ──complete──→ ai_review
                  ↑                                      │
                  └──── reject (返工) ←──────────────────┘
                                                         │
                                                   approve (通过)
                                                         │
                                                         ↓
                                                      (结束)
```

**状态值：**
- `ai_todo` — 待开发
- `ai_dev` — 开发中
- `ai_review` — 待审核
- `ai_rework` — 返工（审核不通过，需重新开发）

## 版本号规则

版本号格式为 `V{major}.{minor}`：
- `iteration` 从 0 开始递增
- `major = Math.floor(iteration / 10) + 1`
- `minor = iteration % 10`
- 示例：V1.0 → V1.1 → ... → V1.9 → V2.0

## 开发上下文使用指南

### 需求理解
1. 优先阅读 `requirement.docText`（需求文档原文提取）
2. 结合 `requirement.customDescription`（人工补充说明）
3. 对照 `requirement.acceptanceCriteria`（验收标准）确认交付范围

### 项目配置
- `project.path` — 本地项目路径，代码在此目录操作
- `project.gitBranch` — 指定开发分支

### 返工场景
当 `isRework=true` 时：
1. 查看 `review.prevComment` 了解审核意见
2. 查看 `review.prevVersion` 了解上一轮版本号
3. 针对审核意见修改代码，完成后提交新版本

## 完整调用示例

```bash
# 1. 取任务
curl http://localhost:3201/api/agent/next-task

# 2. 开始开发
curl -X POST http://localhost:3201/api/agent/task/{taskId}/start

# 3. 开发日志
curl -X POST http://localhost:3201/api/agent/task/{taskId}/log \
  -H "Content-Type: application/json" \
  -d '{"action":"开发","content":"开始实现核心逻辑"}'

# 4. 完成
curl -X POST http://localhost:3201/api/agent/task/{taskId}/complete \
  -H "Content-Type: application/json" \
  -d '{"aiOutput":"新增 login.vue 组件...","summary":"完成登录页开发","durationMs":180000}'

# 5. 继续下一个
curl http://localhost:3201/api/agent/next-task
```

## 版本审核接口（人工/Agent 均可调用）

```
GET  /api/versions/task/:taskId       — 获取任务所有版本
POST /api/versions/:id/approve        — 审核通过
POST /api/versions/:id/reject         — 审核打回 { comment: "修改意见" }
GET  /api/versions/:id                — 获取版本详情
```
