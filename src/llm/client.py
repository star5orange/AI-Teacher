# LLM 客户端封装

import json
import time
import re
from openai import OpenAI

import sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent.parent.parent))
from config import LLM_CONFIG


class LLMClient:
    """统一的 LLM 调用接口，使用同步 OpenAI 客户端（Windows 兼容）"""

    def __init__(self, provider: str = "primary"):
        cfg = LLM_CONFIG[provider]
        self.provider = cfg["provider"]
        self.client = OpenAI(
            api_key=cfg["api_key"],
            base_url=cfg["base_url"],
        )
        self.model = cfg["model"]
        self.pricing = LLM_CONFIG["pricing"].get(self.provider, {"input": 2, "output": 8})

    def chat(
        self,
        system_prompt: str,
        user_prompt: str,
        response_format: str = "json",
        temperature: float = 0,
        max_tokens: int = 8192,
    ) -> dict:
        """发送请求，返回结构化 JSON 或文本

        Args:
            system_prompt: 系统提示词
            user_prompt: 用户提示词
            response_format: "json" 或 "text"
            temperature: 0-1，生成随机性
            max_tokens: 最大输出 token 数

        Returns:
            {"content": ..., "usage": {"input_tokens": N, "output_tokens": N}, "cost": float}
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if response_format == "json":
            kwargs["response_format"] = {"type": "json_object"}

        start = time.time()
        response = self.client.chat.completions.create(**kwargs)
        elapsed = time.time() - start

        content = response.choices[0].message.content
        usage = response.usage

        # 计算成本
        input_cost = (usage.prompt_tokens / 1_000_000) * self.pricing["input"]
        output_cost = (usage.completion_tokens / 1_000_000) * self.pricing["output"]
        total_cost = input_cost + output_cost

        result = {
            "content": content,
            "usage": {
                "input_tokens": usage.prompt_tokens,
                "output_tokens": usage.completion_tokens,
            },
            "cost": round(total_cost, 6),
            "elapsed": round(elapsed, 2),
        }

        if response_format == "json":
            try:
                result["parsed"] = json.loads(content)
            except json.JSONDecodeError:
                # 尝试提取 JSON 块
                match = re.search(r'\{.*\}', content, re.DOTALL)
                if match:
                    try:
                        result["parsed"] = json.loads(match.group())
                    except json.JSONDecodeError:
                        result["parsed"] = None
                        result["parse_error"] = "JSON 解析失败"
                else:
                    result["parsed"] = None
                    result["parse_error"] = "JSON 解析失败"

        return result

    def estimate_cost(self, input_tokens: int, output_tokens: int = 0) -> float:
        """估算成本"""
        return (
            input_tokens / 1_000_000 * self.pricing["input"]
            + output_tokens / 1_000_000 * self.pricing["output"]
        )
