# AI 家教 - 全局配置

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# 项目路径
ROOT_DIR = Path(__file__).parent
CACHE_DIR = ROOT_DIR / "cache" / "courses"
OUTPUT_DIR = ROOT_DIR / "output"
TEMPLATE_DIR = ROOT_DIR / "templates"
DATA_DIR = ROOT_DIR / "data"
TOKEN_DB_PATH = DATA_DIR / "tokens.db"

# 确保目录存在
for d in [CACHE_DIR, OUTPUT_DIR, DATA_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# LLM 配置
LLM_CONFIG = {
    "primary": {
        "provider": "deepseek",
        "api_key": os.getenv("DEEPSEEK_API_KEY"),
        "base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
    },
    "fallback": {
        "provider": "openai",
        "api_key": os.getenv("OPENAI_API_KEY"),
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
    },
    # Token 估算单价（元/百万token）
    "pricing": {
        "deepseek": {"input": 2, "output": 8},
        "gpt-4o-mini": {"input": 1.05, "output": 4.2},
    },
}

# OSS 配置
OSS_CONFIG = {
    "access_key_id": os.getenv("OSS_ACCESS_KEY_ID"),
    "access_key_secret": os.getenv("OSS_ACCESS_KEY_SECRET"),
    "endpoint": os.getenv("OSS_ENDPOINT", "oss-cn-hangzhou.aliyuncs.com"),
    "bucket_name": os.getenv("OSS_BUCKET_NAME", "ai-quiz-pages"),
    "custom_domain": os.getenv("OSS_CUSTOM_DOMAIN", None),
}

# 题库生成配置
QUIZ_CONFIG = {
    "questions_per_knowledge_point": {
        "必考": 8,       # 必考知识点最多题
        "高频": 5,
        "常规": 3,
        "了解": 1,
    },
    "user_material_extra": 2,               # 用户资料知识点额外加题
    "textbook_supplement_min": 2,            # 教材补充最低题量
    "difficulty_distribution": {              # 默认难度分布
        "L1": 0.20,  # 基础概念
        "L2": 0.40,  # 常规应用
        "L3": 0.30,  # 综合运用
        "L4": 0.10,  # 拔高
    },
    "question_types": ["choice", "fill", "calc", "tf", "multi"],
}

# 缓存配置
CACHE_CONFIG = {
    "expire_days": 180,  # 缓存有效期（超过则建议刷新）
}

# Token 配置
TOKEN_CONFIG = {
    "length": 32,  # Token 字符串长度
}
