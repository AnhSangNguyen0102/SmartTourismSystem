#SCRIPT PYTHON TẠO DỮ LIỆU MẪU CÁC LOCATION VÀ TAG

import json
import random
import re
from datetime import time
from supabase import create_client, Client

# --- THIẾT LẬP KẾT NỐI ---
url: str = "YOUR_URL"
key: str = "YOUR_KEY"

supabase: Client = create_client(url, key)

# Tọa độ trung tâm (Mock) của các thành phố trong file JSON
CITY_COORDINATES = {
    "Hà Nội": (21.0285, 105.8542),
    "Thành phố Hồ Chí Minh": (10.8231, 106.6297),
    "Thừa Thiên Huế": (16.4637, 107.5909),
    "Hội An": (15.8801, 108.3380),
    "Đà Lạt": (11.9404, 108.4583),
    "Đà Nẵng": (16.0471, 108.2062),
    "Nha Trang": (12.2388, 109.1967),
    "Hạ Long": (20.9599, 107.0448),
    "Ninh Bình": (20.2539, 105.9750),
    "Phú Quốc": (10.2289, 103.9572)
}

# Hàm bóc tách giá tiền từ chuỗi (VD: "30.000 - 60.000 VNĐ" -> 30000, 60000)
def parse_price(price_str):
    if not price_str or "Miễn phí" in price_str or "Tự do" in price_str:
        return 0.0, 0.0
    
    # Tìm tất cả các con số trong chuỗi
    numbers = re.findall(r'\d+', price_str.replace('.', ''))
    if not numbers:
        return 0.0, 0.0
    
    if len(numbers) == 1:
        val = float(numbers[0])
        return val, val
    else:
        return float(numbers[0]), float(numbers[1])

def seed_data_from_json():
    print("Đang đọc file JSON...")
    with open('Vietnam_tourism_2026.json', 'r', encoding='utf-8-sig') as f:
        data = json.load(f)
    
    dataset = data.get("Vietnam_Tourism_Dataset_2026", {})

    # 1. ĐỒNG BỘ DANH MỤC (CATEGORIES)
    category_map = {}
    categories = ["Điểm tham quan", "Nơi lưu trú", "Quán ăn"]
    for cat in categories:
        res = supabase.table('categories').select('*').eq('category_name', cat).execute()
        if not res.data:
            inserted = supabase.table('categories').insert({"category_name": cat}).execute()
            category_map[cat] = inserted.data[0]['category_id']
        else:
            category_map[cat] = res.data[0]['category_id']

    # 2. ĐỒNG BỘ THÀNH PHỐ VÀ ĐỊA ĐIỂM
    for city_name, city_data in dataset.items():
        print(f"\n--- Đang xử lý thành phố: {city_name} ---")
        
        # Insert Thành phố
        res_city = supabase.table('cities').select('*').eq('city_name', city_name).execute()
        base_lat, base_lng = CITY_COORDINATES.get(city_name, (14.0583, 108.2772)) # Default VN coord
        
        if not res_city.data:
            inserted_city = supabase.table('cities').insert({
                "city_name": city_name,
                "region": "Vietnam",
                "latitude": base_lat,
                "longitude": base_lng
            }).execute()
            city_id = inserted_city.data[0]['city_id']
        else:
            city_id = res_city.data[0]['city_id']

        # Hàm tiện ích để insert Locations
        def insert_locations(items, category_key, category_name):
            cat_id = category_map[category_name]
            for item in items:
                loc_name = item.get('ten') or item.get('ten_quan') or item.get('token')
                if not loc_name: continue

                # Parse giá
                price_str = item.get('gia_ve_tham_khao') or item.get('gia_trung_binh') or "0"
                min_p, max_p = parse_price(price_str)

                # Mock tọa độ (cộng trừ ngẫu nhiên trong bán kính ~5km)
                lat = base_lat + random.uniform(-0.05, 0.05)
                lng = base_lng + random.uniform(-0.05, 0.05)

                try:
                    # Insert vào bảng LOCATIONS
                    loc_res = supabase.table('locations').insert({
                        "location_name": loc_name,
                        "latitude": round(lat, 6),
                        "longitude": round(lng, 6),
                        "city_id": city_id,
                        "open_time": "07:00:00", # Mock giờ mở cửa
                        "close_time": "22:00:00", # Mock giờ đóng cửa
                        "min_price": min_p,
                        "max_price": max_p,
                        "currency": "VND"
                    }).execute()
                    
                    loc_id = loc_res.data[0]['location_id']
                    
                    # Liên kết địa điểm với Danh mục trong bảng LOCATION_CATEGORIES
                    supabase.table('location_categories').insert({
                        "location_id": loc_id,
                        "category_id": cat_id
                    }).execute()
                    
                    print(f"  + Đã thêm: {loc_name}")
                except Exception as e:
                    print(f"  - Bỏ qua {loc_name} (Có thể do trùng tọa độ): {e}")

        # Chạy insert cho từng nhóm trong JSON
        if "diem_du_lich" in city_data:
            insert_locations(city_data["diem_du_lich"], "diem_du_lich", "Điểm tham quan")
        
        if "noi_luu_tru" in city_data:
            insert_locations(city_data["noi_luu_tru"], "noi_luu_tru", "Nơi lưu trú")
            
        if "quan_an" in city_data:
            insert_locations(city_data["quan_an"], "quan_an", "Quán ăn")

    print("\nHOÀN TẤT ĐỔ DỮ LIỆU JSON VÀO DATABASE!")

# Gọi hàm thực thi
seed_data_from_json()

def update_data_from_json():
    print("Đang đọc file JSON...")
    with open('Vietnam_tourism_2026.json', 'r', encoding='utf-8-sig') as f:
        data = json.load(f)
    
    dataset = data.get("Vietnam_Tourism_Dataset_2026", {})
    tag_map = {} # Bộ nhớ tạm để lưu các tag đã tạo

    for city_name, city_data in dataset.items():
        print(f"\n--- Đang cập nhật thành phố: {city_name} ---")
        
        def process_items(items):
            for item in items:
                loc_name = item.get('ten') or item.get('ten_quan') or item.get('token')
                if not loc_name: continue
                
                # Lấy dữ liệu mô tả mới
                description = item.get('gioi_thieu') or item.get('dac_diem') or ""
                
                try:
                    # 1. TÌM ĐỊA ĐIỂM ĐÃ CÓ
                    # Tìm location_id dựa trên tên địa điểm
                    res_loc = supabase.table('locations').select('location_id').eq('location_name', loc_name).execute()
                    
                    if res_loc.data: # Nếu tìm thấy địa điểm trong database
                        loc_id = res_loc.data[0]['location_id']
                                                
                        # 2. XỬ LÝ VÀ THÊM TAGS
                        tags_to_add = []
                        if item.get('the_loai'):
                            tags_to_add.extend([t.strip() for t in item['the_loai'].replace('/', ',').split(',') if t.strip()])
                        if item.get('hang_sao'):
                            tags_to_add.append(item['hang_sao'].strip())
                        if item.get('mon_noi_bat'):
                            tags_to_add.extend([t.strip() for t in item['mon_noi_bat'].replace('/', ',').split(',') if t.strip()])
                            
                        for tag_name in set(tags_to_add):
                            if not tag_name: continue
                            
                            # Kiểm tra xem tag này đã có trong bảng TAGS chưa
                            if tag_name not in tag_map:
                                res_tag = supabase.table('tags').select('tag_id').eq('tag_name', tag_name).execute()
                                if not res_tag.data:
                                    ins_tag = supabase.table('tags').insert({"tag_name": tag_name}).execute()
                                    tag_map[tag_name] = ins_tag.data[0]['tag_id']
                                else:
                                    tag_map[tag_name] = res_tag.data[0]['tag_id']
                            
                            # Gắn Tag vào Địa điểm (Bảng LOCATION_TAGS)
                            try:
                                supabase.table('location_tags').insert({
                                    "location_id": loc_id, 
                                    "tag_id": tag_map[tag_name]
                                }).execute()
                            except:
                                pass # Nếu tag này đã được gắn cho địa điểm rồi thì bỏ qua
                        
                        print(f"  + Đã cập nhật thành công: {loc_name}")
                    else:
                        print(f"  - Bỏ qua (Không tìm thấy trong database): {loc_name}")
                except Exception as e:
                    print(f"  - Lỗi tại {loc_name}: {e}")

        # Chạy hàm xử lý cho từng danh mục
        if "diem_du_lich" in city_data: process_items(city_data["diem_du_lich"])
        if "noi_luu_tru" in city_data: process_items(city_data["noi_luu_tru"])
        if "quan_an" in city_data: process_items(city_data["quan_an"])
        
    print("\nHOÀN TẤT CẬP NHẬT DỮ LIỆU MỚI VÀO CÁC BẢNG CŨ!")

# Gọi hàm thực thi
update_data_from_json()