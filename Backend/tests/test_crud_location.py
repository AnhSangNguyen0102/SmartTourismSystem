import pytest
from uuid import uuid4
from datetime import time
from decimal import Decimal
from sqlmodel import Session, select

from models import (
    Cities, Categories, Tags, Locations, LocationCategories, LocationTags, LocationsImage,
    LocationStats, BusinessLocation, CurrencyEnum
)
from crud.crud_location import (
    get_locations_by_city_and_categories, get_location_tags, get_location_by_ids,
    get_location_images, increment_location_view_count, increment_location_checkin_count,
    get_location_stats, get_locations_by_city, check_location_exists, create_location,
    create_business_location, create_location_categories, create_location_tags
)

@pytest.fixture(name="location_setup")
def location_setup_fixture(db_session: Session):
    # 1. Create City
    city = Cities(
        city_id=1,
        city_name="Hà Nội",
        region="Miền Bắc",
        latitude=Decimal("21.0277"),
        longitude=Decimal("105.8341")
    )
    db_session.add(city)

    # 2. Create Category
    cat = Categories(category_id=1, category_name="Di tích")
    db_session.add(cat)

    # 3. Create Tag
    tag = Tags(tag_id=1, tag_name="Lịch sử")
    db_session.add(tag)
    db_session.commit()

    # 4. Create Location
    loc_id = uuid4()
    loc = Locations(
        location_id=loc_id,
        location_name="Văn Miếu",
        address="Đống Đa, Hà Nội",
        latitude=Decimal("21.0294"),
        longitude=Decimal("105.8361"),
        city_id=1,
        open_time=time(8, 0),
        close_time=time(17, 0),
        min_price=Decimal("30000"),
        max_price=Decimal("30000"),
        currency=CurrencyEnum.VND
    )
    db_session.add(loc)
    db_session.commit()

    # Link categories & tags
    loc_cat = LocationCategories(location_id=loc_id, category_id=1)
    loc_tag = LocationTags(location_id=loc_id, tag_id=1)
    db_session.add(loc_cat)
    db_session.add(loc_tag)
    db_session.commit()

    return {
        "city_id": 1,
        "category_id": 1,
        "tag_id": 1,
        "location_id": loc_id
    }

def test_get_locations_by_city_and_categories(db_session: Session, location_setup):
    locs = get_locations_by_city_and_categories(
        db=db_session,
        city_name="Hà Nội",
        category_ids=[location_setup["category_id"]]
    )
    assert len(locs) == 1
    assert locs[0].location_name == "Văn Miếu"

def test_get_location_tags(db_session: Session, location_setup):
    tags = get_location_tags(db_session, location_setup["location_id"])
    assert len(tags) == 1
    assert tags[0].tag_name == "Lịch sử"

def test_get_location_by_ids(db_session: Session, location_setup):
    locs = get_location_by_ids(db_session, [location_setup["location_id"]])
    assert len(locs) == 1
    assert locs[0].location_name == "Văn Miếu"

def test_get_location_images(db_session: Session, location_setup):
    loc_id = location_setup["location_id"]
    img = LocationsImage(location_id=loc_id, url="https://example.com/vanmieu.jpg", display_order=1)
    db_session.add(img)
    db_session.commit()

    images = get_location_images(db_session, loc_id)
    assert len(images) == 1
    assert images[0].url == "https://example.com/vanmieu.jpg"

def test_location_stats_increments(db_session: Session, location_setup):
    loc_id = location_setup["location_id"]

    # Increment views
    stats = increment_location_view_count(db_session, loc_id)
    db_session.commit()
    assert stats.total_views == 1
    assert stats.total_checkins == 0

    # Increment check-ins
    stats = increment_location_checkin_count(db_session, loc_id)
    db_session.commit()
    assert stats.total_checkins == 1

    # Get stats
    fetched_stats = get_location_stats(db_session, loc_id)
    assert fetched_stats is not None
    assert fetched_stats.total_views == 1
    assert fetched_stats.total_checkins == 1

def test_get_locations_by_city(db_session: Session, location_setup):
    locs = get_locations_by_city(db_session, location_setup["city_id"])
    assert len(locs) == 1
    assert locs[0].location_name == "Văn Miếu"

def test_check_location_exists(db_session: Session, location_setup):
    existing = check_location_exists(db_session, "Văn Miếu", location_setup["city_id"])
    assert existing is not None
    assert existing.location_id == location_setup["location_id"]

    not_existing = check_location_exists(db_session, "Không tồn tại", location_setup["city_id"])
    assert not_existing is None

def test_create_location_and_link_dependencies(db_session: Session, location_setup):
    # Create new location
    new_loc = create_location(
        db=db_session,
        location_name="Lăng Bác",
        latitude=Decimal("21.0368"),
        longitude=Decimal("105.8346"),
        city_id=location_setup["city_id"],
        open_time=time(7, 30),
        close_time=time(11, 0),
        min_price=Decimal("0"),
        max_price=Decimal("0"),
        currency=CurrencyEnum.VND,
        address="Hùng Vương, Ba Đình, Hà Nội"
    )
    db_session.commit()
    assert new_loc.location_id is not None

    # Link business
    biz_id = uuid4()
    biz_link = create_business_location(db_session, business_id=biz_id, location_id=new_loc.location_id)
    db_session.commit()
    assert biz_link.business_id == biz_id

    # Link categories
    cat_links = create_location_categories(db_session, location_id=new_loc.location_id, category_ids=[location_setup["category_id"]])
    db_session.commit()
    assert len(cat_links) == 1

    # Link tags
    tag_links = create_location_tags(db_session, location_id=new_loc.location_id, tag_ids=[location_setup["tag_id"]])
    db_session.commit()
    assert len(tag_links) == 1
