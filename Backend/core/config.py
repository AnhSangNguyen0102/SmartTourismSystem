# ============================================================
# core/config.py  –  Centralized application configuration
# Reads from .env via pydantic-settings and exposes a global
# ``settings`` instance used throughout the application.
# ============================================================

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings populated from environment variables / .env file.

    Key behaviour:
    - ``DATABASE_URL``: port 5432 is **automatically replaced** with 6543
      so the connection goes through Supavisor (connection pooler).
    - ``DB_ECHO``: coerced to ``bool``.
    - ``ACCESS_TOKEN_EXPIRE_MINUTES``: coerced to ``int``.
    """

    # --- Database -----------------------------------------------------------
    # --- Database -----------------------------------------------------------
    DATABASE_URL: str = "postgresql://user:password@localhost:6543/postgres"
    DB_ECHO: bool = False

    # --- Runtime / HTTP -----------------------------------------------------
    ENVIRONMENT: str = "development"
    REQUIRE_HTTPS: bool = False
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 120
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    RATE_LIMIT_EXEMPT_PATHS: str = "/health"
    CORS_ORIGINS: str = (
        "http://localhost:3000,"
        "http://localhost:3001,"
        "http://127.0.0.1:3000,"
        "http://localhost,"
        "capacitor://localhost"
    )
    TRUSTED_HOSTS: str = "localhost,127.0.0.1,0.0.0.0"

    # --- Auth / JWT ---------------------------------------------------------
    SECRET_KEY: str = "YOUR_SUPER_SECRET_KEY_HERE"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    SUPABASE_URL: str = "https://huyalfizralenyrzkpbv.supabase.co"

    # --- SMTP / Email settings -----------------------------------------------
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_SENDER: str = "noreply@smarttourism.com"

    # --- Pydantic-settings config -------------------------------------------
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",          # silently ignore env vars not declared here
    )

    # --- Validators ---------------------------------------------------------
    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def swap_port_to_supavisor(cls, v: str) -> str:
        """
        Supabase pooler (Supavisor) listens on port **6543**.
        If the URL still contains the default Postgres port (5432),
        swap it automatically so developers don't have to remember.
        """
        if ":5432" in v:
            v = v.replace(":5432", ":6543")
        return v

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.ENVIRONMENT.lower() == "production":
            if self.SECRET_KEY == "YOUR_SUPER_SECRET_KEY_HERE" or len(self.SECRET_KEY) < 32:
                raise ValueError("Production requires a strong SECRET_KEY from environment variables.")
            if "user:password@localhost" in self.DATABASE_URL or "postgres:password@localhost" in self.DATABASE_URL:
                raise ValueError("Production requires DATABASE_URL from environment variables.")
            if not self.REQUIRE_HTTPS:
                raise ValueError("Production requires REQUIRE_HTTPS=true to protect data in transit.")
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def trusted_hosts_list(self) -> list[str]:
        return [host.strip() for host in self.TRUSTED_HOSTS.split(",") if host.strip()]

    @property
    def rate_limit_exempt_paths_list(self) -> list[str]:
        return [path.strip() for path in self.RATE_LIMIT_EXEMPT_PATHS.split(",") if path.strip()]


# ---------------------------------------------------------------------------
# Global singleton – import this everywhere:
#   from core.config import settings
# ---------------------------------------------------------------------------
settings = Settings()
