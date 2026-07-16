# 快速学习生成模块

import json
import re
import time
from src.llm.client import LLMClient
from src.llm.prompts import (
    PROMPT_KNOWLEDGE_MAP,
    PROMPT_DEEP_LEARN_GUIDE,
    PROMPT_WEB_FETCH_ANALYSIS,
)
from src.llm.web_fetch import fetch_topic_info


def _parse_json_result(result: dict, label: str = "") -> dict:
    """安全解析 LLM 返回的 JSON，带容错"""
    parsed = result.get("parsed")
    if parsed and isinstance(parsed, dict):
        return parsed

    # 容错：尝试从原始文本中提取 JSON
    raw = result.get("content", "")
    match = re.search(r"\{[\s\S]*\}", raw)
    if match:
        try:
            parsed = json.loads(match.group())
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

    if label:
        print(f"   [WARN] {label} JSON 解析失败，返回空结构")
    return {}


def analyze_timeliness(topic: str, web_summary: str) -> dict:
    """分析技术时效性

    Args:
        topic: 技术主题
        web_summary: WebFetch 抓取的文本摘要

    Returns:
        {"freshness": {...}, "official_description": "...", ...}
    """
    if not web_summary or len(web_summary.strip()) < 50:
        return {
            "freshness": {
                "level": "stable",
                "latest_version": "",
                "latest_release_date": "",
                "llm_vs_web_diff": "",
                "assessment": "未获取到最新网络信息，基于 LLM 训练数据判断",
            },
            "official_description": "",
            "key_updates": [],
            "deprecation_warnings": [],
            "ecosystem_notes": "",
        }

    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位技术情报分析员。请严格按 JSON 格式输出分析结果。",
        user_prompt=PROMPT_WEB_FETCH_ANALYSIS.format(
            topic=topic,
            web_content=web_summary[:4000],
        ),
        response_format="json",
        temperature=0.1,
        max_tokens=2048,
    )

    parsed = _parse_json_result(result, "时效性分析")
    return parsed if parsed else {
        "freshness": {
            "level": "stable",
            "latest_version": "",
            "latest_release_date": "",
            "llm_vs_web_diff": "",
            "assessment": "分析失败",
        },
    }


def generate_knowledge_map(
    topic: str,
    goal: str = "",
    depth: str = "balanced",
    background: str = "",
    confused: str = "",
    time_budget: str = "",
    web_fetch_summary: str = "",
) -> dict:
    """生成技术知识地图（模块 DAG）

    Args:
        topic: 技术主题
        goal: 学习目标
        depth: 深度偏好 (practical / balanced / principle)
        background: 已有基础描述
        confused: 困惑领域描述
        time_budget: 时间预算
        web_fetch_summary: 网络抓取的时效性信息摘要

    Returns:
        {"knowledge_map": dict, "cost": float}
    """
    # 构建背景描述
    bg_parts = []
    if background:
        bg_parts.append(f"已掌握：{background}")
    else:
        bg_parts.append("已掌握：（未知，请假设有基本编程基础）")

    if confused:
        bg_parts.append(f"困惑领域（内容需放慢）：{confused}")
    else:
        bg_parts.append("困惑领域：（未提供）")

    background_text = "\n".join(bg_parts)

    # 网络信息摘要
    web_text = web_fetch_summary if web_fetch_summary else "（未获取到最新网络信息，请基于训练数据生成）"

    print(f"   [知识地图] 生成中... topic={topic}, depth={depth}")

    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位资深技术导师，擅长为成年人梳理技术学习路径。请严格按 JSON 格式输出。",
        user_prompt=PROMPT_KNOWLEDGE_MAP.format(
            topic=topic,
            goal=goal or f"全面了解 {topic} 的核心概念和使用方法",
            depth=depth,
            background=background_text,
            confused=confused or "（未提供）",
            time_budget=time_budget or "（未指定）",
            web_fetch_summary=web_text,
        ),
        response_format="json",
        temperature=0.1,
        max_tokens=16384,
    )

    parsed = _parse_json_result(result, "知识地图")
    modules = parsed.get("modules", [])

    if not modules:
        print(f"   [ERROR] 知识地图生成为空！modules 数量为 0")
        print(f"   LLM raw content tail: ...{result.get('content', '')[-300:]}")

    print(f"   [知识地图] 完成：{len(modules)} 个模块")

    return {
        "knowledge_map": parsed,
        "cost": result.get("cost", 0),
    }


def generate_learning_guide(
    topic: str,
    goal: str = "",
    depth: str = "balanced",
    background: str = "",
    confused: str = "",
    knowledge_map: dict = None,
) -> dict:
    """基于知识地图生成详细学习手册

    Args:
        topic: 技术主题
        goal: 学习目标
        depth: 深度偏好
        background: 已有基础
        confused: 困惑领域
        knowledge_map: 已生成的知识地图

    Returns:
        {"learning_guide": dict, "cost": float}
    """
    if not knowledge_map or not knowledge_map.get("modules"):
        print("   [ERROR] 知识地图为空，无法生成学习手册")
        return {"learning_guide": {}, "cost": 0}

    # 构建知识地图摘要（只传结构，不传完整内容以节省 token）
    map_summary = {
        "topic": knowledge_map.get("topic", topic),
        "goal": knowledge_map.get("goal", goal),
        "estimated_total_hours": knowledge_map.get("estimated_total_hours", 0),
        "course_profile": knowledge_map.get("course_profile", {}),
        "modules": [],
    }
    for mod in knowledge_map.get("modules", []):
        map_summary["modules"].append({
            "id": mod.get("id", ""),
            "title": mod.get("title", ""),
            "type": mod.get("type", "core"),
            "prerequisites": mod.get("prerequisites", []),
            "estimated_minutes": mod.get("estimated_minutes", 60),
            "why_this_matters": mod.get("why_this_matters", ""),
            "sections": [
                {
                    "id": sec.get("id", ""),
                    "title": sec.get("title", ""),
                    "type": sec.get("type", "core"),
                    "key_concepts": sec.get("key_concepts", []),
                }
                for sec in mod.get("sections", [])
            ],
        })

    bg_parts = []
    if background:
        bg_parts.append(f"已掌握：{background}")
    if confused:
        bg_parts.append(f"困惑领域：{confused}")

    # 计算模块数量
    core_modules = [m for m in knowledge_map.get("modules", []) if m.get("type") != "practice"]
    total_sections = sum(len(m.get("sections", [])) for m in knowledge_map.get("modules", []))
    print(f"   [学习手册] 生成中... {len(core_modules)} 个有效模块, {total_sections} 节")

    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位资深技术导师，正在为成年人编写定制化学习手册。请严格按 JSON 格式输出。",
        user_prompt=PROMPT_DEEP_LEARN_GUIDE.format(
            topic=topic,
            goal=goal or f"全面了解 {topic}",
            depth=depth,
            background="\n".join(bg_parts) if bg_parts else "（未提供）",
            confused=confused or "（未提供）",
            knowledge_map_json=json.dumps(map_summary, ensure_ascii=False, indent=2),
        ),
        response_format="json",
        temperature=0.2,
        max_tokens=32768,
    )

    parsed = _parse_json_result(result, "学习手册")
    modules_content = parsed.get("modules_content", [])

    print(f"   [学习手册] 完成：{len(modules_content)} 个模块内容, "
          f"{len(parsed.get('global_practice_questions', []))} 道验证题, "
          f"{len(parsed.get('cheat_sheet', {}).get('commands', [])) + len(parsed.get('cheat_sheet', {}).get('key_syntax', []))} 条速查")

    return {
        "learning_guide": parsed,
        "cost": result.get("cost", 0),
    }


def generate_quick_learn_pipeline(
    topic: str,
    goal: str = "",
    depth: str = "balanced",
    background: str = "",
    confused: str = "",
    time_budget: str = "",
    materials: list = None,
) -> dict:
    """快速学习完整管线

    Args:
        topic: 技术主题
        goal: 学习目标
        depth: 深度偏好
        background: 已有基础描述
        confused: 困惑领域描述
        time_budget: 时间预算
        materials: 参考链接列表

    Returns:
        {
            "knowledge_map": dict,
            "learning_guide": dict,
            "timeliness": dict,
            "total_cost": float,
        }
    """
    total_cost = 0
    start_time = time.time()

    # ── Step 1: WebFetch 时效性检查 ──
    print(f"\n{'='*50}")
    print(f"[快速学习] 开始生成：{topic}")
    print(f"{'='*50}")

    print(f"\n[Step 1/4] 抓取最新信息...")
    web_info = fetch_topic_info(topic)
    print(f"   抓取完成：{web_info['sources_fetched']}/{len(web_info['urls_tried'])} 个来源成功")

    # ── Step 1b: 分析时效性 ──
    timeliness = analyze_timeliness(topic, web_info.get("summary", ""))
    freshness = timeliness.get("freshness", {})
    print(f"   时效评估：{freshness.get('level', '?')} — {freshness.get('assessment', '?')[:60]}")
    total_cost += timeliness.get("cost", 0) if isinstance(timeliness, dict) else 0

    # ── Step 2: 知识地图生成 ──
    print(f"\n[Step 2/4] 生成知识地图...")
    km_result = generate_knowledge_map(
        topic=topic,
        goal=goal,
        depth=depth,
        background=background,
        confused=confused,
        time_budget=time_budget,
        web_fetch_summary=web_info.get("summary", ""),
    )
    knowledge_map = km_result.get("knowledge_map", {})
    total_cost += km_result.get("cost", 0)

    if not knowledge_map or not knowledge_map.get("modules"):
        print(f"\n[ERROR] 知识地图生成失败，管线中断")
        return {
            "knowledge_map": knowledge_map,
            "learning_guide": {},
            "timeliness": timeliness,
            "total_cost": round(total_cost, 4),
            "elapsed": round(time.time() - start_time, 1),
        }

    # ── Step 3: 学习手册生成 ──
    print(f"\n[Step 3/4] 生成学习手册...")
    lg_result = generate_learning_guide(
        topic=topic,
        goal=goal,
        depth=depth,
        background=background,
        confused=confused,
        knowledge_map=knowledge_map,
    )
    learning_guide = lg_result.get("learning_guide", {})
    total_cost += lg_result.get("cost", 0)

    # ── Step 4: 合并结果 ──
    elapsed = round(time.time() - start_time, 1)
    print(f"\n{'='*50}")
    print(f"[快速学习] 完成！耗时 {elapsed}s，总成本 RMB{total_cost:.4f}")
    print(f"{'='*50}")

    return {
        "knowledge_map": knowledge_map,
        "learning_guide": learning_guide,
        "timeliness": timeliness,
        "total_cost": round(total_cost, 4),
        "elapsed": elapsed,
    }
