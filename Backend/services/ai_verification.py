import os
import json
import httpx
import asyncio
import re
import base64
from PIL import Image
import io

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


async def _call_gemini_rest_api(api_key: str, prompt: str, ref_image_bytes: bytes, user_image_bytes: bytes) -> dict:
    """
    Call Gemini API directly via REST (httpx) instead of the google-generativeai library.
    This avoids v1beta quota issues and gives full control over the API version.
    """
    # Encode images to base64
    ref_b64 = base64.b64encode(ref_image_bytes).decode('utf-8')
    user_b64 = base64.b64encode(user_image_bytes).decode('utf-8')
    
    ref_mime = _get_image_mime_type(ref_image_bytes)
    user_mime = _get_image_mime_type(user_image_bytes)
    
    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": ref_mime, "data": ref_b64}},
                {"inline_data": {"mime_type": user_mime, "data": user_b64}}
            ]
        }],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 1024,
            #"response_mime_type": "application/json"  # <-- BẠN THÊM DÒNG NÀY VÀO ĐÂY
        }
    }
    
    # Try multiple API versions and models
    api_attempts = [
        ("v1", "gemini-2.5-flash"),         # Model tiêu chuẩn hiện hành, tối ưu nhất cho đa phương tiện
        ("v1", "gemini-2.5-flash-lite"),    # Bản siêu tốc độ, phù hợp cho check-in thời gian thực
        ("v1", "gemini-2.5-pro"),           # Bản Pro nếu cần phân tích chi tiết ảnh khắt khe hơn
        ("v1", "gemini-2.0-flash-001")      # Phương án dự phòng (bản 2.0 bắt buộc phải có hậu tố -001)
    ]
    
    last_error = None
    
    async with httpx.AsyncClient(timeout=60) as client:
        for api_version, model_name in api_attempts:
            url = f"https://generativelanguage.googleapis.com/{api_version}/models/{model_name}:generateContent?key={api_key}"
            
            # Retry logic for 429 rate limit errors
            max_retries = 2
            retry_delays = [10, 30]
            
            for attempt in range(max_retries + 1):
                try:
                    resp = await client.post(url, json=payload)
                    
                    if resp.status_code == 200:
                        result = resp.json()
                        # Extract text from response
                        candidates = result.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            if parts:
                                return {"success": True, "text": parts[0].get("text", ""), "model": model_name}
                        return {"success": False, "error": f"Gemini trả về kết quả rỗng (model: {model_name})"}
                    
                    elif resp.status_code == 429:
                        # Rate limited - retry after delay
                        if attempt < max_retries:
                            wait_time = retry_delays[attempt]
                            # Try to extract retry delay from response
                            try:
                                err_text = resp.text
                                match = re.search(r'retry.*?(\d+(?:\.\d+)?)\s*s', err_text, re.IGNORECASE)
                                if match:
                                    wait_time = min(int(float(match.group(1))) + 2, 60)
                            except:
                                pass
                            await asyncio.sleep(wait_time)
                            continue
                        else:
                            last_error = f"429 Rate limit cho model {model_name} (đã thử {max_retries + 1} lần)"
                            break  # Try next model
                    
                    elif resp.status_code == 404:
                        last_error = f"Model {model_name} không tồn tại trên API {api_version}"
                        break  # Try next model immediately
                    
                    else:
                        # Other error
                        try:
                            err_detail = resp.json().get("error", {}).get("message", resp.text[:200])
                        except:
                            err_detail = resp.text[:200]
                        last_error = f"HTTP {resp.status_code} từ {model_name}: {err_detail}"
                        break  # Try next model
                        
                except httpx.TimeoutException:
                    last_error = f"Timeout khi gọi {model_name}"
                    break
                except Exception as e:
                    last_error = f"Lỗi kết nối {model_name}: {str(e)}"
                    break
    
    return {"success": False, "error": last_error or "Tất cả model Gemini đều thất bại"}


async def verify_image_with_gemini(user_image_bytes: bytes, reference_image_url: str) -> dict:
    """
    Multimodal verification using Google's Gemini API via direct REST call.
    Compares the user's submitted image with the official reference image.
    Detects landmarks and guards against screen-shots or fake images.
    Falls back to CLIP if Gemini is unavailable.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    
    if not api_key:
        # If no Gemini Key is provided, fallback to CLIP locally
        if HAS_CLIP:
            return await _run_clip_async(user_image_bytes, reference_image_url)
        return {
            "is_matched": False,
            "confidence_score": 0.0,
            "anti_cheat_passed": False,
            "reason": "Chưa cấu hình GEMINI_API_KEY. Hình ảnh bị từ chối."
        }

    try:
        # 1. Fetch reference image
        async with httpx.AsyncClient(follow_redirects=True, verify=False) as client:
            client.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
            resp = await client.get(reference_image_url, timeout=15)
            if resp.status_code != 200:
                raise Exception(f"Không thể tải ảnh mẫu của địa điểm từ storage. Status: {resp.status_code}")
            ref_image_bytes = resp.content

        # 2. Build the prompt
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

        Trả về MỘT chuỗi JSON duy nhất, KHÔNG có markdown:
        {"is_matched": true/false, "confidence_score": <số thực 0.0-100.0>, "anti_cheat_passed": true/false, "reason": "<Giải thích 1-2 câu bằng tiếng Việt nêu rõ điểm khớp hoặc lý do thất bại>"}
        """

        # 3. Call Gemini REST API directly (bypasses google-generativeai library v1beta issues)
        gemini_result = await _call_gemini_rest_api(api_key, prompt, ref_image_bytes, user_image_bytes)
        
        with open("gemini_debug.txt", "w", encoding="utf-8") as f:
            f.write(str(gemini_result))

        if not gemini_result["success"]:
            raise Exception(gemini_result.get("error", "Unknown error"))
        
        raw_text = gemini_result["text"].strip()
        
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
            result = json.loads(clean_text)
        except json.JSONDecodeError as e:
            print(f"⚠️ [CẢNH BÁO] Lỗi Parse JSON từ Gemini: {str(e)}")
            print(f"Chuỗi AI trả về bị lỗi: {raw_text}")
            
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
        
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        # Fallback to local CLIP if available
        if HAS_CLIP:
            return await _run_clip_async(user_image_bytes, reference_image_url)
        return {
            "is_matched": False,
            "confidence_score": 0.0,
            "anti_cheat_passed": False,
            "reason": f"Lỗi trong quá trình xác thực AI: {error_msg}"
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
