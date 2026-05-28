from fastapi.testclient import TestClient
from main import app
from core.security import create_access_token
from database import engine
from sqlmodel import Session, select
import models

client = TestClient(app)

with Session(engine) as session:
    admin_user = session.exec(
        select(models.Users).where(
            models.Users.role == models.UserRole.ADMIN,
            models.Users.status == models.UserStatus.ACTIVE
        )
    ).first()
    
    if not admin_user:
        print("No active admin user found in database. Using mock uuid.")
        admin_id = "c8e96a92-de9e-4a2d-9106-47075aa06978"
    else:
        admin_id = str(admin_user.user_id)
        print(f"Using active admin user: {admin_user.full_name} ({admin_id})")

token = create_access_token({"sub": admin_id, "role": "ADMIN"})
headers = {"Authorization": f"Bearer {token}"}

response = client.get("/api/admin/locations", headers=headers)
print("Status code:", response.status_code)
if response.status_code == 200:
    data = response.json()
    print("Found locations count:", len(data))
    if len(data) > 0:
        print("First location detail:")
        print("  Name:", data[0].get("location_name"))
        print("  Address:", data[0].get("address"))
        print("  GPS:", data[0].get("latitude"), ",", data[0].get("longitude"))
else:
    print("Error:", response.text)
