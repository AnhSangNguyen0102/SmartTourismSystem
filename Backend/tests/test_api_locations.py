import pytest
from datetime import time, datetime, date
from uuid import uuid4
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlmodel import Session

from models import (
    Users, UserProfiles, UserRole, UserStatus, RegisterType,
    Cities, Locations, LocationsImage, LocationReviews,
    EnterpriseProfiles, EnterpriseStatus, LocationSubmissions
)
from core.security import create_access_token

@pytest.fixture(name="setup_data")
def setup_data_fixture(db_session: Session):
    # 1. Tạo Thành phố mẫu
    city = Cities(
        city_id=10,
        city_name="Hồ Chí Minh",
        region="Miền Nam",
        latitude=Decimal("10.776797"),
        longitude=Decimal("106.700981")
    )
    db_session.add(city)
    db_session.commit()

    # 2. Tạo Doanh nghiệp mẫu ACTIVE để đăng ký địa điểm
    ent_user_id = uuid4()
    ent_user = Users(
        user_id=ent_user_id,
        full_name="Chủ Doanh Nghiệp",
        email="enterprise.active@corp.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.ENTERPRISE,
        status=UserStatus.ACTIVE
    )
    ent_profile = EnterpriseProfiles(
        user_id=ent_user_id,
        business_name="Doanh Nghiệp Đăng Ký Địa Điểm",
        contact_person="Nguyễn Văn Doanh",
        contact_email="doanh@corp.com",
        contact_phone="0911223344",
        status=EnterpriseStatus.ACTIVE
    )
    db_session.add(ent_user)
    db_session.add(ent_profile)
    db_session.commit()

    # 3. Tạo User thường mẫu để review
    normal_user_id = uuid4()
    normal_user = Users(
        user_id=normal_user_id,
        full_name="Nguyễn Reviewer",
        email="reviewer@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    normal_profile = UserProfiles(
        user_id=normal_user_id,
        full_name="Nguyễn Reviewer",
        date_of_birth=date(1994, 4, 4),
        gender="MALE"
    )
    db_session.add(normal_user)
    db_session.add(normal_profile)
    db_session.commit()

    # 4. Tạo Địa điểm sẵn có
    loc_id = uuid4()
    location = Locations(
        location_id=loc_id,
        location_name="Chợ Bến Thành",
        address="Bến Thành, Quận 1, TPHCM",
        latitude=Decimal("10.7719"),
        longitude=Decimal("106.6983"),
        city_id=10,
        open_time=time(7, 0, 0),
        close_time=time(19, 0, 0),
        min_price=Decimal("0"),
        max_price=Decimal("100000"),
        is_active=True
    )
    db_session.add(location)
    db_session.commit()

    return {
        "city_id": 10,
        "enterprise_user_id": ent_user_id,
        "normal_user_id": normal_user_id,
        "location_id": loc_id
    }

def test_register_location_api(client: TestClient, db_session: Session, setup_data):
    # Sinh access token cho doanh nghiệp
    access_token = create_access_token(data={"sub": str(setup_data["enterprise_user_id"]), "role": "ENTERPRISE"})
    headers = {"Authorization": f"Bearer {access_token}"}

    # 1. Đăng ký địa điểm hợp lệ
    payload = {
        "location_name": "Nhà thờ Đức Bà",
        "address": "Công xã Paris, Bến Nghé, Quận 1, Hồ Chí Minh",
        "city_id": setup_data["city_id"],
        "open_time": "08:00:00",
        "close_time": "17:00:00",
        "min_price": 0.00,
        "max_price": 0.00,
        "currency": "VND",
        "category_ids": [],
        "tag_ids": []
    }
    response = client.post("/api/v1/locations/register", json=payload, headers=headers)
    assert response.status_code == 201
    res_json = response.json()
    assert res_json["status"] == "PENDING"
    assert "Đã gửi yêu cầu đăng ký địa điểm" in res_json["message"]

    # Kiểm tra database xem đã lưu LocationSubmissions chưa
    submissions = db_session.query(LocationSubmissions).all()
    assert len(submissions) == 1
    assert submissions[0].status == "PENDING"

    # 2. Đăng ký sai: Close time trước open time
    payload_invalid_time = dict(payload)
    payload_invalid_time["close_time"] = "07:00:00"
    response = client.post("/api/v1/locations/register", json=payload_invalid_time, headers=headers)
    assert response.status_code == 400
    assert "close_time phải lớn hơn open_time" in response.json()["detail"]

    # 3. Đăng ký sai: max price nhỏ hơn min price
    payload_invalid_price = dict(payload)
    payload_invalid_price["min_price"] = 50000
    payload_invalid_price["max_price"] = 10000
    response = client.post("/api/v1/locations/register", json=payload_invalid_price, headers=headers)
    assert response.status_code == 400
    assert "max_price phải lớn hơn hoặc bằng min_price" in response.json()["detail"]

def test_get_location_images(client: TestClient, db_session: Session, setup_data):
    loc_id = setup_data["location_id"]
    
    # Tạo một số ảnh cho địa điểm
    img1 = LocationsImage(location_id=loc_id, url="http://img.com/ben-thanh-1.jpg", display_order=2)
    img2 = LocationsImage(location_id=loc_id, url="http://img.com/ben-thanh-2.jpg", display_order=1)
    db_session.add(img1)
    db_session.add(img2)
    db_session.commit()

    # Gọi API lấy ảnh
    response = client.get(f"/api/v1/locations/{loc_id}/images")
    assert response.status_code == 200
    res_list = response.json()
    assert len(res_list) == 2
    # Phải sắp xếp theo display_order (tăng dần: img2 hiển thị trước img1)
    assert res_list[0]["url"] == "http://img.com/ben-thanh-2.jpg"
    assert res_list[1]["url"] == "http://img.com/ben-thanh-1.jpg"

def test_reviews_ratings_endpoints(client: TestClient, db_session: Session, setup_data):
    loc_id = setup_data["location_id"]
    normal_uid = setup_data["normal_user_id"]

    # 1. rating-summary khi chưa có review nào
    response = client.get(f"/api/v1/locations/{loc_id}/rating-summary")
    assert response.status_code == 200
    assert response.json()["total_reviews"] == 0
    assert response.json()["average_rating"] is None

    # Sinh access token cho user thường để làm review
    access_token = create_access_token(data={"sub": str(normal_uid), "role": "USER"})
    headers = {"Authorization": f"Bearer {access_token}"}

    # 2. Tạo review mới thành công
    review_payload = {
        "rating": 5,
        "comment": "Địa điểm tuyệt vời, rất đáng trải nghiệm!"
    }
    response = client.post(f"/api/v1/locations/{loc_id}/reviews", json=review_payload, headers=headers)
    assert response.status_code == 200
    assert response.json()["success"] is True

    # 3. Lấy rating-summary sau khi đã có review
    response = client.get(f"/api/v1/locations/{loc_id}/rating-summary")
    assert response.status_code == 200
    assert response.json()["total_reviews"] == 1
    assert response.json()["average_rating"] == 5.0
    assert response.json()["distribution"]["5"] == 1

    # 4. Lấy danh sách reviews
    response = client.get(f"/api/v1/locations/{loc_id}/reviews")
    assert response.status_code == 200
    res_list = response.json()
    assert len(res_list) == 1
    assert res_list[0]["rating"] == 5
    assert res_list[0]["comment"] == "Địa điểm tuyệt vời, rất đáng trải nghiệm!"
    assert res_list[0]["user"]["full_name"] == "Nguyễn Reviewer"

    # 5. Cập nhật (Upsert) review cũ sang rating và comment mới
    update_payload = {
        "rating": 4,
        "comment": "Chợ hơi nóng nhưng đồ ăn ngon!"
    }
    response = client.post(f"/api/v1/locations/{loc_id}/reviews", json=update_payload, headers=headers)
    assert response.status_code == 200
    
    # Check lại rating-summary và review list
    summary_resp = client.get(f"/api/v1/locations/{loc_id}/rating-summary")
    assert summary_resp.json()["total_reviews"] == 1
    assert summary_resp.json()["average_rating"] == 4.0
    assert summary_resp.json()["distribution"]["4"] == 1
    assert summary_resp.json()["distribution"]["5"] == 0
