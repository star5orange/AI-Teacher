# HTML 渲染模块

import json
import re
from pathlib import Path
from jinja2 import Environment, FileSystemLoader

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import TEMPLATE_DIR


def _extract_css_from_base() -> str:
    """从 base.html 提取 CSS 变量和基础样式"""
    base_path = TEMPLATE_DIR / "base.html"
    if not base_path.exists():
        return ""
    html = base_path.read_text(encoding="utf-8")
    match = re.search(r"<style>(.*?)</style>", html, re.DOTALL)
    return match.group(1) if match else ""


class HTMLRenderer:
    """将知识树 + 题库渲染为自包含 HTML"""

    def __init__(self):
        self.env = Environment(
            loader=FileSystemLoader(str(TEMPLATE_DIR)),
            autoescape=False,  # HTML 模板里已有完整的 HTML 结构
        )

    @staticmethod
    def _safe_json(data) -> str:
        """生成 JSON 字符串，转义所有 < 防止破坏 <script> 标签。
        JSON 结构中不会出现 < 字符，所以全局替换是安全的。"""
        raw = json.dumps(data, ensure_ascii=False)
        # < 在 JSON 字符串值中可能出现（如代码示例 <div>、<script>）
        # 浏览器在 <script> 块内看到 < 会尝试解析 HTML 标签
        # 转为 < 后浏览器不会误解析，JS 引擎会正确还原为 <
        return raw.replace("<", "\\u003c")

    def render(self, context: dict) -> str:
        """渲染完整 HTML

        Args:
            context: {
                "school": str,
                "course": str,
                "textbook": str,
                "user_name": str,
                "token": str,
                "expire_at": str (ISO 格式),
                "knowledge_tree": dict,
                "question_bank": list,
                "source_panel": dict,  # 溯源面板数据
                "is_generic": bool,    # 是否通用版
            }
        """
        # 注入数据为 JSON 字符串（安全转义 </ 避免破坏 HTML）
        context["knowledge_tree_json"] = self._safe_json(
            context["knowledge_tree"]
        )
        context["question_bank_json"] = self._safe_json(
            context["question_bank"]
        )
        context["strategies_json"] = self._safe_json(
            context.get("strategies", [])
        )
        context["review_guide_json"] = self._safe_json(
            context.get("review_guide", {})
        )
        context["kp_details_json"] = self._safe_json(
            context.get("kp_details", {})
        )
        context["pipeline_json"] = self._safe_json(
            context.get("pipeline", {})
        )
        context["cheat_sheets_json"] = self._safe_json(
            context.get("cheat_sheets", [])
        )
        config_dict = {
            "token": context["token"],
            "school": context["school"],
            "course": context["course"],
            "textbook": context.get("textbook", ""),
            "expire_at": context["expire_at"],
            "user_name": context.get("user_name", ""),
            "source_panel": context.get("source_panel", {}),
            "exam_format": context.get("exam_format", {}),
            "is_generic": context.get("is_generic", False),
            "days": context.get("days", 30),
        }
        context["config_json"] = self._safe_json(config_dict)
        context["config"] = config_dict

        # 读取 CSS（从 base.html 提取样式体系）
        context["inline_css"] = _extract_css_from_base()

        mode = context.get("mode", "exam_sprint")
        context["inline_js"] = self._read_all_js(mode=mode)
        context["mode"] = mode

        template_name = "base.html"
        if mode == "quick_learn":
            # 快速学习模式使用专用模板（如果有），否则复用 base.html
            quick_template = TEMPLATE_DIR / "quick_learn.html"
            if quick_template.exists():
                template_name = "quick_learn.html"

        template = self.env.get_template(template_name)
        return template.render(**context)

    def _read_static(self, relative_path: str) -> str:
        """读取静态文件内容"""
        path = TEMPLATE_DIR / relative_path
        if path.exists():
            return path.read_text(encoding="utf-8")
        return ""

    def _read_all_js(self, mode: str = "exam_sprint") -> str:
        """读取所有 JS 文件并合并（按 mode 选择加载哪些模块）"""
        js_dir = TEMPLATE_DIR / "js"

        # 所有模式共用的基础模块
        common_js = [
            "auth.js",
            "knowledge-tree.js",
            "notes.js",
            "highlights.js",
            "app.js",
        ]

        # 期末冲刺专用模块
        exam_js = [
            "quiz.js",
            "wrongbook.js",
            "kp-detail.js",
            "exam.js",
            "charts.js",
            "stats.js",
        ]

        # 快速学习专用模块（如果有）
        quick_js = [
            "learner-profile.js",
            "deep-learn.js",
        ]

        js_files = list(common_js)

        if mode == "quick_learn":
            js_files.extend(quick_js)
        else:
            js_files.extend(exam_js)

        combined = []
        for fname in js_files:
            path = js_dir / fname
            if path.exists():
                content = path.read_text(encoding="utf-8")
                combined.append(f"// ====== {fname} ======\n{content}")
        return "\n\n".join(combined)
