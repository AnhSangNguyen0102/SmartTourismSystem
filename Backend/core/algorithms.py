import math
from typing import List, Tuple, Optional
from core.google_maps import get_full_distance_matrix, haversine_distance, estimate_travel_time_fallback


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Tính khoảng cách đường chim bay giữa 2 điểm (km) bằng công thức Haversine.
    """

    return haversine_distance(lat1, lon1, lat2, lon2)

def estimate_travel_time(lat1: float, lon1: float, lat2: float, lon2: float, speed_kmh: float = 40.0) -> int:
    dist = haversine_distance(lat1, lon1, lat2, lon2)
    return estimate_travel_time_fallback(dist)

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
    user_preferred_tags: List[str]
) -> Optional[float]:
    """
    Tính điểm cho một địa điểm để gợi ý.
    - Ràng buộc cứng: giá tối thiểu của địa điểm không được vượt quá ngân sách.
    - Ràng buộc mềm: Độ khớp tag Jaccard.
    """
    # 1. Ràng buộc cứng (Hard constraint)
    # Nếu giá rẻ nhất để chơi ở đây còn đắt hơn ngân sách của user -> Bỏ qua
    if location_min_price > user_budget:
        return None
        
    # 2. Tính Jaccard similarity
    tag_score = compute_tag_similarity(user_preferred_tags, location_tags)
    
    # 3. Tổng hợp điểm (Trong thực tế có thể thêm trọng số cho rating, khoảng cách...)
    # Ở đây dùng tag_score làm chủ đạo. Nếu giá location_max_price nằm trong budget thì cộng điểm thưởng
    bonus = 0.2 if location_max_price <= user_budget else 0.0
    
    final_score = tag_score + bonus
    return final_score

def _tsp_nearest_neighbor(locations: List[Tuple], dist: List[List[float]]) -> Tuple[List, float]:
    """
    Thuật toán Láng giềng gần nhất (Greedy) cho tập dữ liệu lớn.
    """
    n = len(locations)
    ids = [loc[0] for loc in locations]
    visited = [False] * n
    
    path = [0]  # Bắt đầu từ điểm 0
    visited[0] = True
    total_dist = 0.0
    current = 0

    for _ in range(n - 1):
        next_node = -1
        min_dist = float('inf')
        for j in range(n):
            if not visited[j] and dist[current][j] < min_dist:
                min_dist = dist[current][j]
                next_node = j

        path.append(next_node)
        visited[next_node] = True
        total_dist += min_dist
        current = next_node

    path_ids = [ids[i] for i in path]
    return path_ids, total_dist

def tsp_dp_bitmask(locations: List[Tuple]) -> Tuple[List, float]:
    """
    Tìm đường đi ngắn nhất qua tất cả các địa điểm (path, không cần quay về).
    Xuất phát cố định từ phần tử đầu tiên trong danh sách (index 0 - nhà).
    
    Args:
        locations: List[(id, lat, lon)]
    
    Returns:
        (path_ids, total_distance_km)
    """
    if not locations:
        return [], 0.0

    n = len(locations)
    ids = [loc[0] for loc in locations]
    coords = [(loc[1], loc[2]) for loc in locations]

    # Lấy ma trận 1 lần duy nhất bằng Google Maps API
    dist = get_full_distance_matrix(coords)

    if n > 15:
        print(f"Cảnh báo: {n} địa điểm. Chuyển sang thuật toán Láng giềng gần nhất!")
        return _tsp_nearest_neighbor(locations, dist)
    
    # dp[mask][u] = khoảng cách nhỏ nhất để đến u với tập mask
    dp = [[float("inf")] * n for _ in range(1 << n)]
    parent = [[-1] * n for _ in range(1 << n)]

    # Bắt đầu từ nút 0 (nhà)
    dp[1][0] = 0.0

    for mask in range(1 << n):
        for u in range(n):
            if not (mask & (1 << u)):
                continue
            for v in range(n):
                if mask & (1 << v):
                    continue
                new_mask = mask | (1 << v)
                new_dist = dp[mask][u] + dist[u][v]
                if new_dist < dp[new_mask][v]:
                    dp[new_mask][v] = new_dist
                    parent[new_mask][v] = u

    # Tìm điểm kết thúc để có tổng quãng đường nhỏ nhất
    final_mask = (1 << n) - 1
    min_dist = float("inf")
    last = -1
    for i in range(n):
        if dp[final_mask][i] < min_dist:
            min_dist = dp[final_mask][i]
            last = i

    # Truy ngược đường đi
    path = []
    mask = final_mask
    while last != -1:
        path.append(last)
        prev = parent[mask][last]
        mask ^= (1 << last)
        last = prev

    path.reverse()
    path_ids = [ids[i] for i in path]

    return path_ids, min_dist