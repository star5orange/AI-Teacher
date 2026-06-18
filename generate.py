#!/usr/bin/env python3
"""AI 家教 —— 定制化刷题页面生成器

用法：
  # 完整参数（PPT + 历年题 + 教材）
  python generate.py --school "浙江大学" --course "高等数学（上）" \\
      --materials "PPT/ch1.pptx,去年期末.pdf" \\
      --textbook "同济大学《高等数学》第七版 上册" \\
      --days 30 --user "闲鱼用户名"

  # 仅教材
  python generate.py --school "浙江大学" --course "高等数学（上）" \\
      --textbook "同济大学《高等数学》第七版 上册" \\
      --days 1 --user "闲鱼用户名"

  # 仅课程名（兜底）
  python generate.py --course "高等数学（上）" --days 1 --user "闲鱼用户名"
"""

import sys
import json
import time
from datetime import datetime, timedelta
from pathlib import Path

import click

from config import OUTPUT_DIR, QUIZ_CONFIG
from src.parser.ppt_parser import parse_materials
from src.llm.analysis import analyze_ppt, analyze_exam, merge_analysis
from src.llm.knowledge_tree import generate_knowledge_tree, get_textbook_toc, generate_review_guide, generate_kp_details, generate_pipeline, generate_cheat_sheet
from src.llm.question_bank import generate_all_questions
from src.llm.strategies import generate_strategies
from src.builder.renderer import HTMLRenderer
from src.builder.validator import validate_question_bank, print_validation_report
from src.cache.course_cache import check_cache, save_cache
from src.cache.token_db import create_token, get_stats
from src.cache.material_cache import clean_expired

from src.cache.token_db import create_token, get_stats


@click.command()
@click.option("--school", default="通用", help="学校名称")
@click.option("--course", required=True, help="课程名称")
@click.option("--materials", default=None, help="用户资料路径，逗号分隔（PPT/PDF/图片）")
@click.option("--textbook", default=None, help="教材名称")
@click.option("--exam-format", default=None, help="考试题型分布，如 '选择20分,填空20分,计算40分,证明20分'")
@click.option("--days", default=30, help="有效期（天）")
@click.option("--user", default="unknown", help="闲鱼用户名")
@click.option("--price", default=29.0, help="售价（元）")
@click.option("--skip-deploy", is_flag=True, help="跳过部署，仅生成 HTML")
def main(school, course, materials, textbook, exam_format, days, user, price, skip_deploy):
    """生成定制化刷题页面"""
    start_time = time.time()
    total_llm_cost = 0
    clean_expired()  # 清理过期资料缓存

    print("=" * 60)
    print(f"[ AI 家教 - 刷题页面生成器")
    print(f"   学校：{school}")
    print(f"   课程：{course}")
    print(f"   教材：{textbook or '未指定'}")
    print(f"   资料：{materials or '无'}")
    print(f"   有效期：{days} 天")
    print(f"   用户：{user}")
    print("=" * 60)

    # ── Step 0: 检查缓存 ──
    cached = check_cache(school, course, textbook or "",
                         materials=materials or "")

    strategies_result = {"strategies": [], "cost": 0}  # 默认值

    if cached:
        print("\n[ 缓存命中！直接复用已有题库")
        knowledge_tree = cached["knowledge_tree"]
        question_bank = cached["question_bank"]
        merged_analysis = cached.get("meta", {}).get("merged_analysis")
    else:
        # ── Step 1: 解析用户资料 ──
        user_materials = None
        ppt_analysis = {}
        exam_analysis = {}
        merged_analysis = None

        if materials:
            print("\n[ Step 1/5: 解析用户资料...")
            user_materials = parse_materials(materials)
            print(f"   共 {user_materials['total_files']} 个文件")

            if user_materials["total_files"] > 0:
                # 分类处理：PPT 和 历年题
                ppt_texts = []
                exam_texts = []
                for f in user_materials["files"]:
                    # 简单推断：含"期末""考试""真题"关键词的 → 历年题
                    if any(kw in f["name"].lower() for kw in ["期末", "考试", "真题", "exam", "test"]):
                        exam_texts.append(f["text"])
                    else:
                        ppt_texts.append(f["text"])

                if ppt_texts:
                    print("   [ 分析 PPT 内容...")
                    ppt_analysis = analyze_ppt("\n\n".join(ppt_texts))
                    total_llm_cost += ppt_analysis.get("cost", 0) if isinstance(ppt_analysis, dict) else 0

                if exam_texts:
                    print("   [ 分析历年题...")
                    exam_analysis = analyze_exam("\n\n".join(exam_texts))

                merged_analysis = merge_analysis(ppt_analysis, exam_analysis)

                # 用户提供了考试题型分布
                if exam_format:
                    parsed = _parse_exam_format(exam_format)
                    # 给 question_bank 用的简单版：{"选择": 10, "简答": 10, ...}
                    merged_analysis["question_type_dist"] = {k: v["score"] for k, v in parsed.get("types", {}).items()}
                    print(f"   考试题型：{merged_analysis['question_type_dist']}")

                print(f"   提取知识点：{len(merged_analysis.get('knowledge_points', []))} 个")
                print(f"   高频考点：{len(merged_analysis.get('high_freq_points', []))} 个")
        else:
            merged_analysis = None

        # ── Step 2: 生成知识树 ──
        print("\n[ Step 2/5: 生成知识树...")
        textbook_toc = None
        if textbook:
            print(f"   查询教材目录：《{textbook}》...")
            textbook_toc = get_textbook_toc(textbook)

        # 预获取通用大纲，避免 knowledge_tree 内部重复调用
        from src.llm.knowledge_tree import get_public_syllabus
        syllabus_text = get_public_syllabus(course)

        tree_result = generate_knowledge_tree(
            school=school,
            course=course,
            textbook=textbook or "",
            user_knowledge_points=merged_analysis.get("knowledge_points") if merged_analysis else None,
            textbook_toc=textbook_toc,
            syllabus_text=syllabus_text,
        )
        knowledge_tree = tree_result["knowledge_tree"]
        total_llm_cost += tree_result.get("cost", 0)

        # ── Step 2.5: 详细复习清单 ──
        print("\n[ Step 2.5/5: 生成详细复习清单...")
        user_texts = ""
        if materials:
            user_texts = "\n".join([f.get("text", "")[:3000] for f in user_materials.get("files", [])[:5]])
        review_result = generate_review_guide(school=school, course=course, user_content=user_texts, knowledge_tree=knowledge_tree)
        review_guide = review_result.get("review_guide", {}) if review_result else {}
        if review_guide is None:
            review_guide = {}
        total_llm_cost += review_result.get("cost", 0) if review_result else 0
        chapters_count = len(review_guide.get("chapters", []))
        print(f"   生成 {chapters_count} 章的详细复习内容")

        # 防护：确保 knowledge_tree 不为 None
        if knowledge_tree is None:
            print("   [ERROR] 知识树生成失败，使用兜底结构")
            knowledge_tree = {
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

        chapters_count = len(knowledge_tree.get("chapters", []))
        kp_count = sum(
            len(ch.get("sections", []))
            for ch in knowledge_tree.get("chapters", [])
        )
        print(f"   生成 {chapters_count} 章，{kp_count} 个知识点")

        # ── Step 3: 生成题库 ──
        print(f"\n[ Step 3/5: 生成题库...")
        bank_result = generate_all_questions(
            knowledge_tree=knowledge_tree,
            course=course,
            textbook=textbook or "",
            merged_analysis=merged_analysis,
            questions_per_kp=QUIZ_CONFIG["questions_per_knowledge_point"].get("常规", 3),
        )
        question_bank = bank_result["questions"]
        total_llm_cost += bank_result.get("total_cost", 0)

        # ── Step 4: 质量自检 ──
        print(f"\n[ Step 4/5: 质量自检...")
        validation = validate_question_bank(question_bank, knowledge_tree, merged_analysis)
        print_validation_report(validation)

        if not validation["passed"]:
            print("   [WARN] 有警告但继续生成，请人工检查")

        # ── Step 2.6: 知识点详情卡片 ──
        print("\n[ Step 2.6/5: 生成知识点详情卡片...")
        kp_result = generate_kp_details(course=course, knowledge_tree=knowledge_tree)
        kp_details = kp_result.get("kp_details", {})
        total_llm_cost += kp_result.get("cost", 0)
        print(f"   生成 {len(kp_details)} 个知识点的详情卡片")

        # ── Step 2.7: 技术链路梳理 ──
        print("\n[ Step 2.7/5: 生成技术链路...")
        pipeline_result = generate_pipeline(course=course, knowledge_tree=knowledge_tree)
        pipeline = pipeline_result.get("pipeline", {})
        total_llm_cost += pipeline_result.get("cost", 0)
        print(f"   生成 {len(pipeline.get('stages', []))} 个阶段")

        # ── Step 2.8: 速查卡（模板 + 必背考点）──
        print("\n[ Step 2.8/5: 生成速查卡...")
        cheat_result = generate_cheat_sheet(course=course, knowledge_tree=knowledge_tree, review_guide=review_guide)
        cheat_sheets = cheat_result.get("cheat_sheets", [])
        total_llm_cost += cheat_result.get("cost", 0)
        print(f"   生成 {len(cheat_sheets)} 个章节的速查卡")

        # ── 存入缓存 ──
        save_cache(
            school, course, textbook or "",
            knowledge_tree, question_bank,
            materials=materials or "",
            meta={
                "merged_analysis": merged_analysis,
                "review_guide": review_guide,
                "kp_details": kp_details,
                "pipeline": pipeline,
                "cheat_sheets": cheat_sheets,
                "llm_cost": total_llm_cost,
                "validation": validation["stats"],
            }
        )

    # ── Step 4.5: 解题思路（缓存命中后也生成，成本很低）──
    question_types = list(set(q.get("type", "") for q in question_bank if q.get("type")))
    type_names = {"choice": "选择题", "fill": "填空题", "calc": "计算题", "tf": "判断题", "proof": "证明题", "multi": "多选题"}
    strategy_types = [type_names.get(t, t) for t in question_types if t]
    strategies_result = {"strategies": [], "cost": 0}
    if strategy_types:
        print(f"\n[ Step 4.5/5: 生成解题思路...")
        strategies_result = generate_strategies(course, strategy_types, merged_analysis.get("question_type_dist") if merged_analysis else None)
        total_llm_cost += strategies_result["cost"]
        print(f"   生成 {len(strategies_result['strategies'])} 个题型的解题思路")

    # ── Step 5: 打包 HTML ──
    print(f"\n[ Step 5/5: 打包 HTML...")

    token = create_token(
        school=school,
        course=course,
        textbook=textbook or "",
        materials_summary=materials or "",
        days=days,
        user_name=user,
        price=price,
        cache_key=cached.get("meta", {}).get("cache_key", "") if cached else "",
    )

    expire_at = (datetime.now() + timedelta(days=days)).isoformat()

    # 构建溯源面板数据
    source_panel = _build_source_panel(
        materials, textbook, merged_analysis if not cached else None,
        knowledge_tree, question_bank,
        user_materials if not cached else None,
    )

    renderer = HTMLRenderer()
    # KP详情 / Pipeline / 速查卡：缓存有则复用，无则生成
    if cached:
        kp_details = cached.get("meta", {}).get("kp_details", {})
        pipeline = cached.get("meta", {}).get("pipeline", {})
        cheat_sheets = cached.get("meta", {}).get("cheat_sheets", [])
    if not kp_details and knowledge_tree:
        print("\n[ Step 2.6/5: 生成知识点详情卡片...")
        kp_result = generate_kp_details(course=course, knowledge_tree=knowledge_tree)
        kp_details = kp_result.get("kp_details", {})
        total_llm_cost += kp_result.get("cost", 0)
        print(f"   生成 {len(kp_details)} 个知识点的详情卡片")
    if (not pipeline or not pipeline.get("stages")) and knowledge_tree:
        print("\n[ Step 2.7/5: 生成技术链路...")
        pl_result = generate_pipeline(course=course, knowledge_tree=knowledge_tree)
        pipeline = pl_result.get("pipeline", {})
        total_llm_cost += pl_result.get("cost", 0)
        print(f"   生成 {len(pipeline.get('stages', []))} 个阶段")
    if (not cheat_sheets) and knowledge_tree:
        print("\n[ Step 2.8/5: 生成速查卡...")
        cs_result = generate_cheat_sheet(course=course, knowledge_tree=knowledge_tree, review_guide=review_guide)
        cheat_sheets = cs_result.get("cheat_sheets", [])
        total_llm_cost += cs_result.get("cost", 0)
        print(f"   生成 {len(cheat_sheets)} 个章节的速查卡")
    if not kp_details: kp_details = {}
    if not pipeline: pipeline = {}
    if not cheat_sheets: cheat_sheets = []

    html_content = renderer.render({
        "school": school,
        "course": course,
        "textbook": textbook or "",
        "user_name": user,
        "token": token,
        "expire_at": expire_at,
        "days": days,
        "knowledge_tree": knowledge_tree,
        "question_bank": question_bank,
        "source_panel": source_panel,
        "exam_format": _exam_format_for_frontend(exam_format) if exam_format else {},
        "strategies": strategies_result.get("strategies", []),
        "review_guide": review_guide if not cached else cached.get("meta", {}).get("review_guide", {}),
        "kp_details": kp_details,
        "pipeline": pipeline,
        "cheat_sheets": cheat_sheets,
        "is_generic": not materials and not textbook,
    })

    output_path = OUTPUT_DIR / f"{token}.html"
    output_path.write_text(html_content, encoding="utf-8")
    file_size = output_path.stat().st_size
    print(f"   输出：{output_path}")
    print(f"   大小：{file_size / 1024:.1f} KB")

    # ── Step 6: 部署 ──
    if skip_deploy:
        url = f"file://{output_path}"
        print(f"\n[File] 本地文件：{output_path}")
    else:
        print(f"\n[Deploy] 部署到阿里云 OSS...")
        try:
            from src.deploy.oss_upload import upload_to_oss as _upload
            url = _upload(str(output_path), expire_days=days)
            print(f"   [OK] 部署成功")
        except Exception as e:
            print(f"   [FAIL] 部署失败：{e}")
            print(f"   请手动部署：{output_path}")
            url = f"file://{output_path}"

    # ── Step 6.5: 生成二维码（方便闲鱼发图片给买家）──
    qr_path = None
    if not url.startswith("file://"):
        try:
            from src.deploy.qrcode_gen import generate_qrcode
            qr_label = f"{course} - {school} (有效期{days}天)"
            qr_path = generate_qrcode(url, str(output_path), label=qr_label)
            print(f"\n[QR] 二维码已生成：{qr_path}")
        except Exception as e:
            print(f"\n[QR] 二维码生成失败（非致命）：{e}")

    # ── 汇总 ──
    elapsed = time.time() - start_time
    stats = get_stats()

    print("\n" + "=" * 60)
    print("[OK] 生成完成！")
    print("=" * 60)
    print(f"   链接：{url}")
    if qr_path:
        print(f"   二维码：{qr_path}")
    print(f"   有效期：{days} 天（{expire_at[:10]}）")
    print(f"   题量：{len(question_bank)} 道")
    print(f"   LLM 成本：RMB{total_llm_cost:.4f}")
    print(f"   耗时：{elapsed:.0f} 秒")
    print(f"   累计收入：RMB{stats['total_revenue']}")
    print(f"   当前活跃 Token：{stats['active_tokens']}")
    if qr_path:
        print(f"\n   [闲鱼] 把二维码图片发给买家即可：{qr_path}")
    else:
        print(f"\n   [Copy] 复制链接发给闲鱼用户：")
        print(f"   {url}")


def _exam_format_for_frontend(exam_format: str) -> dict:
    """将 exam-format 转成前端可用的格式（英文键名，避免编码问题）"""
    CN_TO_EN = {
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
    parsed = _parse_exam_format(exam_format)
    if not parsed or "types" not in parsed:
        return {}
    new_types = {}
    for cn_name, info in parsed["types"].items():
        en_name = CN_TO_EN.get(cn_name, cn_name)  # 标准题型翻译，其余原样透传
        new_types[en_name] = info
    return {"types": new_types, "total_score": parsed["total_score"], "total_count": parsed["total_count"]}


def _parse_exam_format(exam_format: str) -> dict:
    """解析考试题型分布字符串

    支持两种格式：
      旧格式: "选择20分,填空20分,计算40分"
      新格式: "选择1*10=10分,简答2*5=10分,代码填空3*15=45分"

    Returns:
        {
            "types": {"选择": {"score": 10, "count": 1}, "简答": {"score": 10, "count": 2}},
            "total_score": 90, "total_count": 7
        }
    """
    dist = {}
    for part in exam_format.split(","):
        part = part.strip()
        if not part:
            continue
        import re
        # 新格式: "选择1*10=10分" → name="选择", count=1, per_score=10, total=10
        match = re.match(r"(.+?)(\d+)\s*\*\s*(\d+)\s*=\s*(\d+)\s*分?", part)
        if match:
            name = match.group(1).strip()
            count = int(match.group(2))
            per_score = int(match.group(3))
            total = int(match.group(4))
            dist[name] = {"score": total, "count": count, "per_score": per_score}
            continue
        # 旧格式: "选择20分" → name="选择", score=20
        match = re.match(r"(.+?)(\d+)\s*分?", part)
        if match:
            name = match.group(1).strip()
            score = int(match.group(2))
            dist[name] = {"score": score, "count": 0}
    if not dist:
        return {}
    total_score = sum(v["score"] for v in dist.values())
    total_count = sum(v["count"] for v in dist.values())
    return {"types": dist, "total_score": total_score, "total_count": total_count}


def _build_source_panel(materials, textbook, merged_analysis, knowledge_tree, question_bank,
                         user_materials=None) -> dict:
    """构建溯源面板数据（页面顶部展示内容来源）"""
    clean_materials = ""
    if materials:
        from pathlib import Path
        if user_materials and user_materials.get("files"):
            # 用实际解析的文件名
            names = [f.get("name", "") for f in user_materials["files"]]
        else:
            names = [Path(f.strip()).stem for f in materials.split(",") if f.strip()]
        clean_materials = "、".join(names[:5])
        if len(names) > 5:
            clean_materials += f" 等{len(names)}个文件"

    panel = {
        "has_materials": bool(materials),
        "materials_list": clean_materials,
        "textbook": textbook or "未指定",
        "coverage_ratio": 0,
        "sources": {
            "user_material": 0,
            "textbook_supplement": 0,
            "public_syllabus": 0,
            "generic": 0,
        },
    }

    # 统计来源分布
    for q in question_bank:
        src = q.get("source", "generic")
        if src in panel["sources"]:
            panel["sources"][src] += 1

    # 统计知识点来源
    kp_sources = {"user_material": 0, "textbook_supplement": 0, "public_syllabus": 0}
    chapters = knowledge_tree.get("chapters", [])
    for ch in chapters:
        for sec in ch.get("sections", []):
            src = sec.get("source", "public_syllabus")
            if src in kp_sources:
                kp_sources[src] += 1

    total_kp = sum(kp_sources.values())
    if total_kp > 0:
        panel["coverage_ratio"] = round(
            (kp_sources["user_material"] + kp_sources["textbook_supplement"]) / total_kp * 100
        )

    panel["kp_sources"] = kp_sources

    if merged_analysis:
        panel["high_freq_points"] = merged_analysis.get("high_freq_points", [])

    return panel


if __name__ == "__main__":
    main()
