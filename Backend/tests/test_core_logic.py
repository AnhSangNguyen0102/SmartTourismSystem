from uuid import uuid4
from decimal import Decimal

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError
from sqlmodel import Session

import database
from api.leaderboard import get_tier_info
from api.trips import validate_coordinates
from core.algorithms import (
    calculate_hybrid_score,
    check_within_radius,
    compute_tag_similarity,
    score_location,
)
from core.config import Settings
from core.dependencies import require_roles
from core.gps import calculate_haversine_distance
from core.security import create_access_token, verify_token, verify_token_optional
from core.spatial_logic import calculate_midpoint, detect_nearby_players
from models import Cities, UserRole
from routers.auth import check_rate_limit
from routers.gamification import ensure_same_user, get_authenticated_user_id


def test_test_suite_is_locked_to_sqlite():
    assert database.DATABASE_URL.startswith("sqlite")
    assert database.engine.url.get_backend_name() == "sqlite"


def test_outer_transaction_rolls_back_committed_test_data():
    connection = database.engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    city_id = 987_654

    session.add(
        Cities(
            city_id=city_id,
            city_name="Rollback Probe",
            region="Test",
            latitude=Decimal("10.0"),
            longitude=Decimal("106.0"),
        )
    )
    session.commit()
    assert session.get(Cities, city_id) is not None

    session.close()
    transaction.rollback()
    connection.close()

    with Session(database.engine) as verification_session:
        assert verification_session.get(Cities, city_id) is None


def test_settings_parses_lists_and_swaps_postgres_port():
    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://user:secret@localhost:5432/app",
        CORS_ORIGINS=" https://one.example,https://two.example ",
        TRUSTED_HOSTS="one.example, two.example",
        RATE_LIMIT_EXEMPT_PATHS="/health, /metrics",
    )

    assert ":6543/" in settings.DATABASE_URL
    assert settings.cors_origins_list == ["https://one.example", "https://two.example"]
    assert settings.trusted_hosts_list == ["one.example", "two.example"]
    assert settings.rate_limit_exempt_paths_list == ["/health", "/metrics"]


def test_settings_rejects_unsafe_production_configuration():
    with pytest.raises(ValidationError, match="Production requires a strong SECRET_KEY"):
        Settings(
            _env_file=None,
            ENVIRONMENT="production",
            SECRET_KEY="short",
            DATABASE_URL="postgresql://user:secret@example.com:6543/app",
            REQUIRE_HTTPS=True,
        )


@pytest.mark.parametrize(
    ("points", "tier", "level"),
    [
        (0, "Bronze", 1),
        (499, "Bronze", 5),
        (500, "Silver", 6),
        (1500, "Gold", 16),
        (3000, "Platinum", 31),
        (5000, "Diamond", 51),
    ],
)
def test_get_tier_info_boundaries(points, tier, level):
    result = get_tier_info(points)
    assert result["tier"] == tier
    assert result["level"] == level


def test_gps_distance_and_radius_check():
    distance = calculate_haversine_distance(0, 0, 0, 1)
    assert distance == pytest.approx(111_195, rel=0.001)

    within, same_point_distance = check_within_radius(10, 106, 10, 106, 1)
    assert within is True
    assert same_point_distance == pytest.approx(0)

    within, _ = check_within_radius(0, 0, 0, 1, 100)
    assert within is False


def test_spatial_helpers_return_nearby_copies_and_midpoint():
    nearby = detect_nearby_players(
        10,
        106,
        [
            {"user_id": "near", "lat": 10, "lng": 106},
            {"user_id": "far", "lat": 11, "lng": 106},
        ],
        radius=100,
    )

    assert [player["user_id"] for player in nearby] == ["near"]
    assert nearby[0]["distance"] == pytest.approx(0)
    assert calculate_midpoint(10, 106, 12, 108) == {"lat": 11, "lng": 107}


def test_tag_similarity_normalizes_values_and_handles_empty_sets():
    assert compute_tag_similarity([" Food ", "History"], ["food", "Nature"]) == pytest.approx(1 / 3)
    assert compute_tag_similarity([], ["food"]) == 0


def test_score_location_applies_budget_constraint_and_bonus():
    assert score_location(100_000, 200_000, ["food"], 110_000, ["food"], transit_cost=20_000) is None
    assert score_location(100_000, 200_000, ["food"], 220_000, ["food"], transit_cost=20_000) == pytest.approx(1.2)


def test_hybrid_score_rewards_shared_destination_style_and_tags():
    matching = calculate_hybrid_score(
        {"planned_destinations": ["Hue"], "travel_style": "Culture", "interests": ["Food", "History"]},
        {"planned_destinations": ["Hue"], "travel_style": "culture", "interests": ["history", "food"]},
    )
    weak = calculate_hybrid_score({}, {})

    assert matching == 99.0
    assert weak < matching


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [(0, 0), ("10.5", "106.75"), (-90, 180), (90, -180)],
)
def test_validate_coordinates_accepts_valid_values(latitude, longitude):
    lat, lon = validate_coordinates(latitude, longitude)
    assert isinstance(lat, float)
    assert isinstance(lon, float)


@pytest.mark.parametrize(
    ("latitude", "longitude", "detail"),
    [
        ("invalid", 0, "Tọa độ GPS không hợp lệ"),
        (91, 0, "Tọa độ GPS nằm ngoài phạm vi hợp lệ"),
        (0, -181, "Tọa độ GPS nằm ngoài phạm vi hợp lệ"),
    ],
)
def test_validate_coordinates_rejects_invalid_values(latitude, longitude, detail):
    with pytest.raises(HTTPException) as exc_info:
        validate_coordinates(latitude, longitude)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == detail


def test_local_jwt_verification_and_optional_auth():
    user_id = uuid4()
    token = create_access_token({"sub": str(user_id), "role": "ADMIN"})
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    payload = verify_token(credentials)
    assert payload["user_id"] == str(user_id)
    assert payload["role"] == "ADMIN"
    assert verify_token_optional(credentials)["sub"] == str(user_id)
    assert verify_token_optional(None) is None


def test_role_dependency_allows_expected_role_and_rejects_other_roles():
    admin_only = require_roles([UserRole.ADMIN])
    assert admin_only({"role": "ADMIN"})["role"] == "ADMIN"

    with pytest.raises(HTTPException) as exc_info:
        admin_only({"role": "USER"})
    assert exc_info.value.status_code == 403


def test_gamification_user_identity_helpers():
    user_id = uuid4()
    assert get_authenticated_user_id({"sub": str(user_id)}) == user_id
    ensure_same_user(user_id, user_id)

    with pytest.raises(HTTPException) as invalid_token:
        get_authenticated_user_id({"sub": "not-a-uuid"})
    assert invalid_token.value.status_code == 401

    with pytest.raises(HTTPException) as wrong_user:
        ensure_same_user(uuid4(), user_id)
    assert wrong_user.value.status_code == 403


def test_auth_rate_limit_rejects_request_over_limit():
    check_rate_limit("unit-test-key", limit=2, window_seconds=60)
    check_rate_limit("unit-test-key", limit=2, window_seconds=60)

    with pytest.raises(HTTPException) as exc_info:
        check_rate_limit("unit-test-key", limit=2, window_seconds=60)
    assert exc_info.value.status_code == 429
