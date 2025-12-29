import os
from pathlib import Path

# Base directory (assuming running from repository root)
BASE_DIR = Path(os.getcwd())

# Persistent storage paths
CACHE_DIR = BASE_DIR / ".cache"
SESSION_DIR = BASE_DIR / ".dataroma-screener-sessions"
SETTINGS_FILE = BASE_DIR / ".config" / "settings.json"

# Server configuration
API_PORT = int(os.environ.get("DATAROMA_SCREENER_API_PORT", 8787))

# Legacy defaults
DEFAULT_PROVIDER_ID = "eodhd"
