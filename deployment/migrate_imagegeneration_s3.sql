-- Adds S3-hosting metadata fields to ImageGeneration for stable hosted URLs.
-- Safe to run multiple times (guards included where possible).

-- NOTE: MySQL doesn't support IF NOT EXISTS for ADD COLUMN in older versions.
-- If your MySQL errors on duplicate column, remove the already-added lines and re-run.

ALTER TABLE ImageGeneration
  ADD COLUMN SourceUrl TEXT NULL,
  ADD COLUMN StorageKey VARCHAR(512) NULL,
  ADD COLUMN ContentType VARCHAR(64) NULL,
  ADD COLUMN ByteSize INT NULL;

CREATE INDEX idx_provider ON ImageGeneration (Provider);
