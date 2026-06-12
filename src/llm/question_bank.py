# 题库生成模块

import json
import re
import time
from src.llm.client import LLMClient
from src.llm.prompts import PROMPT_GENERATE_QUESTIONS, PROMPT_GENERIC_QUESTIONS


def generate_questions_for_kp(
    knowledge_point: dict,
    course: str,
    textbook: str = "",
    type_dist: dict = None,
    difficulty_dist: dict = None,
    example_styles: str = "",
    count: int = 8,
) -> dict:
    """为单个知识点生成题目

    Args:
        knowledge_point: 知识点信息 {name, importance, source, chapter, ...}
        course: 课程名
        textbook: 教材名
        type_dist: 题型分布
        difficulty_dist: 难度分布
        example_styles: 用户资料中的例题风格参考
        count: 题目数量

    Returns:
        {"questions": [...], "cost": float}
    """
    client = LLMClient("primary")

    # 中文题型 → 内部英文类型映射（只做标准题型的翻译）
    CN_TYPE_MAP = {
        "选择": "choice", "选择题": "choice",
        "填空": "fill", "填空题": "fill",
        "判断": "tf", "判断题": "tf",
        "计算": "calc", "计算题": "calc",
        "简答": "short_answer", "简答题": "short_answer",
        "代码填空": "code_fill",
        "大题": "essay",
        "证明": "proof", "证明题": "proof",
        "多选": "multi", "多选题": "multi",
    }

    # 题型要求
    if type_dist:
        total = sum(type_dist.values())
        # 动态支持任意题型：标准题型翻成英文，其余原样透传
        type_reqs_parts = []
        for k, v in type_dist.items():
            en = CN_TYPE_MAP.get(k, None)
            # 不在映射表中的题型直接透传中文名，LLM 会据此生成
            type_name = en if en else k
            cnt = max(1, round(v / total * count))
            type_reqs_parts.append(f"{type_name}: {cnt} 道")
        type_reqs = ", ".join(type_reqs_parts)
    else:
        type_reqs = f"choice:{max(2, count//3)}, fill:{max(2, count//4)}, calc:{max(2, count//3)}, tf:{max(1, count//6)}"

    # 难度要求
    if difficulty_dist:
        diff_reqs = ", ".join(
            f"L{k}: {round(v/total*count) if 'total' in dir() else v} 道"
            for k, v in difficulty_dist.items()
        )
        diff_reqs = f"L1(基础):{max(1, count//5)}, L2(常规):{max(2, count//2)}, L3(综合):{max(1, count//5)}, L4(拔高):{max(0, count//8)}" if not difficulty_dist else diff_reqs
    else:
        diff_reqs = f"L1(基础):{max(1, count//5)}, L2(常规):{max(2, count//2)}, L3(综合):{max(1, count//5)}, L4(拔高):{max(0, count//8)}"

    # 重要性调整题量
    importance = knowledge_point.get("importance", "常规")
    if importance == "必考":
        count = max(count, 10)
        diff_reqs += "（此为必考知识点，请适当增加有区分度的题目）"
    elif importance == "高频":
        count = max(count, 8)

    result = client.chat(
        system_prompt="你是一位大学命题专家，擅长出有区分度的考试题。请严格按照JSON格式输出题目。",
        user_prompt=PROMPT_GENERATE_QUESTIONS.format(
            course=course,
            textbook=textbook or "通用",
            knowledge_point=knowledge_point.get("name", ""),
            importance=importance,
            chapter=knowledge_point.get("chapter", ""),
            type_requirements=type_reqs,
            difficulty_requirements=diff_reqs,
            count=count,
            example_styles=example_styles or "（无参考，按标准风格出题）",
        ),
        response_format="json",
        max_tokens=8192,
    )

    parsed = result.get("parsed", {})

    # 容错：JSON 解析失败时尝试正则提取
    if not parsed or not isinstance(parsed, dict):
        raw = result.get("content", "")
        match = re.search(r'\{[\s\S]*\}', raw)
        if match:
            try:
                parsed = json.loads(match.group())
            except Exception:
                parsed = {}

    questions = parsed.get("questions", [])

    # 给每道题补充知识点信息
    for q in questions:
        q["knowledge_point"] = knowledge_point.get("name", "")
        q["knowledge_point_id"] = knowledge_point.get("id", "")
        q["chapter"] = knowledge_point.get("chapter", "")
        q["source"] = knowledge_point.get("source", "generated")
        q["source_detail"] = knowledge_point.get("source_detail", "")

    return {
        "questions": questions,
        "cost": result.get("cost", 0),
    }


def generate_generic_questions(
    knowledge_point_name: str,
    course: str,
    count: int = 6,
) -> dict:
    """为知识点生成通用题目（兜底方案）

    Args:
        knowledge_point_name: 知识点名称
        course: 课程名
        count: 题目数量

    Returns:
        {"questions": [...], "cost": float}
    """
    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位大学命题专家。请生成通用练习题。按JSON格式输出。",
        user_prompt=PROMPT_GENERIC_QUESTIONS.format(
            course=course,
            knowledge_point=knowledge_point_name,
            count=count,
        ),
        response_format="json",
        max_tokens=4096,
    )

    parsed = result.get("parsed", {})

    # 容错：JSON 解析失败时尝试正则提取
    if not parsed or not isinstance(parsed, dict):
        raw = result.get("content", "")
        match = re.search(r'\{[\s\S]*\}', raw)
        if match:
            try:
                parsed = json.loads(match.group())
            except Exception:
                parsed = {}

    questions = parsed.get("questions", [])
    for q in questions:
        q["knowledge_point"] = knowledge_point_name
        q["source"] = "generic"

    return {
        "questions": questions,
        "cost": result.get("cost", 0),
    }


def generate_all_questions(
    knowledge_tree: dict,
    course: str,
    textbook: str = "",
    merged_analysis: dict = None,
    questions_per_kp: int = 8,
) -> dict:
    """遍历知识树中的所有知识点，批量生成题目

    Args:
        knowledge_tree: 知识树
        course: 课程名
        textbook: 教材名
        merged_analysis: 合并后的考点画像
        questions_per_kp: 每个知识点默认题目数

    Returns:
        {"questions": [...], "total_cost": float, "total_count": int}
    """
    # 提取所有知识点
    all_kps = []
    chapters = knowledge_tree.get("chapters", [])

    if not chapters:
        return {"questions": [], "total_cost": 0, "total_count": 0}

    for ch in chapters:
        for sec in ch.get("sections", []):
            sec["chapter"] = ch.get("title", "")
            all_kps.append(sec)

    # 获取题型和难度分布
    type_dist = None
    difficulty_dist = None
    example_styles = ""
    if merged_analysis:
        type_dist = merged_analysis.get("question_type_dist")
        difficulty_dist = merged_analysis.get("difficulty_dist")

    all_questions = []
    total_cost = 0

    # 计算总知识点数，动态调整每知识点题量
    total_kps = len(all_kps)
    # 目标总题量：至少30道，知识点多时每知识点3-5道
    TARGET_MIN_TOTAL = 30
    base_count_per_kp = max(3, TARGET_MIN_TOTAL // max(total_kps, 1))

    print(f"\n[Pen] 开始生成题库（{total_kps} 个知识点，目标每知识点 {base_count_per_kp} 道）...")

    for i, kp in enumerate(all_kps, 1):
        source = kp.get("source", "generic")
        name = kp.get("title", kp.get("name", ""))

        # 根据重要性和来源智能调整题量
        importance = kp.get("importance", "常规")
        if importance == "必考":
            count = max(base_count_per_kp + 4, 8)
        elif importance == "高频":
            count = max(base_count_per_kp + 2, 5)
        elif importance == "常规":
            count = base_count_per_kp
        else:
            count = max(1, base_count_per_kp - 1)  # 了解级少出题

        # 用户资料知识点额外加 2 道
        if source == "user_material":
            count += 2
        elif source == "textbook_supplement":
            count = max(2, count)

        count = max(2, count)

        print(f"  [{i}/{total_kps}] {name}（{source}，{count}道）...", end=" ")

        try:
            if source == "generic":
                result = generate_generic_questions(name, course, count)
            else:
                result = generate_questions_for_kp(
                    kp, course, textbook,
                    type_dist=type_dist,
                    difficulty_dist=difficulty_dist,
                    example_styles=example_styles,
                    count=count,
                )

            q_count = len(result["questions"])
            cost = result["cost"]
            total_cost += cost
            all_questions.extend(result["questions"])

            print(f"[OK] {q_count}道 | RMB{cost:.4f}")

        except Exception as e:
            print(f"[FAIL] 失败：{e}")
            continue

        # 避免 API 限流
        if i < total_kps:
            time.sleep(0.3)

    print(f"\n[OK] 题库生成完成：{len(all_questions)} 道题，总成本 RMB{total_cost:.4f}")

    return {
        "questions": all_questions,
        "total_cost": round(total_cost, 4),
        "total_count": len(all_questions),
    }
