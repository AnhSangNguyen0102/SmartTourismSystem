import asyncio
import io
import json
import logging
import os
import re

import httpx
from PIL import Image

from services.photo_service import GeminiError, get_photo_service

logger = logging.getLogger(__name__)


def repair_json_reason(json_str: str) -> str:
    """
    Tìm trường "reason" cuối cùng và thay thế các dấu ngoặc kép không hợp lệ
    bên trong chuỗi giá trị của nó cũng như các ký tự xuống dòng để trở thành JSON hợp lệ.
    """
    # Tìm đoạn bắt đầu của "reason": "
    match = re.search(r'("reason"\s*:\s*")', json_str)
    if not match:
        return json_str
    
    start_pos = match.end()
    
    # Tìm dấu ngoặc nhọn kết thúc } cuối cùng
    end_bracket_pos = json_str.rfind('}')
    
    if end_bracket_pos == -1:
        # Trường hợp JSON bị cắt cụt ngang chừng
        reason_content = json_str[start_pos:]
        reason_content = reason_content.replace('"', "'").replace('\n', ' ').replace('\r', '')
        return json_str[:start_pos] + reason_content + '"}'
        
    # Tìm dấu ngoặc kép cuối cùng trước dấu ngoặc nhọn kết thúc }
    end_quote_pos = json_str.rfind('"', start_pos, end_bracket_pos)
    if end_quote_pos == -1:
        return json_str
        
    # Trích xuất nội dung của reason
    reason_content = json_str[start_pos:end_quote_pos]
    
    # Thay thế ngoặc kép lồng và xuống dòng
    repaired_reason = reason_content.replace('"', "'").replace('\n', ' ').replace('\r', '')
        
    # Ghép lại chuỗi JSON hoàn chỉnh
    repaired_json = json_str[:start_pos] + repaired_reason + json_str[end_quote_pos:]
    return repaired_json

# Optional imports for local CLIP similarity
try:
    from transformers import CLIPProcessor, CLIPModel
    import torch
    clip_model = CLIPModel.from_pretrained('openai/clip-vit-base-patch32')
    clip_processor = CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32')
    HAS_CLIP = True
except ImportError:
    HAS_CLIP = False


def _get_image_mime_type(image_bytes: bytes) -> str:
    """Detect image MIME type from bytes header."""
    if image_bytes[:4] == b'\x89PNG':
        return "image/png"
    elif image_bytes[:2] == b'\xff\xd8':
        return "image/jpeg"
    elif image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
        return "image/webp"
    elif image_bytes[:3] == b'GIF':
        return "image/gif"
    return "image/jpeg"  # default


# NOTE: Hàm _call_gemini_rest_api đã được thay thế bởi GeminiPhotoService
# trong services/photo_service.py. Logic HTTP, xoay key, và xử lý lỗi
# theo mã HTTP (429, 403, 400, 5xx) được quản lý tập trung tại đó.


async def verify_image_with_gemini(user_image_bytes: bytes, reference_image_url: str) -> dict:
    """
    Xác thực ảnh người dùng so với ảnh mẫu địa điểm du lịch qua Gemini Vision API.

    Luồng xử lý:
    1. Tải ảnh mẫu từ URL.
    2. Gọi GeminiPhotoService (đã tích hợp key rotation + rate limiting).
    3. Parse JSON phản hồi và áp dụng quy tắc an toàn.
    4. Fallback về CLIP nếu Gemini không khả dụng.
    """
    # ── 1. Kiểm tra Gemini có được cấu hình không ────────────────────────────
    try:
        photo_svc = get_photo_service()
    except ValueError:
        # Không có key nào trong .env → fallback CLIP
        if HAS_CLIP:
            return await _run_clip_async(user_image_bytes, reference_image_url)
        return {
            "is_matched": False,
            "confidence_score": 0.0,
            "anti_cheat_passed": False,
            "reason": "Chưa cấu hình GEMINI_API_KEY. Hình ảnh bị từ chối.",
        }

    try:
        # ── 2. Tải ảnh mẫu ───────────────────────────────────────────────────
        async with httpx.AsyncClient(
            follow_redirects=True,
            verify=False,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        ) as client:
            resp = await client.get(reference_image_url, timeout=15)
        if resp.status_code != 200:
            raise OSError(
                f"Không thể tải ảnh mẫu địa điểm từ storage. Status: {resp.status_code}"
            )
        ref_image_bytes = resp.content

        # ── 3. Xây dựng prompt ───────────────────────────────────────────────
        prompt = """
        Bạn là hệ thống kiểm định ảnh NGHIÊM NGẶT cho trò chơi du lịch thực tế Việt Nam Smart Tourism.
        Hai ảnh được cung cấp:
        - Ảnh 1 (Reference): Ảnh mẫu chính thức của địa điểm du lịch.
        - Ảnh 2 (User): Ảnh người chơi vừa chụp tại thực địa.

        NHIỆM VỤ: Đánh giá xem Ảnh 2 có thực sự được chụp tại cùng địa điểm hoặc địa điểm tương tự với Ảnh 1 không.

        TIÊU CHÍ ĐÁNH GIÁ BẮT BUỘC (phân tích từng mục):
        A. Loại địa điểm/cảnh quan: Ảnh mẫu là gì? (bãi biển, núi, đền, tháp, công viên, phố cổ,...)
           Ảnh người dùng có CÙNG loại địa điểm không? Nếu khác hoàn toàn → is_matched = false, confidence ≤ 20.
        B. Vật thể/kiến trúc đặc trưng: Có cùng công trình, tòa nhà, tượng đài, cảnh quan đặc trưng không?
           Nếu không xuất hiện bất kỳ yếu tố nào giống nhau → is_matched = false, confidence ≤ 30.
        C. Góc chụp/bố cục: Không cần giống hệt, nhưng cảnh nền phải tương tự.
        D. Phát hiện gian lận:
           - Nếu ảnh người dùng là ảnh chụp lại MÀN HÌNH (thấy viền màn hình, phản chiếu, đường kẻ pixel) → anti_cheat_passed = false.
           - Nếu ảnh có watermark ảnh stock (Getty, Shutterstock, Unsplash logo,...) → anti_cheat_passed = false.
           - Nếu ảnh là đồ họa máy tính, ảnh vẽ, AI-generated rõ ràng → anti_cheat_passed = false.

        QUY TẮC ĐIỂM CONFIDENCE (0.0 - 100.0):
        - 85-100: Rất khớp, cùng địa điểm, cùng vật thể đặc trưng, chụp thực tế.
        - 60-84: Khá khớp, cùng loại địa điểm, một số yếu tố tương đồng.
        - 30-59: Khớp một phần, cùng khu vực nhưng khác góc/thời điểm nhiều.
        - 0-29: Không khớp, địa điểm hoàn toàn khác hoặc gian lận.

        is_matched = true CHỈ KHI confidence_score >= 60 VÀ anti_cheat_passed = true.
        TUYỆT ĐỐI không đặt is_matched = true nếu ảnh rõ ràng là cảnh quan khác nhau.

        Trả về MỘT chuỗi JSON duy nhất, KHÔNG có markdown, TUYỆT ĐỐI KHÔNG dùng dấu ngoặc kép " bên trong giá trị của trường 'reason' (nếu cần hãy dùng dấu ngoặc đơn '):
        {"is_matched": true/false, "confidence_score": <số thực 0.0-100.0>, "anti_cheat_passed": true/false, "reason": "<Giải thích 1-2 câu bằng tiếng Việt nêu rõ điểm khớp hoặc lý do thất bại>"}
        """

        # ── 4. Gọi Gemini qua GeminiPhotoService (key rotation + rate limit) ─
        raw_text = await photo_svc.generate_text(
            prompt=prompt,
            image_bytes_list=[ref_image_bytes, user_image_bytes],
        )
        
        # --- LỚP 1: LỌC JSON THÔNG MINH ---
        # Bỏ qua mọi thẻ markdown (```json), giải thích dư thừa của AI. 
        # Chỉ lấy từ dấu { đầu tiên đến dấu } cuối cùng.
        start_idx = raw_text.find('{')
        end_idx = raw_text.rfind('}')
        
        if start_idx != -1 and end_idx != -1:
            clean_text = raw_text[start_idx:end_idx+1]
        else:
            clean_text = raw_text # Fallback nếu không thấy ngoặc
            
        # --- LỚP 2: BẮT LỖI PARSE ĐỂ KHÔNG SẬP APP ---
        try:
            clean_text = repair_json_reason(clean_text)
            result = json.loads(clean_text)
        except json.JSONDecodeError as e:
            logger.error("[Verification] Lỗi parse JSON từ Gemini: %s", e)
            logger.error(">>> RAW TEXT TỪ GEMINI:\n%s\n<<<", raw_text)
            
            # --- LỚP 3: DỮ LIỆU BẢO HIỂM ---
            # Trả về kết quả an toàn thay vì crash màn hình đỏ
            result = {
                "is_matched": False,
                "confidence_score": 0.0,
                "anti_cheat_passed": False,
                "reason": "AI đang bận xử lý định dạng. Vui lòng chụp lại ảnh rõ nét hơn và thử lại!"
            }

        # Safety guard: enforce consistency between is_matched and confidence_score
        MIN_CONFIDENCE_THRESHOLD = 60.0
        score = float(result.get("confidence_score", 0.0))
        anti_cheat = bool(result.get("anti_cheat_passed", False))

        if score < MIN_CONFIDENCE_THRESHOLD or not anti_cheat:
            result["is_matched"] = False
        else:
            result["is_matched"] = True

        return result
        
    except GeminiError as exc:
        logger.warning("[Verification] Gemini thất bại: %s. Fallback sang CLIP.", exc)
        if HAS_CLIP:
            return await _run_clip_async(user_image_bytes, reference_image_url)
        return {
            "is_matched": False,
            "confidence_score": 0.0,
            "anti_cheat_passed": False,
            "reason": f"Dịch vụ AI đang bận, vui lòng thử lại sau: {exc}",
        }
    except Exception as exc:
        logger.exception("[Verification] Lỗi không xác định: %s", exc)
        if HAS_CLIP:
            return await _run_clip_async(user_image_bytes, reference_image_url)
        return {
            "is_matched": False,
            "confidence_score": 0.0,
            "anti_cheat_passed": False,
            "reason": f"Lỗi trong quá trình xác thực AI: {exc}",
        }

async def _run_clip_async(user_image_bytes: bytes, reference_image_url: str) -> dict:
    """Async wrapper for sync CLIP verification."""
    return verify_image_with_clip(user_image_bytes, reference_image_url)

def _extract_clip_features(inputs: dict) -> 'torch.Tensor':
    """Extract normalized image features from CLIP model output."""
    result = clip_model.get_image_features(pixel_values=inputs['pixel_values'])
    # CLIPModel.get_image_features may return BaseModelOutputWithPooling
    # We need the pooler_output (the CLS token embedding after projection)
    if isinstance(result, torch.Tensor):
        features = result
    elif hasattr(result, 'pooler_output') and result.pooler_output is not None:
        features = result.pooler_output
    elif hasattr(result, 'last_hidden_state'):
        # Use mean pooling of last hidden state as fallback
        features = result.last_hidden_state.mean(dim=1)
    else:
        features = result[0]
    
    # Flatten to [1, D] if needed
    if features.dim() > 2:
        features = features.mean(dim=1)
    return features

def verify_image_with_clip(user_image_bytes: bytes, reference_image_url: str, threshold: float = 0.75) -> dict:
    """
    Offline local similarity using CLIP transformer. Computes cosine similarity.
    Threshold: 0.75 means 75% cosine similarity required to pass.
    """
    if not HAS_CLIP:
        return {
            "is_matched": False,
            "confidence_score": 0.0,
            "anti_cheat_passed": False,
            "reason": "Chưa cài đặt thư viện CLIP. Hình ảnh bị từ chối."
        }
        
    try:
        # 1. Fetch reference image
        resp = httpx.get(reference_image_url, timeout=15)
        ref_image = Image.open(io.BytesIO(resp.content)).convert('RGB')
        
        # 2. Load user image
        user_image = Image.open(io.BytesIO(user_image_bytes)).convert('RGB')
        
        # 3. Encode embeddings separately to avoid batching size mismatch
        inputs1 = clip_processor(images=ref_image, return_tensors="pt")
        inputs2 = clip_processor(images=user_image, return_tensors="pt")
        
        with torch.no_grad():
            feat1 = _extract_clip_features(inputs1)
            feat2 = _extract_clip_features(inputs2)
            
            # Normalize embeddings
            feat1 = feat1 / feat1.norm(dim=-1, keepdim=True)
            feat2 = feat2 / feat2.norm(dim=-1, keepdim=True)
        
        # 4. Compute cosine similarity (dot product of normalized vectors)
        similarity = (feat1 * feat2).sum(dim=-1).item()
        confidence = round(max(0.0, similarity) * 100, 2)
        
        passed = similarity >= threshold
        return {
            "is_matched": passed,
            "confidence_score": confidence,
            "anti_cheat_passed": True,
            "reason": (
                f"Độ tương đồng hình ảnh CLIP đạt {confidence}% (Ngưỡng yêu cầu: {threshold*100}%). "
                f"{'Ảnh khớp với địa điểm!' if passed else 'Ảnh không khớp với ảnh mẫu địa điểm.'}"
            )
        }
    except Exception as e:
        return {
            "is_matched": False,
            "confidence_score": 0.0,
            "anti_cheat_passed": False,
            "reason": f"Lỗi phân tích hình ảnh cục bộ: {str(e)}"
        }
