"""
OpenClaw Agent Client - Production Ready
集成到你的项目中使用

Usage:
    from openclaw_client import OpenClawClient
    
    client = OpenClawClient()
    reply = await client.ask("Hello", agent_id="main")
"""

import os
import json
import asyncio
from typing import Optional, List, Dict, AsyncGenerator, Callable
import logging
import httpx

# 配置日志
logger = logging.getLogger("openclaw")


class OpenClawError(Exception):
    """OpenClaw 错误基类"""
    pass


class AuthenticationError(OpenClawError):
    """认证错误"""
    pass


class GatewayUnavailableError(OpenClawError):
    """Gateway 不可用"""
    pass


class AgentTimeoutError(OpenClawError):
    """Agent 超时"""
    pass


class OpenClawClient:
    """
    OpenClaw Agent HTTP 客户端
    
    功能:
        - 单次调用
        - 流式响应
        - 批量并行
        - 智能路由
        - 错误重试
        - 健康检查
    
    Example:
        client = OpenClawClient()
        
        # 单次调用
        reply = await client.ask("设计一个API", agent_id="ai_engineer")
        
        # 流式
        async for chunk in client.ask_stream("写一个故事"):
            print(chunk, end="")
        
        # 批量
        results = await client.ask_batch([
            {"agent_id": "ai_engineer", "message": "任务A"},
            {"agent_id": "python", "message": "任务B"},
        ])
    """
    
    # Agent ID 映射
    AGENTS = {
        "main": "main",
        "qclaw": "main",
        "ai_engineer": "ua58rsb93veqtxl7",
        "unity": "jwag9yx1mrcclqzo",
        "python": "tfxjjhfnjialcuju",
        "game_design": "uafru5gofdt644lm",
        "story": "ds4ygtfdv3z7mmxn",
        "frontend": "agent-209e563a",
    }
    
    # 智能路由规则
    ROUTING_RULES = {
        "ua58rsb93veqtxl7": [
            r"\b(api|microservice|backend|architecture|database|rest|graphql)\b",
            r"\b(deploy|devops|kubernetes|docker|ci/cd)\b",
            r"\b(performance|scalab|optimiz)\b",
        ],
        "tfxjjhfnjialcuju": [
            r"\bpython\b",
            r"\b(fastapi|flask|django|asyncio)\b",
            r"\b(pandas|numpy|jupyter|data)\b",
        ],
        "jwag9yx1mrcclqzo": [
            r"\bunity\b",
            r"\b(ecs|dots|scriptableobject|gameobject)\b",
        ],
        "uafru5gofdt644lm": [
            r"\b(game\s*design|level|mechanic|gameplay)\b",
        ],
        "ds4ygtfdv3z7mmxn": [
            r"\b(story|novel|fiction|character|plot|write)\b",
        ],
        "agent-209e563a": [
            r"\b(react|vue|frontend|web|css|javascript)\b",
        ],
    }
    
    def __init__(
        self,
        base_url: str = None,
        api_key: str = None,
        timeout: int = 120,
        max_concurrent: int = 5,
        max_retries: int = 3,
        enable_routing: bool = True,
    ):
        """
        初始化客户端
        
        Args:
            base_url: Gateway URL (默认从环境变量或 localhost)
            api_key: API Token (默认从环境变量)
            timeout: 请求超时秒数
            max_concurrent: 最大并发数
            max_retries: 最大重试次数
            enable_routing: 是否启用智能路由
        """
        self.base_url = base_url or os.environ.get(
            "OPENCLAW_BASE_URL",
            "http://localhost:50439/v1/chat/completions"
        )
        self.api_key = api_key or os.environ.get("OPENCLAW_API_KEY")
        
        # Demo fallback (仅用于测试)
        if not self.api_key and os.environ.get("OPENCLAW_DEMO"):
            self.api_key = "34b619355da794f9d0eef24ed565ad51396eb64d588d7df1"
        
        self.timeout = timeout
        self.max_concurrent = max_concurrent
        self.max_retries = max_retries
        self.enable_routing = enable_routing
        self._semaphore = asyncio.Semaphore(max_concurrent)
        
        if not self.api_key:
            logger.warning("No API key provided. Set OPENCLAW_API_KEY environment variable.")
    
    def _headers(self) -> dict:
        """构建请求头"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    def resolve_agent_id(self, agent: str) -> str:
        """
        解析 Agent ID
        
        Args:
            agent: Agent 名称或 ID (如 "ai_engineer" 或 "ua58rsb93veqtxl7")
        
        Returns:
            Agent ID
        """
        # 直接匹配
        if agent in self.AGENTS.values():
            return agent
        # 名称映射
        if agent in self.AGENTS:
            return self.AGENTS[agent]
        return agent
    
    def route_message(self, message: str) -> str:
        """
        根据消息内容路由到最合适的 Agent
        
        Args:
            message: 用户消息
        
        Returns:
            推荐的 Agent ID
        """
        import re
        
        message_lower = message.lower()
        scores = {}
        
        for agent_id, patterns in self.ROUTING_RULES.items():
            score = sum(
                len(re.findall(p, message_lower))
                for p in patterns
            )
            if score > 0:
                scores[agent_id] = score
        
        if not scores:
            return "main"
        
        return max(scores, key=scores.get)
    
    async def ask(
        self,
        message: str,
        agent_id: str = "main",
        max_tokens: Optional[int] = None,
        auto_route: bool = False,
    ) -> str:
        """
        发送消息给 Agent
        
        Args:
            message: 用户消息
            agent_id: Agent ID 或名称
            max_tokens: 最大响应 tokens
            auto_route: 是否自动路由
        
        Returns:
            Agent 的回复
        
        Raises:
            AuthenticationError: 认证失败
            GatewayUnavailableError: Gateway 不可用
            AgentTimeoutError: Agent 超时
        """
        # 自动路由
        if auto_route and self.enable_routing:
            agent_id = self.route_message(message)
        
        agent_id = self.resolve_agent_id(agent_id)
        
        async with self._semaphore:
            payload = {
                "model": f"openclaw/{agent_id}",
                "messages": [{"role": "user", "content": message}]
            }
            if max_tokens:
                payload["max_tokens"] = max_tokens
            
            logger.debug(f"Calling agent: {agent_id}")
            
            for attempt in range(self.max_retries):
                try:
                    async with httpx.AsyncClient(timeout=self.timeout) as client:
                        response = await client.post(
                            self.base_url,
                            headers=self._headers(),
                            json=payload
                        )
                        
                        if response.status_code == 401:
                            raise AuthenticationError("Invalid API token")
                        
                        if response.status_code == 503:
                            raise GatewayUnavailableError("Gateway unavailable")
                        
                        response.raise_for_status()
                        
                        data = response.json()
                        reply = data["choices"][0]["message"]["content"]
                        tokens = data["usage"]["total_tokens"]
                        
                        logger.debug(f"Got reply: {tokens} tokens")
                        return reply
                        
                except httpx.TimeoutException:
                    logger.warning(f"Timeout, attempt {attempt + 1}/{self.max_retries}")
                    if attempt == self.max_retries - 1:
                        raise AgentTimeoutError(f"Agent timed out after {self.timeout}s")
                    await asyncio.sleep(2 ** attempt)
                    continue
                    
                except httpx.ConnectError:
                    logger.warning(f"Connection failed, attempt {attempt + 1}/{self.max_retries}")
                    if attempt == self.max_retries - 1:
                        raise GatewayUnavailableError("Cannot connect to Gateway")
                    await asyncio.sleep(2 ** attempt)
                    continue
            
            raise OpenClawError("Unknown error")
    
    async def ask_stream(
        self,
        message: str,
        agent_id: str = "main",
        auto_route: bool = False,
    ) -> AsyncGenerator[str, None]:
        """
        流式获取 Agent 响应
        
        Args:
            message: 用户消息
            agent_id: Agent ID
            auto_route: 是否自动路由
        
        Yields:
            响应内容片段
        """
        if auto_route and self.enable_routing:
            agent_id = self.route_message(message)
        
        agent_id = self.resolve_agent_id(agent_id)
        
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
                response.raise_for_status()
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
        tasks: List[Dict[str, str]],
        on_complete: Callable = None,
    ) -> List[Dict[str, str]]:
        """
        批量并行执行任务
        
        Args:
            tasks: 任务列表 [{"agent_id": "xxx", "message": "..."}, ...]
            on_complete: 单个任务完成回调
        
        Returns:
            结果列表
        """
        async def _run(task):
            agent_id = task.get("agent_id", "main")
            message = task["message"]
            
            reply = await self.ask(message, agent_id)
            
            result = {
                "task_id": task.get("id"),
                "agent_id": agent_id,
                "message": message,
                "reply": reply,
            }
            
            if on_complete:
                await on_complete(result)
            
            return result
        
        return await asyncio.gather(*[_run(t) for t in tasks])
    
    def check_health(self) -> bool:
        """
        检查 Gateway 健康状态
        
        Returns:
            True if healthy
        """
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
    
    def list_agents(self) -> Dict[str, str]:
        """列出可用的 Agent"""
        return dict(self.AGENTS)


# ===== Convenience Functions =====

_default_client: Optional[OpenClawClient] = None


def get_client() -> OpenClawClient:
    """获取默认客户端实例"""
    global _default_client
    if _default_client is None:
        _default_client = OpenClawClient()
    return _default_client


async def ask(message: str, agent: str = "main", **kwargs) -> str:
    """快捷调用函数"""
    return await get_client().ask(message, agent_id=agent, **kwargs)


async def ask_stream(message: str, agent: str = "main", **kwargs):
    """快捷流式调用"""
    async for chunk in get_client().ask_stream(message, agent_id=agent, **kwargs):
        yield chunk


# ===== Example Usage =====

if __name__ == "__main__":
    import sys
    
    async def demo():
        client = OpenClawClient()
        
        # 健康检查
        print(f"Gateway healthy: {client.check_health()}")
        
        # 列出 Agents
        print("\nAvailable agents:")
        for name, aid in client.list_agents().items():
            print(f"  {name}: {aid}")
        
        # 单次调用
        print("\n=== Single Call ===")
        reply = await client.ask("Who are you? Brief intro.", agent_id="python")
        print(f"Python Agent: {reply[:200]}...")
        
        # 流式
        print("\n=== Stream ===")
        async for chunk in client.ask_stream("Count 1 to 5"):
            try:
                print(chunk, end="", flush=True)
            except UnicodeEncodeError:
                print(chunk.encode('ascii', 'replace').decode(), end="", flush=True)
        print()
        
        # 自动路由
        print("\n=== Auto Routing ===")
        reply = await client.ask(
            "Help me optimize my Python async code",
            auto_route=True
        )
        print(f"Auto-routed reply: {reply[:200]}...")
        
        # 批量
        print("\n=== Batch ===")
        results = await client.ask_batch([
            {"agent_id": "ai_engineer", "message": "One tip for API design"},
            {"agent_id": "python", "message": "One tip for Python"},
        ])
        for r in results:
            print(f"[{r['agent_id']}]: {r['reply'][:100]}...")
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "demo":
            asyncio.run(demo())
        elif sys.argv[1] == "ask":
            agent = sys.argv[2] if len(sys.argv) > 2 else "main"
            message = " ".join(sys.argv[3:]) if len(sys.argv) > 3 else "Hello"
            reply = asyncio.run(ask(message, agent))
            print(reply)
        else:
            print("Usage: python openclaw_client.py [demo|ask agent message]")
    else:
        asyncio.run(demo())
