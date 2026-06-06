from typing import List, Tuple, Optional
from core.gps import calculate_haversine_distance


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Tính khoảng cách đường chim bay giữa 2 điểm (km) bằng công thức Haversine.
    """

    return calculate_haversine_distance(lat1, lon1, lat2, lon2) / 1000

def check_within_radius(user_lat: float, user_lon: float, target_lat: float, target_lon: float, radius_m: int) -> Tuple[bool, float]:
    """
    Kiểm tra xem tọa độ user có nằm trong bán kính của điểm đích hay không.
    Trả về (is_within, khoảng_cách_thực_tế_theo_mét).
    """
    distance_km = haversine(user_lat, user_lon, target_lat, target_lon)
    distance_m = distance_km * 1000
    return distance_m <= radius_m, distance_m

def compute_tag_similarity(user_tags: List[str], location_tags: List[str]) -> float:
    """
    Tính độ tương đồng Jaccard giữa tags sở thích của User và tags của Location.
    J(A, B) = |A ∩ B| / |A U B|
    """
    set_user = set(tag.lower().strip() for tag in user_tags)
    set_loc = set(tag.lower().strip() for tag in location_tags)
    
    if not set_user or not set_loc:
        return 0.0
        
    intersection = set_user.intersection(set_loc)
    union = set_user.union(set_loc)
    
    return len(intersection) / len(union)

def score_location(
    location_min_price: float,
    location_max_price: float,
    location_tags: List[str],
    user_budget: float,
    user_preferred_tags: List[str],
    transit_cost: float = 20000.0
) -> Optional[float]:
    """
    Tính điểm cho một địa điểm để gợi ý.
    - Ràng buộc cứng: giá tối thiểu của địa điểm + chi phí di chuyển không được vượt quá ngân sách.
    - Ràng buộc mềm: Độ khớp tag Jaccard.
    """
    # 1. Ràng buộc cứng (Hard constraint)
    total_min_required = location_min_price + transit_cost
    
    # Nếu giá rẻ nhất để chơi ở đây cộng phí di chuyển còn đắt hơn ngân sách của user -> Bỏ qua
    if total_min_required > user_budget:
        return None
        
    # 2. Tính Jaccard similarity
    tag_score = compute_tag_similarity(user_preferred_tags, location_tags)
    
    # 3. Tổng hợp điểm (Trong thực tế có thể thêm trọng số cho rating, khoảng cách...)
    # Ở đây dùng tag_score làm chủ đạo. Nếu giá location_max_price + di chuyển nằm trong budget thì cộng điểm thưởng
    bonus = 0.2 if (location_max_price + transit_cost) <= user_budget else 0.0
    
    final_score = tag_score + bonus
    return final_score

def calculate_hybrid_score(user1: dict, user2: dict, extra_context: dict = {}) -> float:
    """Tính điểm tương đồng giữa 2 người dùng (Hybrid Matching)"""
    # Itinerary Overlap
    dest1 = user1.get("planned_destinations", [])
    dest2 = user2.get("planned_destinations", [])
    itinerary_score = 1.0 if set(dest1) & set(dest2) else 0.5
    
    # Vibe/Style Match
    style1 = (user1.get("travel_style") or "").lower()
    style2 = (user2.get("travel_style") or "").lower()
    style_score = 1.0 if style1 == style2 and style1 != "" else 0.2
    
    # Tag Match
    # Jaccard similarity between tags
    tags1 = user1.get("interests", [])
    tags2 = user2.get("interests", [])
    
    set1 = set(t.lower().strip() for t in tags1)
    set2 = set(t.lower().strip() for t in tags2)
    if not set1 or not set2:
        tag_match = 0.0
    else:
        tag_match = len(set1 & set2) / len(set1 | set2)
    
    final_score = (itinerary_score * 0.4) + (style_score * 0.3) + (tag_match * 0.3)
    return round(70 + (final_score * 29), 1) # Range 70-99%
