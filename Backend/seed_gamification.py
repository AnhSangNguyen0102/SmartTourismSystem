import os
import sys
from dotenv import load_dotenv
from sqlmodel import Session, select, create_engine

# Reconfigure stdout to use UTF-8 on Windows
sys.stdout.reconfigure(encoding='utf-8')


# Add parent dir to path if needed to import database & models
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import engine, create_db_and_tables
from models import PhotoTasks, Locations, TaskTypeEnum, TaskDifficultyEnum

def seed_gamification_tasks():
    load_dotenv()
    
    print("[INFO] Connecting to Database to create sample gamification tasks...")
    try:
        # Create all missing tables first
        create_db_and_tables()
        print("[OK] Database tables verified/created successfully!")
        
        with Session(engine) as session:
            # 1. Fetch some existing locations
            locations = session.exec(select(Locations)).all()
            if not locations:
                print("[FAIL] No locations found in 'locations' table. Please seed locations first.")
                return

            print(f"[OK] Found {len(locations)} locations. Checking existing tasks...")
            
            sample_tours = [
                {
                    "title": "Chụp hình check-in mặt tiền",
                    "description": "Hãy đứng ở khoảng cách 20m - 50m chụp toàn cảnh chính diện địa danh để AI tiến hành xác thực vị trí dừng chân của bạn.",
                    "reward_exp": 150,
                    "radius_meters": 50,
                    "difficulty": TaskDifficultyEnum.EASY,
                    "image": "https://images.unsplash.com/photo-1528127269322-539801943592?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80"
                },
                {
                    "title": "Tìm kiếm Góc ảnh nghệ thuật",
                    "description": "Hãy chụp cận cảnh chi tiết kiến trúc độc đáo nhất tại đây (ví dụ: hoa văn, mái ngói hoặc cổng vòm) theo góc nghiêng 45 độ.",
                    "reward_exp": 300,
                    "radius_meters": 30,
                    "difficulty": TaskDifficultyEnum.MEDIUM,
                    "image": "https://images.unsplash.com/photo-1555921015-5532091f6026?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80"
                },
                {
                    "title": "Thử thách Nhiếp ảnh gia phong cảnh",
                    "description": "Tìm một vị trí trên cao hoặc góc máy rộng để chụp trọn vẹn cảnh quan hùng vĩ, kết hợp yếu tố thiên nhiên như cây cối, bầu trời hay mặt nước cùng với công trình kiến trúc.",
                    "reward_exp": 400,
                    "radius_meters": 100,
                    "difficulty": TaskDifficultyEnum.HARD,
                    "image": "https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80"
                },
                {
                    "title": "Khoảnh khắc giao thoa ánh sáng",
                    "description": "Bắt trọn khoảnh khắc ánh sáng tự nhiên tuyệt đẹp nhất (lúc hoàng hôn, bình minh hoặc ánh sáng xuyên qua các khe hở kiến trúc). Góc chụp tự do, yêu cầu ánh sáng tự nhiên rõ nét.",
                    "reward_exp": 350,
                    "radius_meters": 70,
                    "difficulty": TaskDifficultyEnum.MEDIUM,
                    "image": "https://images.unsplash.com/photo-1469474968028-56623f02e42e?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80"
                },
                {
                    "title": "Tương tác cùng không gian di sản",
                    "description": "Chụp một bức ảnh có xuất hiện bạn hoặc người đồng hành đang hòa mình vào không gian cổ kính/văn hóa của địa điểm (không dùng chế độ selfie cận mặt).",
                    "reward_exp": 250,
                    "radius_meters": 40,
                    "difficulty": TaskDifficultyEnum.MEDIUM,
                    "image": "https://images.unsplash.com/photo-1516483638261-f40889f08a8e?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80"
                },
                {
                    "title": "Khám phá đối xứng kiến trúc",
                    "description": "Tìm một khu vực có tính đối xứng hoàn hảo trong thiết kế kiến trúc (ví dụ: hành lang dài, cổng chào, cầu thang) và chụp ở ngay chính giữa tâm đối xứng.",
                    "reward_exp": 450,
                    "radius_meters": 30,
                    "difficulty": TaskDifficultyEnum.HARD,
                    "image": "https://images.unsplash.com/photo-1520106292534-714081c79aeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80"
                }
            ]

            tasks_created = 0
            for idx, loc in enumerate(locations):
                # Fetch existing tasks for this location
                existing_tasks = session.exec(select(PhotoTasks).where(PhotoTasks.location_id == loc.location_id)).all()
                existing_titles = [task.title for task in existing_tasks]
                
                # Assign 2-3 sample tasks to each location for variety
                import random
                num_tasks_to_add = random.randint(2, 4)
                # Ensure we have different tasks for each location
                tasks_to_assign = random.sample(sample_tours, num_tasks_to_add)
                
                for sample_task in tasks_to_assign:
                    task_title = f"{sample_task['title']} tại {loc.location_name}"
                    
                    if task_title in existing_titles:
                        continue
                        
                    lat_offset = random.uniform(-0.0002, 0.0002)
                    lng_offset = random.uniform(-0.0002, 0.0002)
                    
                    new_task = PhotoTasks(
                        location_id=loc.location_id,
                        title=task_title,
                        description=sample_task['description'],
                        task_type=TaskTypeEnum.PHOTO,
                        reference_image_url=sample_task['image'],
                        reward_exp=sample_task['reward_exp'],
                        radius_meters=sample_task['radius_meters'],
                        difficulty=sample_task['difficulty'],
                        latitude=loc.latitude + Decimal(str(lat_offset)),
                        longitude=loc.longitude + Decimal(str(lng_offset)),
                        is_active=True
                    )
                    session.add(new_task)
                    tasks_created += 1
                
                if tasks_created > 0 and idx % 10 == 0:
                    print(f"   [+] Added tasks up to location '{loc.location_name}'...")
            
            if tasks_created > 0:
                session.commit()
                print(f"\n[SUCCESS] Successfully created {tasks_created} new photo tasks on your Supabase Database!")
            else:
                print("\n[INFO] No new tasks needed to be created.")

    except Exception as e:
        print(f"[FAIL] Error seeding database: {str(e)}")

if __name__ == "__main__":
    seed_gamification_tasks()
