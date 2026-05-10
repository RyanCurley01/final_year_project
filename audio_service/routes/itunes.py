# audio_service/routes/itunes.py
from fastapi import APIRouter, HTTPException
import httpx
import asyncio
import json
import os
from datetime import datetime

from utils import console
from config import (
    executor,
    ITUNES_API_BASE_URL,
    AUDIO_FEATURES_MAX_IMPORTED_ROWS,
    AUDIO_FEATURES_PRUNE_ENABLED,
    STOCK_UNAVAILABLE_RETENTION_DAYS,
)
from database import get_db_connection
from feature_extraction import extract_audio_features_from_preview, derive_mood
from ml_service import _parse_json_list
import ml_service
import json

router = APIRouter()

# ---------------------------------------------------------------------------
# Timing
# ---------------------------------------------------------------------------
REFRESH_INTERVAL      = int(os.getenv("TOPCHARTS_REFRESH_INTERVAL", 60 * 60))
STARTUP_REFRESH_DELAY = int(os.getenv("TOPCHARTS_STARTUP_REFRESH_DELAY", 5))

# ---------------------------------------------------------------------------
# Catalog composition
#   ARTISTS                    → up to TOPCHARTS_TARGET_COUNT songs fetched
#                                from these three artists specifically.
#   ITUNES_SEARCH_TERMS        → up to ITUNES_SEARCH_TARGET_COUNT additional
#                                popular songs from broad iTunes search.
#   _IMPORT_CAP                → hard ceiling for total imported (negative-ID)
#                                rows in DB at any time (default 272).
# ---------------------------------------------------------------------------
TOPCHARTS_TARGET_COUNT     = 150
ITUNES_SEARCH_TARGET_COUNT = 75
LIBRARY_TARGET_COUNT       = 47

ARTISTS = [
    "Aphex Twin",
    "Boards of Canada",
    "Squarepusher",
]

ITUNES_SEARCH_TERMS = [
    "top pop hits", "hip hop hits", "rock classics",
    "R&B soul", "country hits", "jazz standards",
    "indie alternative", "latin reggaeton", "classical piano",
    "folk acoustic", "metal heavy", "funk groove",
    "blues guitar", "reggae dub", "K-pop hits",
]

_IMPORT_CAP = max(1, AUDIO_FEATURES_MAX_IMPORTED_ROWS)

# Background task handle
_refresh_task: asyncio.Task | None = None


# ===========================================================================
# HELPERS
# ===========================================================================

def _safe_execute(cursor, sql: str, params=None):
    try:
        cursor.execute(sql, params)
    except Exception as e:
        msg = str(e)
        if "1146" in msg or "1060" in msg or "1061" in msg:
            return
        raise


def _ensure_stock_schema(cursor):
    _safe_execute(cursor, "ALTER TABLE Stock ADD COLUMN IsAvailable TINYINT(1) NOT NULL DEFAULT 1")
    _safe_execute(cursor, "ALTER TABLE Stock ADD COLUMN UnavailableSince DATETIME NULL")
    _safe_execute(cursor, "ALTER TABLE Stock ADD COLUMN AvailableSince DATETIME NULL")


def _ensure_artist_name_column(cursor):
    _safe_execute(cursor, "ALTER TABLE Products ADD COLUMN ArtistName VARCHAR(255) NULL")


def _upsert_stock(cursor, product_id: int, is_available: int):
    available_flag = 1 if int(is_available) == 1 else 0
    try:
        if available_flag == 1:
            cursor.execute(
                "INSERT INTO Stock (IsAvailable, ProductID, UnavailableSince, AvailableSince) "
                "VALUES (1, %s, NULL, NOW()) "
                "ON DUPLICATE KEY UPDATE IsAvailable = 1, UnavailableSince = NULL, "
                "AvailableSince = CASE WHEN IsAvailable = 0 THEN NOW() ELSE AvailableSince END",
                (product_id,)
            )
        else:
            cursor.execute(
                "INSERT INTO Stock (IsAvailable, ProductID, UnavailableSince, AvailableSince) "
                "VALUES (0, %s, NOW(), NULL) "
                "ON DUPLICATE KEY UPDATE IsAvailable = 0, "
                "UnavailableSince = COALESCE(UnavailableSince, NOW()), AvailableSince = NULL",
                (product_id,)
            )
        return
    except Exception as e:
        if "1452" in str(e):
            return

    cursor.execute(
        "SELECT StockID FROM Stock WHERE ProductID = %s ORDER BY StockID DESC LIMIT 1",
        (product_id,)
    )
    row = cursor.fetchone()
    if row:
        sid = int(row["StockID"])
        if available_flag == 1:
            try:
                cursor.execute(
                    "UPDATE Stock SET IsAvailable = 1, UnavailableSince = NULL, "
                    "AvailableSince = CASE WHEN IsAvailable = 0 THEN NOW() ELSE AvailableSince END "
                    "WHERE StockID = %s", (sid,)
                )
            except Exception:
                cursor.execute("UPDATE Stock SET IsAvailable = 1 WHERE StockID = %s", (sid,))
        else:
            try:
                cursor.execute(
                    "UPDATE Stock SET IsAvailable = 0, "
                    "UnavailableSince = COALESCE(UnavailableSince, NOW()), "
                    "AvailableSince = NULL WHERE StockID = %s", (sid,)
                )
            except Exception:
                cursor.execute("UPDATE Stock SET IsAvailable = 0 WHERE StockID = %s", (sid,))
    else:
        try:
            if available_flag == 1:
                cursor.execute(
                    "INSERT INTO Stock (IsAvailable, ProductID, UnavailableSince, AvailableSince) "
                    "VALUES (1, %s, NULL, NOW())", (product_id,)
                )
            else:
                cursor.execute(
                    "INSERT INTO Stock (IsAvailable, ProductID, UnavailableSince) "
                    "VALUES (0, %s, NOW())", (product_id,)
                )
        except Exception as e:
            if "1452" in str(e):
                return
            if available_flag == 1:
                cursor.execute("INSERT INTO Stock (IsAvailable, ProductID) VALUES (1, %s)", (product_id,))
            else:
                cursor.execute("INSERT INTO Stock (IsAvailable, ProductID) VALUES (0, %s)", (product_id,))


def _mark_products_unavailable(cursor, product_ids: list[int]):
    for pid in product_ids:
        _upsert_stock(cursor, int(pid), 0)


def _purge_stale_unavailable_imports(cursor, retention_days: int) -> int:
    keep_days = max(1, int(retention_days))
    cursor.execute(
        """
        SELECT DISTINCT ProductID FROM Stock
        WHERE ProductID < 0
          AND COALESCE(IsAvailable, 1) = 0
          AND UnavailableSince IS NOT NULL
          AND UnavailableSince <= DATE_SUB(NOW(), INTERVAL %s DAY)
        """,
        (keep_days,)
    )
    stale_ids = [int(r["ProductID"]) for r in cursor.fetchall()]
    if not stale_ids:
        return 0
    fmt = ",".join(["%s"] * len(stale_ids))
    for tbl in ("UserInteractions", "UserRecommendations", "Wishlist", "Sold_Products",
                "Purchased_Products", "CustomerSummary", "Payments", "Order_Items",
                "Stock", "AudioFeatures", "Products"):
        _safe_execute(cursor, f"DELETE FROM {tbl} WHERE ProductID IN ({fmt})", stale_ids)
    return len(stale_ids)


def _prune_imported_audiofeatures(max_imported_rows: int) -> dict:
    target_cap = int(max_imported_rows)
    if target_cap <= 0:
        return {"pruned": 0, "before": 0, "after": 0}

    with get_db_connection() as conn:
        if not conn:
            return {"pruned": 0, "before": 0, "after": 0}
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS c FROM AudioFeatures WHERE ProductID < 0")
            before = int((cursor.fetchone() or {}).get("c") or 0)
            if before <= target_cap:
                return {"pruned": 0, "before": before, "after": before}

            while True:
                cursor.execute("SELECT COUNT(*) AS c FROM AudioFeatures WHERE ProductID < 0")
                current = int((cursor.fetchone() or {}).get("c") or 0)
                overflow = max(0, current - target_cap)
                if overflow <= 0:
                    break
                cursor.execute(
                    """
                    SELECT af.ProductID FROM AudioFeatures af
                    LEFT JOIN Stock s ON s.ProductID = af.ProductID
                    WHERE af.ProductID < 0
                    ORDER BY COALESCE(s.IsAvailable, 0) ASC, af.UpdatedAt ASC, af.FeatureID ASC
                    LIMIT %s
                    """,
                    (overflow,)
                )
                to_prune = [int(r["ProductID"]) for r in cursor.fetchall()]
                if not to_prune:
                    break
                fmt = ",".join(["%s"] * len(to_prune))
                for tbl in ("UserInteractions", "UserRecommendations", "Wishlist", "Sold_Products",
                            "Purchased_Products", "CustomerSummary", "Payments", "Order_Items",
                            "Stock", "AudioFeatures", "Products"):
                    _safe_execute(cursor, f"DELETE FROM {tbl} WHERE ProductID IN ({fmt})", to_prune)
                conn.commit()

            cursor.execute("SELECT COUNT(*) AS c FROM AudioFeatures WHERE ProductID < 0")
            after = int((cursor.fetchone() or {}).get("c") or 0)
            return {"pruned": max(0, before - after), "before": before, "after": after}


def _feature_entry_from_cache(cached: dict) -> dict:
    return {
        "tempo":            float(cached.get("tempo") or 0),
        "energy":           float(cached.get("energy") or 0),
        "valence":          float(cached.get("valence") or 0),
        "danceability":     float(cached.get("danceability") or 0),
        "acousticness":     float(cached.get("acousticness") or 0)
                            if cached.get("acousticness") is not None else None,
        "genre":            cached.get("genre"),
        "genreCluster":     cached.get("genre_cluster"),
        "mood":             cached.get("mood"),
        "spectralCentroid": cached.get("spectral_centroid"),
        "spectralRolloff":  cached.get("spectral_rolloff"),
        "zeroCrossingRate": cached.get("zero_crossing_rate"),
        "instrumentalness": cached.get("instrumentalness"),
        "speechiness":      cached.get("speechiness"),
        "loudness":         cached.get("loudness"),
        "onsetRate":        cached.get("onset_rate"),
        "harmonicRatio":    cached.get("harmonic_ratio"),
        "percussiveRatio":  cached.get("percussive_ratio"),
        "keySignature":     cached.get("key_signature"),
        "timeSignature":    cached.get("time_signature"),
        "duration":         cached.get("duration"),
    }


def _classify_features(features: dict) -> str:
    return ml_service.classify_genre_from_features(
        features["tempo"], features["energy"], features["valence"],
        features["danceability"], features["acousticness"],
        spectral_centroid=features.get("spectral_centroid", 1500.0),
        spectral_rolloff=features.get("spectral_rolloff", 3000.0),
        zero_crossing_rate=features.get("zero_crossing_rate", 0.05),
        instrumentalness=features.get("instrumentalness", 0.5),
        loudness=features.get("loudness", -60.0),
        speechiness=features.get("speechiness", 0.1),
        spectral_bandwidth=features.get("spectral_bandwidth", 1500.0),
        rms_energy=features.get("rms_energy", 0.02),
        onset_rate=features.get("onset_rate", 2.0),
        harmonic_ratio=features.get("harmonic_ratio", 0.5),
        percussive_ratio=features.get("percussive_ratio", 0.5),
        duration=features.get("duration", 0),
        key_signature=features.get("key_signature", "C"),
        time_signature=features.get("time_signature", "4/4"),
        mfcc_mean=features.get("mfcc_mean"),
        chroma_mean=features.get("chroma_mean"),
        spectral_contrast_mean=features.get("spectral_contrast_mean"),
    )


# ===========================================================================
# FETCH PHASE — collect track metadata from iTunes (no audio extraction yet)
# ===========================================================================

async def _fetch_artist_tracks(limit_per_artist: int) -> dict[int, dict]:
    """
    Search iTunes for each artist in ARTISTS and collect up to
    `limit_per_artist` tracks **per artist independently**, for a total
    of up to len(ARTISTS) * limit_per_artist tracks.

    FIX: the outer TOPCHARTS_TARGET_COUNT cap was previously checked inside
    the per-artist loop, which caused later artists to be skipped entirely
    once the first artist's results (however few had preview URLs) reached
    the global ceiling.  Each artist now gets its own budget and the global
    cap is only applied as a final trim after all artists have been fetched.
    """
    collected: dict[int, dict] = {}
    per_artist = max(1, limit_per_artist)

    async with httpx.AsyncClient(timeout=30.0) as client:
        for artist in ARTISTS:
            artist_collected: dict[int, dict] = {}
            try:
                # Request a generous result set so we can find enough tracks
                # that actually have a previewUrl (iTunes doesn't guarantee it).
                params = {"term": artist, "limit": 200, "media": "music", "entity": "song"}
                resp = await client.get(f"{ITUNES_API_BASE_URL}/search", params=params)
                if resp.status_code != 200:
                    console.log(f"   ⚠️ iTunes search failed for '{artist}': HTTP {resp.status_code}")
                    continue

                for track in resp.json().get("results", []):
                    # Stop once this artist's personal budget is met.
                    if len(artist_collected) >= per_artist:
                        break
                    tid = track.get("trackId")
                    pid = -int(tid) if tid else None
                    # Only accept tracks that have a preview URL and whose pid
                    # hasn't already been claimed by a previous artist.
                    if pid and track.get("previewUrl") and pid not in collected and pid not in artist_collected:
                        track["_source_artist"] = artist
                        artist_collected[pid] = track

                collected.update(artist_collected)
                console.log(f"   🎵 Artist '{artist}': collected {len(artist_collected)} tracks (budget={per_artist})")
                await asyncio.sleep(0.15)

            except Exception as e:
                console.log(f"   ⚠️ Artist fetch error for '{artist}': {e}")

    # Final trim to global cap — should rarely be needed but kept as a safety net.
    if len(collected) > TOPCHARTS_TARGET_COUNT:
        collected = dict(list(collected.items())[:TOPCHARTS_TARGET_COUNT])

    console.log(f"   ✅ _fetch_artist_tracks: {len(collected)} total across {len(ARTISTS)} artists")
    return collected


async def _fetch_broad_tracks(exclude_pids: set[int], target: int) -> dict[int, dict]:
    """
    Fetch up to `target` popular iTunes tracks via ITUNES_SEARCH_TERMS,
    skipping any pid already in `exclude_pids`.
    Returns a pid → track dict.
    """
    collected: dict[int, dict] = {}

    async with httpx.AsyncClient(timeout=30.0) as client:
        for term in ITUNES_SEARCH_TERMS:
            if len(collected) >= target:
                break
            try:
                params = {"term": term, "limit": 200, "media": "music", "entity": "song"}
                resp = await client.get(f"{ITUNES_API_BASE_URL}/search", params=params)
                if resp.status_code != 200:
                    continue
                for track in resp.json().get("results", []):
                    if len(collected) >= target:
                        break
                    tid = track.get("trackId")
                    pid = -int(tid) if tid else None
                    if (pid and track.get("previewUrl")
                            and pid not in exclude_pids
                            and pid not in collected):
                        track["_source_term"] = term
                        collected[pid] = track
                await asyncio.sleep(0.1)
            except Exception as e:
                console.log(f"   ⚠️ Broad fetch error for '{term}': {e}")

    console.log(f"   ✅ _fetch_broad_tracks: {len(collected)} total")
    return collected


# ===========================================================================
# IMPORT PHASE — extract audio features and upsert into DB
# ===========================================================================

async def _upsert_track_to_db(track: dict, loop) -> bool:
    """
    Extract audio features for `track` and INSERT or UPDATE the row in
    Products + AudioFeatures + Stock.  Returns True on success.
    Existing rows have their audio features re-extracted so every hourly
    refresh reflects the latest feature data.
    """
    tid         = track.get("trackId")
    preview_url = track.get("previewUrl")
    if not tid or not preview_url:
        return False

    product_id = -int(tid)

    features = await loop.run_in_executor(
        executor, extract_audio_features_from_preview, preview_url, int(tid)
    )
    if not features:
        return False

    genre_label  = _classify_features(features)
    actual_genre = track.get("primaryGenreName", "Unknown")

    mfcc_json              = json.dumps(features["mfcc_mean"]) if features.get("mfcc_mean") else None
    chroma_json            = json.dumps(features["chroma_mean"]) if features.get("chroma_mean") else None
    spectral_contrast_json = (
        json.dumps(features["spectral_contrast_mean"])
        if features.get("spectral_contrast_mean") else None
    )

    with get_db_connection() as conn:
        if not conn:
            return False
        with conn.cursor() as cursor:

            # ── Products: INSERT or UPDATE ───────────────────────────────────
            cursor.execute("SELECT ProductID FROM Products WHERE ProductID = %s", (product_id,))
            if cursor.fetchone():
                cursor.execute(
                    """
                    UPDATE Products
                       SET AlbumTitle         = %s,
                           AlbumPrice         = %s,
                           albumCoverImageUrl = %s,
                           file_url           = %s,
                           preview_url        = %s,
                           ArtistName         = %s
                     WHERE ProductID = %s
                    """,
                    (
                        track.get("trackName", "Unknown"),
                        track.get("trackPrice", 0.99),
                        track.get("artworkUrl100", ""),
                        preview_url, preview_url,
                        track.get("artistName", "Unknown Artist"),
                        product_id,
                    )
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO Products
                        (ProductID, AlbumTitle, AlbumPrice,
                         albumCoverImageUrl, file_url, preview_url, ArtistName)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        product_id,
                        track.get("trackName", "Unknown"),
                        track.get("trackPrice", 0.99),
                        track.get("artworkUrl100", ""),
                        preview_url, preview_url,
                        track.get("artistName", "Unknown Artist"),
                    )
                )

            # ── AudioFeatures: INSERT or UPDATE ──────────────────────────────
            af_values = (
                features["tempo"], features["energy"],
                features["danceability"], features["valence"],
                features["acousticness"],
                features.get("instrumentalness", 0.5),
                features.get("loudness", -60.0),
                features.get("speechiness", 0.1),
                features.get("spectral_centroid", 1500.0),
                features.get("spectral_rolloff", 3000.0),
                features.get("zero_crossing_rate", 0.05),
                actual_genre, genre_label,
                features.get("spectral_bandwidth", 1500.0),
                spectral_contrast_json,
                features.get("rms_energy", 0.02),
                features.get("onset_rate", 2.0),
                features.get("harmonic_ratio", 0.5),
                features.get("percussive_ratio", 0.5),
                features.get("mood", derive_mood(features["valence"], features["energy"])),
                mfcc_json, chroma_json,
                features.get("key_signature"),
                features.get("time_signature"),
                features.get("duration"),
            )

            cursor.execute("SELECT FeatureID FROM AudioFeatures WHERE ProductID = %s", (product_id,))
            if cursor.fetchone():
                cursor.execute(
                    """
                    UPDATE AudioFeatures SET
                        Tempo=%s, Energy=%s, Danceability=%s, Valence=%s,
                        Acousticness=%s, Instrumentalness=%s, Loudness=%s, Speechiness=%s,
                        SpectralCentroid=%s, SpectralRolloff=%s, ZeroCrossingRate=%s,
                        Genre=%s, GenreCluster=%s, SpectralBandwidth=%s, SpectralContrast=%s,
                        RmsEnergy=%s, OnsetRate=%s, HarmonicRatio=%s, PercussiveRatio=%s,
                        Mood=%s, MfccMean=%s, ChromaMean=%s,
                        Key_Signature=%s, TimeSignature=%s, Duration=%s
                    WHERE ProductID = %s
                    """,
                    af_values + (product_id,)
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO AudioFeatures
                        (ProductID, Tempo, Energy, Danceability, Valence,
                         Acousticness, Instrumentalness, Loudness, Speechiness,
                         SpectralCentroid, SpectralRolloff, ZeroCrossingRate,
                         Genre, GenreCluster, SpectralBandwidth, SpectralContrast,
                         RmsEnergy, OnsetRate, HarmonicRatio, PercussiveRatio,
                         Mood, MfccMean, ChromaMean, Key_Signature, TimeSignature, Duration)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (product_id,) + af_values
                )

            _upsert_stock(cursor, product_id, 1)
            conn.commit()

    return True


# ===========================================================================
# TOPCHARTS ENDPOINT — always served from DB
# ===========================================================================

@router.get("/api/itunes/topcharts")
async def get_topcharts(artists: str | None = None, limit_per_artist: int = 50):
    """
    Returns all available imported songs from the DB (ProductID < 0,
    IsAvailable = 1).  The DB is the single source of truth — it is updated
    every hour by refresh_topcharts with the three artist catalogues + broad
    popular tracks, so TopCharts and SimilarSongs always score against the
    same freshly-extracted pool.

    `artists` and `limit_per_artist` are accepted for backwards-compatibility
    but are no longer used to filter results.
    """
    try:
        songs        = []
        features_map = {}

        def _query_stock_songs(conn):
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        p.ProductID, p.AlbumTitle, p.ArtistName,
                        p.albumCoverImageUrl, p.preview_url,
                        af.Tempo, af.Energy, af.Valence, af.Danceability,
                        af.Acousticness, af.Genre, af.GenreCluster, af.Mood,
                        af.SpectralCentroid, af.SpectralRolloff, af.ZeroCrossingRate,
                        af.Instrumentalness, af.Speechiness, af.Loudness,
                        af.OnsetRate, af.HarmonicRatio, af.PercussiveRatio,
                        af.Key_Signature, af.TimeSignature, af.Duration
                    FROM Products p
                    JOIN AudioFeatures af ON af.ProductID = p.ProductID
                    LEFT JOIN Stock s     ON s.ProductID  = p.ProductID
                    WHERE p.ProductID < 0
                      AND COALESCE(s.IsAvailable, 1) = 1
                    ORDER BY p.ProductID DESC
                    """
                )
                return cursor.fetchall()

        rows = []
        with get_db_connection() as conn:
            if conn:
                rows = _query_stock_songs(conn)

        # Cold-start: no imported songs yet — trigger a refresh and retry once
        if not rows:
            console.log("⚠️ get_topcharts: no songs in DB — triggering cold-start refresh")
            try:
                await refresh_topcharts()
            except Exception as err:
                console.log(f"   ⚠️ Cold-start refresh failed: {err}")
            with get_db_connection() as conn:
                if conn:
                    rows = _query_stock_songs(conn)

        if not rows:
            console.log("❌ get_topcharts: still no songs after cold-start refresh")
            return {"status": "success", "count": 0, "songs": [], "features": {}, "source": "empty"}

        for row in rows:
            pid     = int(row["ProductID"])
            abs_tid = abs(pid)
            preview = row.get("preview_url") or ""
            artwork = row.get("albumCoverImageUrl") or ""

            song = {
                "id":               abs_tid,
                "trackId":          abs_tid,
                "trackName":        row.get("AlbumTitle") or f"Track {abs_tid}",
                "albumTitle":       row.get("AlbumTitle") or f"Track {abs_tid}",
                "artistName":       row.get("ArtistName") or None,
                "collectionName":   None,
                "artworkUrl100":    artwork,
                "previewUrl":       preview,
                "fileUrl":          preview,
                "primaryGenreName": row.get("Genre"),
                "source":           "db_stock",
            }
            songs.append(song)

            # Prefer in-memory ML cache (full feature vector) over raw DB columns
            cached = (
                ml_service.audio_features_cache.get(-abs_tid)
                or ml_service.audio_features_cache.get(abs_tid)
            )
            entry = _feature_entry_from_cache(cached) if cached else {
                "tempo":            float(row.get("Tempo") or 0),
                "energy":           float(row.get("Energy") or 0),
                "valence":          float(row.get("Valence") or 0),
                "danceability":     float(row.get("Danceability") or 0),
                "acousticness":     float(row.get("Acousticness") or 0)
                                    if row.get("Acousticness") is not None else None,
                "genre":            row.get("Genre"),
                "genreCluster":     row.get("GenreCluster"),
                "mood":             row.get("Mood"),
                "spectralCentroid": row.get("SpectralCentroid"),
                "spectralRolloff":  row.get("SpectralRolloff"),
                "zeroCrossingRate": row.get("ZeroCrossingRate"),
                "instrumentalness": row.get("Instrumentalness"),
                "speechiness":      row.get("Speechiness"),
                "loudness":         row.get("Loudness"),
                "onsetRate":        row.get("OnsetRate"),
                "harmonicRatio":    row.get("HarmonicRatio"),
                "percussiveRatio":  row.get("PercussiveRatio"),
                "keySignature":     row.get("Key_Signature"),
                "timeSignature":    row.get("TimeSignature"),
                "duration":         row.get("Duration"),
            }

            features_map[str(abs_tid)]  = entry
            features_map[str(-abs_tid)] = entry

        console.log(f"✅ get_topcharts: serving {len(songs)} songs from DB")
        return {
            "status":   "success",
            "count":    len(songs),
            "songs":    songs,
            "features": features_map,
            "source":   "db_stock",
        }

    except Exception as e:
        console.log(f"❌ TopCharts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===========================================================================
# SEARCH PROXY
# ===========================================================================

@router.get("/api/itunes/search")
async def search_itunes(term: str, limit: int = 200, media: str = "music", entity: str = "song"):
    """Proxy endpoint for iTunes Search API."""
    try:
        params = {"term": term, "limit": limit, "media": media, "entity": entity}
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(f"{ITUNES_API_BASE_URL}/search", params=params)
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="iTunes API error")
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="iTunes API timeout")
    except Exception as e:
        console.log(f"❌ iTunes search error: {e}")
        raise HTTPException(status_code=500, detail=f"Error searching iTunes: {str(e)}")


# ===========================================================================
# CLEAR IMPORTED SONGS
# ===========================================================================

@router.delete("/api/itunes/clear-imported-songs")
async def clear_imported_songs():
    """Delete all imported iTunes songs (negative ProductIDs) from the database."""
    try:
        console.log("🗑️  Starting cleanup of imported songs...")
        deleted_count = 0

        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    for tbl in ("UserInteractions", "UserRecommendations", "Wishlist",
                                "Sold_Products", "Purchased_Products", "CustomerSummary",
                                "Payments", "Order_Items", "Stock"):
                        _safe_execute(cursor, f"DELETE FROM {tbl} WHERE ProductID < 0")

                    cursor.execute("DELETE FROM AudioFeatures WHERE ProductID < 0")
                    audio_deleted = cursor.rowcount
                    cursor.execute("DELETE FROM Products WHERE ProductID < 0")
                    products_deleted = cursor.rowcount
                    conn.commit()
                    deleted_count = products_deleted
                    console.log(f"   ✅ Deleted {products_deleted} products, {audio_deleted} features")

        console.log(f"🎉 Cleanup complete: {deleted_count} imported songs removed")
        return {
            "status":        "success",
            "deleted_count": deleted_count,
            "message":       f"Successfully removed {deleted_count} imported songs from database",
        }

    except Exception as e:
        console.log(f"❌ Cleanup error: {e}")
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")


# ===========================================================================
# LEGACY IMPORT ENDPOINTS (kept for backwards-compatibility)
# ===========================================================================

@router.post("/api/itunes/import-top-songs")
async def import_top_songs(limit: int = 150):
    """Legacy endpoint — delegates to refresh_topcharts."""
    console.log("ℹ️  import-top-songs called — delegating to refresh_topcharts")
    return await refresh_topcharts()


@router.post("/api/itunes/import-to-database")
async def import_itunes_songs_to_database(limit: int = 50, genre: str = "pop"):
    """Legacy endpoint — delegates to refresh_topcharts."""
    console.log("ℹ️  import-to-database called — delegating to refresh_topcharts")
    return await refresh_topcharts()


# ===========================================================================
# CORE HOURLY REFRESH
# ===========================================================================

@router.post("/api/itunes/refresh-topcharts")
async def refresh_topcharts():
    """
    Hourly differential sync — runs on startup and every REFRESH_INTERVAL seconds.

    Step 1  Fetch up to TOPCHARTS_TARGET_COUNT (150) tracks from ARTISTS
            (Aphex Twin, Boards of Canada, Squarepusher) via iTunes Search.
            Each artist gets its own independent budget of
            TOPCHARTS_TARGET_COUNT // len(ARTISTS) = 50 tracks so that a
            slow or thin artist catalogue never starves the others.
    Step 2  Fetch up to ITUNES_SEARCH_TARGET_COUNT (75) additional popular
            tracks via broad ITUNES_SEARCH_TERMS, excluding artist tracks.
    Step 3  For every track in both pools — whether new or already in DB —
            re-extract audio features and UPDATE (or INSERT) Products +
            AudioFeatures + Stock, so every hourly cycle refreshes feature data.
    Step 4  Mark any previously-available imported track that is no longer in
            the live pool as unavailable in Stock.
    Step 5  Validate library songs (ProductID > 0).
    Step 6  Purge stale unavailable imports older than STOCK_UNAVAILABLE_RETENTION_DAYS.
    Step 7  Prune imported AudioFeatures rows to _IMPORT_CAP (default 272).
    Step 8  Reload ML cache and sync GenreCluster labels back to DB.
    """
    try:
        console.log("🔄 Starting hourly store refresh (artists + broad)...")
        start_ts = datetime.utcnow()

        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    _ensure_stock_schema(cursor)
                    _ensure_artist_name_column(cursor)
                    conn.commit()

        # ── STEP 1: fetch artist tracks (~50 per artist, 150 total) ──────────
        # Each artist gets an independent budget so thin catalogues (few tracks
        # with previewUrls) don't silently eat into the quota of other artists.
        per_artist    = max(1, TOPCHARTS_TARGET_COUNT // len(ARTISTS))
        artist_tracks = await _fetch_artist_tracks(per_artist)

        # ── STEP 2: fetch broad popular tracks (up to 75, no artist overlap) ─
        broad_tracks  = await _fetch_broad_tracks(
            exclude_pids=set(artist_tracks.keys()),
            target=ITUNES_SEARCH_TARGET_COUNT,
        )

        # Artist tracks take precedence on pid collision (shouldn't happen)
        all_tracks: dict[int, dict] = {**broad_tracks, **artist_tracks}
        live_pids:  set[int]        = set(all_tracks.keys())

        console.log(
            f"   📡 Fetched: {len(artist_tracks)} artist + "
            f"{len(broad_tracks)} broad = {len(live_pids)} total"
        )

        # ── STEP 3: upsert every live track (extract + INSERT/UPDATE) ─────────
        loop           = asyncio.get_running_loop()
        upserted_count = 0
        error_count    = 0

        for pid, track in all_tracks.items():
            try:
                ok = await _upsert_track_to_db(track, loop)
                if ok:
                    upserted_count += 1
                    console.log(
                        f"   ✅ Upserted: "
                        f"{track.get('trackName', pid)} "
                        f"by {track.get('artistName', '?')}"
                    )
                else:
                    error_count += 1
            except Exception as e:
                error_count += 1
                console.log(f"   ❌ Upsert error for pid {pid}: {e}")

        console.log(f"   💾 Upserted {upserted_count} tracks ({error_count} errors)")

        # ── STEP 4: mark dropped tracks unavailable ───────────────────────────
        existing_available: set[int] = set()
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT p.ProductID
                        FROM Products p
                        LEFT JOIN Stock s ON s.ProductID = p.ProductID
                        WHERE p.ProductID < 0
                          AND COALESCE(s.IsAvailable, 1) = 1
                        """
                    )
                    existing_available = {int(r["ProductID"]) for r in cursor.fetchall()}

        dropped_pids = sorted(existing_available - live_pids)
        if dropped_pids:
            with get_db_connection() as conn:
                if conn:
                    with conn.cursor() as cursor:
                        _mark_products_unavailable(cursor, dropped_pids)
                        conn.commit()
            console.log(f"   🚫 Marked {len(dropped_pids)} dropped tracks unavailable")

        # ── STEP 5: validate library songs ────────────────────────────────────
        library_available   = 0
        library_unavailable = 0
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT p.ProductID, p.file_url, af.FeatureID
                        FROM Products p
                        LEFT JOIN AudioFeatures af ON af.ProductID = p.ProductID
                        WHERE p.ProductID > 0
                        ORDER BY p.ProductID ASC
                        LIMIT %s
                        """,
                        (LIBRARY_TARGET_COUNT,)
                    )
                    for row in cursor.fetchall():
                        pid      = row["ProductID"]
                        file_url = (row.get("file_url") or "").strip()
                        has_feat = row.get("FeatureID") is not None
                        avail    = 1 if (file_url and has_feat) else 0
                        if avail:
                            library_available += 1
                        else:
                            library_unavailable += 1
                        _upsert_stock(cursor, pid, avail)
                    conn.commit()

        console.log(f"   📚 Library: {library_available} available, {library_unavailable} unavailable")

        # ── STEP 6: purge stale unavailable imports ───────────────────────────
        purged_count = 0
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    purged_count = _purge_stale_unavailable_imports(
                        cursor, STOCK_UNAVAILABLE_RETENTION_DAYS
                    )
                    conn.commit()
        if purged_count:
            console.log(f"   🗑️ Purged {purged_count} stale unavailable imports")

        # ── STEP 7: prune to hard cap ─────────────────────────────────────────
        prune_result = {"pruned": 0, "before": 0, "after": 0}
        if AUDIO_FEATURES_PRUNE_ENABLED:
            prune_result = _prune_imported_audiofeatures(_IMPORT_CAP)
            if prune_result["pruned"]:
                console.log(
                    f"   🧹 Pruned: {prune_result['before']} → {prune_result['after']} "
                    f"({prune_result['pruned']} removed)"
                )

        # ── STEP 8: reload ML cache + sync GenreCluster ───────────────────────
        await ml_service.startup_cache()

        cluster_updates = []
        try:
            cluster_updates = [
                (data.get("genre_cluster"), pid)
                for pid, data in ml_service.audio_features_cache.items()
                if data.get("genre_cluster")
            ]
            if cluster_updates:
                with get_db_connection() as conn:
                    if conn:
                        with conn.cursor() as cursor:
                            cursor.executemany(
                                "UPDATE AudioFeatures SET GenreCluster = %s WHERE ProductID = %s",
                                cluster_updates,
                            )
                            conn.commit()
                console.log(f"   🔄 Synced GenreCluster for {len(cluster_updates)} songs")
        except Exception as e:
            console.log(f"   ⚠️ GenreCluster sync failed: {e}")

        elapsed = (datetime.utcnow() - start_ts).total_seconds()
        summary = {
            "status":                "success",
            "import_cap":            _IMPORT_CAP,
            "artist_tracks_fetched": len(artist_tracks),
            "broad_tracks_fetched":  len(broad_tracks),
            "total_live_tracks":     len(live_pids),
            "upserted":              upserted_count,
            "errors":                error_count,
            "dropped_unavailable":   len(dropped_pids),
            "library_available":     library_available,
            "library_unavailable":   library_unavailable,
            "purged_stale":          purged_count,
            "pruned_imported":       prune_result["pruned"],
            "imported_before_prune": prune_result["before"],
            "imported_after_prune":  prune_result["after"],
            "genre_cluster_synced":  len(cluster_updates),
            "total_in_cache":        len(ml_service.audio_features_cache),
            "elapsed_seconds":       round(elapsed, 1),
        }
        console.log(f"🎉 Refresh complete in {elapsed:.1f}s: {summary}")
        return summary

    except Exception as e:
        console.log(f"❌ Store refresh error: {e}")
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Refresh failed: {str(e)}")
    

@router.get("/api/itunes/topcharts-ranked")
async def get_topcharts_ranked():
    """
    Returns the IDM artist songs from the DB (ProductID < 0, IsAvailable = 1)
    sorted by their popularity position in the iTunes search results.

    Strategy:
      1. Load all available IDM songs from DB (same pool as get_topcharts).
      2. For each artist in ARTISTS, hit the iTunes Search API to get their
         tracks in popularity order (iTunes returns results ranked by
         popularity by default).
      3. Build a rank map: abs(trackId) → position (lower = more popular).
      4. Sort the DB songs by that rank, artist by artist in ARTISTS order.
         Songs with no iTunes rank (e.g. newly imported, lookup miss) are
         appended at the end of their artist group.
      5. Return the sorted list plus the features map (same shape as
         get_topcharts so the frontend can drop in as a replacement).
    """
    try:
        # ── Step 1: load DB songs ────────────────────────────────────────────
        def _query_stock_songs(conn):
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        p.ProductID, p.AlbumTitle, p.ArtistName,
                        p.albumCoverImageUrl, p.preview_url,
                        af.Tempo, af.Energy, af.Valence, af.Danceability,
                        af.Acousticness, af.Genre, af.GenreCluster, af.Mood,
                        af.SpectralCentroid, af.SpectralRolloff, af.ZeroCrossingRate,
                        af.Instrumentalness, af.Speechiness, af.Loudness,
                        af.OnsetRate, af.HarmonicRatio, af.PercussiveRatio,
                        af.Key_Signature, af.TimeSignature, af.Duration
                    FROM Products p
                    JOIN AudioFeatures af ON af.ProductID = p.ProductID
                    LEFT JOIN Stock s     ON s.ProductID  = p.ProductID
                    WHERE p.ProductID < 0
                      AND COALESCE(s.IsAvailable, 1) = 1
                    """
                )
                return cursor.fetchall()

        rows = []
        with get_db_connection() as conn:
            if conn:
                rows = _query_stock_songs(conn)

        if not rows:
            return {"status": "success", "count": 0, "songs": [], "features": {}, "source": "empty"}

        # Build a quick lookup: abs_tid → row
        db_by_tid: dict[int, dict] = {}
        for row in rows:
            abs_tid = abs(int(row["ProductID"]))
            artist  = (row.get("ArtistName") or "").lower()
            # Only include IDM artists
            if any(frag in artist for frag in ["aphex twin", "boards of canada", "squarepusher"]):
                db_by_tid[abs_tid] = row

        if not db_by_tid:
            return {"status": "success", "count": 0, "songs": [], "features": {}, "source": "empty"}

        # ── Step 2: fetch iTunes popularity rank for each artist ─────────────
        # iTunes returns search results ordered by popularity (most popular first).
        # We request 200 results to cover the full catalogue and record each
        # trackId's position in the response as its popularity rank.
        rank_map: dict[int, int] = {}   # abs_tid → rank (0 = most popular)

        async with httpx.AsyncClient(timeout=20.0) as client:
            for artist in ARTISTS:
                try:
                    params = {
                        "term":   artist,
                        "limit":  200,
                        "media":  "music",
                        "entity": "song",
                    }
                    resp = await client.get(f"{ITUNES_API_BASE_URL}/search", params=params)
                    if resp.status_code != 200:
                        console.log(f"   ⚠️ iTunes rank fetch failed for '{artist}': HTTP {resp.status_code}")
                        continue

                    results = resp.json().get("results", [])
                    for position, track in enumerate(results):
                        tid = track.get("trackId")
                        if tid:
                            rank_map[int(tid)] = position

                    console.log(f"   🎵 iTunes rank fetch for '{artist}': {len(results)} results")
                    await asyncio.sleep(0.15)

                except Exception as e:
                    console.log(f"   ⚠️ iTunes rank fetch error for '{artist}': {e}")

        console.log(f"   📊 rank_map has {len(rank_map)} entries")

        # ── Step 3: sort DB songs by artist then by iTunes rank ──────────────
        # Group by artist in canonical order, sort each group by rank.
        ARTIST_FRAGMENTS = [
            ("aphex twin",       "Aphex Twin"),
            ("boards of canada", "Boards of Canada"),
            ("squarepusher",     "Squarepusher"),
        ]

        sorted_rows: list[dict] = []
        for fragment, _ in ARTIST_FRAGMENTS:
            group = [
                row for row in db_by_tid.values()
                if fragment in (row.get("ArtistName") or "").lower()
            ]
            # Sort by iTunes popularity rank; unranked songs go to the end
            group.sort(key=lambda r: rank_map.get(abs(int(r["ProductID"])), 99999))
            sorted_rows.extend(group)

        # ── Step 4: build response (same shape as get_topcharts) ────────────
        songs        = []
        features_map = {}

        for row in sorted_rows:
            pid     = int(row["ProductID"])
            abs_tid = abs(pid)
            preview = row.get("preview_url") or ""
            artwork = row.get("albumCoverImageUrl") or ""

            song = {
                "id":               abs_tid,
                "trackId":          abs_tid,
                "trackName":        row.get("AlbumTitle") or f"Track {abs_tid}",
                "albumTitle":       row.get("AlbumTitle") or f"Track {abs_tid}",
                "artistName":       row.get("ArtistName") or None,
                "collectionName":   None,
                "artworkUrl100":    artwork,
                "previewUrl":       preview,
                "fileUrl":          preview,
                "primaryGenreName": row.get("Genre"),
                "source":           "db_stock",
                "popularityRank":   rank_map.get(abs_tid),   # expose rank for debugging
            }
            songs.append(song)

            cached = (
                ml_service.audio_features_cache.get(-abs_tid)
                or ml_service.audio_features_cache.get(abs_tid)
            )
            entry = _feature_entry_from_cache(cached) if cached else {
                "tempo":            float(row.get("Tempo") or 0),
                "energy":           float(row.get("Energy") or 0),
                "valence":          float(row.get("Valence") or 0),
                "danceability":     float(row.get("Danceability") or 0),
                "acousticness":     float(row.get("Acousticness") or 0)
                                    if row.get("Acousticness") is not None else None,
                "genre":            row.get("Genre"),
                "genreCluster":     row.get("GenreCluster"),
                "mood":             row.get("Mood"),
                "spectralCentroid": row.get("SpectralCentroid"),
                "spectralRolloff":  row.get("SpectralRolloff"),
                "zeroCrossingRate": row.get("ZeroCrossingRate"),
                "instrumentalness": row.get("Instrumentalness"),
                "speechiness":      row.get("Speechiness"),
                "loudness":         row.get("Loudness"),
                "onsetRate":        row.get("OnsetRate"),
                "harmonicRatio":    row.get("HarmonicRatio"),
                "percussiveRatio":  row.get("PercussiveRatio"),
                "keySignature":     row.get("Key_Signature"),
                "timeSignature":    row.get("TimeSignature"),
                "duration":         row.get("Duration"),
            }

            features_map[str(abs_tid)]  = entry
            features_map[str(-abs_tid)] = entry

        console.log(f"✅ get_topcharts_ranked: returning {len(songs)} songs sorted by iTunes popularity")
        return {
            "status":   "success",
            "count":    len(songs),
            "songs":    songs,
            "features": features_map,
            "source":   "db_stock_ranked",
        }

    except Exception as e:
        console.log(f"❌ TopCharts ranked error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===========================================================================
# BACKGROUND SCHEDULER
# ===========================================================================

async def _run_scheduled_refresh(trigger: str) -> bool:
    try:
        console.log(f"⏰ {trigger} store refresh starting (interval={REFRESH_INTERVAL}s)...")
        await refresh_topcharts()
        return True
    except Exception as e:
        console.log(f"⚠️ {trigger} store refresh failed: {e}")
        return False


async def _topcharts_refresh_loop():
    """
    Background coroutine: fires on startup then every REFRESH_INTERVAL seconds.
    """
    if STARTUP_REFRESH_DELAY > 0:
        await asyncio.sleep(STARTUP_REFRESH_DELAY)

    # Always enforce hard cap against whatever is already in the DB before
    # the first refresh, so a restart never serves stale rows beyond _IMPORT_CAP.
    prune = _prune_imported_audiofeatures(_IMPORT_CAP)
    if prune["pruned"] > 0:
        console.log(
            f"🧹 Startup hard-cap prune: {prune['before']} → {prune['after']} "
            f"({prune['pruned']} removed)"
        )
    else:
        console.log(
            f"✅ Startup cap check: {prune['after']} imported songs in DB (cap={_IMPORT_CAP})"
        )

    max_retries = 5
    for attempt in range(1, max_retries + 1):
        success = await _run_scheduled_refresh(f"Startup (attempt {attempt}/{max_retries})")
        if success:
            break
        if attempt < max_retries:
            wait = min(15 * attempt, 60)
            console.log(f"⏳ Retrying startup refresh in {wait}s...")
            await asyncio.sleep(wait)
        else:
            console.log("❌ Startup refresh exhausted all retries — will retry at next interval.")

    while True:
        await asyncio.sleep(REFRESH_INTERVAL)
        await _run_scheduled_refresh("Scheduled")


def start_refresh_scheduler():
    """Start the background refresh loop. Call once from the app startup event."""
    global _refresh_task
    if _refresh_task is None or _refresh_task.done():
        _refresh_task = asyncio.get_event_loop().create_task(_topcharts_refresh_loop())
        console.log(
            f"🕐 Top-charts auto-refresh scheduled: "
            f"startup delay={STARTUP_REFRESH_DELAY}s, interval={REFRESH_INTERVAL}s"
        )


def stop_refresh_scheduler():
    """Cancel the background refresh loop. Call from the app shutdown event."""
    global _refresh_task
    if _refresh_task and not _refresh_task.done():
        _refresh_task.cancel()
        console.log("🛑 Top-charts auto-refresh cancelled")
