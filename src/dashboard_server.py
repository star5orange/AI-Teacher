#!/usr/bin/env python3
"""AI Teacher 个人控制台 —— 本地 Web Dashboard

用法：
    python src/dashboard_server.py --port 8080
    然后浏览器打开 http://localhost:8080

功能：
    - 期末冲刺生成（上传课件 → 生成刷题页面）
    - 快速学习生成（输入技术名词 → 生成学习手册）
    - 学习者画像管理
    - 已生成内容历史记录
"""

import json
import sys
import re
import sqlite3
import subprocess
import threading
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))

import click
from flask import Flask, request, jsonify, send_file
from jinja2 import Environment, FileSystemLoader

# ── 路径 ──────────────────────────────────────

ROOT = Path(__file__).parent.parent
UPLOAD_DIR = ROOT / "uploads_pending"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
TEMPLATE_DIR = ROOT / "templates"
DASHBOARD_TEMPLATE_DIR = TEMPLATE_DIR / "dashboard"
OUTPUT_DIR = ROOT / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = ROOT / "data" / "dashboard.db"

MAX_FILE_SIZE = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pptx", ".pdf", ".docx", ".doc", ".jpg", ".jpeg", ".png", ".txt"}

# ── Flask + Jinja2 ────────────────────────────

app = Flask(__name__)
jinja_env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)), autoescape=True)


def render_template(name: str, **context) -> str:
    """渲染 Jinja2 模板（自动添加通用上下文）"""
    context.setdefault("now", datetime.now())
    return jinja_env.get_template(name).render(**context)


# ── SQLite ────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """初始化数据库表"""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS generation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mode TEXT NOT NULL,
            topic TEXT NOT NULL,
            params_json TEXT,
            html_path TEXT,
            oss_url TEXT,
            status TEXT DEFAULT 'pending',
            error_msg TEXT,
            cost REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS learner_profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data_json TEXT NOT NULL DEFAULT '{}',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        -- 确保 profile 永远有一行
        INSERT OR IGNORE INTO learner_profile (id, data_json) VALUES (1, '{}');
    """)
    conn.commit()
    conn.close()


def get_profile() -> dict:
    conn = get_db()
    row = conn.execute("SELECT data_json FROM learner_profile WHERE id = 1").fetchone()
    conn.close()
    if row:
        try:
            return json.loads(row["data_json"])
        except Exception:
            return {}
    return {}


def save_profile(data: dict):
    conn = get_db()
    conn.execute(
        "UPDATE learner_profile SET data_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
        (json.dumps(data, ensure_ascii=False),),
    )
    conn.commit()
    conn.close()


def add_history(mode: str, topic: str, params: dict = None) -> int:
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO generation_history (mode, topic, params_json, status) VALUES (?, ?, ?, 'pending')",
        (mode, topic, json.dumps(params or {}, ensure_ascii=False)),
    )
    conn.commit()
    hid = cur.lastrowid
    conn.close()
    return hid


def update_history(hid: int, **kwargs):
    sets = []
    vals = []
    for k, v in kwargs.items():
        sets.append(f"{k} = ?")
        vals.append(v)
    vals.append(hid)
    conn = get_db()
    conn.execute(f"UPDATE generation_history SET {', '.join(sets)} WHERE id = ?", vals)
    conn.commit()
    conn.close()


def get_history(limit: int = 50) -> list:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM generation_history ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_history(hid: int):
    conn = get_db()
    conn.execute("DELETE FROM generation_history WHERE id = ?", (hid,))
    conn.commit()
    conn.close()


# ── 辅助 ──────────────────────────────────────

def allowed_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def safe_dirname(s: str) -> str:
    return "".join(c for c in s if c.isalnum() or c in "_-（）()")[:30]


def read_inline_css() -> str:
    """读取 CSS 变量定义（复用 base.html 的样式体系）"""
    base_html = (TEMPLATE_DIR / "base.html").read_text(encoding="utf-8")
    # 提取 <style> 块中 :root 到第一个非注释 CSS 规则结束
    match = re.search(r"<style>(.*?)</style>", base_html, re.DOTALL)
    if match:
        return match.group(1)
    return ""


# ── 页面路由 ──────────────────────────────────


@app.route("/")
def dashboard_index():
    """控制台首页"""
    profile = get_profile()
    history = get_history(limit=20)
    stats = {
        "total": len(history),
        "exam_count": sum(1 for h in history if h["mode"] == "exam_sprint"),
        "quick_count": sum(1 for h in history if h["mode"] == "quick_learn"),
    }
    return render_template(
        "dashboard/index.html",
        profile=profile,
        history=history,
        stats=stats,
        inline_css=read_inline_css(),
    )


@app.route("/generate/exam")
def generate_exam_page():
    """期末冲刺生成表单"""
    return render_template(
        "dashboard/generate_exam.html", inline_css=read_inline_css()
    )


@app.route("/generate/quick")
def generate_quick_page():
    """快速学习生成表单"""
    profile = get_profile()
    return render_template(
        "dashboard/generate_quick.html",
        profile=profile,
        inline_css=read_inline_css(),
    )


@app.route("/profile")
def profile_page():
    """画像编辑页"""
    profile = get_profile()
    return render_template(
        "dashboard/profile.html", profile=profile, inline_css=read_inline_css()
    )


@app.route("/history")
def history_page():
    """历史记录页"""
    history_list = get_history(limit=100)
    return render_template(
        "dashboard/history.html",
        history=history_list,
        inline_css=read_inline_css(),
    )


# ── 静态文件 ──────────────────────────────────

@app.route("/output/")
@app.route("/output/<path:subpath>")
def serve_output(subpath=""):
    """提供生成的文件下载/预览"""
    if subpath:
        # 尝试 output 目录
        output_path = OUTPUT_DIR / subpath
        if output_path.exists() and output_path.is_file():
            return send_file(str(output_path))

        # 尝试 uploads_pending 目录
        pending_path = UPLOAD_DIR / subpath
        if pending_path.exists() and pending_path.is_file():
            return send_file(str(pending_path))

        return "文件不存在", 404

    # 列出 output 目录
    files = []
    if OUTPUT_DIR.exists():
        for f in sorted(
            OUTPUT_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True
        ):
            if f.is_file():
                files.append(
                    f'<li><a href="/output/{f.name}">{f.name}</a> '
                    f"({f.stat().st_size/1024:.0f}KB)</li>"
                )

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>输出文件</title>
<style>
  body {{font-family:"Microsoft YaHei",sans-serif;max-width:700px;margin:40px auto;padding:20px;}}
  a {{color:#2563eb;text-decoration:none;}}
  a:hover {{text-decoration:underline;}}
  .back {{font-size:0.9em;margin-bottom:20px;}}
</style>
</head>
<body>
<div class="back"><a href="/">← 返回控制台</a></div>
<h2>📦 输出文件</h2>
<ul>{''.join(files) if files else '<li>无文件</li>'}</ul>
</body>
</html>"""
    return html


@app.route("/js/<path:filename>")
def serve_js(filename: str):
    """提供 JS 文件"""
    js_path = TEMPLATE_DIR / "js" / filename
    if js_path.exists():
        return send_file(str(js_path), mimetype="application/javascript")
    return "Not found", 404


@app.route("/css/<path:filename>")
def serve_css(filename: str):
    """提供 CSS 文件"""
    css_path = TEMPLATE_DIR / "css" / filename
    if css_path.exists():
        return send_file(str(css_path), mimetype="text/css")
    return "Not found", 404


# ── API ───────────────────────────────────────


@app.route("/api/generate/exam", methods=["POST"])
def api_generate_exam():
    """触发期末冲刺生成"""
    data = request.get_json(force=True, silent=True) or {}
    school = (data.get("school") or "").strip() or "通用"
    course = (data.get("course") or "").strip()
    exam_format = (data.get("exam_format") or "").strip()
    materials_dir = (data.get("materials_dir") or "").strip()

    if not course:
        return jsonify({"error": "课程名不能为空"}), 400

    # 写入历史记录
    hid = add_history("exam_sprint", course, {"school": school, "exam_format": exam_format})

    # 构建命令行参数
    cmd = [
        sys.executable,
        str(ROOT / "generate.py"),
        "--school", school,
        "--course", course,
        "--days", str(data.get("days", 30)),
        "--user", "dashboard",
        "--skip-deploy",
    ]
    if exam_format:
        cmd.extend(["--exam-format", exam_format])
    if materials_dir:
        cmd.extend(["--materials", materials_dir])

    # 后台线程执行生成
    def _run():
        try:
            result = subprocess.run(
                cmd,
                capture_output=True, text=True, timeout=600,
                cwd=str(ROOT), encoding="utf-8", errors="replace",
            )
            output_text = result.stdout + result.stderr
            print(output_text[-2000:] if len(output_text) > 2000 else output_text)

            if result.returncode != 0:
                update_history(hid, status="failed", error_msg=output_text[-500:])
                return

            # 尝试从输出提取 HTML 路径
            html_path = None
            for line in output_text.split("\n"):
                line = line.strip()
                if "输出：" in line or "输出:" in line:
                    html_path = line.split("：")[-1].split(":")[-1].strip()
                    break

            # 如果没找到，扫描 output 目录查找最新文件
            if not html_path:
                html_files = sorted(
                    OUTPUT_DIR.glob("*.html"),
                    key=lambda x: x.stat().st_mtime, reverse=True,
                )
                if html_files:
                    html_path = str(html_files[0].relative_to(ROOT)).replace("\\", "/")

            update_history(hid, status="done", html_path=html_path)
            print(f"[Dashboard] 期末冲刺生成完成：{html_path}")

        except subprocess.TimeoutExpired:
            update_history(hid, status="failed", error_msg="生成超时（10分钟）")
        except Exception as e:
            update_history(hid, status="failed", error_msg=str(e))

    threading.Thread(target=_run, daemon=True).start()

    return jsonify({"ok": True, "history_id": hid, "message": "生成已开始，请稍候"})


@app.route("/api/generate/quick", methods=["POST"])
def api_generate_quick():
    """触发快速学习生成"""
    data = request.get_json(force=True, silent=True) or {}
    topic = (data.get("topic") or "").strip()
    goal = (data.get("goal") or "").strip()
    depth = (data.get("depth") or "balanced").strip()
    time_budget = (data.get("time_budget") or "").strip()
    materials = data.get("materials", [])

    if not topic:
        return jsonify({"error": "技术主题不能为空"}), 400

    # 合并用户画像到参数
    profile = get_profile()
    params = {
        "topic": topic,
        "goal": goal,
        "depth": depth,
        "time_budget": time_budget,
        "materials": materials,
        "profile": profile,
    }

    hid = add_history("quick_learn", topic, params)

    # 后台线程执行生成
    def _run():
        try:
            from src.llm.deep_learn import generate_quick_learn_pipeline

            update_history(hid, status="running")

            # 组装画像信息
            known_str = "、".join(profile.get("known", []))
            confused_str = "、".join(profile.get("confused", []))

            # 调用快速学习管线
            result = generate_quick_learn_pipeline(
                topic=topic,
                goal=goal,
                depth=depth,
                background=known_str,
                confused=confused_str,
                time_budget=time_budget,
                materials=materials,
            )

            if result.get("knowledge_map") and result.get("learning_guide"):
                # 渲染 HTML
                from src.builder.renderer import HTMLRenderer
                renderer = HTMLRenderer()
                context = {
                    "school": "",
                    "course": topic,
                    "textbook": "",
                    "user_name": "dashboard",
                    "token": "local",
                    "expire_at": "",
                    "knowledge_tree": result["knowledge_map"],
                    "question_bank": result.get("learning_guide", {}).get("global_practice_questions", []),
                    "source_panel": {"sources": [f"LLM + WebFetch (时效: {result.get('timeliness', {}).get('freshness', {}).get('level', '?')})"]},
                    "is_generic": False,
                    "strategies": [],
                    "review_guide": result.get("learning_guide", {}),
                    "kp_details": {},
                    "pipeline": {},
                    "cheat_sheets": [result.get("learning_guide", {}).get("cheat_sheet", {})],
                    "days": 30,
                    "exam_format": {},
                    "mode": "quick_learn",
                }
                html = renderer.render(context)
                html_path = OUTPUT_DIR / f"quicklearn_{topic}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
                html_path.write_text(html, encoding="utf-8")
                rel_path = str(html_path.relative_to(ROOT)).replace("\\", "/")

                update_history(
                    hid,
                    status="done",
                    html_path=rel_path,
                    cost=result.get("total_cost", 0),
                )
                print(f"[Dashboard] 快速学习生成完成：{rel_path}")
            else:
                update_history(
                    hid,
                    status="failed",
                    error_msg="管线返回结果不完整（知识地图或学习手册为空）",
                )

        except Exception as e:
            import traceback
            traceback.print_exc()
            update_history(hid, status="failed", error_msg=str(e))

    threading.Thread(target=_run, daemon=True).start()

    return jsonify({"ok": True, "history_id": hid, "message": "生成已开始，请稍候"})


@app.route("/api/profile", methods=["GET"])
def api_get_profile():
    """读取学习者画像"""
    return jsonify(get_profile())


@app.route("/api/profile", methods=["PUT"])
def api_update_profile():
    """更新学习者画像"""
    data = request.get_json(force=True, silent=True) or {}
    save_profile(data)
    return jsonify({"ok": True, "profile": data})


@app.route("/api/history", methods=["GET"])
def api_get_history():
    """获取历史记录"""
    limit = request.args.get("limit", 50, type=int)
    return jsonify(get_history(limit=limit))


@app.route("/api/history/<int:hid>", methods=["DELETE"])
def api_delete_history(hid: int):
    """删除一条历史记录"""
    delete_history(hid)
    return jsonify({"ok": True})


@app.route("/api/history/<int:hid>/status", methods=["GET"])
def api_history_status(hid: int):
    """查询某次生成的状态"""
    conn = get_db()
    row = conn.execute(
        "SELECT id, status, html_path, error_msg, cost FROM generation_history WHERE id = ?",
        (hid,),
    ).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "记录不存在"}), 404
    return jsonify(dict(row))


# ── 启动 ──────────────────────────────────────


@click.command()
@click.option("--port", default=8080, help="监听端口")
@click.option("--host", default="127.0.0.1", help="监听地址（默认 127.0.0.1 仅本机）")
def main(port, host):
    """启动个人控制台"""
    init_db()

    print()
    print("=" * 55)
    print("  🏠 AI Teacher - 个人学习控制台")
    print("=" * 55)
    print(f"  地址：http://localhost:{port}")
    print(f"  期末冲刺：http://localhost:{port}/generate/exam")
    print(f"  快速学习：http://localhost:{port}/generate/quick")
    print(f"  画像管理：http://localhost:{port}/profile")
    print(f"  历史记录：http://localhost:{port}/history")
    print(f"  输出文件：http://localhost:{port}/output/")
    print("=" * 55)
    print()
    print("  Ctrl+C 关闭服务")
    print()

    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    main()
