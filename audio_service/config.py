# audio_service/config.py
import os
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor
# EXECUTION ORDER: Independent. Import first to ensure environment variables are loaded.

# Load environment variables
load_dotenv()

# EXECUTION ORDER: Run on module import.
# Thread pool for audio analysis
# Keep concurrency modest to avoid OOM in the Docker container
executor = ThreadPoolExecutor(max_workers=4)

# Database configuration
# EXECUTION ORDER: Run on module import.
DB_CONFIG = {
    'host': os.getenv('MYSQL_HOST', os.getenv('DB_HOST', 'host.docker.internal')),
    'port': int(os.getenv('MYSQL_PORT', os.getenv('DB_PORT', '3306'))),
    'user': os.getenv('MYSQL_USER', os.getenv('DB_USER')),
    'password': os.getenv('MYSQL_PASSWORD', os.getenv('MYSQL_ROOT_PASSWORD', os.getenv('DB_PASSWORD'))),
    'database': os.getenv('MYSQL_DATABASE', os.getenv('DB_NAME', 'Game_Store_System')),
    'charset': 'utf8mb4',
    'cursorclass': 'dict', # String here, converted in usage or imported elsewhere if needed
    'connect_timeout': 3,  # Fast timeout to avoid blocking
    'read_timeout': 5,
    'write_timeout': 5
}

# S3 Configuration for presigned URLs
# EXECUTION ORDER: Run on module import.
S3_CONFIG = {
    'bucket_name': os.getenv('AWS_S3_BUCKET_NAME', 'game-and-music-files'),
    'region': os.getenv('AWS_REGION', 'eu-west-1'),
    'access_key': os.getenv('AWS_ACCESS_KEY_ID'),
    'secret_key': os.getenv('AWS_SECRET_ACCESS_KEY'),
    'url_expiration': 3600  # URLs valid for 1 hour
}

# Generated image hosting (S3-backed)
IMAGE_POOL_S3_BUCKET = os.getenv("IMAGE_POOL_S3_BUCKET", S3_CONFIG['bucket_name'])
IMAGE_POOL_S3_PREFIX = os.getenv("IMAGE_POOL_S3_PREFIX", "generated-images")
IMAGE_POOL_MAX_DOWNLOAD_BYTES = int(os.getenv("IMAGE_POOL_MAX_DOWNLOAD_BYTES", "8000000"))  # 8MB
IMAGE_POOL_DOWNLOAD_TIMEOUT_SECS = float(os.getenv("IMAGE_POOL_DOWNLOAD_TIMEOUT_SECS", "6"))
IMAGE_POOL_DEFAULT_SIZE = int(os.getenv("IMAGE_POOL_DEFAULT_SIZE", "80"))
IMAGE_POOL_MAX_TOTAL_BYTES = int(os.getenv("IMAGE_POOL_MAX_TOTAL_BYTES", "1700000000"))  # 1.7GB generated-images cap (47 songs x 80 images + headroom)
IMAGE_POOL_ESTIMATED_AVG_IMAGE_BYTES = int(os.getenv("IMAGE_POOL_ESTIMATED_AVG_IMAGE_BYTES", "350000"))


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "y", "on"}


EXTERNAL_IMAGE_GENERATION_ENABLED = _env_bool("EXTERNAL_IMAGE_GENERATION_ENABLED", default=True)

# Imported iTunes AudioFeatures retention controls.
# Keep this bounded so historical chart churn does not degrade ML clustering and similarity quality.
# Target composition: 150 top-chart songs + 75 iTunes search songs = 225 imported rows.
# With 47 library rows this yields a 272 total AudioFeatures target pool.
AUDIO_FEATURES_MAX_IMPORTED_ROWS = 225
AUDIO_FEATURES_PRUNE_ENABLED = _env_bool("AUDIO_FEATURES_PRUNE_ENABLED", default=True)

# Keep unavailable iTunes songs in Stock for a short retention window,
# then delete them from Stock/Products/AudioFeatures and related rows.
STOCK_UNAVAILABLE_RETENTION_DAYS = int(os.getenv("STOCK_UNAVAILABLE_RETENTION_DAYS", "14"))

# iTunes API configuration from environment
# EXECUTION ORDER: Run on module import.
ITUNES_API_BASE_URL = os.getenv('ITUNES_API_BASE_URL', 'https://itunes.apple.com')

# Allowed Origins for CORS
# EXECUTION ORDER: Run on module import.
def get_allowed_origins():
    env_origins = os.getenv("ALLOWED_ORIGINS", "")
    if env_origins.strip():
        extra = [o.strip() for o in env_origins.split(",") if o.strip()]
    else:
        extra = []
        
    origins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:3000",
        
        # Production - Vercel
        "https://music-recommendation-store.vercel.app",
        *extra,
    ]

    # Add Codespaces origins if running in Codespaces
    if os.getenv('CODESPACES') == 'true':
        codespace_name = os.getenv('CODESPACE_NAME')
        domain = os.getenv('GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN', 'preview.app.github.dev')
        if codespace_name:
            origins.extend([
                f"https://{codespace_name}-5173.{domain}",
                f"https://{codespace_name}-3000.{domain}"
            ])
    return origins
