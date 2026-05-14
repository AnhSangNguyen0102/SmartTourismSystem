from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TYPE travelstyle ADD VALUE 'CULTURAL';"))
        conn.execute(text("ALTER TYPE travelstyle ADD VALUE 'ECO';"))
        conn.execute(text("ALTER TYPE travelstyle ADD VALUE 'ADVENTURE';"))
        conn.execute(text("ALTER TYPE travelstyle ADD VALUE 'FAMILY';"))
        conn.execute(text("ALTER TYPE travelstyle ADD VALUE 'FOODIE';"))
        conn.execute(text("ALTER TYPE travelstyle ADD VALUE 'LUXURY';"))
        conn.execute(text("ALTER TYPE travelstyle ADD VALUE 'WELLNESS';"))
        conn.commit()
        print('ENUM updated')
    except Exception as e:
        print('Error:', e)
