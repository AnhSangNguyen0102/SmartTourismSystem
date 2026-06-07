import requests
import json
from datetime import date, timedelta

BASE_URL = "http://localhost:8000"

EMAIL = "user@example223.com"
PASSWORD = "stringst"

def print_step(step_num, desc):
    print(f"\n{'='*50}\n[{step_num}] {desc}\n{'='*50}")

def main():
    session = requests.Session()
    
    # 1. Login
    print_step(1, "Login")
    resp = session.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    print(resp.status_code, resp.text)
    if resp.status_code != 200:
        print("Login failed, exiting.")
        return
        
    token = resp.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    session.headers.update(headers)
    
    # 2. Create planning
    print_step(2, "Create Planning")
    start_date = date.today() + timedelta(days=5)
    end_date = start_date + timedelta(days=2)
    
    plan_payload = {
        "city_id": 1,
        "start_day": start_date.isoformat(),
        "end_day": end_date.isoformat(),
        "budget": 5000000,
        "currency": "VND",
        "pax_adult": 2,
        "pax_children": 0,
        "tag_ids": [1]
    }
    resp = session.post(f"{BASE_URL}/api/planning/create", json=plan_payload)
    print(resp.status_code, resp.text)
    if resp.status_code != 200:
        print("Create planning failed, exiting.")
        return
        
    session_id = resp.json().get("session_id")
    
    # 3. Recommend
    print_step(3, "Recommend Locations")
    recommend_payload = {
        "city_id": 1,
        "budget": 5000000,
        "preferred_tags": [],
        "max_results": 5
    }
    resp = session.post(f"{BASE_URL}/api/suggestions/recommend", json=recommend_payload)
    print(resp.status_code, resp.text)
    if resp.status_code != 200:
        print("Recommend failed, exiting.")
        return
        
    locations = resp.json().get("locations", [])
    if not locations:
        print("No locations found, cannot proceed to create trip.")
        return
        
    location_ids = [loc["location_id"] for loc in locations]
    
    # 4. Create Trip
    print_step(4, "Create Trip")
    trip_payload = {
        "session_id": session_id,
        "name": "Test Trip From Script",
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "location_ids": location_ids
    }
    resp = session.post(f"{BASE_URL}/api/trips/create", json=trip_payload)
    print(resp.status_code, resp.text)
    if resp.status_code != 200:
        print("Create trip failed, exiting.")
        return
        
    itinerary_id = resp.json().get("itinerary_id")
    
    # 5. Get Trip Detail
    print_step(5, "Get Trip Detail")
    resp = session.get(f"{BASE_URL}/api/trips/{itinerary_id}")
    print(resp.status_code)
    try:
        detail_data = resp.json()
        print(json.dumps(detail_data, indent=2, ensure_ascii=False)[:500] + "\n... (truncated)")
    except Exception as e:
        print("Parse json failed", e)
        return
        
    if resp.status_code != 200:
        print("Get trip detail failed, exiting.")
        return
        
    stops = detail_data.get("stops", [])
    if not stops:
        print("No stops found in the trip.")
        return
        
    first_stop = stops[0]
    stop_id = first_stop["stop_id"]
    target_lat = float(first_stop["latitude"])
    target_lon = float(first_stop["longitude"])
    
    print(f"Target Stop ID: {stop_id}, Lat: {target_lat}, Lon: {target_lon}")
    
    # 6. Check-in
    print_step(6, "Check-in")
    checkin_payload = {
        "latitude": target_lat,
        "longitude": target_lon
    }
    resp = session.post(f"{BASE_URL}/api/trips/{stop_id}/checkin", json=checkin_payload)
    print(resp.status_code, resp.text)
    
    print("\n--- Test Completed ---")

if __name__ == "__main__":
    main()
