import os
import sys

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

if sys.platform.startswith("win"):
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("[ERROR] DATABASE_URL not found in .env")
    raise SystemExit(1)

if ("supabase.co" in DATABASE_URL or "supabase.com" in DATABASE_URL) and "sslmode" not in DATABASE_URL:
    DATABASE_URL += "?sslmode=require"

engine = create_engine(DATABASE_URL)


def has_column(conn, table: str, column: str) -> bool:
    return conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name=:table AND column_name=:column"
        ),
        {"table": table, "column": column},
    ).fetchone() is not None


def has_table(conn, table: str) -> bool:
    return conn.execute(
        text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name=:table"
        ),
        {"table": table},
    ).fetchone() is not None


with engine.begin() as conn:
    if not has_column(conn, "locations", "address"):
        conn.execute(text("ALTER TABLE public.locations ADD COLUMN address VARCHAR(500) NULL"))
        print("[OK] Added locations.address")

    if not has_column(conn, "locations", "is_active"):
        conn.execute(text("ALTER TABLE public.locations ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE"))
        print("[OK] Added locations.is_active")

    if not has_column(conn, "locations", "deleted_at"):
        conn.execute(text("ALTER TABLE public.locations ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE NULL"))
        print("[OK] Added locations.deleted_at")

    if not has_table(conn, "location_submissions"):
        conn.execute(
            text(
                """
                CREATE TABLE public.location_submissions (
                    submission_id UUID PRIMARY KEY,
                    location_id UUID REFERENCES public.locations(location_id) ON DELETE SET NULL,
                    enterprise_id UUID NOT NULL REFERENCES public.enterprise_profiles(enterprise_id) ON DELETE CASCADE,
                    type VARCHAR(50) NOT NULL,
                    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
                    data_json TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    reviewed_at TIMESTAMP WITH TIME ZONE NULL,
                    reviewed_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
                    reject_reason VARCHAR(255) NULL
                )
                """
            )
        )
        print("[OK] Created location_submissions")

    if not has_table(conn, "location_verification_logs"):
        conn.execute(
            text(
                """
                CREATE TABLE public.location_verification_logs (
                    log_id SERIAL PRIMARY KEY,
                    submission_id UUID REFERENCES public.location_submissions(submission_id) ON DELETE SET NULL,
                    location_id UUID REFERENCES public.locations(location_id) ON DELETE SET NULL,
                    admin_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
                    action VARCHAR(50) NOT NULL,
                    reason VARCHAR(255) NULL,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        print("[OK] Created location_verification_logs")

print("[DONE] Admin/enterprise migration completed")
