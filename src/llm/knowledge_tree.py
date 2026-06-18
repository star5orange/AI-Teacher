# 知识树生成模块

import json
import re
from src.llm.client import LLMClient
from src.llm.prompts import PROMPT_KNOWLEDGE_TREE, PROMPT_REVIEW_GUIDE, PROMPT_KP_DETAILS, PROMPT_PIPELINE, PROMPT_CHEAT_SHEET


def get_public_syllabus(course: str) -> str:
    """获取课程公开大纲（从 LLM 训练数据中直接查询）"""
    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位大学教务专家，熟悉中国各大学课程的标准教学大纲。",
        user_prompt=f'请简要列出《{course}》课程在中国大学的标准教学大纲（章节目录）。格式：第一章 xxx\\n  1.1 xxx\\n  1.2 xxx\\n...',
        response_format="text",
        temperature=0.1,
        max_tokens=2048,
    )
    return result.get("content", "")


def get_textbook_toc(textbook: str) -> dict:
    """获取教材目录（LLM 直接输出）"""
    if not textbook:
        return {"textbook": "", "chapters": []}

    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位教材数据库，熟知各版本大学教材的完整目录。请严格按照JSON格式输出。",
        user_prompt=f'请输出《{textbook}》的完整章节目录。格式：{{"textbook": "书名", "chapters": [{{"title": "章标题", "sections": [{{"title": "节标题"}}]}}]}}',
        response_format="json",
        temperature=0.1,
    )
    return result.get("parsed", {"textbook": textbook, "chapters": []})


def _build_fallback_tree_from_syllabus(course: str, syllabus_text: str) -> dict:
    """从通用大纲文本构建兜底知识树（比单知识点fallback更完整）

    当 LLM JSON 解析失败时，尝试用另一次 LLM 调用将大纲文本转为结构化知识树。
    如果大纲文本也为空，则返回最简单的兜底结构。
    """
    if not syllabus_text or len(syllabus_text.strip()) < 20:
        return _build_minimal_fallback(course)

    # 尝试让 LLM 将大纲文本转为结构化知识树
    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位大学课程专家。请将以下课程大纲转为结构化知识树JSON。严格按照JSON格式输出。",
        user_prompt=f"""课程：{course}

课程大纲：
{syllabus_text}

请输出如下JSON格式：
{{
  "course": "{course}",
  "chapters": [
    {{
      "title": "章标题",
      "order": 1,
      "source": "public_syllabus",
      "sections": [
        {{
          "id": "kp_章节_序号",
          "title": "知识点名",
          "description": "2-3句话说明核心概念和考试考察方式",
          "importance": "常规",
          "source": "public_syllabus",
          "estimated_questions": 3
        }}
      ]
    }}
  ]
}}

要求：
1. 每章至少2个知识点，整棵树至少8个知识点
2. id格式：kp_章序号_节序号，如 kp_01_01
3. importance: 必考/高频/常规/了解，大部分标"常规"，核心章节标"高频"
""",
        response_format="json",
        temperature=0.1,
        max_tokens=8192,
    )

    parsed = result.get("parsed")
    if parsed is None:
        raw = result.get("content", "")
        match = re.search(r'\{[\s\S]*\}', raw)
        if match:
            try:
                parsed = json.loads(match.group())
            except Exception:
                pass

    if parsed and parsed.get("chapters"):
        # 确保每个 section 有 id
        for ch in parsed.get("chapters", []):
            ch.setdefault("source", "public_syllabus")
            for i, sec in enumerate(ch.get("sections", [])):
                if not sec.get("id"):
                    sec["id"] = f"kp_{ch.get('order', 1):02d}_{i+1:02d}"
                sec.setdefault("source", "public_syllabus")
                sec.setdefault("importance", "常规")
                sec.setdefault("chapter", ch.get("title", ""))
        return parsed

    return _build_minimal_fallback(course)


def _build_minimal_fallback(course: str) -> dict:
    """最简单的兜底知识树（只有1章1知识点）"""
    return {
        "course": course,
        "chapters": [{
            "title": course,
            "order": 1,
            "source": "fallback",
            "sections": [{
                "id": "kp_fallback_01",
                "title": f"{course}综合",
                "description": f"基于课程《{course}》的综合知识点",
                "importance": "常规",
                "source": "fallback",
                "estimated_questions": 10,
                "chapter": course,
            }]
        }]
    }


def generate_review_guide(
    school: str,
    course: str,
    user_content: str = "",
    knowledge_tree: dict = None,
) -> dict:
    """生成详细的期末复习知识清单（富文本 Markdown）

    Args:
        school: 学校名称
        course: 课程名称
        user_content: 用户资料内容摘要
        knowledge_tree: 已生成的知识树（用于确保章节覆盖完整）

    Returns:
        {"review_guide": {...}, "cost": float}
    """
    if not user_content:
        user_content = "（用户未提供资料，请基于该课程通用知识点生成所有章节课）"

    # 从知识树提取详细知识点列表（含子知识点），作为复习清单的必须覆盖考点
    chapter_hints = ""
    if knowledge_tree and knowledge_tree.get("chapters"):
        lines = []
        total_kp = 0
        for ch in knowledge_tree["chapters"]:
            ch_title = ch.get("title", "")
            lines.append(f"\n【{ch_title}】")
            for sec in ch.get("sections", []):
                sec_title = sec.get("title", "")
                sec_desc = sec.get("description", "")
                importance = sec.get("importance", "常规")
                lines.append(f"  知识点：{sec_title} [{importance}] — {sec_desc}")
                total_kp += 1
                # 子知识点必须全部覆盖
                for sp in sec.get("sub_points", []):
                    sp_title = sp.get("title", "")
                    sp_desc = sp.get("description", "")
                    if sp_title:
                        lines.append(f"    ↳ 子知识点（必须独立讲解）：{sp_title} — {sp_desc}")
                        total_kp += 1
        chapter_hints = (
            f"\n\n【必须覆盖的知识点清单——共 {total_kp} 个知识点/子知识点，每个都必须生成独立知识卡片】\n" +
            "\n".join(lines) +
            "\n\n关键要求：每个子知识点必须在复习清单中有独立的文字讲解（概念定义+示例+结论），"
            "不能只画一张总图就跳过。图中每个组件 = 一张独立知识卡片。"
        )

    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位资深的大学课程辅导专家，专门帮助学生准备期末考试。你的输出是学生唯一的学习资料，必须详尽、有例子、可自学。每一个子知识点都必须有独立的文字讲解——不能只画一张总图就略过细节。图展示关系，文字解释细节，两者互补。用户上传的资料可能不完整，你必须生成该课程所有标准章节的复习内容（至少6章）。请严格按照JSON格式输出，代码用```语言名 包裹。",
        user_prompt=PROMPT_REVIEW_GUIDE.format(
            course=course,
            school=school,
            user_content=user_content[:15000],
        ) + chapter_hints,
        response_format="json",
        max_tokens=16384,
    )

    parsed = result.get("parsed", {}) or {}
    return {
        "review_guide": parsed,
        "cost": result.get("cost", 0),
    }


def generate_knowledge_tree(
    school: str,
    course: str,
    textbook: str = "",
    user_knowledge_points: list = None,
    textbook_toc: dict = None,
    syllabus_text: str = None,
) -> dict:
    """生成完整知识树

    三级来源策略：
    1. 用户资料提取的知识点（最高优先级）
    2. 教材目录（次要参考）
    3. 课程通用大纲（兜底）

    Args:
        school: 学校名称
        course: 课程名称
        textbook: 教材名称
        user_knowledge_points: 从用户资料提取的知识点列表
        textbook_toc: 教材目录（已结构化）
        syllabus_text: 预先获取的通用大纲文本（避免重复调用）

    Returns:
        {"knowledge_tree": dict, "cost": float}
    """
    client = LLMClient("primary")

    # 准备输入
    user_points_str = ""
    if user_knowledge_points:
        points_list = []
        for kp in user_knowledge_points:
            imp = kp.get("importance", "常规")
            src = kp.get("source", "未知")
            points_list.append(f"  - {kp.get('name', '')} [{imp}] [来源：{src}]")
        user_points_str = "\n".join(points_list)

    toc_str = ""
    if textbook_toc and textbook_toc.get("chapters"):
        chapters = textbook_toc["chapters"]
        toc_lines = []
        for ch in chapters:
            toc_lines.append(f"  {ch['title']}")
            for sec in ch.get("sections", []):
                toc_lines.append(f"    - {sec['title']}")
        toc_str = "\n".join(toc_lines)

    # 获取通用大纲（如果未预获取）
    if syllabus_text is None:
        syllabus_text = get_public_syllabus(course)

    result = client.chat(
        system_prompt="你是一位大学课程专家。请综合用户资料、教材和通用大纲，生成最完整的知识树。用户资料中的内容优先级最高。按JSON格式输出。",
        user_prompt=PROMPT_KNOWLEDGE_TREE.format(
            course=course,
            school=school,
            textbook=textbook or "未指定",
            user_points=user_points_str or "（用户未提供）",
            textbook_toc=toc_str or "（未提供）",
            public_syllabus=syllabus_text,
        ),
        response_format="json",
        max_tokens=16384,
    )

    total_cost = result.get("cost", 0)
    parsed = result.get("parsed")

    # 容错：如果 JSON 解析失败，尝试从原始文本中提取
    if parsed is None:
        raw = result.get("content", "")
        match = re.search(r'\{[\s\S]*\}', raw)
        if match:
            try:
                parsed = json.loads(match.group())
                print(f"   [WARN] 知识树 JSON 解析失败，已通过正则提取恢复")
            except Exception:
                print(f"   [ERROR] 知识树 JSON 解析失败，且正则提取也失败")
                print(f"   LLM 原始输出前200字：{raw[:200]}")
        else:
            print(f"   [ERROR] 知识树 JSON 解析失败，原始输出中无 JSON 对象")
            print(f"   LLM 原始输出前200字：{raw[:200]}")

    # 验证解析结果是否有效（至少有chapters且非空）
    if parsed and (not parsed.get("chapters") or len(parsed["chapters"]) == 0):
        print(f"   [WARN] 知识树 chapters 为空，尝试从大纲重建")
        parsed = None

    # 兜底策略1：从通用大纲重建更完整的知识树
    if parsed is None:
        print(f"   [RECOVERY] 尝试从通用大纲重建知识树...")
        parsed = _build_fallback_tree_from_syllabus(course, syllabus_text)

    # 确保每个 section 有 id 和 chapter 字段
    for ch in parsed.get("chapters", []):
        ch_title = ch.get("title", "")
        for i, sec in enumerate(ch.get("sections", [])):
            if not sec.get("id"):
                sec["id"] = f"kp_{ch.get('order', 1):02d}_{i+1:02d}"
            if not sec.get("chapter"):
                sec["chapter"] = ch_title
            if not sec.get("source"):
                sec["source"] = ch.get("source", "public_syllabus")

    return {
        "knowledge_tree": parsed,
        "cost": total_cost,
    }


def generate_kp_details(course: str, knowledge_tree: dict) -> dict:
    """为知识树中每个知识点生成结构化详情卡片

    Args:
        course: 课程名称
        knowledge_tree: 已生成的知识树

    Returns:
        {"kp_details": dict, "cost": float}
    """
    chapters = knowledge_tree.get("chapters", [])
    if not chapters:
        return {"kp_details": {}, "cost": 0}

    # 构建知识点列表（ID + 名称 + 章节，含子知识点）
    kp_lines = []
    for ch in chapters:
        ch_title = ch.get("title", "")
        for sec in ch.get("sections", []):
            kp_id = sec.get("id", "")
            kp_name = sec.get("title", sec.get("name", ""))
            if kp_id and kp_name:
                kp_lines.append(f"  [{kp_id}] {kp_name}（章节：{ch_title}）")
            # 子知识点
            for sp in sec.get("sub_points", []):
                sp_name = sp.get("title", "")
                if sp_name:
                    kp_lines.append(f"    ↳ 子: {sp_name}（属于 {kp_name}，章节：{ch_title}）")

    if not kp_lines:
        return {"kp_details": {}, "cost": 0}

    kp_list_str = "\n".join(kp_lines)

    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位大学课程辅导专家。请为每个知识点ID生成5个维度的学习导航内容。输出JSON的key必须用我提供的知识点ID，不要编造新ID。",
        user_prompt=PROMPT_KP_DETAILS.format(
            course=course,
            kp_list=kp_list_str,
        ),
        response_format="json",
        max_tokens=16384,
    )

    parsed = result.get("parsed", {})
    details = parsed.get("kp_details", {}) if parsed else {}
    if not details:
        # 尝试从原始文本中提取 JSON
        raw = result.get("content", "")
        import re as _re
        match = _re.search(r'\{[\s\S]*"kp_details"[\s\S]*\}', raw)
        if match:
            try:
                parsed2 = json.loads(match.group())
                details = parsed2.get("kp_details", {})
            except Exception:
                pass
    print(f"   [KP详情] 生成 {len(details)} 个知识点详情卡片")
    return {
        "kp_details": details,
        "cost": result.get("cost", 0),
    }


def generate_pipeline(course: str, knowledge_tree: dict) -> dict:
    """为工程类课程生成技术链路梳理

    Args:
        course: 课程名称
        knowledge_tree: 已生成的知识树

    Returns:
        {"pipeline": dict, "cost": float}
    """
    chapters = knowledge_tree.get("chapters", [])
    if not chapters:
        return {"pipeline": {}, "cost": 0}

    # 提取所有知识点名
    kp_names = []
    for ch in chapters:
        for sec in ch.get("sections", []):
            name = sec.get("title", sec.get("name", ""))
            if name:
                kp_names.append(name)

    if len(kp_names) < 3:
        return {"pipeline": {}, "cost": 0}

    kp_list_str = "\n".join(f"  - {n}" for n in kp_names)

    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位大学课程辅导专家，擅长为应用型/工程类课程梳理技术链路。请严格按JSON格式输出。",
        user_prompt=PROMPT_PIPELINE.format(
            course=course,
            kp_list=kp_list_str,
        ),
        response_format="json",
        max_tokens=4096,
    )

    parsed = result.get("parsed", {})
    pipeline = parsed.get("pipeline", {}) if parsed else {}
    if not pipeline:
        raw = result.get("content", "")
        import re as _re2
        match = _re2.search(r'\{[\s\S]*"pipeline"[\s\S]*\}', raw)
        if match:
            try:
                pipeline = json.loads(match.group()).get("pipeline", {})
            except Exception:
                pass

    stages = len(pipeline.get("stages", []))
    print(f"   [Pipeline] 生成 {stages} 个阶段的技术链路")
    return {
        "pipeline": pipeline,
        "cost": result.get("cost", 0),
    }


def generate_cheat_sheet(course: str, knowledge_tree: dict, review_guide: dict) -> dict:
    """为每个章节生成速查卡（模板 + 必背考点 + 常见坑）

    Args:
        course: 课程名称
        knowledge_tree: 知识树
        review_guide: 复习清单（用于提取摘要，避免重复生成）

    Returns:
        {"cheat_sheets": list, "cost": float}
    """
    chapters = knowledge_tree.get("chapters", [])
    if not chapters:
        return {"cheat_sheets": [], "cost": 0}

    # 构建知识点列表
    kp_lines = []
    for ch in chapters:
        ch_title = ch.get("title", "")
        for sec in ch.get("sections", []):
            name = sec.get("title", sec.get("name", ""))
            if name:
                kp_lines.append(f"  [{ch_title}] {name}")

    if not kp_lines:
        return {"cheat_sheets": [], "cost": 0}

    kp_list_str = "\n".join(kp_lines)

    # 从复习清单提取各章节前100字作为摘要
    review_summary = ""
    review_chapters = review_guide.get("chapters", [])
    if review_chapters:
        lines = []
        for ch in review_chapters:
            title = ch.get("title", "")
            content = ch.get("content", "")[:100]
            lines.append(f"- {title}: {content}...")
        review_summary = "\n".join(lines)

    client = LLMClient("primary")
    result = client.chat(
        system_prompt="你是一位大学课程辅导专家，擅长为学生制作考前速查卡。请严格按JSON格式输出。",
        user_prompt=PROMPT_CHEAT_SHEET.format(
            course=course,
            kp_list=kp_list_str,
            review_summary=review_summary,
        ),
        response_format="json",
        max_tokens=8192,
    )

    parsed = result.get("parsed", {})
    cheat_sheets = parsed.get("cheat_sheets", []) if parsed else []

    print(f"   [速查卡] 生成 {len(cheat_sheets)} 个章节的速查卡")
    return {
        "cheat_sheets": cheat_sheets,
        "cost": result.get("cost", 0),
    }
