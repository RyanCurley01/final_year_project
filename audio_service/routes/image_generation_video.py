# pyright: reportUnusedFunction=false

"""Video export endpoint for hosted image pools.

This module builds a slideshow MP4 from S3-hosted images and optionally mixes
song audio, with range-response support for resumable downloads.
"""

from fastapi import APIRouter, Query, HTTPException, Request
from typing import Optional
import hashlib
import os
import requests
import shutil
import subprocess
import tempfile

from . import image_generation as core

router = APIRouter()


def _generate_export_placeholder_frame(temp_dir: str, width: int = 1080, height: int = 1920) -> str:
    """Generate a portrait procedural thumbnail frame for pool-video exports."""
    placeholder_path = os.path.join(temp_dir, "placeholder_frame.ppm")
    core._generate_procedural_frame(
        out_path=placeholder_path,
        width=width,
        height=height,
        energy=0.5,
        lfc=0.5,
        hfc=0.5,
        spectral_centroid=0.5,
        onset_type="percussion",
        glitch=False,
        seed=1337,
    )
    return placeholder_path


@router.get("/pool-video")
def download_image_pool_video(
    request: Request,
    song_id: int = Query(..., gt=0, description="Song ProductID for hosted pool video export"),
    song_title: str = Query("image-pool", description="Song title used in the downloaded filename"),
    audio_url: Optional[str] = Query(None, description="Optional song audio URL to mux into the video"),
    frame_duration: float = Query(0.45, ge=0.1, le=3.0, description="Seconds each image stays on screen"),
    onset_sync: bool = Query(True, description="When true and audio is available, switch images on detected audio onsets"),
):
    """Create and download an MP4 slideshow containing all hosted pool images for a song."""
    # Hard prerequisites: S3 source images and ffmpeg executable.
    if not core.IMAGE_POOL_S3_BUCKET:
        raise HTTPException(status_code=503, detail="S3 bucket not configured")

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise HTTPException(status_code=503, detail="ffmpeg is not available on this server")

    # Cache key includes request knobs so different options get distinct blobs.
    cache_key = hashlib.md5(
        f"v3|{int(song_id)}|{song_title}|{audio_url or ''}|{float(frame_duration):.3f}|{bool(onset_sync)}".encode("utf-8")
    ).hexdigest()
    cached = core._get_cached_pool_video(cache_key)
    if cached and cached.get("content"):
        return core._pool_video_http_response(
            cached.get("content") or b"",
            cached.get("filename") or f"{core._sanitize_filename(song_title)}-image-pool.mp4",
            request.headers.get("range"),
        )

    # Load ordered hosted image rows from DB.
    rows = []
    try:
        with core.get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
            with conn.cursor() as cursor:
                rows = core._db_fetch_hosted_image_rows(cursor, int(song_id))
                if rows:
                    # Use the same first-row selection logic as the frontend thumbnail.
                    # The frontend calls /api/images/pool?count=1, which uses _db_fetch_images.
                    thumb_rows = core._db_fetch_images(cursor, int(song_id), 1)
                    if thumb_rows:
                        thumb_url = thumb_rows[0].get("url")
                        if thumb_url:
                            match_index = next(
                                (idx for idx, row in enumerate(rows) if (row or {}).get("ImageUrl") == thumb_url),
                                None,
                            )
                            if match_index is not None and match_index > 0:
                                thumb_row = rows.pop(match_index)
                                rows.insert(0, thumb_row)
    except HTTPException:
        raise
    except Exception as e:
        core.console.log(f"❌ Pool video DB lookup failed for ProductID={song_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to load image pool metadata")

    # If the backend pool is still empty, warm up a single LoremFlickr-hosted image
    # so the exported video thumbnail matches the frontend's real pool thumbnail.
    if not rows:
        try:
            inserted = core._quick_warmup_s3_images(
                int(song_id),
                song_title,
                mood=None,
                energy=None,
                valence=None,
                tempo=None,
                danceability=None,
                acousticness=None,
                genre=None,
                max_images=1,
            )
            if inserted > 0:
                with core.get_db_connection() as conn:
                    if conn:
                        with conn.cursor() as cursor:
                            rows = core._db_fetch_hosted_image_rows(cursor, int(song_id))
        except Exception as e:
            core.console.log(f"⚠️ Pool video warmup failed for ProductID={song_id}: {e}")

    placeholder_only = not bool(rows)

    # All intermediate frame/audio/video artifacts live in a temp workspace.
    with tempfile.TemporaryDirectory(prefix=f"pool_video_{int(song_id)}_") as tmp_dir:
        frame_paths: list[str] = []

        for idx, row in enumerate(rows):
            # Read each object from S3 and normalize to a PPM frame for concat.
            storage_key = (row or {}).get("StorageKey")
            if not storage_key:
                continue

            obj = core.get_object_stream(core.IMAGE_POOL_S3_BUCKET, storage_key)
            if not obj:
                continue

            body, content_type, _content_length = obj
            try:
                data = body.read()
            except Exception:
                data = None
            finally:
                try:
                    body.close()
                except Exception:
                    pass

            if not data:
                continue

            content_type = ((row or {}).get("ContentType") or "").strip().lower()
            source_ext = core._ext_from_content_type(content_type)
            source_path = os.path.join(tmp_dir, f"source_{idx:05d}{source_ext}")
            with open(source_path, "wb") as frame_file:
                frame_file.write(data)

            normalized_path = os.path.join(tmp_dir, f"frame_{idx:05d}.ppm")
            if core._normalize_image_to_ppm(ffmpeg_bin, source_path, normalized_path):
                frame_paths.append(normalized_path)
            else:
                core.console.log(f"⚠️ Failed to normalize pool image frame ProductID={song_id} idx={idx}")

        if not frame_paths:
            if placeholder_only:
                placeholder_path = _generate_export_placeholder_frame(tmp_dir, width=1080, height=1920)
                frame_paths.append(placeholder_path)
            else:
                raise HTTPException(status_code=404, detail="Hosted pool images are missing in storage")

        audio_file = ""
        if audio_url:
            # Optional audio download for mux step with a hard size cap.
            audio_file = os.path.join(tmp_dir, "song_audio.bin")
            try:
                timeout = (10, 60)
                with requests.get(audio_url, stream=True, timeout=timeout, allow_redirects=True) as audio_resp:
                    audio_resp.raise_for_status()
                    max_audio_bytes = 150 * 1024 * 1024
                    written = 0
                    with open(audio_file, "wb") as out_audio:
                        for chunk in audio_resp.iter_content(chunk_size=64 * 1024):
                            if not chunk:
                                continue
                            written += len(chunk)
                            if written > max_audio_bytes:
                                raise ValueError("Audio file too large")
                            out_audio.write(chunk)
            except Exception as e:
                core.console.log(f"⚠️ Pool video audio download failed ProductID={song_id}: {e}")
                audio_file = ""

        concat_file = os.path.join(tmp_dir, "frames.txt")
        # Build either onset-aligned or fixed-duration manifest.
        if onset_sync and audio_file and os.path.exists(audio_file) and os.path.getsize(audio_file) > 0:
            manifest_meta = core._build_concat_manifest_with_onsets(
                manifest_path=concat_file,
                temp_dir=tmp_dir,
                frame_paths=frame_paths,
                audio_file=audio_file,
                fallback_frame_duration=float(frame_duration),
            )
        else:
            manifest_meta = core._build_concat_manifest_with_onsets(
                manifest_path=concat_file,
                temp_dir=tmp_dir,
                frame_paths=frame_paths,
                audio_file="",
                fallback_frame_duration=float(frame_duration),
            )

        silent_video_file = os.path.join(tmp_dir, "pool_video_silent.mp4")
        # Pass 1: render silent slideshow video in portrait TikTok dimensions.
        build_cmd = [
            ffmpeg_bin,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            concat_file,
            "-vsync",
            "vfr",
            "-vf",
            "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            silent_video_file,
        ]

        try:
            proc = subprocess.run(build_cmd, capture_output=True, text=True, timeout=180, check=False)
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Video generation timed out")

        if proc.returncode != 0 or not os.path.exists(silent_video_file):
            core.console.log(
                f"❌ ffmpeg pool video generation failed ProductID={song_id}: "
                f"returncode={proc.returncode} stderr={proc.stderr[-1200:] if proc.stderr else ''}"
            )
            raise HTTPException(status_code=500, detail="Failed to generate image pool video")

        final_video_file = silent_video_file

        if audio_file and os.path.exists(audio_file) and os.path.getsize(audio_file) > 0:
            # Pass 2: mux audio, loop visuals, trim to shortest stream.
            with_audio_file = os.path.join(tmp_dir, "pool_video_with_audio.mp4")
            mux_cmd = [
                ffmpeg_bin,
                "-y",
                "-stream_loop",
                "-1",
                "-i",
                silent_video_file,
                "-i",
                audio_file,
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-shortest",
                "-movflags",
                "+faststart",
                with_audio_file,
            ]

            try:
                mux_proc = subprocess.run(mux_cmd, capture_output=True, text=True, timeout=240, check=False)
                if mux_proc.returncode == 0 and os.path.exists(with_audio_file):
                    final_video_file = with_audio_file
                    if manifest_meta.get("used_onsets"):
                        core.console.log(
                            f"🎬 Pool video onset-sync ProductID={song_id} "
                            f"intervals={manifest_meta.get('interval_count')} "
                            f"audio_secs={manifest_meta.get('audio_duration'):.2f} "
                            f"procedural={manifest_meta.get('procedural_count')} "
                            f"glitch={manifest_meta.get('glitch_count')}"
                        )
                else:
                    core.console.log(
                        f"⚠️ Pool video mux failed ProductID={song_id}: "
                        f"returncode={mux_proc.returncode} stderr={mux_proc.stderr[-1200:] if mux_proc.stderr else ''}"
                    )
            except subprocess.TimeoutExpired:
                core.console.log(f"⚠️ Pool video mux timeout ProductID={song_id}")

        with open(final_video_file, "rb") as video_file:
            video_bytes = video_file.read()

    # Cache final bytes and serve with RFC-compliant range support.
    filename = f"{core._sanitize_filename(song_title)}-image-pool.mp4"
    core._cache_pool_video(cache_key, video_bytes, filename)
    return core._pool_video_http_response(video_bytes, filename, request.headers.get("range"))
