# 时效性信息抓取模块

import re
import json
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from urllib.parse import quote_plus


class _TextExtractor(HTMLParser):
    """简单的 HTML 文本提取器"""

    def __init__(self):
        super().__init__()
        self.text_parts = []
        self.skip_tags = {"script", "style", "noscript", "code", "pre"}
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.skip_tags:
            self._skip_depth += 1

    def handle_endtag(self, tag):
        if tag in self.skip_tags and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data):
        if self._skip_depth == 0:
            text = data.strip()
            if text and len(text) > 2:
                self.text_parts.append(text)

    def get_text(self, max_chars: int = 8000) -> str:
        result = []
        total = 0
        for part in self.text_parts:
            if total + len(part) > max_chars:
                result.append(part[: max_chars - total])
                break
            result.append(part)
            total += len(part)
        return "\n".join(result)


def _fetch_url(url: str, timeout: int = 8) -> str | None:
    """抓取单个 URL，返回文本内容"""
    try:
        req = Request(url, headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml",
        })
        with urlopen(req, timeout=timeout) as resp:
            # 限制读取大小（前 200KB 足够获取关键信息）
            html = resp.read(200_000).decode("utf-8", errors="replace")
    except (URLError, HTTPError, OSError, ValueError) as e:
        return None

    extractor = _TextExtractor()
    try:
        extractor.feed(html)
    except Exception:
        pass
    text = extractor.get_text(6000)

    # 清理空行
    lines = [l for l in text.split("\n") if l.strip()]
    return "\n".join(lines[:100])  # 最多保留 100 行


def _search_urls(topic: str) -> list[str]:
    """根据 topic 生成可能的资料 URL"""
    encoded = quote_plus(topic)

    urls = [
        # Wikipedia
        f"https://en.wikipedia.org/wiki/{topic.replace(' ', '_')}",
    ]

    # 常见技术官网映射
    KNOWN_SITES = {
        "fastapi": "https://fastapi.tiangolo.com/",
        "flask": "https://flask.palletsprojects.com/",
        "django": "https://docs.djangoproject.com/",
        "react": "https://react.dev/",
        "vue": "https://vuejs.org/",
        "flutter": "https://flutter.dev/",
        "docker": "https://docs.docker.com/",
        "kubernetes": "https://kubernetes.io/docs/",
        "redis": "https://redis.io/docs/",
        "nginx": "https://nginx.org/en/docs/",
        "postgresql": "https://www.postgresql.org/docs/",
        "mongodb": "https://www.mongodb.com/docs/",
        "graphql": "https://graphql.org/",
        "grpc": "https://grpc.io/docs/",
        "rust": "https://doc.rust-lang.org/",
        "golang": "https://go.dev/doc/",
        "typescript": "https://www.typescriptlang.org/docs/",
        "pytorch": "https://pytorch.org/docs/",
        "tensorflow": "https://www.tensorflow.org/",
        "langchain": "https://python.langchain.com/docs/",
    }

    topic_lower = topic.lower()
    for name, url in KNOWN_SITES.items():
        if name in topic_lower or topic_lower in name:
            urls.append(url)
            break

    # GitHub 搜索（常见的 GitHub 仓库命名）
    urls.append(f"https://github.com/{topic_lower}/{topic_lower}")

    return urls


def fetch_topic_info(topic: str) -> dict:
    """抓取技术主题的最新信息

    Args:
        topic: 技术主题名称

    Returns:
        {
            "summary": str,          # 抓取到的文本摘要
            "sources_fetched": int,  # 成功抓取的来源数
            "urls_tried": list[str], # 尝试抓取的 URL
            "errors": list[str],     # 抓取失败的信息
        }
    """
    urls = _search_urls(topic)
    summaries = []
    errors = []
    fetched = 0

    for url in urls:
        text = _fetch_url(url)
        if text:
            # 截取前 2000 字作为摘要
            summaries.append(f"=== {url} ===\n{text[:2000]}")
            fetched += 1
        else:
            errors.append(f"无法访问: {url}")

    return {
        "summary": "\n\n".join(summaries) if summaries else "",
        "sources_fetched": fetched,
        "urls_tried": urls,
        "errors": errors,
    }
