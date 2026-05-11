"""
seed_image_pools.py
===================
Run once at Railway deployment to pre-populate the ImageGeneration table
with S3-hosted LoremFlickr images for every eligible library song.

Usage (standalone):
    python seed_image_pools.py

Usage (in Railway start command):
    python seed_image_pools.py && uvicorn main:app --host 0.0.0.0 --port $PORT

Environment variables respected (via config.py / .env):
    EXTERNAL_IMAGE_GENERATION_ENABLED  – must be "true" or "1"
    IMAGE_POOL_DEFAULT_SIZE            – images per song (default 30)
    IMAGE_POOL_MAX_TOTAL_BYTES         – global S3 byte cap
    DATABASE_URL / DB_* vars           – connection used by database.py
    IMAGE_POOL_S3_BUCKET               – target S3 bucket
"""

import sys
import os
import time
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [seed] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("seed_image_pools")


def _env_flag(name: str, default: bool = False) -> bool:
    """Read a boolean environment variable."""
    val = os.environ.get(name, "").strip().lower()
    if val in ("1", "true", "yes", "on"):
        return True
    if val in ("0", "false", "no", "off"):
        return False
    return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def wait_for_db(max_attempts: int = 10, delay_secs: float = 3.0) -> bool:
    """
    Poll the DB connection until it succeeds or attempts are exhausted.
    Railway can start the app container before the managed MySQL instance
    is fully ready, so a brief retry loop prevents seed failures on cold boot.
    """
    from database import get_db_connection  # noqa: import inside fn to avoid early init

    for attempt in range(1, max_attempts + 1):
        try:
            with get_db_connection() as conn:
                if conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1")
                        cur.fetchone()
            log.info("Database ready (attempt %d/%d).", attempt, max_attempts)
            return True
        except Exception as exc:
            log.warning(
                "DB not ready yet (attempt %d/%d): %s — retrying in %.0fs …",
                attempt, max_attempts, exc, delay_secs,
            )
            time.sleep(delay_secs)

    log.error("Database did not become ready after %d attempts. Aborting seed.", max_attempts)
    return False


def run_seed(pool_size: int) -> dict:
    """
    Import and call precompute_all_song_image_pools from the route module.
    Importing here (not at module level) lets the seed script start without
    crashing when optional heavy deps (cv2, librosa) aren't installed yet.
    """
    from routes.image_generation import precompute_all_song_image_pools  # noqa

    log.info("Starting image pool seed (pool_size=%d) …", pool_size)
    result = precompute_all_song_image_pools(pool_size=pool_size)
    return result


def main() -> int:
    # ------------------------------------------------------------------ #
    # 1. Guard: skip entirely when external generation is disabled         #
    # ------------------------------------------------------------------ #
    if not _env_flag("EXTERNAL_IMAGE_GENERATION_ENABLED", default=False):
        log.info(
            "EXTERNAL_IMAGE_GENERATION_ENABLED is not set/true — skipping image seed."
        )
        return 0

    # ------------------------------------------------------------------ #
    # 2. Guard: skip when S3 bucket is not configured                      #
    # ------------------------------------------------------------------ #
    if not os.environ.get("IMAGE_POOL_S3_BUCKET", "").strip():
        log.warning("IMAGE_POOL_S3_BUCKET is not set — skipping image seed (no S3 target).")
        return 0

    pool_size = _env_int("IMAGE_POOL_DEFAULT_SIZE", default=30)
    log.info("Pool size from env: %d images/song.", pool_size)

    # ------------------------------------------------------------------ #
    # 3. Wait for DB to be ready (handles Railway cold-start race)         #
    # ------------------------------------------------------------------ #
    if not wait_for_db(max_attempts=10, delay_secs=3.0):
        return 1  # non-zero exit aborts the Railway deployment

    # ------------------------------------------------------------------ #
    # 4. Run the precompute job                                            #
    # ------------------------------------------------------------------ #
    try:
        summary = run_seed(pool_size)
    except Exception as exc:
        log.exception("Image pool seed raised an unhandled exception: %s", exc)
        return 1

    # ------------------------------------------------------------------ #
    # 5. Log the summary returned by precompute_all_song_image_pools()    #
    # ------------------------------------------------------------------ #
    status = summary.get("status", "unknown")
    songs = summary.get("songs", 0)
    inserted = summary.get("inserted", 0)
    skipped = summary.get("skipped", 0)
    underfilled = summary.get("underfilled_songs", 0)
    elapsed = summary.get("elapsed_seconds", 0.0)
    s3_bytes = summary.get("s3_total_bytes", 0)

    log.info(
        "Seed complete — status=%s | songs=%d | inserted=%d | skipped=%d | "
        "underfilled=%d | s3_bytes=%d | elapsed=%.1fs",
        status, songs, inserted, skipped, underfilled, s3_bytes, elapsed,
    )

    if status not in ("ok", "external_generation_disabled", "budget_cap_reached"):
        log.error("Seed ended with non-ok status: %s", status)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
