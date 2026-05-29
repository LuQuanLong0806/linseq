"""
集成示例：在你的项目中使用 OpenClaw Agent

三种方式：
  1. 直接 HTTP 调用（最简单）
  2. 使用 OpenClawClient 类
  3. 使用快捷函数
"""

# ============================================================
# 方式一：直接 HTTP 调用（无需额外依赖）
# ============================================================

import requests

def ask_agent_simple(message: str, agent_id: str = "main") -> str:
    """最简单的调用方式"""
    response = requests.post(
        "http://localhost:50439/v1/chat/completions",
        headers={
            "Authorization": "Bearer 34b619355da794f9d0eef24ed565ad51396eb64d588d7df1",
            "Content-Type": "application/json"
        },
        json={
            "model": f"openclaw/{agent_id}",
            "messages": [{"role": "user", "content": message}]
        },
        timeout=120
    )
    return response.json()["choices"][0]["message"]["content"]

# 使用
# reply = ask_agent_simple("Hello", "main")
# print(reply)


# ============================================================
# 方式二：使用 OpenClawClient 类（推荐）
# ============================================================

# 先导入客户端类（从 openclaw_client.py）
# from openclaw_client import OpenClawClient

# 初始化
# client = OpenClawClient(
#     api_key="YOUR_TOKEN_HERE",
#     timeout=120
# )

# 单次调用
# reply = await client.ask("设计一个API", agent_id="ai_engineer")

# 流式调用
# async for chunk in client.ask_stream("写一个故事"):
#     print(chunk)

# 批量调用
# results = await client.ask_batch([
#     {"agent_id": "ai_engineer", "message": "任务A"},
#     {"agent_id": "python", "message": "任务B"},
# ])


# ============================================================
# 方式三：使用快捷函数（最便捷）
# ============================================================

# from openclaw_client import ask

# reply = await ask("Hello", agent="main")


# ============================================================
# 完整示例：集成到 Web 服务
# ============================================================

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

# 初始化客户端
# from openclaw_client import OpenClawClient
# client = OpenClawClient(api_key="YOUR_TOKEN_HERE")

class AskRequest(BaseModel):
    message: str
    agent: str = "main"

@app.post("/ask")
async def ask_endpoint(req: AskRequest):
    """HTTP API endpoint that calls OpenClaw Agent"""
    # reply = await client.ask(req.message, agent_id=req.agent)
    # return {"reply": reply}
    
    # 临时使用简单方式
    reply = ask_agent_simple(req.message, req.agent)
    return {"reply": reply}

# 启动: uvicorn integration_example:app --reload


# ============================================================
# 完整示例：集成到 CLI 工具
# ============================================================

import asyncio
import sys

async def cli_chat():
    """命令行聊天"""
    print("OpenClaw Agent CLI (type 'quit' to exit)")
    print("-" * 40)
    
    # client = OpenClawClient(api_key="YOUR_TOKEN_HERE")
    
    while True:
        try:
            user_input = input("You: ").strip()
            if user_input.lower() in ["quit", "exit", "q"]:
                break
            
            if not user_input:
                continue
            
            # reply = await client.ask(user_input, agent_id="main")
            reply = ask_agent_simple(user_input, "main")
            print(f"Agent: {reply}\n")
            
        except KeyboardInterrupt:
            break
    
    print("Bye!")

# if __name__ == "__main__":
#     asyncio.run(cli_chat())


# ============================================================
# 完整示例：集成到定时任务
# ============================================================

async def scheduled_report():
    """定时生成报告"""
    # client = OpenClawClient(api_key="YOUR_TOKEN_HERE")
    
    report = await client.ask(
        "生成今日工作日报，包括：1. 昨日进展 2. 今日计划 3. 风险",
        agent_id="main"
    )
    
    # 发送报告（邮件/Slack/等）
    print("Daily Report:")
    print(report)
    
    return report

# 使用 cron 定时调用:
# */30 * * * * cd /path/to/project && python -c "import asyncio; from integration_example import scheduled_report; asyncio.run(scheduled_report())"


# ============================================================
# 完整示例：集成到数据处理流程
# ============================================================

async def analyze_data(data: str) -> str:
    """使用 Agent 分析数据"""
    # client = OpenClawClient(api_key="YOUR_TOKEN_HERE")
    
    prompt = f"""分析以下数据并给出洞察：

数据：
{data}

请提供：
1. 关键指标
2. 异常检测
3. 建议
"""
    
    return await client.ask(prompt, agent_id="python")

# 使用
# insights = await analyze_data("user_id,clicks,conversions\n1,100,5\n2,150,8")


# ============================================================
# 环境配置
# ============================================================

# 生产环境建议使用环境变量:
# export OPENCLAW_API_KEY="your-token-here"
# export OPENCLAW_BASE_URL="http://your-gateway:50439/v1/chat/completions"

# 或在 .env 文件中:
# OPENCLAW_API_KEY=your-token-here
# OPENCLAW_BASE_URL=http://localhost:50439/v1/chat/completions


if __name__ == "__main__":
    # 测试简单调用
    print("Testing simple call...")
    reply = ask_agent_simple("Say 'Hello' in one word", "main")
    print(f"Reply: {reply}")
