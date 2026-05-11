"""
Database helpers for image generation routes.

This module contains SQL-focused helper functions so route/controller logic can
stay shorter and easier to read.

Design notes:
- Functions in this file only do database reads/writes and row shaping.
- Business rules (scheduling, moderation, fallback decisions) stay in route
    orchestration modules.
- Returning primitive values and plain dicts keeps call-sites predictable.
"""

from typing import Callable
import random


def db_count_images(cursor, product_id: int) -> int:
    """Count all image rows for a product, regardless of provider."""
    # Fast aggregate used as a guard before heavier selection queries.
    cursor.execute("SELECT COUNT(*) AS cnt FROM ImageGeneration WHERE ProductID = %s", (product_id,))
    row = cursor.fetchone() or {}
    return int(row.get("cnt") or 0)


def db_count_images_by_provider(cursor, product_id: int, provider: str) -> int:
    """Count image rows for one product/provider pair."""
    # Provider-level counts drive refill/trim logic for hosted images.
    cursor.execute(
        "SELECT COUNT(*) AS cnt FROM ImageGeneration WHERE ProductID = %s AND Provider = %s",
        (product_id, provider),
    )
    row = cursor.fetchone() or {}
    return int(row.get("cnt") or 0)


def db_trim_song_pool_by_provider(cursor, product_id: int, provider: str, keep_count: int) -> int:
    """Trim older rows so a song keeps at most keep_count images for a provider."""
    # Defensive floor avoids invalid negative thresholds.
    keep_n = max(0, int(keep_count))
    cursor.execute(
        """
        DELETE ig
        FROM ImageGeneration ig
        JOIN (
            SELECT ImageGenID
            FROM (
                SELECT ImageGenID,
                       ROW_NUMBER() OVER (PARTITION BY ProductID ORDER BY ImageGenID DESC) AS rn
                FROM ImageGeneration
                WHERE ProductID = %s AND Provider = %s
            ) ranked
            WHERE rn > %s
        ) doomed ON doomed.ImageGenID = ig.ImageGenID
        """,
        (product_id, provider, keep_n),
    )
    return int(cursor.rowcount or 0)


def db_trim_song_pool_by_provider_with_keys(cursor, product_id: int, provider: str, keep_count: int) -> tuple[int, list[str]]:
    """Trim older rows and return removed storage keys for optional S3 cleanup."""
    # Fetch keys first so callers can delete orphaned S3 objects after trim.
    keep_n = max(0, int(keep_count))
    cursor.execute(
        """
        SELECT StorageKey
        FROM ImageGeneration
        WHERE ProductID = %s AND Provider = %s
        ORDER BY ImageGenID DESC
        LIMIT 18446744073709551615 OFFSET %s
        """,
        (product_id, provider, keep_n),
    )
    doomed_rows = cursor.fetchall() or []
    doomed_keys = [str(r.get("StorageKey") or "").strip() for r in doomed_rows if str(r.get("StorageKey") or "").strip()]

    trimmed = db_trim_song_pool_by_provider(cursor, product_id, provider, keep_n)
    return int(trimmed or 0), doomed_keys


def db_product_exists(cursor, product_id: int) -> bool:
    """Lightweight existence check for Products table."""
    # Used to fail early for invalid song/product IDs.
    cursor.execute("SELECT 1 AS ok FROM Products WHERE ProductID = %s LIMIT 1", (product_id,))
    row = cursor.fetchone() or {}
    return bool(row.get("ok"))


def db_s3_storage_stats(cursor) -> tuple[int, int]:
    """Return total bytes + total rows for S3-backed image records."""
    # Budget enforcement uses these totals to cap global storage growth.
    cursor.execute(
        """
        SELECT COALESCE(SUM(ByteSize), 0) AS total_bytes,
               COUNT(*) AS total_images
        FROM ImageGeneration
        WHERE Provider = 's3'
        """
    )
    row = cursor.fetchone() or {}
    return int(row.get("total_bytes") or 0), int(row.get("total_images") or 0)


def db_fetch_images(cursor, product_id: int, count: int) -> list:
    total = db_count_images_by_provider(cursor, product_id, "s3")

    if total <= 0:
        return []

    limit_n = min(count, total)

    offset = 0
    if total > limit_n:
        offset = random.randint(0, total - limit_n)

    cursor.execute(
        """
        SELECT ImageUrl AS url,
               Width AS width,
               Height AS height,
               KeywordTag AS tags
        FROM ImageGeneration
        WHERE ProductID = %s
          AND Provider = 's3'
        ORDER BY CreatedAt DESC
        LIMIT %s OFFSET %s
        """,
        (product_id, limit_n, offset),
    )

    rows = cursor.fetchall() or []

    return [
        {
            "url": r.get("url"),
            "urlLarge": r.get("url"),
            "tags": r.get("tags"),
            "width": r.get("width"),
            "height": r.get("height"),
        }
        for r in rows
        if r.get("url")
    ]


def db_fetch_hosted_image_rows(cursor, product_id: int) -> list:
    """Fetch all hosted image metadata rows for a product in stable order."""
    # Stable ordering makes video frame generation deterministic.
    cursor.execute(
        """
        SELECT ImageGenID, StorageKey, ContentType, ImageUrl
        FROM ImageGeneration
        WHERE ProductID = %s AND Provider = 's3'
        ORDER BY ImageGenID ASC
        """,
        (product_id,),
    )
    return cursor.fetchall() or []


def db_insert_hosted_images(
    cursor,
    product_id: int,
    images: list,
    contains_banned_figure_terms: Callable[[str], bool],
    hash_url: Callable[[str], str],
) -> int:
    """Insert hosted (S3) image rows with storage metadata."""
    # Ignore empty payloads so callers can safely batch without pre-checks.
    inserted = 0
    for img in images:
        url = img.get("url") or ""
        if not url or contains_banned_figure_terms(img.get("tags")):
            continue

        url_hash = img.get("urlHash") or hash_url(url)
        storage_key = img.get("storageKey") or ""
        content_type = img.get("contentType") or "image/jpeg"
        byte_size = int(img.get("byteSize") or 0)
        # img dict uses "tags" key; DB column is KeywordTag
        tags = img.get("tags") or ""
        source_url = img.get("sourceUrl") or ""

        cursor.execute(
            """
            INSERT INTO ImageGeneration
                (ProductID, ImageUrl, UrlHash, StorageKey, ContentType, ByteSize, KeywordTag, SourceUrl, Provider, CreatedAt)
            VALUES
                (%s, %s, %s, %s, %s, %s, %s, %s, 's3', NOW())
            ON DUPLICATE KEY UPDATE
                ImageUrl    = VALUES(ImageUrl),
                StorageKey  = VALUES(StorageKey),
                ContentType = VALUES(ContentType),
                ByteSize    = VALUES(ByteSize),
                KeywordTag  = VALUES(KeywordTag),
                SourceUrl   = VALUES(SourceUrl)
            """,
            (product_id, url, url_hash, storage_key, content_type, byte_size, tags, source_url),
        )
        inserted += cursor.rowcount

    return inserted
