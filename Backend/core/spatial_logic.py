import math
import random

def generate_random_coordinates(lat: float, lng: float, min_radius: int = 50, max_radius: int = 200):
    """
    Sinh tọa độ ngẫu nhiên dựa trên thuật toán hình học mặt cầu.
    Khoảng cách mặc định từ 50m đến 200m.
    """
    # Bán kính Trái Đất (mét)
    R = 6371000
    
    # Khoảng cách ngẫu nhiên
    d = random.uniform(min_radius, max_radius)
    # Góc hướng ngẫu nhiên (radian)
    theta = random.uniform(0, 2 * math.pi)
    
    # Chuyển đổi lat/lng hiện tại sang radian
    phi1 = math.radians(lat)
    lambda1 = math.radians(lng)
    
    # Áp dụng công thức
    phi2 = math.asin(math.sin(phi1) * math.cos(d / R) + math.cos(phi1) * math.sin(d / R) * math.cos(theta))
    lambda2 = lambda1 + math.atan2(math.sin(theta) * math.sin(d / R) * math.cos(phi1), math.cos(d / R) - math.sin(phi1) * math.sin(phi2))
    
    # Trả về tọa độ dạng độ (degrees)
    return {
        "lat": math.degrees(phi2),
        "lng": math.degrees(lambda2)
    }

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Tính khoảng cách Haversine giữa 2 tọa độ (trả về mét)
    """
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

def detect_nearby_players(player_lat: float, player_lng: float, other_players: list, radius: float = 50.0):
    """
    Phát hiện các người chơi khác trong bán kính chỉ định (mặc định 50m).
    Lưu ý: Phần tích hợp Redis GEO để truy vấn danh sách other_players sẽ được thực hiện ở cấp xử lý dữ liệu.
    Hàm này xử lý logic tính khoảng cách chính xác.
    other_players: list các dict dạng [{"user_id": ..., "lat": ..., "lng": ...}]
    """
    nearby = []
    for p in other_players:
        dist = calculate_haversine_distance(player_lat, player_lng, p["lat"], p["lng"])
        if dist <= radius:
            p_copy = p.copy()
            p_copy["distance"] = dist
            nearby.append(p_copy)
    return nearby

def calculate_midpoint(lat1: float, lon1: float, lat2: float, lon2: float) -> dict:
    """
    Tính tọa độ trung điểm (Rendezvous point) giữa 2 người chơi.
    (Sử dụng công thức trung bình cộng do khoảng cách rất ngắn < 50m)
    """
    return {
        "lat": (lat1 + lat2) / 2.0,
        "lng": (lon1 + lon2) / 2.0
    }