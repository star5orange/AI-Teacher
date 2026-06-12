# 二维码生成模块 —— 将链接转为二维码图片，方便通过闲鱼图片发送

import qrcode
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def generate_qrcode(url: str, output_path: str, label: str = "") -> str:
    """生成二维码并保存为 PNG 图片

    Args:
        url: 要编码的 URL
        output_path: 输出图片路径（不含扩展名，会自动加 .png）
        label: 二维码下方的文字标注

    Returns:
        生成的图片文件路径
    """
    output_path = Path(output_path)
    png_path = output_path.with_suffix(".png")

    # 用 qrcode 简化 API 生成
    qr_img = qrcode.make(url)
    # qrcode.make 返回的是 PilImage 包装对象，需要取内部的 PIL Image
    img = qr_img.get_image() if hasattr(qr_img, 'get_image') else qr_img._img

    # 如果有标注文字，在底部添加
    if label:
        text_height = 36
        new_img = Image.new("RGB", (img.size[0], img.size[1] + text_height), "#ffffff")
        new_img.paste(img, (0, 0))

        draw = ImageDraw.Draw(new_img)
        try:
            font = ImageFont.truetype("simhei.ttf", 12)
        except Exception:
            try:
                font = ImageFont.truetype("C:\\Windows\\Fonts\\msyh.ttc", 12)
            except Exception:
                font = ImageFont.load_default()

        bbox = draw.textbbox((0, 0), label, font=font)
        tw = bbox[2] - bbox[0]
        draw.text(((img.size[0] - tw) / 2, img.size[1] + 6), label, fill="#2c3e6b", font=font)
        img = new_img

    img.save(str(png_path))
    return str(png_path)


def generate_upload_guide_qrcode(upload_page_url: str, output_dir: str) -> str:
    """生成"上传资料"引导二维码（给买家扫码上传文件用）"""
    path = Path(output_dir) / "upload_guide_qr"
    return generate_qrcode(upload_page_url, str(path), label="扫码上传复习资料")
