# SCRIPT PYTHON TẠO DỮ LIỆU MẪU USER VÀ PLANNING

import random
from datetime import timedelta, date, time
from faker import Faker
from supabase import create_client, Client

url: str = "YOUR_URL"
key: str = "YOUR_KEY"

supabase: Client = create_client(url, key)
fake = Faker('vi_VN')

def seed_users_and_planning():
    print("Bắt đầu lấy Master Data từ DB...")
    
    # Lấy danh sách Tags, Cities, Locations hiện có để làm data gốc
    tags_res = supabase.table('tags').select('tag_id').execute()
    cities_res = supabase.table('cities').select('city_id').execute()
    
    tag_ids = [t['tag_id'] for t in tags_res.data]
    city_ids = [c['city_id'] for c in cities_res.data]
    
    # ---------------------------------------------------------
    # 1. TẠO USERS & USER_PROFILES
    # ---------------------------------------------------------
    print("\n--- Đang tạo Users ---")
    user_ids = []
    for _ in range(10): # Tạo thử 10 users
        # Insert User
        user_res = supabase.table('users').insert({
            "full_name": fake.name(),
            "passwordhash": "hashed_password_mock",
            "email": fake.unique.email(),
            "register_type": "EMAIL",
            "role": "USER",
            "status": "ACTIVE"
        }).execute()
        
        user_id = user_res.data[0]['user_id']
        user_ids.append(user_id)
        
        # Insert Profile
        supabase.table('user_profiles').insert({
            "user_id": user_id,
            "full_name": user_res.data[0]['full_name'],
            "date_of_birth": fake.date_of_birth(minimum_age=18, maximum_age=40).isoformat(),
            "gender": random.choice(['MALE', 'FEMALE']),
            "travel_style": random.choice(['BACKPACKER', 'RESORT'])
        }).execute()
        
        # ---------------------------------------------------------
        # 2. TẠO PREFERENCE_TAG_WEIGHTS (Phục vụ AI gợi ý)
        # ---------------------------------------------------------
        # Chọn ngẫu nhiên 5 tags mà user này thích

        user_tags = random.sample(tag_ids, min(len(tag_ids), 5))   

        for tag_id in user_tags:
            supabase.table('preference_tag_weights').insert({
                "user_id": user_id,
                "tag_id": tag_id,
                "weight": round(random.uniform(0.5, 0.9), 2) # Trọng số thích
            }).execute()

    # ---------------------------------------------------------
    # 3. TẠO PLANNING SESSIONS & ITINERARIES (Luồng cốt lõi)
    # ---------------------------------------------------------
    print("\n--- Đang tạo Lịch trình (Itineraries) ---")
    for user_id in user_ids:
        # Mỗi user tạo 1 chuyến đi đến 1 thành phố ngẫu nhiên
        target_city = random.choice(city_ids)
        start_date = fake.future_date(end_date="+30d")
        end_date = start_date + timedelta(days=random.randint(1, 3)) # Đi 2-4 ngày
        
        # Tạo Session
        session_res = supabase.table('planning_sessions').insert({
            "user_id": user_id,
            "city_id": target_city,
            "pax_adult": random.randint(1, 4),
            "budget": random.randint(2000000, 10000000),
            "start_day": start_date.isoformat(),
            "end_day": end_date.isoformat(),
            "status": "CONFIRMED"
        }).execute()
        session_id = session_res.data[0]['session_id']
        
        # Tạo Itinerary
        itin_res = supabase.table('itineraries').insert({
            "session_id": session_id,
            "user_id": user_id,
            "name": f"Chuyến đi {target_city} của {fake.first_name()}",
            "status": "CONFIRMED",
            "total_budget": session_res.data[0]['budget'],
            "total_travel_time": 0,
            "total_distance": 0
        }).execute()
        itin_id = itin_res.data[0]['itinerary_id']
        
        # Lấy các địa điểm thuộc thành phố này để xếp vào lịch trình
        locs_in_city = supabase.table('locations').select('location_id').eq('city_id', target_city).execute()
        available_locs = [l['location_id'] for l in locs_in_city.data]
        
        if not available_locs:
            continue

        # ---------------------------------------------------------
        # 4. CHIA NGÀY (ITINERARY_DAYS) & ĐIỂM DỪNG (STOPS)
        # ---------------------------------------------------------
        delta = end_date - start_date
        num_days = delta.days + 1
        
        for day_order in range(1, num_days + 1):
            current_date = start_date + timedelta(days=day_order-1)
            
            day_res = supabase.table('itinerary_days').insert({
                "itinerary_id": itin_id,
                "day_order": day_order,
                "travel_date": current_date.isoformat(),
                "estimated_budget": 1000000,
                "total_time": 0
            }).execute()
            day_id = day_res.data[0]['day_id']
            
            # Chọn ngẫu nhiên 3 điểm dừng cho ngày hôm đó
            stops_today = random.sample(available_locs, min(3, len(available_locs)))
            
            for stop_idx, loc_id in enumerate(stops_today):
                supabase.table('itinerary_stops').insert({
                    "day_id": day_id,
                    "location_id": loc_id,
                    "stop_order": stop_idx + 1,
                    # Mock thời gian đơn giản
                    "arrival_time": time(8 + (stop_idx * 3), 0).isoformat(), 
                    "departure_time": time(10 + (stop_idx * 3), 0).isoformat(),
                    "status": "PENDING"
                }).execute()

    print("\nHOÀN TẤT TẠO DỮ LIỆU USER VÀ PLANNING!")

seed_users_and_planning()