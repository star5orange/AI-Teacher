# 课程/教材缓存管理

import json
import hashlib
from datetime import datetime, timedelta
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import CACHE_DIR, CACHE_CONFIG


def _make_cache_key(school: str, course: str, textbook: str = "",
                    materials: str = "") -> str:
    """生成缓存键（学校+课程+教材+资料路径 -> hash）"""
    raw = f"{school}_{course}_{textbook}_{materials}".strip("_")
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def check_cache(school: str, course: str, textbook: str = "",
                materials: str = "") -> dict | None:
    """检查缓存

    Returns:
        {"knowledge_tree": ..., "question_bank": ..., "meta": {...}} 或 None
    """
    key = _make_cache_key(school, course, textbook, materials)
    cache_path = CACHE_DIR / f"{key}.json"

    if not cache_path.exists():
        return None

    with open(cache_path, "r", encoding="utf-8") as f:
        cached = json.load(f)

    # 检查缓存时效
    created = datetime.fromisoformat(cached["meta"]["created_at"])
    max_age = CACHE_CONFIG["expire_days"]
    if datetime.now() - created > timedelta(days=max_age):
        return None  # 缓存过期

    return cached


def save_cache(school: str, course: str, textbook: str,
               knowledge_tree: dict, question_bank: list,
               materials: str = "", meta: dict = None):
    """保存缓存"""
    key = _make_cache_key(school, course, textbook, materials)
    cache_path = CACHE_DIR / f"{key}.json"

    data = {
        "knowledge_tree": knowledge_tree,
        "question_bank": question_bank,
        "meta": meta or {},
    }
    data["meta"]["created_at"] = datetime.now().isoformat()
    data["meta"]["cache_key"] = key

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def list_cached_courses() -> list[dict]:
    """列出所有缓存的课程"""
    courses = []
    for f in sorted(CACHE_DIR.glob("*.json")):
        with open(f, "r", encoding="utf-8") as fp:
            data = json.load(fp)
        meta = data.get("meta", {})
        courses.append({
            "file": f.name,
            "cache_key": meta.get("cache_key", ""),
            "created_at": meta.get("created_at", ""),
            "question_count": len(data.get("question_bank", [])),
            "llm_cost": meta.get("llm_cost", 0),
        })
    return courses


def clear_cache(cache_key: str = None):
    """清理缓存"""
    if cache_key:
        path = CACHE_DIR / f"{cache_key}.json"
        if path.exists():
            path.unlink()
    else:
        for f in CACHE_DIR.glob("*.json"):
            f.unlink()
