import pytest
from uuid import uuid4, UUID
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from unittest.mock import patch

from models import (
    Users, UserProfiles, HiddenChests, PlayerHiddenTasks,
    EnterpriseProfiles, EnterpriseEvents, EnterpriseEventQR,
    EnterpriseEventSteps, HiddenSpawnLogs, SpawnStatusEnum,
    RarityEnum, QuestTypeEnum, RegisterType, UserRole, UserStatus, EnterpriseStatus
)
from core.security import create_access_token

@pytest.fixture(name="hidden_setup")
def hidden_setup_fixture(db_session: Session):
    # Create player
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Thợ Săn Kho Báu",
        email="hunter@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)
    db_session.commit()

    # Create profile
    profile = UserProfiles(
        user_id=user_id,
        full_name="Thợ Săn Kho Báu",
        points_balance=100,
        total_points=100
    )
    db_session.add(profile)

    # Create chest template
    chest = HiddenChests(
        chest_id=uuid4(),
        title="Rương Đồng Cổ",
        description="Chứa một ít EXP và Xu",
        rarity=RarityEnum.COMMON,
        min_exp=10,
        max_exp=20,
        min_coin=5,
        max_coin=10
    )
    db_session.add(chest)

    # Create enterprise profile & event
    ent_id = uuid4()
    enterprise = EnterpriseProfiles(
        enterprise_id=ent_id,
        user_id=uuid4(),
        business_name="Doanh Nghiệp A",
        contact_person="Người liên hệ",
        contact_email="ent@gmail.com",
        contact_phone="0909090909",
        status=EnterpriseStatus.ACTIVE
    )
    db_session.add(enterprise)
    db_session.commit()

    event = EnterpriseEvents(
        event_id=uuid4(),
        enterprise_id=enterprise.enterprise_id,
        title="Checkin Nhận Thưởng",
        description="Checkin tại cửa hàng để nhận quà",
        quest_type=QuestTypeEnum.CHECKIN,
        latitude=Decimal("10.3541"),
        longitude=Decimal("107.0768"),
        radius_meters=100.0,
        reward_exp=50,
        reward_coin=20,
        multiplier=1,
        rarity=RarityEnum.COMMON,
        start_time=datetime.utcnow() - timedelta(hours=1),
        end_time=datetime.utcnow() + timedelta(hours=1),
        is_active=True
    )
    db_session.add(event)
    db_session.commit()

    return {
        "user_id": user_id,
        "chest_id": chest.chest_id,
        "event_id": event.event_id,
        "profile": profile
    }

def test_get_active_hidden_tasks_api(client: TestClient, db_session: Session, hidden_setup):
    user_id = hidden_setup["user_id"]
    token = create_access_token(data={"sub": str(user_id), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # Add an expired task and an active task
    now = datetime.utcnow()
    task_expired = PlayerHiddenTasks(
        user_id=user_id,
        task_type="CHEST",
        target_id=hidden_setup["chest_id"],
        latitude=Decimal("10.3540"),
        longitude=Decimal("107.0767"),
        status=SpawnStatusEnum.ACTIVE,
        rarity=RarityEnum.COMMON,
        expires_at=now - timedelta(minutes=5)
    )
    task_active = PlayerHiddenTasks(
        user_id=user_id,
        task_type="CHEST",
        target_id=hidden_setup["chest_id"],
        latitude=Decimal("10.3542"),
        longitude=Decimal("107.0769"),
        status=SpawnStatusEnum.ACTIVE,
        rarity=RarityEnum.COMMON,
        expires_at=now + timedelta(minutes=10)
    )
    db_session.add(task_expired)
    db_session.add(task_active)
    db_session.commit()

    # Request active tasks. Expired ones should get cleaned up.
    response = client.get("/api/v1/hidden/active", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["spawn_id"] == str(task_active.spawn_id)

    db_session.refresh(task_expired)
    assert task_expired.status == SpawnStatusEnum.EXPIRED

def test_ping_location_enterprise_spawn(client: TestClient, db_session: Session, hidden_setup):
    user_id = hidden_setup["user_id"]
    token = create_access_token(data={"sub": str(user_id), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # Ping coordinates close to the enterprise event (10.3541, 107.0768)
    coords = {
        "latitude": 10.35412,
        "longitude": 107.07682
    }
    response = client.post("/api/v1/hidden/ping-location", json=coords, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["spawned"] is True
    assert data["item"]["type"] == "DYNAMIC_QUEST"

def test_claim_chest_api(client: TestClient, db_session: Session, hidden_setup):
    user_id = hidden_setup["user_id"]
    token = create_access_token(data={"sub": str(user_id), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # Spawn chest task
    task = PlayerHiddenTasks(
        user_id=user_id,
        task_type="CHEST",
        target_id=hidden_setup["chest_id"],
        latitude=Decimal("10.35410"),
        longitude=Decimal("107.07680"),
        status=SpawnStatusEnum.ACTIVE,
        rarity=RarityEnum.COMMON,
        expires_at=datetime.utcnow() + timedelta(minutes=10)
    )
    db_session.add(task)
    db_session.commit()

    # Claim chest when too far away (distance > 5m)
    claim_too_far = {
        "spawn_id": str(task.spawn_id),
        "latitude": 10.3550,
        "longitude": 107.0780
    }
    response = client.post("/api/v1/hidden/claim-chest", json=claim_too_far, headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "too_far"

    # Claim chest close enough (distance < 5m)
    claim_success = {
        "spawn_id": str(task.spawn_id),
        "latitude": 10.354101,
        "longitude": 107.076801
    }
    response = client.post("/api/v1/hidden/claim-chest", json=claim_success, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "reward_exp" in data
    assert "reward_coin" in data

    db_session.refresh(task)
    assert task.status == SpawnStatusEnum.CLAIMED

def test_verify_quest_checkin_api(client: TestClient, db_session: Session, hidden_setup):
    user_id = hidden_setup["user_id"]
    token = create_access_token(data={"sub": str(user_id), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # Spawn quest task for enterprise event
    task = PlayerHiddenTasks(
        user_id=user_id,
        task_type="DYNAMIC_QUEST",
        target_id=hidden_setup["event_id"],
        latitude=Decimal("10.3541"),
        longitude=Decimal("107.0768"),
        status=SpawnStatusEnum.ACTIVE,
        rarity=RarityEnum.COMMON,
        expires_at=datetime.utcnow() + timedelta(minutes=15)
    )
    db_session.add(task)
    db_session.commit()

    # Verify check-in (requires correct distance)
    verify_data = {
        "spawn_id": str(task.spawn_id),
        "latitude": 10.35411,
        "longitude": 107.07681
    }
    response = client.post("/api/v1/hidden/verify-quest", json=verify_data, headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["title"] == "Checkin Nhận Thưởng"

    db_session.refresh(task)
    assert task.status == SpawnStatusEnum.CLAIMED
