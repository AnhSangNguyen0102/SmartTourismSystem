import json
import uuid
from typing import Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.redis_locks import acquire_match_lock, release_match_lock
from core.spatial_logic import calculate_haversine_distance, calculate_midpoint

router = APIRouter(tags=["Social Quest"])

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            websocket = self.active_connections[user_id]
            try:
                await websocket.send_json(message)
            except Exception:
                self.disconnect(user_id)

manager = ConnectionManager()

# --- TRẠNG THÁI SERVER ---
class PlayerState:
    IDLE = "IDLE"
    MATCHING_PENDING = "MATCHING_PENDING"
    IN_QUEST = "IN_QUEST"

player_states: Dict[str, str] = {}
player_locations: Dict[str, dict] = {}
# Lưu thông tin của cặp đôi đang ghép (Instance)
# Format: { "instance_id": {"p1": "userA", "p2": "userB", "p1_accept": False, "p2_accept": False} }
active_instances: Dict[str, dict] = {}
# Tra cứu nhanh: user_id -> instance_id
user_to_instance: Dict[str, str] = {}


async def process_location_update(user_id: str, lat: float, lng: float):
    if player_states.get(user_id) != PlayerState.IDLE:
        return

    for other_user, loc in player_locations.items():
        if other_user == user_id or player_states.get(other_user) != PlayerState.IDLE:
            continue

        dist = calculate_haversine_distance(lat, lng, loc["lat"], loc["lng"])
        
        # 1. PHÁT HIỆN GẦN NHAU DƯỚI 50M -> MỜI CHƠI
        if dist <= 50.0:
            if acquire_match_lock(user_id) and acquire_match_lock(other_user):
                instance_id = str(uuid.uuid4())
                
                # Lưu thông tin phiên chơi
                active_instances[instance_id] = {
                    "p1": user_id, "p2": other_user,
                    "p1_accept": False, "p2_accept": False
                }
                user_to_instance[user_id] = instance_id
                user_to_instance[other_user] = instance_id
                
                player_states[user_id] = PlayerState.MATCHING_PENDING
                player_states[other_user] = PlayerState.MATCHING_PENDING
                
                # Gửi lời mời cho cả 2
                spawn_event = {
                    "event": "quest_spawn_request",
                    "data": {
                        "instance_id": instance_id,
                        "title": "⚡ Truy tìm Lữ Khách",
                        "message": "Có người chơi đang ở gần! Chấp nhận để nhận điểm hẹn chung.",
                        "timeout": 30
                    }
                }
                await manager.send_personal_message(spawn_event, user_id)
                await manager.send_personal_message(spawn_event, other_user)
                return 
            else:
                release_match_lock(user_id)


async def cancel_quest_instance(instance_id: str, reason: str = "Nhiệm vụ bị hủy"):
    """Hủy phiên chơi, giải phóng lock và báo cho user còn lại"""
    if instance_id not in active_instances: return
    
    instance = active_instances[instance_id]
    p1, p2 = instance["p1"], instance["p2"]
    
    # Giải phóng trạng thái và Lock
    for p in [p1, p2]:
        player_states[p] = PlayerState.IDLE
        release_match_lock(p)
        if p in user_to_instance: del user_to_instance[p]
        # Báo về Frontend để đóng Popup
        await manager.send_personal_message({"event": "quest_cancelled", "reason": reason}, p)
        
    del active_instances[instance_id]


@router.websocket("/ws/social_quest/{user_id}")
async def social_quest_websocket(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    player_states[user_id] = PlayerState.IDLE
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                action = payload.get("action")
                
                if action == "update_location":
                    loc = payload.get("payload", {})
                    lat, lng = loc.get("lat"), loc.get("lng")
                    if lat and lng:
                        player_locations[user_id] = {"lat": lat, "lng": lng}
                        await process_location_update(user_id, lat, lng)

                elif action == "accept_quest":
                    instance_id = user_to_instance.get(user_id)
                    if instance_id and instance_id in active_instances:
                        instance = active_instances[instance_id]
                        # Đánh dấu người này đã đồng ý
                        if instance["p1"] == user_id: instance["p1_accept"] = True
                        if instance["p2"] == user_id: instance["p2_accept"] = True
                        
                        # Báo cho client là đang chờ người kia
                        await manager.send_personal_message({"event": "waiting_for_partner"}, user_id)
                        
                        # NẾU CẢ 2 CÙNG ĐỒNG Ý -> TÍNH ĐIỂM HẸN VÀ BẮT ĐẦU
                        if instance["p1_accept"] and instance["p2_accept"]:
                            p1, p2 = instance["p1"], instance["p2"]
                            player_states[p1] = PlayerState.IN_QUEST
                            player_states[p2] = PlayerState.IN_QUEST
                            
                            loc1, loc2 = player_locations[p1], player_locations[p2]
                            rendezvous = calculate_midpoint(loc1["lat"], loc1["lng"], loc2["lat"], loc2["lng"])
                            instance["rendezvous"] = rendezvous
                            
                            start_event = {
                                "event": "quest_start",
                                "data": {
                                    "rendezvous_lat": rendezvous["lat"],
                                    "rendezvous_lng": rendezvous["lng"],
                                    "message": "Điểm hẹn đã được xác định! Hãy di chuyển và tìm nhau."
                                }
                            }
                            await manager.send_personal_message(start_event, p1)
                            await manager.send_personal_message(start_event, p2)

                elif action == "reject_quest":
                    instance_id = user_to_instance.get(user_id)
                    await cancel_quest_instance(instance_id, "Đối phương đã từ chối tham gia.")

                elif action == "social_interact" or action == "complete_quest":
                    # KHI TƯƠNG TÁC HOẶC HOÀN THÀNH: PHẢI KIỂM TRA KHOẢNG CÁCH DƯỚI 10 MÉT
                    instance_id = user_to_instance.get(user_id)
                    if instance_id and instance_id in active_instances:
                        instance = active_instances[instance_id]
                        p1, p2 = instance["p1"], instance["p2"]
                        
                        loc1, loc2 = player_locations.get(p1), player_locations.get(p2)
                        dist = calculate_haversine_distance(loc1["lat"], loc1["lng"], loc2["lat"], loc2["lng"])
                        
                        if dist <= 10.0:  # Dung sai 10m an toàn cho GPS drift
                            # Thành công!
                            success_event = {"event": "quest_success", "message": "Hoàn thành xuất sắc!"}
                            await manager.send_personal_message(success_event, p1)
                            await manager.send_personal_message(success_event, p2)
                            
                            # Dọn dẹp server
                            for p in [p1, p2]:
                                player_states[p] = PlayerState.IDLE
                                release_match_lock(p)
                                if p in user_to_instance: del user_to_instance[p]
                            del active_instances[instance_id]
                        else:
                            # Nếu đứng xa quá, báo lỗi không cho tương tác
                            await manager.send_personal_message({
                                "event": "error", 
                                "message": f"Các bạn đang cách nhau {dist:.0f}m. Hãy tiến lại gần nhau hơn (dưới 3m)!"
                            }, user_id)

            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        instance_id = user_to_instance.get(user_id)
        if instance_id:
            await cancel_quest_instance(instance_id, "Đối phương đã mất kết nối.")
        if user_id in player_states: del player_states[user_id]
        if user_id in player_locations: del player_locations[user_id]