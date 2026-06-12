#!/usr/bin/env python3
"""独立的部署/管理脚本

用法：
  # 部署已有 HTML
  python deploy.py upload output/a1b2c3d4.html --days 30

  # 续期 Token
  python deploy.py renew --token a1b2c3d4 --add-days 30

  # 查看统计
  python deploy.py stats

  # 查看某用户的所有订单
  python deploy.py list --user "闲鱼用户名"
"""

import click
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent))
from src.deploy.oss_upload import upload_to_oss
from src.cache.token_db import (
    renew_token, revoke_token, list_tokens, get_token_info, get_stats,
)
from src.cache.course_cache import list_cached_courses, clear_cache


@click.group()
def cli():
    """AI 家教 - 部署与管理工具"""
    pass


@cli.command()
@click.argument("html_path")
@click.option("--days", default=30, help="链接有效天数")
def upload(html_path, days):
    """上传 HTML 到 OSS 并生成签名 URL"""
    path = Path(html_path)
    if not path.exists():
        print(f"❌ 文件不存在：{html_path}")
        return

    print(f"🚀 上传中...")
    url = upload_to_oss(str(path), expire_days=days)
    print(f"✅ 上传成功！")
    print(f"   {url}")


@cli.command()
@click.option("--token", required=True, help="Token 字符串")
@click.option("--add-days", default=30, help="续期天数")
def renew(token, add_days):
    """续期 Token"""
    info = get_token_info(token)
    if not info:
        print(f"❌ Token 不存在：{token}")
        return

    print(f"   用户：{info['user_name']}")
    print(f"   课程：{info['course']}")
    print(f"   当前到期：{info['expire_at']}")

    if renew_token(token, add_days):
        print(f"✅ 已续期 {add_days} 天")
    else:
        print(f"❌ 续期失败")


@cli.command()
@click.option("--token", required=True, help="Token 字符串")
def revoke(token):
    """作废 Token"""
    if revoke_token(token):
        print(f"✅ Token 已作废：{token}")
    else:
        print(f"❌ 操作失败")


@cli.command()
@click.option("--user", default=None, help="闲鱼用户名（可选）")
def list(user):
    """列出 Token 记录"""
    tokens = list_tokens(user)
    if not tokens:
        print("暂无记录")
        return

    print(f"{'Token':<12} {'用户':<12} {'课程':<16} {'状态':<8} {'到期':<16} {'价格'}")
    print("-" * 75)
    for t in tokens:
        token_short = t["token"][:10] + ".."
        print(f"{token_short:<12} {t['user_name']:<12} {t['course']:<16} {t['status']:<8} {t['expire_at']:<16} ¥{t['price']}")


@cli.command()
def stats():
    """查看统计"""
    s = get_stats()
    print(f"   累计 Token：{s['total_tokens']}")
    print(f"   活跃 Token：{s['active_tokens']}")
    print(f"   累计收入：¥{s['total_revenue']}")

    print(f"\n📦 缓存课程：")
    courses = list_cached_courses()
    if courses:
        for c in courses:
            print(f"   {c['cache_key']} | {c['question_count']}题 | 生成于 {c['created_at'][:10]}")
    else:
        print("   （空）")


@cli.command()
@click.option("--cache-key", default=None, help="指定缓存键（不指定则清空全部）")
def clear(cache_key):
    """清理缓存"""
    clear_cache(cache_key)
    print(f"✅ 缓存已清理")


if __name__ == "__main__":
    cli()
