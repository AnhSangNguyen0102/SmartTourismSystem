"""test_connection.py - Kiem tra ket noi toi Supabase"""
import os
from dotenv import load_dotenv
from sqlalchemy import text
from sqlmodel import Session, create_engine

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
if "supabase.co" in DATABASE_URL and "sslmode" not in DATABASE_URL:
    DATABASE_URL += "?sslmode=require"

host = DATABASE_URL.split('@')[1].split('/')[0]
print(f"[*] Host: {host}")

try:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    with Session(engine) as session:
        version = session.exec(text("SELECT version()")).first()
        print(f"[OK] Ket noi thanh cong!")
        print(f"     {version[0][:80]}")

        tables = session.exec(text("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' ORDER BY table_name
        """)).fetchall()

        if tables:
            print(f"\n[INFO] Co {len(tables)} bang tren Supabase:")
            for row in tables:
                print(f"   - {row[0]}")
        else:
            print("\n[WARN] Chua co bang nao. Hay chay schema.sql tren Supabase SQL Editor.")

except Exception as e:
    print(f"[FAIL] Loi ket noi: {e}")
