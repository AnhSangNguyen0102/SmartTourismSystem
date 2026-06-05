"""
main.py - FastAPI application entrypoint
Backend: FastAPI | Database: Supabase (PostgreSQL) | ORM: SQLModel
"""

import sys
# Reconfigure stdout to use UTF-8 on Windows
sys.stdout.reconfigure(encoding='utf-8')
import asyncio

from contextlib import asynccontextmanager
from time import monotonic
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, HTTPException
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import JSONResponse, RedirectResponse

from core.config import settings
from database import create_db_and_tables


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(self), camera=(self)")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if settings.ENVIRONMENT.lower() == "production":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


class EnforceHTTPSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if settings.ENVIRONMENT.lower() == "production" and settings.REQUIRE_HTTPS:
            forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
            is_https = request.url.scheme == "https" or forwarded_proto == "https"
            if not is_https:
                https_url = request.url.replace(scheme="https")
                return RedirectResponse(str(https_url), status_code=307)
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.requests: dict[str, list[float]] = {}

    def _client_ip(self, request) -> str:
        # Cloudflare sends the real client IP in this header.
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            return cf_ip.strip()

        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()

        return request.client.host if request.client else "unknown"

    async def dispatch(self, request, call_next):
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        if request.url.path in settings.rate_limit_exempt_paths_list:
            return await call_next(request)

        now = monotonic()
        window_start = now - settings.RATE_LIMIT_WINDOW_SECONDS
        client_ip = self._client_ip(request)
        bucket_key = f"{client_ip}:{request.url.path}"

        timestamps = [ts for ts in self.requests.get(bucket_key, []) if ts >= window_start]
        if len(timestamps) >= settings.RATE_LIMIT_REQUESTS:
            retry_after = max(1, int(settings.RATE_LIMIT_WINDOW_SECONDS - (now - timestamps[0])))
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."},
                headers={"Retry-After": str(retry_after)},
            )

        timestamps.append(now)
        self.requests[bucket_key] = timestamps
        return await call_next(request)


# ============================================================
# Lifespan: startup / shutdown events
# ============================================================

async def auto_cancel_expired_trips_worker():
    """Background task to cancel expired trips every 10 minutes."""
    while True:
        try:
            from sqlmodel import Session
            from database import engine
            from crud.crud_itinerary import auto_cancel_expired_trips
            with Session(engine) as session:
                cancelled = auto_cancel_expired_trips(session)
                if cancelled:
                    print(f"[Worker] Da tu dong huy {len(cancelled)} chuyen di het han.")
        except Exception as e:
            print(f"[Worker] Loi khi tu dong huy chuyen di het han: {e}")
        # Sleep for 10 minutes (600 seconds)
        await asyncio.sleep(600)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks before accepting requests."""
    # Khởi chạy background worker tự động hủy chuyến đi hết hạn
    worker_task = asyncio.create_task(auto_cancel_expired_trips_worker())
    
    try:
        print("Dang kiem tra ket noi Database...")
        create_db_and_tables()
        print("Ket noi Database va khoi tao bang thanh cong!")
        
        # Tự động seed dữ liệu thành tựu mặc định
        from sqlmodel import Session
        from database import engine
        from api.achievements import seed_default_achievements
        from api.gamification_seeding import seed_default_gamification_shop
        with Session(engine) as session:
            seed_default_achievements(session)
            seed_default_gamification_shop(session)
        print("Khoi tao du lieu thanh tuu va shop gamification thanh cong!")
    except Exception as e:
        if settings.ENVIRONMENT.lower() == "development":
            print(f"LOI KET NOI DATABASE: {str(e)}")
        else:
            print(f"LOI KET NOI DATABASE: {type(e).__name__}")
        print("Canh bao: Server van chay nhung cac chuc nang lien quan den DB se loi.")
    
    yield
    
    # Hủy background task khi tắt server
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


# ============================================================
# App instance
# ============================================================

app = FastAPI(
    title="Du Lịch Thông Minh Việt Nam",
    description="Smart Travel Platform API",
    version="1.0.0",
    lifespan=lifespan,
)

if settings.ENVIRONMENT.lower() == "production":
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts_list)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(EnforceHTTPSMiddleware)
app.add_middleware(RateLimitMiddleware)

# ============================================================
# CORS Middleware
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# Routers (add your feature routers here)
# ============================================================

# Example:
# from routers import users, locations, itineraries
# app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
# app.include_router(locations.router, prefix="/api/v1/locations", tags=["Locations"])
# app.include_router(itineraries.router, prefix="/api/v1/itineraries", tags=["Itineraries"])

from routers import auth, enterprise, location_router, gamification, task_router, social_quest, hidden_quest, enterprise_event, explore, community, admin, voucher
from api import planning, locations, trips, reference, leaderboard, achievements

app.include_router(auth.router, prefix="/api/auth")
app.include_router(enterprise.router, prefix="/api")
app.include_router(location_router.router, prefix="/api/v1")
app.include_router(gamification.router)
app.include_router(task_router.router, prefix="/api/v1")
app.include_router(social_quest.router)
app.include_router(planning.router)
app.include_router(locations.router)
app.include_router(trips.router)
app.include_router(reference.router)
app.include_router(leaderboard.router)
app.include_router(achievements.router)
app.include_router(hidden_quest.router)
app.include_router(enterprise_event.router)
app.include_router(voucher.router, prefix="/api")

# Đăng ký các routers mới cho Admin, Social Feed & Chat, Proxy Maps
app.include_router(explore.router)
app.include_router(community.router)
app.include_router(admin.router)


# ============================================================
# Health check
# ============================================================

@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "message": "Du Lịch Thông Minh Việt Nam API is running"}


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy"}

# Code thêm vào để test tính năng module data
# pyrefly: ignore [missing-import]
from fastapi import Depends
# pyrefly: ignore [missing-import]
from sqlmodel import Session
from database import get_session
from crud.crud_user import create_user
from schemas import UserCreate

@app.post("/test-create-user", tags=["Test"])
def test_db(user: UserCreate, db: Session = Depends(get_session)):
    if settings.ENVIRONMENT.lower() != "development":
        raise HTTPException(status_code=404, detail="Not found")
    return create_user(
        db=db,
        full_name=user.full_name,
        email=user.email,
        password=user.password
    )
# ============================================================
# Run locally: uvicorn main:app --reload
# ============================================================
