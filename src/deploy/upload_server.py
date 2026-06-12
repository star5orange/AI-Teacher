#!/usr/bin/env python3
"""简易文件接收服务 —— 供买家上传资料到卖家电脑

用法：
  终端1: python src/deploy/upload_server.py --port 8080
  终端2: ngrok http 8080
  然后把 ngrok 生成的 https 链接发给买家

买家打开链接 → 拖拽上传文件 → 卖家在管理面板一键生成 → 发二维码给买家
每次有买家时再启动，用完就关，不必一直开着。
"""

import json
import sys
import re
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import click
from flask import Flask, request, jsonify, send_from_directory, send_file

app = Flask(__name__)

ROOT = Path(__file__).parent.parent.parent
UPLOAD_DIR = ROOT / "uploads_pending"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
TEMPLATE_DIR = ROOT / "templates"
OUTPUT_DIR = ROOT / "output"

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB
ALLOWED_EXTENSIONS = {'.pptx', '.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png', '.txt'}


def allowed_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def safe_dirname(s: str) -> str:
    """生成安全的目录名"""
    return "".join(c for c in s if c.isalnum() or c in '_-（）()')[:30]


# ── 买家页面 ──

@app.route('/')
def index():
    """上传页面（买家看到的上传界面）"""
    return send_file(str(TEMPLATE_DIR / "upload.html"))


# ── 卖家页面 ──

@app.route('/dashboard')
def dashboard():
    """卖家管理面板（查看待处理 + 一键生成）"""
    pending = []
    if UPLOAD_DIR.exists():
        for d in sorted(UPLOAD_DIR.iterdir(), reverse=True):
            if not d.is_dir():
                continue
            info_file = d / "info.json"
            info = {}
            if info_file.exists():
                info = json.loads(info_file.read_text(encoding='utf-8'))
            # 检查是否已有输出
            html_files = list(d.glob("*.html")) + list(d.glob("*.png"))
            pending.append({
                "dir": d.name,
                "school": info.get("school", "?"),
                "course": info.get("course", "?"),
                "user_name": info.get("user_name", ""),
                "exam_format": info.get("exam_format", ""),
                "files": info.get("files", []),
                "received_at": info.get("received_at", ""),
                "has_output": len(html_files) > 0,
                "output_files": [f.name for f in html_files],
            })

    # 简易 HTML（不依赖外部模板）
    rows = ""
    for p in pending:
        file_list = "、".join(f.get("name", "") for f in p["files"])
        status = '<span style="color:green">已生成</span>' if p["has_output"] else '<span style="color:#cc8800">待处理</span>'
        generate_btn = ""
        if not p["has_output"]:
            generate_btn = f'<button onclick="generate(\'{p["dir"]}\')" style="padding:4px 12px;background:#2c3e6b;color:#fff;border:none;border-radius:4px;cursor:pointer;">生成</button>'
        output_links = ""
        for f in p.get("output_files", []):
            output_links += f' <a href="/output/{p["dir"]}/{f}" target="_blank" style="font-size:0.8em;">{f}</a>'

        rows += f"""
        <tr>
          <td style="font-size:0.8em;">{p['received_at'][:16] if p['received_at'] else '?'}</td>
          <td>{p.get('user_name', '?')}</td>
          <td>{p['school']}</td>
          <td>{p['course']}</td>
          <td style="font-size:0.8em;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{file_list}</td>
          <td>{status}{output_links}</td>
          <td>{generate_btn}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>卖家管理面板</title>
<style>
  * {{margin:0;padding:0;box-sizing:border-box;}}
  body {{font-family:"Microsoft YaHei",sans-serif;background:#f0f4f8;padding:20px;}}
  .header {{background:#2c3e6b;color:#fff;padding:16px 24px;border-radius:10px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;}}
  .header h1 {{font-size:1.2em;}}
  .header a {{color:#aaccff;text-decoration:none;font-size:0.9em;}}
  table {{width:100%;background:#fff;border-radius:10px;overflow:hidden;border-collapse:collapse;box-shadow:0 2px 8px rgba(0,0,0,0.06);}}
  th,td {{padding:10px 14px;text-align:left;border-bottom:1px solid #eee;font-size:0.9em;}}
  th {{background:#f8fafc;color:#555;font-weight:600;}}
  tr:hover {{background:#f8fafe;}}
  .empty {{text-align:center;padding:60px;color:#999;}}
  .tip {{margin-top:16px;font-size:0.8em;color:#888;line-height:1.6;}}
  .tip code {{background:#f0f0f0;padding:1px 6px;border-radius:3px;}}
</style>
</head>
<body>
<div class="header">
  <h1>📋 待处理列表（{len(pending)}）</h1>
  <div><a href="/">上传页面 →</a> &nbsp; <a href="/output/">输出文件 →</a></div>
</div>
<table>
  <tr><th>时间</th><th>买家</th><th>学校</th><th>课程</th><th>文件</th><th>状态</th><th>操作</th></tr>
  {rows if rows else '<tr><td colspan="6" class="empty">还没有买家上传资料</td></tr>'}
</table>
<div class="tip">
  💡 <strong>使用说明：</strong><br>
  1. 买家上传后点「生成」→ 等待 2-10 分钟 → 状态变绿<br>
  2. 点输出文件名下载 HTML/二维码 → 把 <code>.png</code> 二维码发给买家<br>
  3. 或者用 <code>python generate.py --materials "uploads_pending/xxx" --course "课程名"</code> 手动生成<br>
  4. 处理完可删 <code>uploads_pending/</code> 下对应目录
</div>
<script>
  async function generate(dir) {{
    if (!confirm('确认生成？将调用 generate.py，耗时 2-10 分钟。')) return;
    const td = event.target.parentElement;
    event.target.textContent = '生成中...';
    event.target.disabled = true;
    try {{
      const resp = await fetch('/api/generate', {{
        method: 'POST',
        headers: {{'Content-Type':'application/json'}},
        body: JSON.stringify({{dir}}),
      }});
      const data = await resp.json();
      if (data.ok) {{
        alert('生成成功！\\n' + (data.qr_path || ''));
        location.reload();
      }} else {{
        alert('失败：' + (data.error || '未知错误'));
        event.target.textContent = '生成';
        event.target.disabled = false;
      }}
    }} catch(e) {{
      alert('请求失败：' + e.message);
      event.target.textContent = '生成';
      event.target.disabled = false;
    }}
  }}
</script>
</body>
</html>"""
    return html


@app.route('/output/')
@app.route('/output/<path:subpath>')
def serve_output(subpath=""):
    """提供生成的文件下载（HTML + 二维码）"""
    output_dir = ROOT / "output"
    if subpath:
        # 也可能是 uploads_pending 下的文件
        pending_path = UPLOAD_DIR / subpath
        if pending_path.exists() and pending_path.is_file():
            return send_file(str(pending_path))
        output_path = output_dir / subpath
        if output_path.exists() and output_path.is_file():
            return send_file(str(output_path))
        return "文件不存在", 404
    # 列出 output 目录
    files = []
    if output_dir.exists():
        for f in sorted(output_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            files.append(f'<li><a href="/output/{f.name}">{f.name}</a> ({f.stat().st_size/1024:.0f}KB)</li>')
    return f"<h2>输出文件</h2><ul>{''.join(files) if files else '<li>无文件</li>'}</ul>"


# ── API ──

@app.route('/api/upload', methods=['POST'])
def upload():
    """接收文件上传"""
    course = request.form.get('course', '').strip()
    school = request.form.get('school', '通用').strip()
    exam_format = request.form.get('exam_format', '').strip()
    user_name = request.form.get('user_name', '').strip()

    if not course:
        return jsonify({"error": "课程名不能为空"}), 400

    files = request.files.getlist('files')
    if not files:
        return jsonify({"error": "请选择文件"}), 400

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dir_name = f"{safe_dirname(school)}_{safe_dirname(course)}_{timestamp}"
    save_dir = UPLOAD_DIR / dir_name
    save_dir.mkdir(parents=True, exist_ok=True)

    saved_files = []
    for f in files:
        if not f.filename or not allowed_file(f.filename):
            continue
        f.seek(0, 2)
        size = f.tell()
        f.seek(0)
        if size > MAX_FILE_SIZE:
            continue
        safe_name = Path(f.filename).name
        f.save(str(save_dir / safe_name))
        saved_files.append({"name": safe_name, "size": size})

    info = {
        "school": school,
        "course": course,
        "exam_format": exam_format,
        "user_name": user_name,
        "files": saved_files,
        "received_at": datetime.now().isoformat(),
    }
    (save_dir / "info.json").write_text(
        json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')

    print(f"\n[接收] {school} - {course}  |  {len(saved_files)}个文件  |  {save_dir.name}")
    for f in saved_files:
        print(f"   {f['name']} ({f['size']/1024:.0f}KB)")

    return jsonify({"ok": True, "message": f"已收到 {len(saved_files)} 个文件", "dir": dir_name})


@app.route('/api/pending')
def list_pending():
    """列出待处理的买家上传"""
    pending = []
    if UPLOAD_DIR.exists():
        for d in sorted(UPLOAD_DIR.iterdir(), reverse=True):
            if not d.is_dir():
                continue
            info_file = d / "info.json"
            info = {}
            if info_file.exists():
                info = json.loads(info_file.read_text(encoding='utf-8'))
            pending.append({
                "dir": d.name,
                "school": info.get("school", ""),
                "course": info.get("course", ""),
                "files": info.get("files", []),
                "received_at": info.get("received_at", ""),
            })
    return jsonify({"pending": pending})


@app.route('/api/generate', methods=['POST'])
def trigger_generate():
    """触发生成（按目录名）"""
    data = request.get_json(force=True, silent=True) or {}
    dir_name = (data.get('dir', '') or '').strip()
    if not dir_name:
        return jsonify({"error": "缺少 dir 参数"}), 400

    target_dir = UPLOAD_DIR / dir_name
    if not target_dir.exists():
        return jsonify({"error": f"目录不存在：{dir_name}"}), 404

    info_file = target_dir / "info.json"
    info = {}
    if info_file.exists():
        info = json.loads(info_file.read_text(encoding='utf-8'))

    school = info.get("school", "通用")
    course = info.get("course", "")
    exam_fmt = info.get("exam_format", "")

    if not course:
        return jsonify({"error": "课程名为空"}), 400

    print(f"\n{'='*50}")
    print(f"[生成] {school} - {course}")
    print(f"[生成] 资料目录：{target_dir}")
    print(f"[生成] 题型：{exam_fmt or '未指定'}")
    print(f"{'='*50}")

    import subprocess
    cmd = [
        sys.executable,
        str(ROOT / "generate.py"),
        "--school", school,
        "--course", course,
        "--materials", str(target_dir),
        "--days", "30",
        "--user", "upload",
        "--skip-deploy",
    ]
    if exam_fmt:
        cmd.extend(["--exam-format", exam_fmt])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True, text=True, timeout=600,
            cwd=str(ROOT),
            encoding='utf-8', errors='replace',
        )
        output_text = result.stdout + result.stderr
        print(output_text[-2000:] if len(output_text) > 2000 else output_text)

        if result.returncode != 0:
            return jsonify({"error": "生成失败", "detail": output_text[-500:]}), 500

        # 从输出中提取最新生成的 HTML 和 QR 路径
        html_path = None
        qr_path = None
        for line in output_text.split('\n'):
            line = line.strip()
            if '输出：' in line or '输出:' in line:
                html_path = line.split('：')[-1].split(':')[-1].strip()
            if '二维码：' in line or '二维码:' in line:
                qr_path = line.split('：')[-1].split(':')[-1].strip()

        return jsonify({
            "ok": True,
            "message": "生成成功",
            "html_path": html_path,
            "qr_path": qr_path,
        })

    except subprocess.TimeoutExpired:
        return jsonify({"error": "生成超时（10分钟）"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── 启动 ──

@click.command()
@click.option("--port", default=8080, help="监听端口")
@click.option("--host", default="0.0.0.0", help="监听地址")
def main(port, host):
    """启动文件接收服务"""
    print()
    print("=" * 55)
    print("  📤 AI 家教 - 资料接收服务")
    print("=" * 55)
    print(f"  本机地址：http://localhost:{port}")
    print(f"  买家上传：http://localhost:{port}/")
    print(f"  管理面板：http://localhost:{port}/dashboard")
    print(f"  文件存储：{UPLOAD_DIR}")
    print("=" * 55)
    print()
    print("  [ 公网访问 ]")
    print("  1. 安装 ngrok：https://ngrok.com/download")
    print("  2. 新开一个终端，运行：")
    print(f"     ngrok http {port}")
    print("  3. 把 ngrok 生成的 Forwarding 地址（https://xxx.ngrok-free.app）发给买家")
    print()
    print("  每次有买家时再启动，用完 Ctrl+C 关闭即可。")
    print("=" * 55)
    print()

    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    main()
