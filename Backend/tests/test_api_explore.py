import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlmodel import Session

from models import Cities, Locations
from decimal import Decimal
from uuid import uuid4

def test_reverse_geocode_api(client: TestClient):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "display_name": "Bạch Dinh, Vũng Tàu, Việt Nam",
        "address": {"city": "Vũng Tàu", "country": "Việt Nam"}
    }

    with patch("routers.explore.requests.get", return_value=mock_response) as mock_get:
        response = client.get("/api/discovery/geocode/reverse?lat=10.3541&lon=107.0768")
        assert response.status_code == 200
        data = response.json()
        assert data["display_name"] == "Bạch Dinh, Vũng Tàu, Việt Nam"
        mock_get.assert_called_once()

def test_reverse_geocode_api_error(client: TestClient):
    with patch("routers.explore.requests.get", side_effect=Exception("Connection timed out")):
        response = client.get("/api/discovery/geocode/reverse?lat=10.3541&lon=107.0768")
        assert response.status_code == 200
        data = response.json()
        assert "error" in data
        assert data["address"] == {}

def test_weather_api(client: TestClient):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "current_weather": {
            "temperature": 28.5,
            "windspeed": 12.0,
            "weathercode": 1
        }
    }

    with patch("routers.explore.requests.get", return_value=mock_response) as mock_get:
        response = client.get("/api/discovery/weather?lat=10.3541&lon=107.0768")
        assert response.status_code == 200
        data = response.json()
        assert data["temp"] == 28.5
        assert data["windspeed"] == 12.0
        assert data["condition"] == "Thoáng đãng"
        mock_get.assert_called_once()

def test_weather_api_error(client: TestClient):
    with patch("routers.explore.requests.get", side_effect=Exception("API limit exceeded")):
        response = client.get("/api/discovery/weather?lat=10.3541&lon=107.0768")
        assert response.status_code == 200
        data = response.json()
        assert data["temp"] == 25.0
        assert data["condition"] == "Không rõ"
        assert "error" in data

def test_search_geocode_api(client: TestClient, db_session: Session):
    # Seed local city and location for database search
    city = Cities(
        city_id=30,
        city_name="Đà Nẵng",
        region="Miền Trung",
        latitude=Decimal("16.0544"),
        longitude=Decimal("108.2022")
    )
    db_session.add(city)

    loc = Locations(
        location_id=uuid4(),
        location_name="Cầu Rồng Đà Nẵng",
        address="An Hải Tây, Sơn Trà, Đà Nẵng",
        latitude=Decimal("16.0611"),
        longitude=Decimal("108.2275"),
        city_id=30,
        open_time=None,
        close_time=None,
        min_price=Decimal("0"),
        max_price=Decimal("0"),
        is_active=True
    )
    db_session.add(loc)
    db_session.commit()

    mock_osm_response = MagicMock()
    mock_osm_response.status_code = 200
    mock_osm_response.json.return_value = [
        {
            "place_id": "osm_1",
            "licence": "OSM",
            "lat": "16.0612",
            "lon": "108.2276",
            "display_name": "Cầu Rồng, Đà Nẵng, Việt Nam",
            "class": "place",
            "type": "bridge"
        }
    ]

    with patch("routers.explore.requests.get", return_value=mock_osm_response):
        response = client.get("/api/discovery/geocode/search?q=Đà Nẵng")
        assert response.status_code == 200
        data = response.json()
        # Verify that local DB items (city and location) and OSM items are combined
        # "Đà Nẵng" matches city_name "Đà Nẵng" and location_name containing "Đà Nẵng"
        display_names = [item["display_name"] for item in data]
        assert any("Thành phố đề xuất" in name for name in display_names)
        assert any("Điểm đến đề xuất" in name for name in display_names)
        assert any("Cầu Rồng" in name for name in display_names)
