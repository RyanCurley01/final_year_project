# audio_service/s3_service.py
import boto3
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
