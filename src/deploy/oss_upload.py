# 阿里云 OSS 部署模块

import oss2
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import OSS_CONFIG


class OSSDeployer:
    """阿里云 OSS 部署 + 签名 URL 生成"""

    def __init__(self):
        config = OSS_CONFIG
        if not config["access_key_id"] or not config["access_key_secret"]:
            raise ValueError("请配置 OSS_ACCESS_KEY_ID 和 OSS_ACCESS_KEY_SECRET")

        self.auth = oss2.Auth(
            config["access_key_id"],
            config["access_key_secret"],
        )
        self.bucket = oss2.Bucket(
            self.auth,
            config["endpoint"],
            config["bucket_name"],
        )
        self.custom_domain = config.get("custom_domain")

    def upload(self, local_path: str, expire_days: int = 30) -> str:
        """上传文件并返回带签名的临时链接

        Args:
            local_path: 本地 HTML 文件路径
            expire_days: 链接有效天数

        Returns:
            带签名的 URL（到期后 OSS 服务端自动拒绝访问）
        """
        token = Path(local_path).stem  # 文件名（不含扩展名）= token

        # 1. 上传到 OSS（bucket 设为私有）
        object_name = f"quiz/{token}.html"
        self.bucket.put_object_from_file(
            object_name, local_path,
            headers={
                "Content-Type": "text/html; charset=utf-8",
                "Content-Disposition": "inline",  # 手机浏览器直接打开，不下载
            }
        )

        # 2. 生成签名 URL（强制 HTTPS + 手机浏览器直接打开不下载）
        expire_seconds = expire_days * 24 * 3600
        signed_url = self.bucket.sign_url(
            "GET", object_name, expire_seconds,
            params={
                "response-content-disposition": "inline",
            }
        )
        signed_url = signed_url.replace("http://", "https://")

        # 3. 如果有自定义域名，替换 endpoint 部分
        if self.custom_domain:
            # 签名 URL 的域名替换为自定义域名（签名仍然有效）
            from urllib.parse import urlparse, urlunparse
            parsed = urlparse(signed_url)
            custom_parsed = urlparse(self.custom_domain if "://" in self.custom_domain else f"https://{self.custom_domain}")
            signed_url = urlunparse((
                custom_parsed.scheme,
                custom_parsed.netloc,
                parsed.path,
                parsed.params,
                parsed.query,
                parsed.fragment,
            ))

        return signed_url


def upload_to_oss(local_path: str, expire_days: int = 30) -> str:
    """上传 HTML 到 OSS 并返回签名 URL

    Args:
        local_path: 本地文件路径
        expire_days: 有效期（天）

    Returns:
        签名 URL
    """
    deployer = OSSDeployer()
    url = deployer.upload(local_path, expire_days)
    return url
