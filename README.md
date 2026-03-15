# final_year_project

## Image Generation

This project uses a frontend image orchestrator plus backend FastAPI routes to
build song-aware image pools and optional slideshow videos.

### End-to-End Sequence (Order of Use)

1. Frontend initializes song image context.
	The UI component (`OnsetImageCard`) calls the image service to initialize a
	pool for the active song.

2. Frontend requests pool images from backend.
	The service calls `GET /api/images/pool` with song metadata and audio
	features (`mood`, `energy`, `valence`, `tempo`, `danceability`,
	`acousticness`, `genre`).

3. Backend validates the request.
	The pool endpoint validates `song_id`, checks library-song rules, and
	verifies that the product exists in the database.

4. Backend trims and reads the hosted pool.
	Existing hosted rows are trimmed to the configured pool size, stale storage
	keys are optionally deleted from S3, and current hosted images are fetched.

5. Backend schedules refill when pool is short.
	If the pool has fewer images than target size, a background refill job is
	scheduled (with per-song throttling). For tiny first requests, a small
	synchronous warmup can run.

6. Keyword and safety logic is applied before provider usage.
	Text values are tokenized, blocked terms are filtered, and only verified
	safe keywords are used. Audio features are mapped into safe keyword groups.

7. LoremFlickr URLs are generated.
	Each URL uses one keyword plus a `lock` parameter so requests can vary while
	staying provider-safe.

8. Images are downloaded and moderated before persistence.
	Downloaded bytes are validated as image content, then moderation checks run:
	face detection (Haar cascade on grayscale) and red-border detection on image
	edge pixels.

9. Approved images are hosted to S3 and inserted in DB.
	Passed images are uploaded to S3, stored as hosted image records
	(`Provider='s3'`), and returned to clients via stable `/api/images/file/...`
	URLs.

10. Frontend preloads and consumes pool images on onsets.
	 The frontend preloads a window of upcoming URLs and swaps images on onset
	 events. If a real image is not ready at onset time, it shows a procedural
	 fallback frame and swaps to a real image as soon as it becomes ready.

11. Prompt-search route uses short TTL cache.
	 `GET /api/images/search` caches generated URL lists by normalized prompt
	 hash for a short TTL, reducing repeated prompt-processing work.

12. Optional pool-video export uses hosted pool + ffmpeg.
	 `GET /api/images/pool-video` loads hosted rows, normalizes frames,
	 optionally detects audio onsets for variable frame timing, renders a silent
	 slideshow, optionally muxes audio, caches output bytes, and serves the MP4
	 with HTTP range support.

### Key Backend Modules

- `audio_service/routes/image_generation.py`: Core orchestration helpers
  (refill scheduling, moderation, hosting, manifest/video helpers, shared
  utility logic).
- `audio_service/routes/image_generation_endpoints.py`: HTTP endpoints for
  `/search`, `/pool`, `/file/{product_id}/{url_hash}`, `/health`.
- `audio_service/routes/image_generation_video.py`: HTTP endpoint for
  `/pool-video`.
- `audio_service/routes/image_generation_keywords.py`: Tokenization, banned
  term filtering, and audio-feature-to-keyword mapping.
- `audio_service/routes/image_generation_cache.py`: In-memory prompt cache for
  `/search`.
- `audio_service/routes/image_generation_db.py`: SQL-focused read/write helpers
  for image pool state.