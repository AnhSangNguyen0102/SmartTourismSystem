# Bao cao bao mat du lieu

Ngay thuc hien: 2026-05-26

## Ket luan ngan

Repo da duoc gia co cac diem rui ro cao nhat ve cau hinh, xac thuc, phan quyen va thao tac du lieu theo `user_id`. Sau cac thay doi nay, he thong an toan hon cho moi truong staging/production, nhung van can bo sung email/SMS provider, secure storage/cookie va audit/rate limit tap trung neu trien khai that.

## Da sua trong code

### 1. Khoa cau hinh production nguy hiem

File: `Backend/core/config.py`

- Them `ENVIRONMENT` de phan biet development/production.
- Them `CORS_ORIGINS` de cau hinh danh sach frontend domain bang bien moi truong.
- Production se bi chan khoi dong neu van dung `SECRET_KEY` mac dinh hoac `DATABASE_URL` local mac dinh.
- Production se bi chan khoi dong neu khong bat `REQUIRE_HTTPS=true`.
- Them parser `cors_origins_list` de backend khong can hard-code CORS trong `main.py`.

### 2. Dong CORS mo toan bo domain

File: `Backend/main.py`

- Go bo `allow_origin_regex=".*"`.
- CORS chi chap nhan cac origin nam trong `settings.CORS_ORIGINS`.

Ly do: CORS mo toan bo domain lam website la co the goi API cua he thong, dac biet nguy hiem khi co token/cookie.

### 3. Khoa endpoint test tao user o production

File: `Backend/main.py`

- Endpoint `/test-create-user` chi con hoat dong khi `ENVIRONMENT=development`.
- Neu chay production, endpoint tra `404`.

### 4. Khong cho frontend tu chon role khi dang ky

File: `Backend/routers/auth.py`

- API `/api/auth/register` bo qua `role` do client gui len.
- User moi luon duoc tao voi `UserRole.USER`.

Ly do: Client khong duoc quyen tu gui `ADMIN` hoac `ENTERPRISE` khi tao tai khoan.

### 5. Hash refresh token truoc khi luu DB

File: `Backend/routers/auth.py`

- Login thuong da chuyen sang dung `crud_user.create_user_session`, ham nay hash refresh token truoc khi luu.
- Access token luu `role` dang string ro rang.
- Google login cung thong nhat `sub` la `user_id`, khong con dung email lam subject token.

Ly do: Neu database bi lo, refresh token plaintext co the bi dung de chiem phien dang nhap.

### 6. Sua logout refresh token

File: `Backend/routers/auth.py`

- Logout giai ma refresh token de lay `user_id`.
- Chi revoke session cua dung user.
- Token loi/het han/khong hop le tra `401`.

### 7. Them rate limit co ban cho auth

File: `Backend/routers/auth.py`

- Login: 5 lan / 5 phut / email.
- Forgot password: 3 lan / 15 phut / email.
- Reset password: 5 lan / 15 phut / email.

Day la rate limit in-memory, phu hop local/staging. Production nen chuyen sang Redis.

### 8. Khong in OTP ra terminal

File: `Backend/routers/auth.py`

- Bo viec ghi OTP ra log/terminal.
- Forgot password tra message chung de tranh user enumeration.
- OTP duoc sinh bang `secrets` thay vi `random`.

Luu y: Can cau hinh email/SMS provider that de gui OTP. Hien code da tranh lo OTP nhung chua co kenh gui that.

### 9. Bo co che admin hard-code tu nang quyen

File: `Backend/routers/admin.py`

- Go bo fallback theo email hard-code.
- Admin phai ton tai trong database va co role hop le.

Ly do: Co che tu cap admin theo email hard-code la cua hau trong production.

### 10. Khoa thao tac gamification theo user khac

File: `Backend/routers/gamification.py`

- Them xac thuc JWT cho cac API gamification nhay cam.
- Neu request co `user_id` khac voi `sub` trong token thi tra `403`.
- Ap dung cho claim newbie gift, daily attendance, nearby treasures, claim treasure, task list, start/cancel task va submit photo.

Ly do: Truoc do client co the gui UUID cua user khac de doc/sua du lieu gamification.

### 11. Giam ro ri token tren mobile

File: `Frontend/src/platform/storage.js`

- Tren native app, token luu trong Capacitor Preferences khong con bi dong bo nguoc vao `localStorage`.

Luu y: Web van dang dung `localStorage`. Production web nen chuyen sang HttpOnly Secure SameSite cookie.

### 12. Bat HTTPS va security headers cho du lieu gui qua internet

File: `Backend/main.py`, `Backend/core/config.py`

- Them middleware bat HTTPS redirect trong production khi `REQUIRE_HTTPS=true`.
- Them HSTS cho production.
- Them cac security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- Them `TRUSTED_HOSTS` de gioi han host hop le trong production.

Luu y: HTTPS can duoc cau hinh tren reverse proxy/cloud hosting bang TLS certificate that. Middleware chi bao ve phan ung dung va yeu cau proxy gui dung `X-Forwarded-Proto`.

### 13. Khoa API public internet khong dung HTTPS o frontend

File: `Frontend/src/config/api.js`

- Chan `REACT_APP_API_URL` public bat dau bang `http://`.
- Van cho phep `localhost` va IP private nhu `192.168.x.x` de test LAN/mobile noi bo.

### 14. Gia co GPS/check-in

File: `Backend/api/trips.py`, `Backend/routers/hidden_quest.py`

- Bo bypass demo cho check-in GPS.
- Check-in chi thanh cong khi toa do nam trong ban kinh hop le cua tram.
- Validate latitude/longitude nam trong mien hop le.
- Tracking GPS van kiem tra itinerary thuoc user truoc khi ghi log.
- Hidden quest validate toa do truoc khi spawn/claim/verify.

Luu y: GPS tu client van co the bi fake bang fake GPS hoac API tool. De chong gian lan manh hon can them accuracy, timestamp, toc do di chuyen bat thuong, device attestation va/hoac server-side risk scoring.

### 15. Khoa debug endpoint va giam log nhay cam

File: `Backend/routers/hidden_quest.py`, `Backend/api/trips.py`, `Backend/api/profile.py`, `Backend/services/ai_verification.py`

- `/api/v1/hidden/debug-spawn` chi mo trong development hoac admin.
- Bo log debug in user/email trong hidden quest.
- Bo log route chi tiet/ten dia diem trong production.
- Khong echo profile payload ve response demo.
- Khong in raw text AI khi parse loi.

### 16. Chong request flood / DDoS o tang ung dung

File: `Backend/main.py`, `Backend/core/config.py`

- Them `RateLimitMiddleware` cho FastAPI.
- Mac dinh moi IP chi duoc goi cung mot path `120` request trong `60` giay.
- Khi vuot nguong, API tra `429 Too Many Requests` kem header `Retry-After`.
- Middleware doc IP that tu `CF-Connecting-IP` khi backend chay sau Cloudflare, fallback sang `X-Forwarded-For` hoac socket client IP.
- Co the cau hinh bang `.env`:

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=120
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_EXEMPT_PATHS=/health
```

Da test local voi `RATE_LIMIT_REQUESTS=2`: 2 request dau tra `200`, request thu 3 va 4 tra `429`.

Luu y: day la rate limit in-memory, phu hop mot process/server. Production nhieu instance nen chuyen bucket sang Redis de dong bo rate limit.

### 17. Khuyen nghi cau hinh Cloudflare

Can thuc hien tren Cloudflare dashboard vi can domain/account:

1. Tro DNS domain API ve server backend va bat proxy mau cam.
2. SSL/TLS mode: `Full (strict)`.
3. Bat `Always Use HTTPS`.
4. Bat `HTTP Strict Transport Security (HSTS)` sau khi chac chan HTTPS hoat dong dung.
5. Security level: `Medium` hoac `High`.
6. Tao WAF rate limit rule cho API:

```text
If URI Path starts with /api/
Then block/challenge when requests exceed 120 per minute per IP
```

7. Tao rule nghiem hon cho auth:

```text
If URI Path starts with /api/auth/login
Then block/challenge when requests exceed 10 per minute per IP
```

8. Bat Bot Fight Mode hoac Super Bot Fight Mode neu goi Cloudflare ho tro.
9. Neu co the, firewall backend chi cho phep inbound tu Cloudflare IP ranges va SSH IP cua ban. Khi do attacker khong bypass duoc Cloudflare de goi thang server.

## Viec da kiem tra

- Da chay kiem tra cu phap:

```bash
python3 -m py_compile Backend/core/config.py Backend/main.py Backend/routers/auth.py Backend/routers/admin.py Backend/routers/gamification.py
```

Ket qua: khong co loi cu phap.

## Can lam tiep neu deploy production

1. Tao `.env` rieng cho backend voi:
   - `ENVIRONMENT=production`
   - `SECRET_KEY` dai, ngau nhien, toi thieu 32 ky tu
   - `DATABASE_URL` that
   - `CORS_ORIGINS=https://domain-frontend-that`
   - `TRUSTED_HOSTS=domain-api-that`
   - `REQUIRE_HTTPS=true`
   - `RATE_LIMIT_ENABLED=true`
   - `RATE_LIMIT_REQUESTS=120`
   - `RATE_LIMIT_WINDOW_SECONDS=60`
   - `GOOGLE_API_KEY`, `GEMINI_API_KEY` neu dung

2. Dat backend sau HTTPS reverse proxy/cloud hosting co TLS certificate hop le.

3. Dat backend sau Cloudflare va gioi han firewall chi nhan traffic tu Cloudflare IP ranges.

4. Them email/SMS provider cho forgot password. Hien OTP khong con bi lo log, nhung can kenh gui that.

5. Chuyen rate limit in-memory sang Redis de dung duoc khi chay nhieu process/server.

6. Chuyen token web sang HttpOnly Secure SameSite cookie thay vi `localStorage`.

7. Bo sung chong fake GPS nang cao: accuracy, timestamp, speed anomaly, device attestation va gioi han tan suat GPS.

8. Kiem tra ownership cho tat ca API con lai, dac biet message, profile, location submission.

9. Them audit log cho admin action: update role, approve/reject enterprise, reset rank, grant point.

10. Chay dependency audit:

```bash
pip-audit
npm audit
```

## Cac file da thay doi

- `Backend/core/config.py`
- `Backend/main.py`
- `Backend/api/trips.py`
- `Backend/api/profile.py`
- `Backend/routers/auth.py`
- `Backend/routers/admin.py`
- `Backend/routers/gamification.py`
- `Backend/routers/hidden_quest.py`
- `Backend/services/ai_verification.py`
- `Frontend/src/config/api.js`
- `Frontend/src/platform/storage.js`
