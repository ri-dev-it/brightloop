"""Central configuration. Everything is overridable through environment variables."""
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Config:
    BASE = BASE
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me-in-production")
    DATABASE = os.environ.get("DATABASE", os.path.join(BASE, "data", "brightloop.db"))
    TOKEN_MAX_AGE = int(os.environ.get("TOKEN_MAX_AGE", 60 * 60 * 12))   # 12h sessions
    RESET_MAX_AGE = int(os.environ.get("RESET_MAX_AGE", 60 * 60))        # 1h reset links
    FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5000")
    CORS_ORIGINS = tuple(origin.strip() for origin in os.environ.get(
        "CORS_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500"
    ).split(",") if origin.strip())
    SEED_DEMO = os.environ.get("SEED_DEMO", "1") == "1"
    # Mail: "console" (default, writes data/outbox.log) or "smtp"
    MAIL_MODE = os.environ.get("MAIL_MODE", "console")
    MAIL_FROM = os.environ.get("MAIL_FROM", "billing@brightloop.example")
    SMTP_HOST = os.environ.get("SMTP_HOST", "")
    SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
    SMTP_USER = os.environ.get("SMTP_USER", "")
    SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
