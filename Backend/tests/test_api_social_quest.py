import pytest
import json
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from unittest.mock import patch

from routers.social_quest import (
    player_states, player_locations, player_cooldowns,
    active_instances, user_to_instance, manager
)

@pytest.fixture(autouse=True)
def clean_social_quest_state():
    """Clear all global state caches before and after each test."""
    player_states.clear()
    player_locations.clear()
    player_cooldowns.clear()
    active_instances.clear()
    user_to_instance.clear()
    manager.active_connections.clear()
    yield
    player_states.clear()
    player_locations.clear()
    player_cooldowns.clear()
    active_instances.clear()
    user_to_instance.clear()
    manager.active_connections.clear()

@pytest.fixture(autouse=True)
def mock_match_locks():
    """Mock redis locks for matches."""
    with patch("routers.social_quest.acquire_match_lock", return_value=True), \
         patch("routers.social_quest.release_match_lock", return_value=None):
        yield

def test_websocket_connect_and_disconnect(client: TestClient):
    user_id = "userA"
    with client.websocket_connect(f"/ws/social_quest/{user_id}") as websocket:
        assert user_id in player_states
        assert player_states[user_id] == "IDLE"
        assert user_id in manager.active_connections
    
    # After exit (disconnect)
    assert user_id not in player_states
    assert user_id not in manager.active_connections

def test_location_update_and_matching_flow(client: TestClient):
    user_a = "userA"
    user_b = "userB"

    # Connect User A
    with client.websocket_connect(f"/ws/social_quest/{user_a}") as ws_a:
        # Connect User B
        with client.websocket_connect(f"/ws/social_quest/{user_b}") as ws_b:
            # User A updates location
            ws_a.send_json({
                "action": "update_location",
                "payload": {"lat": 10.0, "lng": 100.0}
            })
            
            # User B updates location close to User A (approx 5 meters distance)
            ws_b.send_json({
                "action": "update_location",
                "payload": {"lat": 10.00003, "lng": 100.00003}
            })

            # Check matching requests are spawned
            msg_a = ws_a.receive_json()
            msg_b = ws_b.receive_json()

            assert msg_a["event"] == "quest_spawn_request"
            assert msg_b["event"] == "quest_spawn_request"

            instance_id = msg_a["data"]["instance_id"]
            assert instance_id in active_instances

            # User A accepts quest
            ws_a.send_json({
                "action": "accept_quest"
            })
            wait_msg_a = ws_a.receive_json()
            assert wait_msg_a["event"] == "waiting_for_partner"

            # User B accepts quest -> triggers quest start with rendezvous
            ws_b.send_json({
                "action": "accept_quest"
            })
            
            start_msg_a = ws_a.receive_json()
            start_msg_b = ws_b.receive_json()

            assert start_msg_a["event"] == "quest_start"
            assert start_msg_b["event"] == "quest_start"
            assert "rendezvous_lat" in start_msg_a["data"]

            # Complete quest: send complete action when close enough
            ws_a.send_json({
                "action": "complete_quest"
            })

            success_msg_a = ws_a.receive_json()
            success_msg_b = ws_b.receive_json()

            assert success_msg_a["event"] == "quest_success"
            assert success_msg_b["event"] == "quest_success"

def test_matching_rejection_flow(client: TestClient):
    user_a = "userA"
    user_b = "userB"

    with client.websocket_connect(f"/ws/social_quest/{user_a}") as ws_a:
        with client.websocket_connect(f"/ws/social_quest/{user_b}") as ws_b:
            ws_a.send_json({
                "action": "update_location",
                "payload": {"lat": 10.0, "lng": 100.0}
            })
            ws_b.send_json({
                "action": "update_location",
                "payload": {"lat": 10.00001, "lng": 100.00001}
            })

            msg_a = ws_a.receive_json()
            msg_b = ws_b.receive_json()
            assert msg_a["event"] == "quest_spawn_request"

            # User A rejects
            ws_a.send_json({
                "action": "reject_quest"
            })

            cancel_msg_a = ws_a.receive_json()
            cancel_msg_b = ws_b.receive_json()

            assert cancel_msg_a["event"] == "quest_cancelled"
            assert cancel_msg_b["event"] == "quest_cancelled"
            assert cancel_msg_b["reason"] == "Đối phương đã từ chối tham gia."

            # Cooldown is set
            assert user_a in player_cooldowns
            assert user_b in player_cooldowns
