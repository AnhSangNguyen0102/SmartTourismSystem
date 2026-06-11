import pytest
from decimal import Decimal
from sqlmodel import Session

from models import Cities, Categories, Tags
from crud.crud_reference import get_active_cities, get_all_categories, get_all_tags

@pytest.fixture(name="reference_setup")
def reference_setup_fixture(db_session: Session):
    # Active city
    city_active = Cities(
        city_id=1,
        city_name="Đà Lạt",
        region="Tây Nguyên",
        latitude=Decimal("11.9404"),
        longitude=Decimal("108.4583"),
        is_active=True
    )
    # Inactive city
    city_inactive = Cities(
        city_id=2,
        city_name="Thành Phố X",
        region="Không rõ",
        latitude=Decimal("0.0"),
        longitude=Decimal("0.0"),
        is_active=False
    )
    db_session.add(city_active)
    db_session.add(city_inactive)

    # Category
    cat = Categories(category_id=1, category_name="Ẩm thực")
    db_session.add(cat)

    # Tag
    tag = Tags(tag_id=1, tag_name="Chụp ảnh")
    db_session.add(tag)

    db_session.commit()

def test_get_active_cities(db_session: Session, reference_setup):
    cities = get_active_cities(db_session)
    assert len(cities) == 1
    # Note: get_active_cities returns tuple/row mapping selected columns
    assert cities[0].city_name == "Đà Lạt"

def test_get_all_categories(db_session: Session, reference_setup):
    categories = get_all_categories(db_session)
    assert len(categories) == 1
    assert categories[0].category_name == "Ẩm thực"

def test_get_all_tags(db_session: Session, reference_setup):
    tags = get_all_tags(db_session)
    assert len(tags) == 1
    assert tags[0].tag_name == "Chụp ảnh"
