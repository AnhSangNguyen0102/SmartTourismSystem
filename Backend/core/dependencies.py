from fastapi import Depends, HTTPException, status
from core.security import verify_token
from models import UserRole

def require_roles(allowed_roles: list[UserRole]):
    """
    Dependency kiểm tra role của user từ JWT Token.
    """
    def role_checker(current_user: dict = Depends(verify_token)):
        # Giả sử trong JWT Token bạn mã hóa role vào key "role"
        user_role = current_user.get("role")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập vào tài nguyên này."
            )
        return current_user
    return role_checker

# Tạo sẵn các alias để tái sử dụng trong Router
require_admin = require_roles([UserRole.ADMIN])
require_enterprise = require_roles([UserRole.ENTERPRISE, UserRole.ADMIN])