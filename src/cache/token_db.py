# Token 数据库管理

import sqlite3
import secrets
import json
from datetime import datetime, timedelta
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import TOKEN_DB_PATH, TOKEN_CONFIG


def get_connection():
    """获取数据库连接"""
    conn = sqlite3.connect(str(TOKEN_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """初始化数据库表"""
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS tokens (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            token           TEXT UNIQUE NOT NULL,
            school          TEXT DEFAULT '',
            course          TEXT NOT NULL,
            textbook        TEXT DEFAULT '',
            materials_summary TEXT DEFAULT '',
            cache_key       TEXT DEFAULT '',
            days            INTEGER DEFAULT 30,
            user_name       TEXT DEFAULT '',
            price           REAL DEFAULT 29.0,
            status          TEXT DEFAULT 'active',
            device_id       TEXT DEFAULT '',
            created_at      TEXT DEFAULT (datetime('now', 'localtime')),
            activated_at    TEXT,
            expire_at       TEXT,
            renewed_count   INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS orders (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            token           TEXT NOT NULL,
            order_type      TEXT DEFAULT 'new',  -- new | renew | upgrade
            price           REAL DEFAULT 29.0,
            user_name       TEXT DEFAULT '',
            created_at      TEXT DEFAULT (datetime('now', 'localtime'))
        );
    """)
    conn.commit()
    conn.close()


def generate_token() -> str:
    """生成唯一 Token"""
    return secrets.token_hex(TOKEN_CONFIG["length"] // 2)


def create_token(
    school: str,
    course: str,
    textbook: str = "",
    materials_summary: str = "",
    days: int = 30,
    user_name: str = "",
    price: float = 29.0,
    cache_key: str = "",
) -> str:
    """创建新 Token，返回 token 字符串"""
    init_db()
    token = generate_token()
    now = datetime.now()
    expire_at = now + timedelta(days=days)

    conn = get_connection()
    conn.execute(
        """INSERT INTO tokens (token, school, course, textbook, materials_summary,
           cache_key, days, user_name, price, created_at, expire_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            token, school, course, textbook, materials_summary,
            cache_key, days, user_name, price,
            now.strftime("%Y-%m-%d %H:%M:%S"),
            expire_at.strftime("%Y-%m-%d %H:%M:%S"),
        ),
    )
    conn.execute(
        """INSERT INTO orders (token, order_type, price, user_name)
           VALUES (?, 'new', ?, ?)""",
        (token, price, user_name),
    )
    conn.commit()
    conn.close()
    return token


def get_token_info(token: str) -> dict | None:
    """查询 Token 信息"""
    init_db()
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM tokens WHERE token = ?", (token,)
    ).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def activate_token(token: str, device_id: str) -> bool:
    """首次激活：记录设备 ID 和激活时间"""
    init_db()
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM tokens WHERE token = ? AND status = 'active'", (token,)
    ).fetchone()
    if not row:
        conn.close()
        return False

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        "UPDATE tokens SET device_id = ?, activated_at = ? WHERE token = ?",
        (device_id, now, token),
    )
    conn.commit()
    conn.close()
    return True


def renew_token(token: str, add_days: int = 30, price: float = 29.0) -> bool:
    """续期 Token"""
    init_db()
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM tokens WHERE token = ?", (token,)
    ).fetchone()
    if not row:
        conn.close()
        return False

    current_expire = datetime.strptime(row["expire_at"], "%Y-%m-%d %H:%M:%S")
    new_expire = current_expire + timedelta(days=add_days)

    conn.execute(
        "UPDATE tokens SET expire_at = ?, days = days + ?, renewed_count = renewed_count + 1, status = 'active' WHERE token = ?",
        (new_expire.strftime("%Y-%m-%d %H:%M:%S"), add_days, token),
    )
    conn.execute(
        "INSERT INTO orders (token, order_type, price, user_name) VALUES (?, 'renew', ?, ?)",
        (token, price, row["user_name"]),
    )
    conn.commit()
    conn.close()
    return True


def revoke_token(token: str) -> bool:
    """手动作废 Token"""
    init_db()
    conn = get_connection()
    conn.execute("UPDATE tokens SET status = 'revoked' WHERE token = ?", (token,))
    conn.commit()
    conn.close()
    return True


def list_tokens(user_name: str = None) -> list[dict]:
    """列出 Token（可按用户过滤）"""
    init_db()
    conn = get_connection()
    if user_name:
        rows = conn.execute(
            "SELECT * FROM tokens WHERE user_name = ? ORDER BY created_at DESC",
            (user_name,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM tokens ORDER BY created_at DESC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_stats() -> dict:
    """统计概览"""
    init_db()
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) as c FROM tokens").fetchone()["c"]
    active = conn.execute(
        "SELECT COUNT(*) as c FROM tokens WHERE status = 'active'"
    ).fetchone()["c"]
    total_revenue = conn.execute(
        "SELECT SUM(price) as c FROM orders"
    ).fetchone()["c"] or 0
    conn.close()
    return {
        "total_tokens": total,
        "active_tokens": active,
        "total_revenue": round(total_revenue, 2),
    }
