from __future__ import annotations

import os

import psycopg
from dotenv import load_dotenv

load_dotenv()


def get_connection() -> psycopg.Connection:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError(".env에 DATABASE_URL이 설정되어 있지 않습니다.")
    return psycopg.connect(database_url)
