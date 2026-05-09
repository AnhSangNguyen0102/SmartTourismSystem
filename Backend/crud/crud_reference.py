"""
================================================================================
 crud/crud_reference.py  │  USE CASE: Reference / Master Data
================================================================================
 Q   Op      Table(s)    Function
 ──  ──────  ──────────  ───────────────────────
 Q1  SELECT  CITIES      get_active_cities
 Q2  SELECT  CATEGORIES  get_all_categories
 Q3  SELECT  TAGS        get_all_tags
================================================================================
"""

from sqlmodel import Session, select

from models import Cities, Categories, Tags


# ---------------------------------------------------------------------------
# Q1 – Lấy tất cả thành phố đang hoạt động  (SELECT cities WHERE is_active)
# ---------------------------------------------------------------------------

def get_active_cities(db: Session) -> list[Cities]:
    """
    Trả về danh sách các thành phố có ``is_active = True``.

    Columns trả về: city_id, city_name, latitude, longitude, region.
    """
    statement = (
        select(
            Cities.city_id,
            Cities.city_name,
            Cities.latitude,
            Cities.longitude,
            Cities.region,
        )
        .where(Cities.is_active == True)
    )
    rows = db.exec(statement).all()
    return rows


# ---------------------------------------------------------------------------
# Q2 – Lấy tất cả danh mục địa điểm  (SELECT categories)
# ---------------------------------------------------------------------------

def get_all_categories(db: Session) -> list[Categories]:
    """
    Trả về toàn bộ bảng ``categories``.

    Columns trả về: category_id, category_name.
    """
    statement = select(Categories.category_id, Categories.category_name)
    return db.exec(statement).all()


# ---------------------------------------------------------------------------
# Q3 – Lấy tất cả tag sở thích  (SELECT tags)
# ---------------------------------------------------------------------------

def get_all_tags(db: Session) -> list[Tags]:
    """
    Trả về toàn bộ bảng ``tags``.

    Columns trả về: tag_id, tag_name.
    """
    statement = select(Tags.tag_id, Tags.tag_name)
    return db.exec(statement).all()
