# ============================================================
# core/google_maps.py  –  OSRM routing + Haversine fallback
# ============================================================
# Đã thay thế Google Maps API bằng OSRM (Open Source Routing Machine).
# OSRM dùng dữ liệu OpenStreetMap, tính khoảng cách ĐƯỜNG BỘ thực tế.
# Server public: router.project-osrm.org (miễn phí, không cần API key).
# ============================================================

from __future__ import annotations
import math
from dataclasses import dataclass
from typing import Optional, List, Tuple
import httpx
from core.config import settings

# --- Data structures ---
@dataclass
class DistanceResult:
    distance_km: float        
    travel_time_min: int      
    source: str               

@dataclass
class RouteResult:
    polyline_data: str        
    distance_km: float
    travel_time_min: int
    source: str

# --- Constants ---
_EARTH_RADIUS_KM = 6371.0
_OSRM_BASE_URL = getattr(settings, "OSRM_BASE_URL", "https://router.project-osrm.org")

# --- Haversine helpers (FALLBACK) ---
def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Tính khoảng cách đường chim bay (km) bằng công thức Haversine."""
    lat1_r, lon1_r = math.radians(lat1), math.radians(lon1)
    lat2_r, lon2_r = math.radians(lat2), math.radians(lon2)
    dlat = lat2_r - lat1_r
    dlon = lon2_r - lon1_r
    a = (math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return _EARTH_RADIUS_KM * c

def estimate_travel_time_fallback(distance_km: float) -> int:
    """Ước lượng thời gian di chuyển từ khoảng cách đường chim bay (phút)."""
    if distance_km <= 0:
        return 0
    speed = getattr(settings, "AVG_CITY_SPEED_KMH", 40.0)
    hours = distance_km / speed
    return max(1, round(hours * 60))


# =====================================================================
# OSRM API calls (PRIMARY) — Khoảng cách đường bộ thực tế
# =====================================================================
# LƯU Ý: OSRM dùng format "longitude,latitude" (ngược với Google Maps)
# =====================================================================

def get_full_distance_matrix(coords: List[Tuple[float, float]]) -> List[List[float]]:
    """
    Tạo ma trận khoảng cách NxN (km).
    PRIMARY: OSRM Table Service (đường bộ thực tế).
    FALLBACK: Haversine (đường chim bay).

    Parameters
    ----------
    coords : List[Tuple[float, float]]
        Danh sách tọa độ [(lat, lon), ...].
    """
    n = len(coords)
    dist_matrix = [[0.0] * n for _ in range(n)]

    # --- OSRM Table Service ---
    try:
        # OSRM yêu cầu format: lon,lat;lon,lat;...
        coords_str = ";".join([f"{lon},{lat}" for lat, lon in coords])
        url = f"{_OSRM_BASE_URL}/table/v1/driving/{coords_str}"
        params = {"annotations": "distance"}

        with httpx.Client(timeout=15.0) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        if data.get("code") == "Ok" and "distances" in data:
            raw_distances = data["distances"]  # meters
            for i in range(n):
                for j in range(n):
                    if i != j:
                        # Chuyển từ mét sang km
                        dist_matrix[i][j] = raw_distances[i][j] / 1000.0
            print(f"✅ OSRM Table: Đã tính ma trận {n}x{n} khoảng cách đường bộ thực tế.")
            return dist_matrix
        else:
            print(f"⚠️ OSRM Table trả về code: {data.get('code')}. Chuyển sang Haversine.")

    except Exception as e:
        print(f"⚠️ OSRM Table lỗi: {e}. Chuyển sang Haversine fallback.")

    # --- FALLBACK: Haversine ---
    for i in range(n):
        for j in range(n):
            if i != j:
                dist_matrix[i][j] = haversine_distance(*coords[i], *coords[j])
    print(f"📐 Haversine fallback: Đã tính ma trận {n}x{n} đường chim bay.")
    return dist_matrix


def get_distance_and_duration(
    origin_lat: float, origin_lon: float,
    dest_lat: float, dest_lon: float,
) -> DistanceResult:
    """
    Tính khoảng cách (km) và thời gian (phút) giữa 2 điểm.
    PRIMARY: OSRM Route Service.
    FALLBACK: Haversine.
    """
    try:
        coords_str = f"{origin_lon},{origin_lat};{dest_lon},{dest_lat}"
        url = f"{_OSRM_BASE_URL}/route/v1/driving/{coords_str}"
        params = {"overview": "false"}

        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        if data.get("code") == "Ok" and data.get("routes"):
            route = data["routes"][0]
            return DistanceResult(
                distance_km=round(route["distance"] / 1000.0, 2),
                travel_time_min=max(1, round(route["duration"] / 60)),
                source="osrm",
            )
    except Exception as e:
        print(f"⚠️ OSRM Route lỗi: {e}. Dùng Haversine.")

    # FALLBACK
    dist_km = haversine_distance(origin_lat, origin_lon, dest_lat, dest_lon)
    return DistanceResult(
        distance_km=round(dist_km, 2),
        travel_time_min=estimate_travel_time_fallback(dist_km),
        source="haversine_fallback",
    )


def get_route_polyline(
    origin_lat: float, origin_lon: float,
    dest_lat: float, dest_lon: float,
) -> RouteResult:
    """
    Lấy đường đi chi tiết (Polyline), khoảng cách và thời gian giữa 2 trạm.
    PRIMARY: OSRM Route Service (đường bộ thực tế + encoded polyline).
    FALLBACK: Haversine & đường thẳng ảo.
    """
    try:
        # OSRM format: lon,lat;lon,lat
        coords_str = f"{origin_lon},{origin_lat};{dest_lon},{dest_lat}"
        url = f"{_OSRM_BASE_URL}/route/v1/driving/{coords_str}"
        params = {
            "overview": "full",          # Trả polyline đầy đủ
            "geometries": "polyline",    # Format giống Google Maps
        }

        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        if data.get("code") == "Ok" and data.get("routes"):
            route = data["routes"][0]
            return RouteResult(
                polyline_data=route["geometry"],  # Encoded polyline string
                distance_km=round(route["distance"] / 1000.0, 2),
                travel_time_min=max(1, round(route["duration"] / 60)),
                source="osrm",
            )
    except Exception as e:
        print(f"⚠️ OSRM Directions lỗi: {e}. Dùng Haversine fallback.")

    # FALLBACK (Rớt mạng hoặc OSRM không phản hồi)
    dist_km = haversine_distance(origin_lat, origin_lon, dest_lat, dest_lon)
    fake_polyline = f"{origin_lat},{origin_lon};{dest_lat},{dest_lon}"
    return RouteResult(
        polyline_data=fake_polyline,
        distance_km=round(dist_km, 2),
        travel_time_min=estimate_travel_time_fallback(dist_km),
        source="haversine_fallback",
    )