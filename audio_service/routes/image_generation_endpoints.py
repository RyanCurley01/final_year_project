# pyright: reportUnusedFunction=false

"""HTTP endpoints for image search/pool/file/health routes.

The route handlers in this module call into image_generation core helpers so
request validation and response shaping stay readable.
"""

from fastapi import APIRouter, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from typing import Optional
import random

from . import image_generation as core

router = APIRouter()


@router.get("/search")
async def search_images(
    prompt: str = Query(..., description="Search keywords for image retrieval"),
    count: int = Query(20, ge=1, le=1000, description="Number of images to return"),
    nocache: bool = Query(False, description="Skip cache for fresh images"),
):
    """Search for real photographs matching keyword tags via LoremFlickr."""
    # Feature gate: return safe empty payload when external fetch is disabled.
    if not core._EXTERNAL_IMAGE_GENERATION_ENABLED:
        return {
            "images": [],
            "source": "external_generation_disabled",
            "prompt": prompt,
        }

    if not nocache:
        # Prompt cache avoids repeated provider URL generation.
        cached = core._get_cached(prompt)
        if cached:
            shuffled = list(cached)
            random.shuffle(shuffled)
            return {"images": shuffled[:count], "source": "cache", "prompt": prompt}

    keywords = core._safe_prompt_keywords(prompt)
    if not keywords:
        keywords = ["abstract", "landscape", "sky"]

    images = core._generate_loremflickr_urls(keywords, count, nocache=nocache)
    if not nocache:
        core._set_cached(prompt, images)
    return {"images": images, "source": "loremflickr", "prompt": prompt}


@router.get("/pool")
def get_image_pool(
    request: Request,
    song_title: str = Query(..., description="Song title for contextual image retrieval"),
    song_id: Optional[str] = Query(None, description="Song ID for cache keying"),
    count: int = Query(30, ge=1, le=1000, description="Number of images for the pool"),
    nocache: bool = Query(False, description="Skip cache for fresh refill images"),
    pad_external: bool = Query(False, description="Pad DB pools with external LoremFlickr URLs to prevent empty responses"),
    mood: Optional[str] = Query(None, description="Song mood (energetic/happy/calm/sad)"),
    energy: Optional[float] = Query(None, ge=0, le=1, description="Energy level 0-1"),
    valence: Optional[float] = Query(None, ge=0, le=1, description="Valence (positivity) 0-1"),
    tempo: Optional[float] = Query(None, description="Tempo in BPM"),
    danceability: Optional[float] = Query(None, ge=0, le=1, description="Danceability 0-1"),
    acousticness: Optional[float] = Query(None, ge=0, le=1, description="Acousticness 0-1"),
    genre: Optional[str] = Query(None, description="Genre from AudioFeatures"),
):
    """Return S3-hosted image pool data for a library song."""
    _ = pad_external  # Kept for API compatibility.

    # Parse/validate song ID first so downstream DB work can short-circuit.
    product_id = core._safe_int(song_id)

    if not product_id or product_id == 0:
        return {
            "images": [],
            "source": "invalid_song_id",
            "song_title": song_title,
            "tags_used": [],
            "mood": mood,
        }

    try:
        with core.get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
            with conn.cursor() as cursor:
                if not core._db_product_exists(cursor, int(product_id)):
                    return {
                        "images": [],
                        "source": "invalid_song_id_not_found",
                        "song_title": song_title,
                        "tags_used": [],
                        "mood": mood,
                    }
    except HTTPException:
        raise
    except Exception as e:
        core.console.log(f"❌ Product existence check failed for ProductID={product_id}: {e}")
        return {
            "images": [],
            "source": "db_error",
            "song_title": song_title,
            "tags_used": [],
            "mood": mood,
        }

    if nocache:
        # nocache still serves DB-hosted images; it just bypasses prompt cache
        # and forces a fresh read path.
        try:
            with core.get_db_connection() as conn:
                if not conn:
                    raise HTTPException(status_code=503, detail="Database connection unavailable")
                with conn.cursor() as cursor:
                    trimmed_rows, trimmed_keys = core._db_trim_song_pool_by_provider_with_keys(cursor, int(product_id), "s3", int(core._DEFAULT_POOL_SIZE))
                    if trimmed_rows > 0:
                        core._delete_s3_keys_best_effort(trimmed_keys)
                    conn.commit()
                    images = core._db_fetch_images(cursor, product_id, count)
            images = [
                {**img, "url": core._absolute_url(request, img.get("url")), "urlLarge": core._absolute_url(request, img.get("urlLarge") or img.get("url"))}
                for img in (images or [])
            ]
            return {
                "images": images,
                "source": "db_pool_nocache_ignored",
                "song_title": song_title,
                "tags_used": [],
                "mood": mood,
            }
        except HTTPException:
            raise
        except Exception as e:
            core.console.log(f"❌ Image pool DB error for ProductID={product_id}: {e}")
            return {
                "images": [],
                "source": "db_error",
                "song_title": song_title,
                "tags_used": [],
                "mood": mood,
            }

    # Default path: return persisted hosted pool and schedule background refill
    # when the pool is below target size.
    try:
        images = []
        with core.get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
            with conn.cursor() as cursor:
                trimmed_rows, trimmed_keys = core._db_trim_song_pool_by_provider_with_keys(cursor, int(product_id), "s3", int(core._DEFAULT_POOL_SIZE))
                if trimmed_rows > 0:
                    core._delete_s3_keys_best_effort(trimmed_keys)
                conn.commit()
                images = core._db_fetch_images(cursor, product_id, count)

        missing_target = max(0, int(core._DEFAULT_POOL_SIZE) - len(images or []))
        if missing_target > 0:
            desired_size = int(core._DEFAULT_POOL_SIZE)
            core._schedule_pool_refill(
                product_id=int(product_id),
                song_title=song_title,
                desired_size=int(desired_size),
                mood=mood,
                energy=energy,
                valence=valence,
                tempo=tempo,
                danceability=danceability,
                acousticness=acousticness,
                genre=genre,
            )

            if len(images or []) == 0 and int(count) <= 3:
                try:
                    inserted_now = core._quick_warmup_s3_images(
                        int(product_id),
                        song_title,
                        mood=mood,
                        energy=energy,
                        valence=valence,
                        tempo=tempo,
                        danceability=danceability,
                        acousticness=acousticness,
                        genre=genre,
                        max_images=1,
                    )
                    if inserted_now > 0:
                        with core.get_db_connection() as retry_conn:
                            if retry_conn:
                                with retry_conn.cursor() as retry_cursor:
                                    trimmed_rows, trimmed_keys = core._db_trim_song_pool_by_provider_with_keys(retry_cursor, int(product_id), "s3", int(core._DEFAULT_POOL_SIZE))
                                    if trimmed_rows > 0:
                                        core._delete_s3_keys_best_effort(trimmed_keys)
                                    retry_conn.commit()
                                    images = core._db_fetch_images(retry_cursor, product_id, count)
                    missing_target = max(0, int(core._DEFAULT_POOL_SIZE) - len(images or []))
                except Exception as warm_err:
                    core.console.log(f"⚠️ S3 warmup failed for ProductID={product_id}: {warm_err}")

        images = [
            {**img, "url": core._absolute_url(request, img.get("url")), "urlLarge": core._absolute_url(request, img.get("urlLarge") or img.get("url"))}
            for img in (images or [])
        ]

        return {
            "images": images,
            "source": (
                "db_pool"
                if missing_target == 0
                else "db_pool_short_external_disabled"
                if not core._EXTERNAL_IMAGE_GENERATION_ENABLED
                else "db_pool_short_refill_scheduled"
            ),
            "song_title": song_title,
            "tags_used": [],
            "mood": mood,
        }
    except HTTPException:
        raise
    except Exception as e:
        core.console.log(f"❌ Image pool DB error for ProductID={product_id}: {e}")
        return {
            "images": [],
            "source": "db_error",
            "song_title": song_title,
            "tags_used": [],
            "mood": mood,
        }


@router.get("/file/{product_id}/{url_hash}")
def get_hosted_image_file(product_id: int, url_hash: str):
    """Serve a hosted image by stable URL (browser-cacheable)."""
    if not core.IMAGE_POOL_S3_BUCKET:
        raise HTTPException(status_code=503, detail="S3 bucket not configured")

    row = {}
    try:
        with core.get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT StorageKey, ContentType
                        FROM ImageGeneration
                        WHERE ProductID = %s AND UrlHash = %s
                        LIMIT 1
                        """,
                        (int(product_id), str(url_hash)),
                    )
                    row = cursor.fetchone() or {}
    except Exception as e:
        core.console.log(f"⚠️ Hosted image DB lookup failed for ProductID={product_id}, UrlHash={url_hash}: {e}")

    storage_key = (row or {}).get("StorageKey")

    # Fallback key probing helps when DB row exists but key extension changes.
    candidate_keys: list[str] = []
    if storage_key:
        candidate_keys.append(storage_key)
    else:
        for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".img"):
            candidate_keys.append(f"{core.IMAGE_POOL_S3_PREFIX}/{int(product_id)}/{str(url_hash)}{ext}")

    obj = None
    for key in candidate_keys:
        obj = core.get_object_stream(core.IMAGE_POOL_S3_BUCKET, key)
        if obj:
            break

    if not obj:
        raise HTTPException(status_code=404, detail="Image object missing")

    body, content_type, _content_length = obj
    headers = {
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": f'"{url_hash}"',
    }
    return StreamingResponse(body, media_type=(content_type or row.get("ContentType") or "image/jpeg"), headers=headers)


@router.get("/health")
async def image_service_health():
    """Health check for the image generation service."""
    return {
        "status": "ok",
        "cache_size": len(core._image_cache),
        "providers": ["loremflickr", "s3"],
        "verified_keywords": len(core._VERIFIED_KEYWORDS),
    }
