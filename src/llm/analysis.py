# 资料分析模块

import json
from src.llm.client import LLMClient
from src.llm.prompts import PROMPT_ANALYZE_PPT, PROMPT_ANALYZE_EXAM, PROMPT_STRUCTURE_TOC


def analyze_ppt(ppt_text: str) -> dict:
    """分析 PPT 内容，提取知识点和例题

    Args:
        ppt_text: PPT 提取的纯文本

    Returns:
        {"knowledge_points": [...], "examples": [...], "teacher_preference": {...}}
    """
    if not ppt_text or len(ppt_text) < 50:
        return {"knowledge_points": [], "examples": [], "teacher_preference": {}}

    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位大学课程分析专家，专门分析教师课件和教材内容。请严格按照JSON格式输出。",
        user_prompt=PROMPT_ANALYZE_PPT.format(ppt_text=ppt_text[:12000]),
        response_format="json",
    )

    parsed = result.get("parsed")
    if parsed is None:
        # 尝试从原始文本中提取 JSON
        import re
        raw = result.get("content", "")
        match = re.search(r'\{[\s\S]*\}', raw)
        if match:
            try:
                parsed = json.loads(match.group())
                print(f"   [WARN] PPT分析 JSON 解析失败，已通过正则提取恢复")
            except Exception:
                print(f"   [ERROR] PPT分析 JSON 解析失败")
                parsed = {}

    # 确保返回结构完整
    if not isinstance(parsed, dict):
        parsed = {}
    parsed.setdefault("knowledge_points", [])
    parsed.setdefault("examples", [])
    parsed.setdefault("teacher_preference", {})
    return parsed


def analyze_exam(exam_text: str) -> dict:
    """分析历年真题，提取考点分布

    Args:
        exam_text: 历年真题纯文本

    Returns:
        {"questions": [...], "summary": {...}}
    """
    if not exam_text or len(exam_text) < 30:
        return {"questions": [], "summary": {}}

    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位大学考试分析专家，专门分析历年真题。请严格按照JSON格式输出。",
        user_prompt=PROMPT_ANALYZE_EXAM.format(exam_text=exam_text[:12000]),
        response_format="json",
    )

    parsed = result.get("parsed")
    if parsed is None:
        import re
        raw = result.get("content", "")
        match = re.search(r'\{[\s\S]*\}', raw)
        if match:
            try:
                parsed = json.loads(match.group())
                print(f"   [WARN] 历年题分析 JSON 解析失败，已通过正则提取恢复")
            except Exception:
                print(f"   [ERROR] 历年题分析 JSON 解析失败")
                parsed = {}

    if not isinstance(parsed, dict):
        parsed = {}
    parsed.setdefault("questions", [])
    parsed.setdefault("summary", {})
    return parsed


def structure_toc(toc_text: str) -> dict:
    """将教材目录文字结构化

    Args:
        toc_text: OCR 或手动输入的目录文字

    Returns:
        {"textbook": "教材名", "chapters": [...]}
    """
    if not toc_text or len(toc_text) < 10:
        return {"textbook": "", "chapters": []}

    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位教材编辑。请将目录文字整理为结构化章节目录，修正OCR错误。按JSON格式输出。",
        user_prompt=PROMPT_STRUCTURE_TOC.format(toc_text=toc_text[:8000]),
        response_format="json",
    )
    return result.get("parsed", {})


def merge_analysis(ppt_analysis: dict, exam_analysis: dict) -> dict:
    """合并 PPT 分析和历年题分析，生成综合考点画像

    Returns:
        {
            "knowledge_points": [...],       # 合并去重的知识点
            "high_freq_points": [...],       # 高频考点
            "question_type_dist": {...},     # 题型分布
            "difficulty_dist": {...},        # 难度分布
            "coverage_ratio": 0.0-1.0,       # 用户资料覆盖比例
        }
    """
    # 提取 PPT 知识点
    ppt_points = {
        kp["name"]: kp
        for kp in ppt_analysis.get("knowledge_points", [])
    }

    # 提取历年题中的考点
    exam_summary = exam_analysis.get("summary", {})
    high_freq = exam_summary.get("high_freq_points", [])
    exam_questions = exam_analysis.get("questions", [])

    # 为 PPT 知识点补充历年题信息
    for hf in high_freq:
        if hf in ppt_points:
            ppt_points[hf]["importance"] = "必考"
        else:
            ppt_points[hf] = {
                "name": hf,
                "importance": "必考",
                "source": "历年题",
                "chapter": "",
            }

    # 题型分布（优先历年题，其次 PPT 偏好）
    type_dist = exam_summary.get("type_distribution", {})
    if not type_dist:
        pref = ppt_analysis.get("teacher_preference", {})
        types = pref.get("question_types", ["选择", "填空", "计算"])
        type_dist = {t: 1 for t in types}

    # 难度分布
    diff_dist = exam_summary.get("difficulty_distribution", {"1": 2, "2": 4, "3": 3, "4": 1})

    # 覆盖率估算
    total_kp = len(ppt_points)
    covered = sum(1 for kp in ppt_points.values() if kp.get("source") == "PPT")

    return {
        "knowledge_points": list(ppt_points.values()),
        "high_freq_points": high_freq,
        "question_type_dist": type_dist,
        "difficulty_dist": diff_dist,
        "coverage_ratio": covered / max(total_kp, 1),
        "exam_question_count": len(exam_questions),
    }
