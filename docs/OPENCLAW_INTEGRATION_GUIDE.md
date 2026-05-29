# OpenClaw Agent HTTP 集成指南

**版本**: 1.0  
**日期**: 2026-05-29  
**适用于**: 外部项目集成 OpenClaw Agent

---

## 目录

1. [概述](#1-概述)
2. [环境要求](#2-环境要求)
3. [配置步骤](#3-配置步骤)
4. [基础调用](#4-基础调用)
5. [进阶功能](#5-进阶功能)
6. [错误处理](#6-错误处理)
7. [最佳实践](#7-最佳实践)
8. [常见问题](#8-常见问题)

---

## 1. 概述

### 1.1 能力说明

OpenClaw Gateway 提供 OpenAI 兼容的 HTTP API，支持：

- ✅ 唤醒指定 Agent
- ✅ 流式响应
- ✅ 多轮对话（无状态）
- ✅ 并行调用多个 Agent
- ✅ 结果 Webhook 回调
- ✅ 智能路由

### 1.2 架构图

```
┌─────────────────┐
│  你的项目        │
│  (Python/Node/) │
└────────┬────────┘
         │ HTTP POST
         ▼
┌─────────────────┐      ┌─────────────────┐
│  OpenClaw       │      │  Agents         │
│  Gateway        │─────►│  - QClaw        │
│  :50439         │      │  - AI工程师     │
└─────────────────┘      │  - Unity架构师  │
                         │  - Python全栈   │
                         │  - ...          │
                         └─────────────────┘
```

---

## 2. 环境要求

### 2.1 前置条件

| 项目 | 要求 |
|------|------|
| OpenClaw | v0.2.23+ 运行中 |
| Gateway | 已启用，端口可访问 |
| 网络 | 本机访问（默认 loopback） |

### 2.2 获取配置信息

在 OpenClaw 配置文件 `~/.qclaw/openclaw.json` 中获取：

```json
{
  "gateway": {
    "port": 50439,                    // Gateway 端口
    "auth": {
      "token": "your-token-here"      // 认证 Token
    },
    "http": {
      "endpoints": {
        "chatCompletions": {
          "enabled": true              // 必须为 true
        }
      }
    }
  }
}
```

### 2.3 Agent ID 列表

| Agent 名称 | Agent ID | 适用场景 |
|------------|----------|----------|
| QClaw | `main` | 通用任务、日常问答 |
| AI工程师 | `ua58rsb93veqtxl7` | 架构设计、DevOps、API设计 |
| Unity架构师 | `jwag9yx1mrcclqzo` | Unity开发、ECS、游戏架构 |
| Python全栈 | `tfxjjhfnjialcuju` | Python、FastAPI、数据处理 |
| 游戏设计师 | `uafru5gofdt644lm` | 游戏机制、关卡设计 |
| 小说创作专家 | `ds4ygtfdv3z7mmxn` | 故事创作、文案 |
| 灵序 LINSEQ | `agent-209e563a` | Web前端、React、UI/UX |

---

## 3. 配置步骤

### 3.1 步骤一：确认 Gateway 运行

```powershell
# Windows
openclaw gateway status

# 如果未运行
openclaw gateway start
```

### 3.2 步骤二：测试连接

```powershell
# 使用 PowerShell 测试
Invoke-RestMethod -Uri "http://localhost:50439/v1/models" `
    -Headers @{ "Authorization" = "Bearer YOUR_TOKEN" }
```

成功响应：
```json
{
  "object": "list",
  "data": [{"id": "openclaw", "object": "model"}]
}
```

### 3.3 步骤三：在你的项目中配置

#### Python 项目

创建配置文件 `config.py`:

```python
# config.py
OPENCLAW_CONFIG = {
    "base_url": "http://localhost:50439/v1/chat/completions",
    "api_key": "34b619355da794f9d0eef24ed565ad51396eb64d588d7df1",
    "timeout": 120,
    "default_agent": "main",
}

AGENT_MAPPING = {
    "general": "main",
    "ai_engineer": "ua58rsb93veqtxl7",
    "unity": "jwag9yx1mrcclqzo",
    "python": "tfxjjhfnjialcuju",
    "game_design": "uafru5gofdt644lm",
    "story": "ds4ygtfdv3z7mmxn",
    "frontend": "agent-209e563a",
}
```

#### Node.js 项目

创建配置文件 `openclaw.config.js`:

```javascript
// openclaw.config.js
module.exports = {
  baseUrl: 'http://localhost:50439/v1/chat/completions',
  apiKey: '34b619355da794f9d0eef24ed565ad51396eb64d588d7df1',
  timeout: 120000,
  defaultAgent: 'main',
  
  agents: {
    general: 'main',
    aiEngineer: 'ua58rsb93veqtxl7',
    unity: 'jwag9yx1mrcclqzo',
    python: 'tfxjjhfnjialcuju',
    gameDesign: 'uafru5gofdt644lm',
    story: 'ds4ygtfdv3z7mmxn',
    frontend: 'agent-209e563a',
  }
};
```

#### 环境变量方式（推荐生产环境）

```bash
# .env
OPENCLAW_BASE_URL=http://localhost:50439/v1/chat/completions
OPENCLAW_API_KEY=34b619355da794f9d0eef24ed565ad51396eb64d588d7df1
OPENCLAW_TIMEOUT=120
```

---

## 4. 基础调用

### 4.1 最简示例

#### Python

```python
import requests

def ask_agent(message: str, agent_id: str = "main") -> str:
    """调用 OpenClaw Agent"""
    response = requests.post(
        "http://localhost:50439/v1/chat/completions",
        headers={
            "Authorization": "Bearer YOUR_TOKEN",
            "Content-Type": "application/json"
        },
        json={
            "model": f"openclaw/{agent_id}",
            "messages": [{"role": "user", "content": message}]
        },
        timeout=120
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]

# 使用
reply = ask_agent("设计一个用户认证系统", agent_id="ua58rsb93veqtxl7")
print(reply)
```

#### Node.js

```javascript
const axios = require('axios');

async function askAgent(message, agentId = 'main') {
  const response = await axios.post(
    'http://localhost:50439/v1/chat/completions',
    {
      model: `openclaw/${agentId}`,
      messages: [{ role: 'user', content: message }]
    },
    {
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN',
        'Content-Type': 'application/json'
      },
      timeout: 120000
    }
  );
  return response.data.choices[0].message.content;
}

// 使用
const reply = await askAgent('设计一个用户认证系统', 'ua58rsb93veqtxl7');
console.log(reply);
```

#### cURL

```bash
curl -X POST http://localhost:50439/v1/chat/completions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openclaw/ua58rsb93veqtxl7",
    "messages": [{"role": "user", "content": "设计一个用户认证系统"}]
  }'
```

### 4.2 响应格式

```json
{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "created": 1780019901,
  "model": "openclaw",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Agent 的回复内容..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 24126,
    "completion_tokens": 267,
    "total_tokens": 24393
  }
}
```

### 4.3 流式响应

对于长任务，使用流式响应获得实时输出：

#### Python 流式

```python
import requests
import json

def ask_agent_stream(message: str, agent_id: str = "main"):
    """流式调用 Agent"""
    response = requests.post(
        "http://localhost:50439/v1/chat/completions",
        headers={
            "Authorization": "Bearer YOUR_TOKEN",
            "Content-Type": "application/json"
        },
        json={
            "model": f"openclaw/{agent_id}",
            "messages": [{"role": "user", "content": message}],
            "stream": True
        },
        timeout=120,
        stream=True
    )
    
    for line in response.iter_lines():
        if line:
            line = line.decode('utf-8')
            if line.startswith('data: ') and line != 'data: [DONE]':
                try:
                    data = json.loads(line[6:])
                    delta = data['choices'][0].get('delta', {})
                    content = delta.get('content', '')
                    if content:
                        yield content
                except json.JSONDecodeError:
                    pass

# 使用
for chunk in ask_agent_stream("写一个完整的技术方案", "ua58rsb93veqtxl7"):
    print(chunk, end='', flush=True)
```

#### Node.js 流式

```javascript
async function* askAgentStream(message, agentId = 'main') {
  const response = await fetch('http://localhost:50439/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: `openclaw/${agentId}`,
      messages: [{ role: 'user', content: message }],
      stream: true
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const data = JSON.parse(line.slice(6));
          const content = data.choices[0]?.delta?.content || '';
          if (content) yield content;
        } catch (e) {}
      }
    }
  }
}

// 使用
for await (const chunk of askAgentStream('写一个完整的技术方案', 'ua58rsb93veqtxl7')) {
  process.stdout.write(chunk);
}
```

---

## 5. 进阶功能

### 5.1 并行调用多个 Agent

```python
import asyncio
import httpx

async def ask_agent_async(client, message: str, agent_id: str) -> dict:
    """异步调用单个 Agent"""
    response = await client.post(
        "http://localhost:50439/v1/chat/completions",
        headers={
            "Authorization": "Bearer YOUR_TOKEN",
            "Content-Type": "application/json"
        },
        json={
            "model": f"openclaw/{agent_id}",
            "messages": [{"role": "user", "content": message}]
        }
    )
    data = response.json()
    return {
        "agent_id": agent_id,
        "reply": data["choices"][0]["message"]["content"]
    }

async def ask_multiple_agents(message: str, agent_ids: list) -> list:
    """并行调用多个 Agent"""
    async with httpx.AsyncClient(timeout=120) as client:
        tasks = [ask_agent_async(client, message, aid) for aid in agent_ids]
        results = await asyncio.gather(*tasks)
    return results

# 使用
results = await ask_multiple_agents(
    "最佳微服务通信方案？",
    ["ua58rsb93veqtxl7", "tfxjjhfnjialcuju"]
)

for r in results:
    print(f"[{r['agent_id']}]: {r['reply'][:100]}...")
```

### 5.2 智能路由

根据问题内容自动选择 Agent：

```python
import re

ROUTING_RULES = {
    "ua58rsb93veqtxl7": [  # AI Engineer
        r"\b(api|microservice|backend|architecture|database|rest)\b",
        r"\b(deploy|devops|kubernetes|docker)\b",
    ],
    "tfxjjhfnjialcuju": [  # Python
        r"\bpython\b",
        r"\b(fastapi|flask|django|pandas|numpy)\b",
    ],
    "jwag9yx1mrcclqzo": [  # Unity
        r"\bunity\b",
        r"\b(ecs|dots|scriptableobject|gameobject)\b",
    ],
    "ds4ygtfdv3z7mmxn": [  # Story
        r"\b(story|novel|write|creative|narrative)\b",
    ],
}

def route_message(message: str) -> str:
    """根据内容路由到最合适的 Agent"""
    message_lower = message.lower()
    scores = {}
    
    for agent_id, patterns in ROUTING_RULES.items():
        score = sum(len(re.findall(p, message_lower)) for p in patterns)
        if score > 0:
            scores[agent_id] = score
    
    if not scores:
        return "main"
    
    return max(scores, key=scores.get)

# 使用
agent_id = route_message("帮我优化 Python 异步代码")  # -> "tfxjjhfnjialcuju"
reply = ask_agent("帮我优化 Python 异步代码", agent_id)
```

### 5.3 Webhook 回调

Agent 完成任务后回调你的服务器：

```python
import requests

def ask_with_callback(message: str, agent_id: str, callback_url: str):
    """调用 Agent 并回调结果"""
    # 1. 调用 Agent
    response = requests.post(
        "http://localhost:50439/v1/chat/completions",
        headers={
            "Authorization": "Bearer YOUR_TOKEN",
            "Content-Type": "application/json"
        },
        json={
            "model": f"openclaw/{agent_id}",
            "messages": [{"role": "user", "content": message}]
        },
        timeout=120
    )
    
    result = response.json()
    reply = result["choices"][0]["message"]["content"]
    
    # 2. 回调
    callback_data = {
        "agent_id": agent_id,
        "message": message,
        "reply": reply,
        "tokens": result["usage"]["total_tokens"],
    }
    
    requests.post(callback_url, json=callback_data)
    return reply
```

### 5.4 批量任务队列

```python
import asyncio
import httpx
from typing import Callable

class AgentTaskQueue:
    """Agent 任务队列"""
    
    def __init__(self, max_concurrent: int = 3):
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
    
    async def execute_task(
        self,
        client: httpx.AsyncClient,
        task: dict,
        on_complete: Callable = None
    ):
        """执行单个任务"""
        async with self.semaphore:
            response = await client.post(
                "http://localhost:50439/v1/chat/completions",
                headers={
                    "Authorization": "Bearer YOUR_TOKEN",
                    "Content-Type": "application/json"
                },
                json={
                    "model": f"openclaw/{task['agent_id']}",
                    "messages": [{"role": "user", "content": task['message']}]
                }
            )
            result = response.json()
            output = {
                "task_id": task.get("id"),
                "agent_id": task["agent_id"],
                "reply": result["choices"][0]["message"]["content"],
            }
            
            if on_complete:
                await on_complete(output)
            
            return output
    
    async def run_batch(self, tasks: list, on_complete: Callable = None):
        """批量执行任务"""
        async with httpx.AsyncClient(timeout=120) as client:
            coros = [
                self.execute_task(client, task, on_complete)
                for task in tasks
            ]
            return await asyncio.gather(*coros)

# 使用
queue = AgentTaskQueue(max_concurrent=2)

tasks = [
    {"id": 1, "agent_id": "ua58rsb93veqtxl7", "message": "任务A"},
    {"id": 2, "agent_id": "tfxjjhfnjialcuju", "message": "任务B"},
    {"id": 3, "agent_id": "main", "message": "任务C"},
]

results = await queue.run_batch(tasks)
```

---

## 6. 错误处理

### 6.1 常见错误码

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `401 Unauthorized` | Token 无效或缺失 | 检查 Authorization header |
| `400 Invalid model` | model 格式错误 | 使用 `openclaw/{agentId}` 格式 |
| `504 Gateway Timeout` | Agent 响应超时 | 增加 timeout 参数 |
| `Connection refused` | Gateway 未运行 | 启动 Gateway 服务 |

### 6.2 错误处理示例

```python
import requests
from typing import Optional

def ask_agent_safe(message: str, agent_id: str = "main", retries: int = 3) -> Optional[str]:
    """带重试的安全调用"""
    for attempt in range(retries):
        try:
            response = requests.post(
                "http://localhost:50439/v1/chat/completions",
                headers={
                    "Authorization": "Bearer YOUR_TOKEN",
                    "Content-Type": "application/json"
                },
                json={
                    "model": f"openclaw/{agent_id}",
                    "messages": [{"role": "user", "content": message}]
                },
                timeout=120
            )
            
            if response.status_code == 401:
                raise ValueError("Invalid API token")
            
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]
            
        except requests.Timeout:
            print(f"Timeout, retry {attempt + 1}/{retries}")
            if attempt == retries - 1:
                raise
            continue
            
        except requests.ConnectionError:
            print(f"Connection failed, retry {attempt + 1}/{retries}")
            if attempt == retries - 1:
                raise ValueError("Gateway not running")
            continue
    
    return None
```

---

## 7. 最佳实践

### 7.1 性能优化

```python
# 1. 使用连接池
import httpx

# 推荐：异步客户端 + 连接池
client = httpx.AsyncClient(
    timeout=120,
    limits=httpx.Limits(max_connections=10, max_keepalive_connections=5)
)

# 2. 合理设置超时
TIMEOUT_CONFIG = {
    "connect": 5,      # 连接超时
    "read": 120,       # 读取超时（Agent 思考时间）
    "write": 10,       # 写入超时
    "pool": 5,         # 连接池超时
}

# 3. 控制并发
MAX_CONCURRENT = 3  # 同时最多 3 个请求
```

### 7.2 安全建议

```python
# 1. 使用环境变量存储 Token
import os

API_KEY = os.environ.get("OPENCLAW_API_KEY")

# 2. 不要硬编码 Token
# ❌ 错误
API_KEY = "34b619355da794f9d0eef24ed565ad51396eb64d588d7df1"

# ✅ 正确
API_KEY = os.environ["OPENCLAW_API_KEY"]

# 3. 生产环境使用 HTTPS
BASE_URL = "https://your-gateway.com/v1/chat/completions"
```

### 7.3 监控与日志

```python
import logging
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("openclaw")

def ask_agent_with_logging(message: str, agent_id: str = "main") -> str:
    """带日志的调用"""
    start_time = time.time()
    
    logger.info(f"Calling agent: {agent_id}")
    logger.debug(f"Message: {message[:100]}...")
    
    try:
        response = requests.post(...)
        result = response.json()
        
        duration = time.time() - start_time
        tokens = result["usage"]["total_tokens"]
        
        logger.info(f"Completed in {duration:.2f}s, {tokens} tokens")
        
        return result["choices"][0]["message"]["content"]
        
    except Exception as e:
        logger.error(f"Failed: {e}")
        raise
```

---

## 8. 常见问题

### Q1: 如何判断 Agent 是否可用？

```python
def check_gateway() -> bool:
    """检查 Gateway 状态"""
    try:
        response = requests.get(
            "http://localhost:50439/v1/models",
            headers={"Authorization": "Bearer YOUR_TOKEN"},
            timeout=5
        )
        return response.status_code == 200
    except:
        return False

if not check_gateway():
    print("Gateway not available")
```

### Q2: 能否保持多轮对话状态？

HTTP API 是**无状态**的。如需多轮对话，手动传递历史：

```python
def multi_turn_chat(messages: list, agent_id: str = "main") -> str:
    """多轮对话（手动维护历史）"""
    response = requests.post(
        "http://localhost:50439/v1/chat/completions",
        headers={...},
        json={
            "model": f"openclaw/{agent_id}",
            "messages": messages  # 传递完整历史
        }
    )
    return response.json()["choices"][0]["message"]["content"]

# 使用
history = [{"role": "user", "content": "你好"}]
reply = multi_turn_chat(history)
history.append({"role": "assistant", "content": reply})
history.append({"role": "user", "content": "继续"})
reply = multi_turn_chat(history)
```

### Q3: 如何限制响应长度？

```python
response = requests.post(
    ...,
    json={
        "model": "openclaw/main",
        "messages": [{"role": "user", "content": "..."}],
        "max_tokens": 500  # 限制最多 500 tokens
    }
)
```

### Q4: 外网如何访问？

修改 Gateway 配置：

```json
{
  "gateway": {
    "bind": "all",  // 从 "loopback" 改为 "all"
    "auth": {
      "mode": "token",
      "token": "strong-token-here"  // 使用强 Token
    }
  }
}
```

或使用 Tailscale：
```json
{
  "gateway": {
    "tailscale": {
      "mode": "on"
    }
  }
}
```

---

## 附录：完整示例代码

### Python 完整封装类

```python
"""
openclaw_client.py - OpenClaw Agent HTTP Client
"""

import os
import json
import asyncio
from typing import Optional, List, Dict, AsyncGenerator
import httpx

class OpenClawClient:
    """OpenClaw Agent 客户端"""
    
    def __init__(
        self,
        base_url: str = None,
        api_key: str = None,
        timeout: int = 120,
        max_concurrent: int = 5
    ):
        self.base_url = base_url or os.environ.get(
            "OPENCLAW_BASE_URL",
            "http://localhost:50439/v1/chat/completions"
        )
        self.api_key = api_key or os.environ.get("OPENCLAW_API_KEY")
        self.timeout = timeout
        self.max_concurrent = max_concurrent
        self._semaphore = asyncio.Semaphore(max_concurrent)
    
    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    async def ask(
        self,
        message: str,
        agent_id: str = "main",
        max_tokens: Optional[int] = None
    ) -> str:
        """发送消息给指定 Agent"""
        async with self._semaphore:
            payload = {
                "model": f"openclaw/{agent_id}",
                "messages": [{"role": "user", "content": message}]
            }
            if max_tokens:
                payload["max_tokens"] = max_tokens
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.base_url,
                    headers=self._headers(),
                    json=payload
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]
    
    async def ask_stream(
        self,
        message: str,
        agent_id: str = "main"
    ) -> AsyncGenerator[str, None]:
        """流式获取响应"""
        payload = {
            "model": f"openclaw/{agent_id}",
            "messages": [{"role": "user", "content": message}],
            "stream": True
        }
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST",
                self.base_url,
                headers=self._headers(),
                json=payload
            ) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        try:
                            data = json.loads(line[6:])
                            delta = data["choices"][0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            pass
    
    async def ask_batch(
        self,
        tasks: List[Dict[str, str]]
    ) -> List[Dict[str, str]]:
        """批量执行任务"""
        async def _run(task):
            reply = await self.ask(task["message"], task.get("agent_id", "main"))
            return {"task": task, "reply": reply}
        
        return await asyncio.gather(*[_run(t) for t in tasks])
    
    def check_health(self) -> bool:
        """检查 Gateway 状态"""
        try:
            import requests
            models_url = self.base_url.replace("/chat/completions", "/models")
            response = requests.get(
                models_url,
                headers=self._headers(),
                timeout=5
            )
            return response.status_code == 200
        except:
            return False


# 使用示例
if __name__ == "__main__":
    client = OpenClawClient()
    
    # 单次调用
    reply = asyncio.run(client.ask("Hello", "main"))
    print(reply)
    
    # 批量调用
    tasks = [
        {"agent_id": "ua58rsb93veqtxl7", "message": "任务A"},
        {"agent_id": "tfxjjhfnjialcuju", "message": "任务B"},
    ]
    results = asyncio.run(client.ask_batch(tasks))
    print(results)
```

---

**文档版本**: 1.0  
**最后更新**: 2026-05-29
