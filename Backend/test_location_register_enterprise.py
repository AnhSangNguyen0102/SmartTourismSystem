"""
test_location_register_enterprise.py
User: Smoke Corp | enterprise_id: 0993a41d-161f-425d-a2a7-76e815e05de9
Chạy: python test_location_register_enterprise.py
"""
import httpx, json, sys
sys.stdout.reconfigure(encoding='utf-8')


BASE_URL = "http://127.0.0.1:8000"
ENDPOINT = f"{BASE_URL}/api/v1/locations/register"
from core.security import create_access_token
TOKEN = create_access_token({"sub": "c8e96a92-de9e-4a2d-9106-47075aa06978", "role": "ENTERPRISE"})
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
GREEN, RED, CYAN, RESET, BOLD = "\033[92m", "\033[91m", "\033[96m", "\033[0m", "\033[1m"

passed = failed = 0

def check(tc, expected, actual, body=None):
    global passed, failed
    ok = actual == expected
    print(f"  [{'PASS' if ok else 'FAIL'}] {tc}")
    print(f"         Expected {expected} | Got {actual}")
    if body: print(f"         Body: {json.dumps(body, ensure_ascii=False)[:200]}")
    print()
    if ok: passed += 1
    else: failed += 1

print(f"\n{BOLD}═══ TEST ĐĂNG KÝ ĐỊA ĐIỂM - Smoke Corp ═══{RESET}\n")

# TC0: Health check
try:
    r = httpx.get(f"{BASE_URL}/health", timeout=5)
    print(f"  [{'PASS' if r.status_code==200 else 'FAIL'}] TC0 - Server {'UP' if r.status_code==200 else 'DOWN'}\n")
    passed += 1
except: print("  [FAIL] Server không chạy\n"); sys.exit(1)

VALID = {
    "location_name": "Smoke Corp Lounge Sài Gòn",
    "address": "29 Ngô Quyền, Quận 1, Hồ Chí Minh, Việt Nam",
    "city_id": 1, "open_time": "08:00:00", "close_time": "22:00:00",
    "min_price": "100000.00", "max_price": "500000.00", "currency": "VND",
    "category_ids": [1], "tag_ids": [1, 2]
}

# TC1: Đăng ký hợp lệ
r = httpx.post(ENDPOINT, json=VALID, headers=HEADERS, timeout=10)
check("TC1 - Đăng ký hợp lệ", 201, r.status_code, r.json() if r.content else None)

# TC2: Trùng tên
r = httpx.post(ENDPOINT, json=VALID, headers=HEADERS, timeout=10)
check("TC2 - Trùng tên địa điểm", 400, r.status_code, r.json() if r.content else None)

# TC3: close_time <= open_time
r = httpx.post(ENDPOINT, json={**VALID, "location_name": "Test Time", "close_time": "07:00:00"}, headers=HEADERS, timeout=10)
check("TC3 - close_time <= open_time", 400, r.status_code, r.json() if r.content else None)

# TC4: max_price < min_price
r = httpx.post(ENDPOINT, json={**VALID, "location_name": "Test Price", "min_price": "500000", "max_price": "100000"}, headers=HEADERS, timeout=10)
check("TC4 - max_price < min_price", 400, r.status_code, r.json() if r.content else None)

# TC5: city_id không tồn tại
r = httpx.post(ENDPOINT, json={**VALID, "location_name": "Test City", "city_id": 9999}, headers=HEADERS, timeout=10)
check("TC5 - city_id không tồn tại", 400 if r.status_code==400 else 404, r.status_code, r.json() if r.content else None)

# TC6: Thiếu location_name
r = httpx.post(ENDPOINT, json={k:v for k,v in VALID.items() if k!="location_name"}, headers=HEADERS, timeout=10)
check("TC6 - Thiếu location_name", 422, r.status_code, r.json() if r.content else None)

print(f"{BOLD}{'═'*50}{RESET}")
print(f"{BOLD}  KẾT QUẢ: {passed}/{passed+failed} PASS | {failed}/{passed+failed} FAIL{RESET}")
print(f"{BOLD}{'═'*50}{RESET}\n")
if failed: sys.exit(1)