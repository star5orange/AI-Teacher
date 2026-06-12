# PPT 解析模块

from pathlib import Path


def extract_text_from_pptx(filepath: str) -> str:
    """从 PPTX 文件提取纯文本

    Args:
        filepath: .pptx 文件路径

    Returns:
        提取的文字内容（保留幻灯片序号）
    """
    try:
        from pptx import Presentation
    except ImportError:
        raise ImportError("请安装 python-pptx: pip install python-pptx")

    prs = Presentation(filepath)
    slides_text = []

    for i, slide in enumerate(prs.slides, 1):
        slide_lines = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for paragraph in shape.text_frame.paragraphs:
                    text = paragraph.text.strip()
                    if text:
                        slide_lines.append(text)

            # 处理表格
            if shape.has_table:
                for row in shape.table.rows:
                    row_text = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                    if row_text:
                        slide_lines.append(" | ".join(row_text))

        if slide_lines:
            slides_text.append(f"--- 幻灯片 {i} ---\n" + "\n".join(slide_lines))

    return "\n\n".join(slides_text)


def extract_text_from_docx(filepath: str) -> str:
    """从 DOCX/DOC 文件提取纯文本

    Args:
        filepath: .docx 或 .doc 文件路径

    Returns:
        提取的文字内容
    """
    try:
        import docx
    except ImportError:
        raise ImportError("请安装 python-docx: pip install python-docx")

    doc = docx.Document(filepath)
    paragraphs = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            paragraphs.append(text)

    # 也尝试提取表格内容
    for table in doc.tables:
        for row in table.rows:
            row_text = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if row_text:
                paragraphs.append(" | ".join(row_text))

    return "\n".join(paragraphs)


def extract_text_from_pdf(filepath: str) -> str:
    """从 PDF 文件提取纯文本（电子版PDF，非扫描件）

    Args:
        filepath: .pdf 文件路径

    Returns:
        提取的文字内容
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise ImportError("请安装 PyMuPDF: pip install PyMuPDF")

    doc = fitz.open(filepath)
    pages_text = []

    for i, page in enumerate(doc, 1):
        text = page.get_text()
        if text.strip():
            pages_text.append(f"--- 第 {i} 页 ---\n{text.strip()}")

    doc.close()
    return "\n\n".join(pages_text)


def parse_materials(materials_str: str) -> dict:
    """解析用户资料参数

    Args:
        materials_str: 逗号分隔的文件路径，如 "PPT/ch1.pptx,PPT/exam.pdf"

    Returns:
        {
            "files": [{"path": "...", "type": "pptx|pdf|image", "text": "..."}],
            "total_files": N,
        }
    """
    if not materials_str:
        return {"files": [], "total_files": 0}

    SUPPORTED = {".pptx", ".pdf", ".docx", ".doc", ".png", ".jpg", ".jpeg", ".bmp", ".tiff"}
    raw_paths = [p.strip() for p in materials_str.split(",") if p.strip()]
    filepaths = []
    for p in raw_paths:
        path = Path(p)
        if path.is_dir():
            count = 0
            for f in sorted(path.rglob('*')):
                if f.is_file() and f.suffix.lower() in SUPPORTED:
                    filepaths.append(str(f))
                    count += 1
            print(f"  扫描文件夹 {path.name}：找到 {count} 个文件")
        else:
            filepaths.append(p)

    files = []

    for fp in filepaths:
        path = Path(fp)
        if not path.exists():
            print(f"[WARN] 文件不存在，跳过：{fp}")
            continue

        suffix = path.suffix.lower()

        # 先查缓存
        from src.cache.material_cache import get_cached_text, set_cached_text
        cached = get_cached_text(str(path))
        if cached is not None:
            files.append({
                "path": str(path), "name": path.name, "type": "cached",
                "text": cached, "char_count": len(cached),
            })
            print(f"  [Cache] {path.name}：缓存命中（{len(cached)} 字符）")
            continue

        try:
            if suffix == ".pptx":
                text = extract_text_from_pptx(str(path))
                file_type = "pptx"
            elif suffix == ".pdf":
                text = extract_text_from_pdf(str(path))
                file_type = "pdf"
            elif suffix in (".docx", ".doc"):
                text = extract_text_from_docx(str(path))
                file_type = "docx"
            elif suffix in (".png", ".jpg", ".jpeg", ".bmp", ".tiff"):
                # 图片走 OCR
                from src.parser.ocr import ocr_image
                text = ocr_image(str(path))
                file_type = "image"
            else:
                print(f"[WARN] 不支持的格式，跳过：{fp}")
                continue

            files.append({
                "path": str(path),
                "name": path.name,
                "type": file_type,
                "text": text,
                "char_count": len(text),
            })
            set_cached_text(str(path), text)  # 写入缓存
            print(f"  [OK] {path.name}：提取 {len(text)} 字符")

        except Exception as e:
            print(f"[FAIL] {path.name} 解析失败：{e}")
            continue

    return {
        "files": files,
        "total_files": len(files),
    }
