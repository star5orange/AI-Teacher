# 资料解析缓存（PDF/PPT 提取文字的缓存）

import json
import hashlib
from datetime import datetime, timedelta
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import CACHE_DIR

MATERIAL_CACHE_DIR = CACHE_DIR.parent / "materials"
MATERIAL_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _file_hash(filepath: str) -> str:
    """对文件内容做 hash，文件变了 hash 就变"""
    path = Path(filepath)
    if not path.exists():
        return ""
    # 对文件大小 + 修改时间做 hash（不读完整内容，够用）
    stat = path.stat()
    raw = f"{filepath}_{stat.st_size}_{stat.st_mtime}"
    return hashlib.md5(raw.encode()).hexdigest()[:16]


def get_cached_text(filepath: str) -> str | None:
    """从缓存读取已解析的文本"""
    key = _file_hash(filepath)
    cache_path = MATERIAL_CACHE_DIR / f"{key}.json"
    if not cache_path.exists():
        return None

    with open(cache_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 检查是否过期（7天）
    cached_at = datetime.fromisoformat(data["cached_at"])
    if datetime.now() - cached_at > timedelta(days=7):
        cache_path.unlink()
        return None

    return data["text"]


def set_cached_text(filepath: str, text: str):
    """缓存已解析的文本"""
    key = _file_hash(filepath)
    cache_path = MATERIAL_CACHE_DIR / f"{key}.json"
    data = {
        "filepath": filepath,
        "text": text,
        "char_count": len(text),
        "cached_at": datetime.now().isoformat(),
    }
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def clean_expired():
    """清理超过 7 天的缓存"""
    cutoff = datetime.now() - timedelta(days=7)
    for f in MATERIAL_CACHE_DIR.glob("*.json"):
        try:
            with open(f, "r", encoding="utf-8") as fp:
                data = json.load(fp)
            cached_at = datetime.fromisoformat(data.get("cached_at", "2000-01-01"))
            if cached_at < cutoff:
                f.unlink()
        except (json.JSONDecodeError, KeyError):
            f.unlink()
