# 解题思路生成模块

from src.llm.client import LLMClient
from src.llm.prompts import PROMPT_STRATEGIES


def generate_strategies(
    course: str,
    question_types: list,
    exam_format: dict = None,
) -> dict:
    """针对常见题型生成解题思路

    Args:
        course: 课程名
        question_types: 题型列表，如 ["选择", "填空", "计算", "证明"]
        exam_format: 用户提供的题型分布

    Returns:
        {"strategies": [...], "cost": float}
    """
    if not question_types:
        return {"strategies": [], "cost": 0}

    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位大学教学专家，擅长总结各类题型的解题技巧。请严格按照JSON格式输出。",
        user_prompt=PROMPT_STRATEGIES.format(
            course=course,
            question_types="、".join(question_types),
            exam_format=str(exam_format) if exam_format else "未指定",
        ),
        response_format="json",
        max_tokens=4096,
    )

    parsed = result.get("parsed", {})
    return {
        "strategies": parsed.get("strategies", []),
        "cost": result.get("cost", 0),
    }
