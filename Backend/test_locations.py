"""
test_locations.py
=================
Kiểm tra dữ liệu Reference (Cities, Categories, Tags) và Location 
từ Supabase DB mới.
"""

import sys
from sqlmodel import Session
from database import engine

from crud.crud_reference import get_active_cities, get_all_categories, get_all_tags
from crud.crud_location import (
    get_locations_by_city_and_categories,
    get_location_tags,
    get_location_by_ids,
    get_location_images,
)

def run():
    print(f"\n{'═'*60}")
    print("  TEST DATA: REFERENCE & LOCATION")
    print(f"{'═'*60}")

    with Session(engine) as db:
        # 1. Cities
        cities = get_active_cities(db)
        print(f"\n✅ get_active_cities: {len(cities)} bản ghi")
        for c in cities[:3]:
            print(f"   - {c.city_name} ({c.region}) | GPS: {c.latitude}, {c.longitude}")
        if len(cities) > 3: print("   ...")

        # 2. Categories
        cats = get_all_categories(db)
        print(f"\n✅ get_all_categories: {len(cats)} bản ghi")
        for c in cats[:5]:
            print(f"   - ID: {c.category_id} | Name: {c.category_name}")
        if len(cats) > 5: print("   ...")

        # 3. Tags
        tags = get_all_tags(db)
        print(f"\n✅ get_all_tags: {len(tags)} bản ghi")
        for t in tags[:5]:
            print(f"   - ID: {t.tag_id} | Name: {t.tag_name}")
        if len(tags) > 5: print("   ...")

        # Kiểm tra phần Location nếu có data
        if not cities or not cats:
            print("\n⚠️ Thiếu city hoặc category, bỏ qua test location.")
            return

        test_city = cities[0].city_name
        test_cat_ids = [c.category_id for c in cats]

        # 4. Locations by City and Categories
        locs = get_locations_by_city_and_categories(db, test_city, test_cat_ids)
        print(f"\n✅ get_locations_by_city_and_categories (City: '{test_city}', Categories: {test_cat_ids[:3]}...): {len(locs)} bản ghi")
        
        for l in locs[:3]:
            print(f"   - {l.location_name} | Price: {l.min_price}-{l.max_price} {l.currency} | Hours: {l.open_time} - {l.close_time}")
        if len(locs) > 3: print("   ...")

        if locs:
            test_loc_id = locs[0].location_id
            
            # 5. Location Details
            detail = get_location_by_ids(db, [test_loc_id])
            print(f"\n✅ get_location_by_ids (ID: {test_loc_id}): {len(detail)} bản ghi")
            if detail:
                print(f"   - Tên: {detail[0].location_name}")

            # 6. Location Tags
            ltags = get_location_tags(db, test_loc_id)
            print(f"\n✅ get_location_tags: {len(ltags)} tags")
            for t in ltags:
                print(f"   - {t.tag_name}")

            # 7. Location Images
            imgs = get_location_images(db, test_loc_id)
            print(f"\n✅ get_location_images: {len(imgs)} ảnh")
            for img in imgs:
                print(f"   - Order {img.display_order}: {img.url}")

if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        sys.exit(1)
