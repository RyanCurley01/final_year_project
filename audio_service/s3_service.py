# audio_service/s3_service.py
import boto3
from botocore.exceptions import ClientError
from urllib.parse import urlparse, unquote
from botocore.config import Config
from config import S3_CONFIG
from utils import console

# Initialize S3 client with Signature V4 (required for eu-west-1 and most regions)
# EXECUTION ORDER: Initialization runs on module import.
s3_client = None
try:
    if S3_CONFIG['access_key'] and S3_CONFIG['secret_key']:
        
        # Configure S3 client with Signature V4 and proper endpoint
        s3_config = Config(
            signature_version='s3v4',
            s3={'addressing_style': 'virtual'}
        )
        
        s3_client = boto3.client(
            's3',
            region_name=S3_CONFIG['region'],
            aws_access_key_id=S3_CONFIG['access_key'],
            aws_secret_access_key=S3_CONFIG['secret_key'],
            config=s3_config
        )
        console.log(f"✅ S3 client initialized for presigned URLs (region: {S3_CONFIG['region']}, signature: v4)")
    else:
        console.log("⚠️  AWS credentials not found. Presigned URLs will not be generated.")
except Exception as e:
    console.log(f"⚠️  Failed to initialize S3 client: {e}")
    s3_client = None

# EXECUTION ORDER: Called when URL generation is needed (API response preparation)
# Depends on s3_client being initialized.
def generate_presigned_url(s3_url: str) -> str:
    """
    Generate a presigned URL for an S3 object.
    
    Args:
        s3_url: Full S3 URL (e.g., https://bucket.s3.region.amazonaws.com/key)
    
    Returns:
        Presigned URL or original URL if presigning fails
    """
    if not s3_url or not s3_client:
        return s3_url
    
    try:
        # Extract the S3 key from the URL
        # Format: https://bucket.s3.region.amazonaws.com/path/to/file
        parsed = urlparse(s3_url)
        key = parsed.path.lstrip('/')
        
        # URL decode the key (database has URL-encoded paths, S3 keys have literal characters)
        key = unquote(key)
        
        # Generate presigned URL
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': S3_CONFIG['bucket_name'],
                'Key': key
            },
            ExpiresIn=S3_CONFIG['url_expiration']
        )
        
        return presigned_url
    except Exception as e:
        console.log(f"Error generating presigned URL for {s3_url}: {e}")
        return s3_url  # Return original URL as fallback


def upload_bytes(
    bucket_name: str,
    object_key: str,
    data: bytes,
    *,
    content_type: str | None = None,
    cache_control: str | None = None,
    metadata: dict | None = None,
):
    """Upload bytes to S3.

    Note: Whether objects are publicly readable depends on your bucket policy.
    We intentionally do not set ACLs here.
    """
    if s3_client is None:
        return False

    extra_args: dict = {}
    if content_type:
        extra_args["ContentType"] = content_type
    if cache_control:
        extra_args["CacheControl"] = cache_control
    if metadata:
        extra_args["Metadata"] = metadata

    try:
        s3_client.put_object(Bucket=bucket_name, Key=object_key, Body=data, **extra_args)
        return True
    except ClientError as e:
        console.log(f"Error uploading to S3 ({bucket_name}/{object_key}): {e}")
        return False


def get_object_stream(bucket_name: str, object_key: str):
    """Fetch an object from S3 and return (stream, content_type, content_length)."""
    if s3_client is None:
        return None
    try:
        obj = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        body = obj.get("Body")
        content_type = obj.get("ContentType")
        content_length = obj.get("ContentLength")
        return body, content_type, content_length
    except ClientError as e:
        console.log(f"Error fetching S3 object ({bucket_name}/{object_key}): {e}")
        return None


def delete_object(bucket_name: str, object_key: str) -> bool:
    """Delete an object from S3. Returns True on success."""
    if s3_client is None:
        return False
    try:
        s3_client.delete_object(Bucket=bucket_name, Key=object_key)
        return True
    except ClientError as e:
        console.log(f"Error deleting S3 object ({bucket_name}/{object_key}): {e}")
        return False


def object_exists(bucket_name: str, object_key: str) -> bool:
    """Return True when an S3 object exists."""
    if s3_client is None:
        return False
    try:
        s3_client.head_object(Bucket=bucket_name, Key=object_key)
        return True
    except ClientError:
        return False


def list_object_keys(bucket_name: str, prefix: str) -> list[str]:
    """List all object keys for a prefix (handles pagination)."""
    if s3_client is None:
        return []

    keys: list[str] = []
    token = None
    try:
        while True:
            kwargs = {"Bucket": bucket_name, "Prefix": prefix, "MaxKeys": 1000}
            if token:
                kwargs["ContinuationToken"] = token
            resp = s3_client.list_objects_v2(**kwargs)
            for obj in resp.get("Contents") or []:
                key = obj.get("Key")
                if key:
                    keys.append(str(key))

            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
            if not token:
                break
    except ClientError as e:
        console.log(f"Error listing S3 objects ({bucket_name}/{prefix}): {e}")
        return []

    return keys
