"""
database.py - Database engine and session management
Backend: FastAPI | Database: Supabase (PostgreSQL) | ORM: SQLModel

Supabase DATABASE_URL format:
  postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

Set in .env:
  DATABASE_URL=postgresql://postgres:...
  DB_ECHO=falsepip
"""

import os
from typing import Generator

# pyrefly: ignore [missing-import]
from dotenv import load_dotenv
# pyrefly: ignore [missing-import]
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

load_dotenv()

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password@localhost:5432/postgres",
)

# Supabase requires SSL - append sslmode if not already present
if ("supabase.co" in DATABASE_URL or "supabase.com" in DATABASE_URL) and "sslmode" not in DATABASE_URL:
    DATABASE_URL += "?sslmode=require"

engine_options = {
    "echo": os.getenv("DB_ECHO", "false").lower() == "true",
}

if DATABASE_URL.startswith("sqlite"):
    # SQLite is used by the isolated backend test suite.
    engine_options["connect_args"] = {"check_same_thread": False}
else:
    # Use connection pooling to reuse connections instead of opening
    # a new TCP+SSL connection per request.
    engine_options.update(
        {
            "pool_size": 5,
            "max_overflow": 10,
            "pool_recycle": 300,
            "pool_pre_ping": True,
            "connect_args": {
                "connect_timeout": 10,
                "keepalives": 1,
                "keepalives_idle": 30,
                "keepalives_interval": 10,
                "keepalives_count": 5,
            },
        }
    )

engine = create_engine(DATABASE_URL, **engine_options)


def create_db_and_tables() -> None:
    """
    Create all tables defined via SQLModel.
    NOTE: On Supabase, prefer running schema.sql directly in the
    SQL editor instead of using this function in production.
    Use this only for local dev / testing.
    """
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """
    FastAPI dependency — yields a DB session per request.

    Usage:
        @app.get("/items")
        def read_items(session: Session = Depends(get_session)):
            ...
    """
    with Session(engine) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
