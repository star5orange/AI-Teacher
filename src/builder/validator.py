# 质量自检模块

import json
from collections import Counter


def validate_question_bank(
    question_bank: list,
    knowledge_tree: dict,
    merged_analysis: dict = None,
) -> dict:
    """对生成的题库进行质量自检

    Args:
        question_bank: 题库列表
        knowledge_tree: 知识树
        merged_analysis: 考点画像（含分布期望）

    Returns:
        {
            "passed": bool,
            "checks": [...],
            "warnings": [...],
            "stats": {...},
        }
    """
    checks = []
    warnings = []
    stats = {
        "total": len(question_bank),
        "by_type": Counter(),
        "by_difficulty": Counter(),
        "by_source": Counter(),
        "kps_covered": set(),
        "with_explanation": 0,
        "with_pitfall": 0,
    }

    # 提取所有知识点
    all_kps = set()
    chapters = knowledge_tree.get("chapters", [])
    for ch in chapters:
        for sec in ch.get("sections", []):
            kp_name = sec.get("title", sec.get("name", ""))
            if kp_name:
                all_kps.add(kp_name)

    # 逐题统计
    for q in question_bank:
        q_type = q.get("type", "")
        difficulty = q.get("difficulty", 0)
        source = q.get("source", "unknown")
        kp = q.get("knowledge_point", "")

        stats["by_type"][q_type] += 1
        stats["by_difficulty"][f"L{difficulty}"] += 1
        stats["by_source"][source] += 1
        if kp:
            stats["kps_covered"].add(kp)
        if q.get("explanation"):
            stats["with_explanation"] += 1
        if q.get("pitfall"):
            stats["with_pitfall"] += 1

    # ── 检查项 ──

    # 1. 知识点覆盖率
    covered = stats["kps_covered"]
    if all_kps:
        coverage = len(covered) / len(all_kps)
        stats["kp_coverage"] = round(coverage * 100, 1)
        if coverage >= 0.95:
            checks.append(f"[OK] 知识点覆盖率 {stats['kp_coverage']}%")
        else:
            missing = all_kps - covered
            warnings.append(f"[WARN] 知识点覆盖率仅 {stats['kp_coverage']}%，缺失：{missing}")

    # 2. 题型分布
    if merged_analysis and merged_analysis.get("question_type_dist"):
        expected_types = set(merged_analysis["question_type_dist"].keys())
        actual_types = set(stats["by_type"].keys())
        if expected_types - actual_types:
            warnings.append(f"[WARN] 缺少题型：{expected_types - actual_types}")

    # 3. 解析完整性
    explanation_rate = stats["with_explanation"] / max(stats["total"], 1)
    if explanation_rate >= 0.9:
        checks.append(f"[OK] 解析覆盖率 {round(explanation_rate*100)}%")
    else:
        warnings.append(f"[WARN] 解析覆盖率仅 {round(explanation_rate*100)}%")

    # 4. 易错提醒覆盖率
    pitfall_rate = stats["with_pitfall"] / max(stats["total"], 1)
    stats["pitfall_rate"] = round(pitfall_rate * 100, 1)
    if pitfall_rate < 0.5:
        warnings.append(f"[WARN] 易错提醒覆盖率偏低 ({stats['pitfall_rate']}%)")

    # 5. 题量检查
    kp_count = len(all_kps)
    expected_min = kp_count * 5  # 每知识点最少 5 道
    if stats["total"] >= expected_min:
        checks.append(f"[OK] 题量充足（{stats['total']}题 / {kp_count}个知识点）")
    else:
        warnings.append(f"[WARN] 题量偏少（{stats['total']}题，建议 ≥ {expected_min}题）")

    passed = len(warnings) == 0

    return {
        "passed": passed,
        "checks": checks,
        "warnings": warnings,
        "stats": {
            "total": stats["total"],
            "by_type": dict(stats["by_type"]),
            "by_difficulty": dict(stats["by_difficulty"]),
            "by_source": dict(stats["by_source"]),
            "kp_coverage": stats.get("kp_coverage", 0),
            "pitfall_rate": stats.get("pitfall_rate", 0),
            "explanation_rate": round(explanation_rate * 100, 1),
        },
    }


def print_validation_report(result: dict):
    """打印验证报告"""
    print("\n" + "=" * 50)
    print("[List] 质量自检报告")
    print("=" * 50)

    for check in result["checks"]:
        print(f"  {check}")

    if result["warnings"]:
        print("")
        for w in result["warnings"]:
            print(f"  {w}")

    print(f"\n  [Chart] 统计：")
    stats = result["stats"]
    print(f"     总题量：{stats['total']}")
    print(f"     题型分布：{stats['by_type']}")
    print(f"     知识点覆盖：{stats['kp_coverage']}%")
    print(f"     解析覆盖：{stats['explanation_rate']}%")
    print(f"     易错提醒覆盖：{stats['pitfall_rate']}%")

    if result["passed"]:
        print("\n  [OK] 质量自检通过！")
    else:
        print(f"\n  [WARN] 有 {len(result['warnings'])} 个警告，请检查")
