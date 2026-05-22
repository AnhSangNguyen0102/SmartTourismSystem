import os
import sys
from dotenv import load_dotenv
from sqlmodel import Session, select

# Reconfigure stdout to use UTF-8 on Windows
sys.stdout.reconfigure(encoding='utf-8')

# Add parent dir to path if needed to import database & models
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import engine, create_db_and_tables
from models import HiddenChests, RarityEnum

def seed_hidden_chests():
    load_dotenv()
    print("[INFO] Creating database tables if they do not exist...")
    try:
        create_db_and_tables()
    except Exception as e:
        print(f"[WARN] Error running create_db_and_tables: {e}")
    print("[INFO] Connecting to Database to seed hidden chests...")
    try:
        with Session(engine) as session:
            # Check if chests already exist
            existing = session.exec(select(HiddenChests)).all()
            if existing:
                print(f"[INFO] Hidden chests table already seeded. Found {len(existing)} chests.")
                return

            chests_to_seed = [
                HiddenChests(
                    title="Rương Đồng (Common Chest)",
                    description="Rương báu bằng gỗ đơn sơ, chứa một vài đồng xu và kinh nghiệm nhỏ lẻ.",
                    rarity=RarityEnum.COMMON,
                    min_exp=10,
                    max_exp=30,
                    min_coin=5,
                    max_coin=15
                ),
                HiddenChests(
                    title="Rương Bạc (Rare Chest)",
                    description="Rương bạc chạm khắc tinh xảo, chứa lượng phần thưởng khá lớn.",
                    rarity=RarityEnum.RARE,
                    min_exp=30,
                    max_exp=60,
                    min_coin=15,
                    max_coin=30
                ),
                HiddenChests(
                    title="Rương Vàng (Epic Chest)",
                    description="Rương vàng hoàng gia lấp lánh, chứa đầy ắp vật phẩm và may mắn nhân đôi.",
                    rarity=RarityEnum.EPIC,
                    min_exp=60,
                    max_exp=120,
                    min_coin=30,
                    max_coin=60
                ),
                HiddenChests(
                    title="Rương Thần Thoại (Legendary Chest)",
                    description="Rương báu cổ đại tỏa ra vầng hào quang chói lọi. Cơ hội cực cao nhận được jackpot đặc biệt!",
                    rarity=RarityEnum.LEGENDARY,
                    min_exp=120,
                    max_exp=250,
                    min_coin=60,
                    max_coin=150
                )
            ]

            for chest in chests_to_seed:
                session.add(chest)
            
            session.commit()
            print("[SUCCESS] Successfully seeded 4 types of hidden chests!")
            
    except Exception as e:
        print(f"[FAIL] Error seeding hidden chests: {str(e)}")

if __name__ == "__main__":
    seed_hidden_chests()
