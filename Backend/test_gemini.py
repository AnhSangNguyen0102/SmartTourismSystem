import os
import asyncio
from dotenv import load_dotenv
from services.ai_verification import verify_image_with_gemini

load_dotenv()

async def main():
    try:
        res = await verify_image_with_gemini(b"dummy_image", "https://httpbin.org/image/jpeg")
        with open("test_out.txt", "w", encoding="utf-8") as f:
            f.write(str(res))
    except Exception as e:
        import traceback
        with open("test_out.txt", "w", encoding="utf-8") as f:
            f.write(traceback.format_exc())

asyncio.run(main())
