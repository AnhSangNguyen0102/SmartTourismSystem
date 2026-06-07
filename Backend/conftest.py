"""Global pytest safety guard for every backend test invocation."""

import os


TEST_DATABASE_URL = "sqlite:///:memory:"

# Set these before pytest imports any backend module or legacy test script.
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test_secret_key_12345678901234567890_test_key"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["DB_ECHO"] = "false"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["REDIS_URL"] = "redis://127.0.0.1:1/15"
