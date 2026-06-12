# OCR 模块（图片文字识别）

from pathlib import Path


def ocr_image(filepath: str, lang: str = "ch") -> str:
    """对图片进行 OCR 文字识别

    Args:
        filepath: 图片路径（支持 png/jpg/bmp/tiff）
        lang: 语言，"ch"（中文）、"en"（英文）、"ch_en"（中英混合）

    Returns:
        识别出的文字内容
    """
    try:
        from paddleocr import PaddleOCR
    except ImportError:
        raise ImportError("请安装 PaddleOCR: pip install paddleocr")

    # PaddleOCR 首次运行会自动下载模型
    ocr = PaddleOCR(
        use_angle_cls=True,
        lang=lang,
        show_log=False,
    )

    result = ocr.ocr(filepath, cls=True)

    if not result or not result[0]:
        return ""

    lines = []
    for line_info in result[0]:
        text = line_info[1][0]  # 识别的文字
        confidence = line_info[1][1]  # 置信度
        if confidence > 0.5:  # 过滤低置信度结果
            lines.append(text)

    return "\n".join(lines)


def ocr_images_batch(filepaths: list[str], lang: str = "ch") -> dict:
    """批量 OCR"""
    results = {}
    for fp in filepaths:
        try:
            text = ocr_image(fp, lang)
            results[fp] = text
            print(f"  [OK] {Path(fp).name}：识别 {len(text)} 字符")
        except Exception as e:
            print(f"  [FAIL] {Path(fp).name} 识别失败：{e}")
            results[fp] = ""
    return results
