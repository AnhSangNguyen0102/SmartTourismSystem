"""
database.py - Database engine and session management
Backend: FastAPI | Database: Supabase (PostgreSQL) | ORM: SQLModel

Supabase DATABASE_URL format:
  postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

Set in .env:
  DATABASE_URL=postgresql://postgres:...
  DB_ECHO=false
"""

import os
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

load_dotenv()

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password@localhost:5432/postgres",
)

# Supabase requires SSL - append sslmode if not already present
if "supabase.co" in DATABASE_URL and "sslmode" not in DATABASE_URL:
    DATABASE_URL += "?sslmode=require"

engine = create_engine(
    DATABASE_URL,
    echo=os.getenv("DB_ECHO", "false").lower() == "true",
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,     # Re-check connections before use
    pool_recycle=1800,      # Recycle every 30 min (avoid idle timeout)
    connect_args={
        # Required by Supabase / cloud PostgreSQL providers
        "sslmode": "require",
    } if "supabase.co" in DATABASE_URL else {},
)


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
