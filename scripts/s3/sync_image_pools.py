#!/usr/bin/env python3
"""
Reconcile ImageGeneration (Provider='s3') with S3 image pool objects.

What this script does:
1) Enforces per-song cap (default 80) by keeping newest DB rows and deleting overflow rows.
2) Deletes overflow and orphan S3 objects under the pool prefix.
3) Optionally backfills missing S3 objects for kept rows using SourceUrl.
4) Updates DB metadata when a backfill upload succeeds.

Run in dry-run first:
  python scripts/s3/sync_image_pools.py

Apply changes:
  python scripts/s3/sync_image_pools.py --apply
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

import boto3
import pymysql
import requests
from dotenv import load_dotenv


DEFAULT_TARGET_SIZE = 80
DEFAULT_S3_PREFIX = "generated-images"
DEFAULT_DOWNLOAD_TIMEOUT_SECS = 10
DEFAULT_DOWNLOAD_LIMIT_BYTES = 8_000_000


def _load_env_files() -> None:
    candidates: List[Path] = []

    script_path = Path(__file__).resolve()
    candidates.extend(script_path.parents)

    cwd = Path.cwd().resolve()
    candidates.append(cwd)
    candidates.extend(cwd.parents)

    seen: Set[Path] = set()
    for root in candidates:
        if root in seen:
            continue
        seen.add(root)
        for env_path in (root / "audio_service" / ".env", root / ".env"):
            if env_path.exists():
                load_dotenv(env_path, override=False)


_load_env_files()


@dataclass
class DbRow:
    image_gen_id: int
    product_id: int
    provider: str
    storage_key: Optional[str]
    source_url: Optional[str]
    image_url: Optional[str]
    content_type: Optional[str]
    byte_size: Optional[int]
    url_hash: str


@dataclass(frozen=True)
class S3Object:
    key: str
    product_id: int
    url_hash: str
    byte_size: int
    content_type: Optional[str]
    last_modified_ts: float
    public_url: str


@dataclass
class Plan:
    overflow_db_ids: List[int]
    overflow_keys: Set[str]
    orphan_s3_keys: Set[str]
    missing_kept_rows: List[DbRow]
    missing_db_objects: List[S3Object]
    refresh_db_objects: List[S3Object]
    kept_keys_expected: Set[str]


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None or str(value).strip() == "":
        return default
    return value


def _required(name: str, value: Optional[str]) -> str:
    if not value:
        raise ValueError(f"Missing required setting: {name}")
    return value


def _mysql_conn() -> pymysql.connections.Connection:
    host = _required("MYSQL_HOST", _env("MYSQL_HOST"))
    port = int(_env("MYSQL_PORT", "3306"))
    user = _required("MYSQL_USER", _env("MYSQL_USER"))
    password = _required("MYSQL_PASSWORD", _env("MYSQL_PASSWORD"))
    database = _required("MYSQL_DATABASE", _env("MYSQL_DATABASE"))

    return pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def _s3_client():
    region = _required("AWS_REGION", _env("AWS_REGION", _env("AWS_DEFAULT_REGION", "eu-west-1")))
    access_key = _env("AWS_ACCESS_KEY_ID")
    secret_key = _env("AWS_SECRET_ACCESS_KEY")

    kwargs = {"service_name": "s3", "region_name": region}
    if access_key and secret_key:
        kwargs["aws_access_key_id"] = access_key
        kwargs["aws_secret_access_key"] = secret_key
    return boto3.client(**kwargs)


def _public_s3_url(bucket: str, region: str, key: str) -> str:
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"


def _build_local_image_url(product_id: int, url_hash: str) -> str:
    return f"/api/images/file/{int(product_id)}/{str(url_hash)}"


def _guess_ext_from_content_type(content_type: Optional[str]) -> str:
    if not content_type:
        return ".img"
    c = content_type.lower().strip()
    if c == "image/jpeg":
        return ".jpg"
    if c == "image/png":
        return ".png"
    if c == "image/webp":
        return ".webp"
    if c == "image/gif":
        return ".gif"
    return ".img"


def _guess_content_type_from_key(key: str) -> str:
    lower = str(key).strip().lower()
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return "image/jpeg"
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".gif"):
        return "image/gif"
    return "application/octet-stream"


def _build_storage_key(prefix: str, row: DbRow) -> str:
    ext = _guess_ext_from_content_type(row.content_type)
    return f"{prefix}/{row.product_id}/{row.url_hash}{ext}"


def _parse_pool_key(prefix: str, key: str) -> Optional[Tuple[int, str]]:
    cleaned_prefix = str(prefix).strip().strip("/")
    cleaned_key = str(key).strip()
    expected_prefix = f"{cleaned_prefix}/"
    if not cleaned_key.startswith(expected_prefix):
        return None

    remainder = cleaned_key[len(expected_prefix):]
    parts = remainder.split("/")
    if len(parts) != 2:
        return None

    product_part, filename = parts
    if "." not in filename:
        return None

    try:
        product_id = int(product_part)
    except ValueError:
        return None

    url_hash = filename.rsplit(".", 1)[0].strip()
    if not url_hash:
        return None
    return product_id, url_hash


def _list_pool_objects(s3, bucket: str, prefix: str, region: str) -> Tuple[List[S3Object], Set[str]]:
    objects: List[S3Object] = []
    invalid_keys: Set[str] = set()
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=f"{prefix}/"):
        for obj in page.get("Contents", []):
            key = str(obj.get("Key") or "").strip()
            if not key:
                continue

            parsed = _parse_pool_key(prefix, key)
            if not parsed:
                invalid_keys.add(key)
                continue

            product_id, url_hash = parsed
            last_modified = obj.get("LastModified")
            last_modified_ts = float(last_modified.timestamp()) if last_modified else 0.0
            objects.append(
                S3Object(
                    key=key,
                    product_id=product_id,
                    url_hash=url_hash,
                    byte_size=int(obj.get("Size") or 0),
                    content_type=_guess_content_type_from_key(key),
                    last_modified_ts=last_modified_ts,
                    public_url=_public_s3_url(bucket, region, key),
                )
            )
    return objects, invalid_keys


def _fetch_db_rows(conn) -> List[DbRow]:
    sql = """
        SELECT
            ImageGenID,
            ProductID,
            Provider,
            StorageKey,
            SourceUrl,
            ImageUrl,
            ContentType,
            ByteSize,
            UrlHash
        FROM ImageGeneration
        WHERE Provider = 's3'
    """
    with conn.cursor() as cursor:
        cursor.execute(sql)
        rows = cursor.fetchall() or []

    out: List[DbRow] = []
    for row in rows:
        out.append(
            DbRow(
                image_gen_id=int(row["ImageGenID"]),
                product_id=int(row["ProductID"]),
                provider=str(row["Provider"]),
                storage_key=(str(row.get("StorageKey") or "").strip() or None),
                source_url=(str(row.get("SourceUrl") or "").strip() or None),
                image_url=(str(row.get("ImageUrl") or "").strip() or None),
                content_type=(str(row.get("ContentType") or "").strip() or None),
                byte_size=int(row.get("ByteSize") or 0) or None,
                url_hash=str(row["UrlHash"]),
            )
        )
    return out


def _group_rows(rows: Iterable[DbRow]) -> Dict[int, List[DbRow]]:
    grouped: Dict[int, List[DbRow]] = defaultdict(list)
    for row in rows:
        grouped[row.product_id].append(row)
    for pid in grouped:
        grouped[pid].sort(key=lambda r: r.image_gen_id, reverse=True)
    return grouped


def _group_objects(objects: Iterable[S3Object]) -> Dict[int, List[S3Object]]:
    grouped: Dict[int, List[S3Object]] = defaultdict(list)
    for obj in objects:
        grouped[obj.product_id].append(obj)
    for pid in grouped:
        grouped[pid].sort(key=lambda o: (o.last_modified_ts, o.key), reverse=True)
    return grouped


def _fetch_existing_product_ids(conn, product_ids: Set[int]) -> Set[int]:
    if not product_ids:
        return set()

    found: Set[int] = set()
    with conn.cursor() as cursor:
        product_list = sorted(int(pid) for pid in product_ids)
        for chunk in _chunked(product_list, 500):
            placeholders = ",".join(["%s"] * len(chunk))
            cursor.execute(
                f"SELECT ProductID FROM Products WHERE ProductID IN ({placeholders})",
                chunk,
            )
            for row in cursor.fetchall() or []:
                found.add(int(row["ProductID"]))
    return found


def _build_plan(
    conn,
    rows: List[DbRow],
    s3_objects: List[S3Object],
    invalid_s3_keys: Set[str],
    target_size: int,
    s3_prefix: str,
) -> Plan:
    grouped_objects = _group_objects(s3_objects)
    row_by_key: Dict[str, DbRow] = {}
    for row in rows:
        key = row.storage_key or _build_storage_key(s3_prefix, row)
        row_by_key[key] = row

    product_ids_in_s3 = {obj.product_id for obj in s3_objects}
    existing_product_ids = _fetch_existing_product_ids(conn, product_ids_in_s3)
    s3_keys = {obj.key for obj in s3_objects}

    overflow_db_ids: List[int] = []
    overflow_keys: Set[str] = set()
    orphan_s3_keys: Set[str] = set(invalid_s3_keys)
    missing_kept_rows: List[DbRow] = []
    missing_db_objects: List[S3Object] = []
    refresh_db_objects: List[S3Object] = []
    kept_keys_expected: Set[str] = set()

    represented_row_ids: Set[int] = set()

    for product_id, objects in grouped_objects.items():
        kept = objects[:target_size]
        overflow = objects[target_size:]

        if product_id not in existing_product_ids:
            orphan_s3_keys.update(obj.key for obj in kept)
            orphan_s3_keys.update(obj.key for obj in overflow)
            continue

        for obj in kept:
            kept_keys_expected.add(obj.key)
            db_row = row_by_key.get(obj.key)
            if not db_row:
                missing_db_objects.append(obj)
                continue

            represented_row_ids.add(db_row.image_gen_id)

            expected_image_url = _build_local_image_url(obj.product_id, obj.url_hash)
            if (
                db_row.storage_key != obj.key
                or db_row.image_url != expected_image_url
                or (db_row.byte_size or 0) != int(obj.byte_size or 0)
                or (db_row.content_type or "") != (obj.content_type or "")
            ):
                refresh_db_objects.append(obj)

        for obj in overflow:
            overflow_keys.add(obj.key)
            db_row = row_by_key.get(obj.key)
            if db_row:
                overflow_db_ids.append(db_row.image_gen_id)
                represented_row_ids.add(db_row.image_gen_id)

    for row in rows:
        key = row.storage_key or _build_storage_key(s3_prefix, row)
        if key in overflow_keys:
            continue
        if key not in s3_keys:
            missing_kept_rows.append(row)

    return Plan(
        overflow_db_ids=overflow_db_ids,
        overflow_keys=overflow_keys,
        orphan_s3_keys=orphan_s3_keys,
        missing_kept_rows=missing_kept_rows,
        missing_db_objects=missing_db_objects,
        refresh_db_objects=refresh_db_objects,
        kept_keys_expected=kept_keys_expected,
    )


def _chunked(values: List[int], size: int = 500) -> Iterable[List[int]]:
    for i in range(0, len(values), size):
        yield values[i : i + size]


def _delete_db_rows(conn, image_gen_ids: List[int]) -> int:
    if not image_gen_ids:
        return 0
    deleted = 0
    with conn.cursor() as cursor:
        for chunk in _chunked(image_gen_ids, 500):
            placeholders = ",".join(["%s"] * len(chunk))
            sql = f"DELETE FROM ImageGeneration WHERE ImageGenID IN ({placeholders})"
            cursor.execute(sql, chunk)
            deleted += int(cursor.rowcount or 0)
    return deleted


def _delete_s3_keys(s3, bucket: str, keys: Set[str]) -> int:
    if not keys:
        return 0
    key_list = list(keys)
    deleted = 0
    for i in range(0, len(key_list), 1000):
        batch = key_list[i : i + 1000]
        response = s3.delete_objects(
            Bucket=bucket,
            Delete={"Objects": [{"Key": k} for k in batch], "Quiet": True},
        )
        deleted += len(response.get("Deleted", []))
    return deleted


def _download_source(url: str, timeout_secs: int, max_bytes: int) -> Tuple[bytes, str]:
    with requests.get(url, timeout=timeout_secs, stream=True) as resp:
        resp.raise_for_status()
        content_type = (resp.headers.get("Content-Type") or "").split(";")[0].strip() or "image/jpeg"
        chunks: List[bytes] = []
        size = 0
        for chunk in resp.iter_content(chunk_size=65536):
            if not chunk:
                continue
            size += len(chunk)
            if size > max_bytes:
                raise ValueError(f"download too large ({size} bytes > {max_bytes})")
            chunks.append(chunk)
        return b"".join(chunks), content_type


def _backfill_missing_rows(
    conn,
    s3,
    bucket: str,
    s3_prefix: str,
    rows: List[DbRow],
    timeout_secs: int,
    max_bytes: int,
    apply: bool,
) -> Tuple[int, int]:
    uploaded = 0
    failed = 0

    for row in rows:
        if not row.source_url:
            failed += 1
            continue

        target_key = row.storage_key or _build_storage_key(s3_prefix, row)
        try:
            data, content_type = _download_source(row.source_url, timeout_secs=timeout_secs, max_bytes=max_bytes)

            if apply:
                s3.put_object(
                    Bucket=bucket,
                    Key=target_key,
                    Body=data,
                    ContentType=content_type,
                    CacheControl="public, max-age=31536000, immutable",
                    Metadata={"product_id": str(row.product_id), "source": "sourceurl-backfill"},
                )

                image_url = f"/api/images/file/{row.product_id}/{row.url_hash}"
                with conn.cursor() as cursor:
                    cursor.execute(
                        """
                        UPDATE ImageGeneration
                        SET StorageKey = %s,
                            ContentType = %s,
                            ByteSize = %s,
                            ImageUrl = %s
                        WHERE ImageGenID = %s
                        """,
                        (target_key, content_type, len(data), image_url, row.image_gen_id),
                    )

            uploaded += 1
        except Exception:
            failed += 1

    return uploaded, failed


def _upsert_db_rows_from_s3(conn, objects: List[S3Object]) -> int:
    if not objects:
        return 0

    payload = [
        (
            obj.product_id,
            "s3",
            None,
            obj.public_url,
            obj.key,
            obj.content_type,
            obj.byte_size,
            _build_local_image_url(obj.product_id, obj.url_hash),
            obj.url_hash,
            1980,
            1280,
            None,
        )
        for obj in objects
    ]

    with conn.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO ImageGeneration
                (ProductID, Provider, KeywordTag, SourceUrl, StorageKey, ContentType, ByteSize,
                 ImageUrl, UrlHash, Width, Height, LockId)
            VALUES
                (%s, %s, %s, %s, %s, %s, %s,
                 %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                Provider = VALUES(Provider),
                SourceUrl = COALESCE(ImageGeneration.SourceUrl, VALUES(SourceUrl)),
                StorageKey = VALUES(StorageKey),
                ContentType = VALUES(ContentType),
                ByteSize = VALUES(ByteSize),
                ImageUrl = VALUES(ImageUrl)
            """,
            payload,
        )
        return int(cursor.rowcount or 0)


def _print_summary(plan: Plan, song_count: int, s3_count: int, target_size: int):
    print("\n=== Image Pool Sync Plan ===")
    print(f"Songs with s3 rows: {song_count}")
    print(f"S3 objects under prefix: {s3_count}")
    print(f"Target images per song: {target_size}")
    print(f"Overflow DB rows to delete: {len(plan.overflow_db_ids)}")
    print(f"Overflow keys to delete from S3: {len(plan.overflow_keys)}")
    print(f"Orphan keys to delete from S3: {len(plan.orphan_s3_keys)}")
    print(f"Missing kept rows eligible for backfill: {len(plan.missing_kept_rows)}")
    print(f"Missing DB rows to insert from S3: {len(plan.missing_db_objects)}")
    print(f"Existing DB rows to refresh from S3: {len(plan.refresh_db_objects)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync ImageGeneration s3 pools with S3 bucket")
    parser.add_argument("--apply", action="store_true", help="Apply changes (default is dry-run)")
    parser.add_argument("--target-size", type=int, default=DEFAULT_TARGET_SIZE, help="Per-song image cap")
    parser.add_argument(
        "--s3-prefix",
        default=_env("IMAGE_POOL_S3_PREFIX", DEFAULT_S3_PREFIX),
        help="S3 prefix for generated images",
    )
    parser.add_argument(
        "--bucket",
        default=_env("IMAGE_POOL_S3_BUCKET", _env("AWS_S3_BUCKET_NAME")),
        help="S3 bucket for generated images",
    )
    parser.add_argument("--skip-backfill", action="store_true", help="Do not upload missing kept rows from SourceUrl")
    parser.add_argument("--download-timeout", type=int, default=DEFAULT_DOWNLOAD_TIMEOUT_SECS)
    parser.add_argument("--download-max-bytes", type=int, default=DEFAULT_DOWNLOAD_LIMIT_BYTES)
    args = parser.parse_args()

    if args.target_size < 1:
        print("target-size must be >= 1", file=sys.stderr)
        return 2

    try:
        bucket = _required("bucket", args.bucket)
        s3_prefix = str(args.s3_prefix).strip().strip("/")
        region = _required("AWS_REGION", _env("AWS_REGION", _env("AWS_DEFAULT_REGION", "eu-west-1")))

        conn = _mysql_conn()
        s3 = _s3_client()

        rows = _fetch_db_rows(conn)
        grouped = _group_rows(rows)
        s3_objects, invalid_s3_keys = _list_pool_objects(s3, bucket, s3_prefix, region)

        plan = _build_plan(conn, rows, s3_objects, invalid_s3_keys, args.target_size, s3_prefix)
        _print_summary(plan, song_count=len(grouped), s3_count=len(s3_objects), target_size=args.target_size)

        if not args.apply:
            print("\nDry-run only. Re-run with --apply to execute.")
            conn.close()
            return 0

        inserted_from_s3 = len(plan.missing_db_objects)
        refreshed_from_s3 = len(plan.refresh_db_objects)
        _upsert_db_rows_from_s3(conn, plan.missing_db_objects + plan.refresh_db_objects)

        deleted_rows = _delete_db_rows(conn, plan.overflow_db_ids)
        deleted_overflow_s3 = _delete_s3_keys(s3, bucket, plan.overflow_keys)
        deleted_orphan_s3 = _delete_s3_keys(s3, bucket, plan.orphan_s3_keys)

        uploaded = 0
        failed = 0
        if not args.skip_backfill:
            uploaded, failed = _backfill_missing_rows(
                conn=conn,
                s3=s3,
                bucket=bucket,
                s3_prefix=s3_prefix,
                rows=plan.missing_kept_rows,
                timeout_secs=args.download_timeout,
                max_bytes=args.download_max_bytes,
                apply=True,
            )

        conn.commit()
        conn.close()

        print("\n=== Applied Changes ===")
        print(f"Deleted DB overflow rows: {deleted_rows}")
        print(f"Deleted S3 overflow keys: {deleted_overflow_s3}")
        print(f"Deleted S3 orphan keys: {deleted_orphan_s3}")
        print(f"Inserted DB rows from S3: {inserted_from_s3}")
        print(f"Refreshed DB rows from S3: {refreshed_from_s3}")
        print(f"Backfilled missing kept rows: {uploaded}")
        print(f"Backfill failures: {failed}")
        print("\nDone.")
        return 0

    except Exception as exc:
        print(f"\nError: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
