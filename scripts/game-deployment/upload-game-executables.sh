#!/bin/bash

# Upload Game Executables to S3 and Update Database
# This script uploads the game .exe files to S3 and updates the database with the download URLs

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Game Executable Upload Script ===${NC}"

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    echo "Install it with: pip install awscli"
    exit 1
fi

# Check for required environment variables
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo -e "${YELLOW}Warning: AWS credentials not found in environment${NC}"
    echo "Make sure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set"
    exit 1
fi

# Configuration
S3_BUCKET="${AWS_S3_BUCKET_NAME:-game-and-music-files}"
S3_REGION="${AWS_REGION:-eu-west-1}"
GAME_EXECUTABLES_DIR="../../game executables"
S3_PREFIX="Game Executables"

echo -e "${GREEN}S3 Bucket: ${S3_BUCKET}${NC}"
echo -e "${GREEN}Region: ${S3_REGION}${NC}"
echo -e "${GREEN}Local Directory: ${GAME_EXECUTABLES_DIR}${NC}"
echo ""

# Navigate to script directory
cd "$(dirname "$0")"

# Check if game executables directory exists
if [ ! -d "$GAME_EXECUTABLES_DIR" ]; then
    echo -e "${RED}Error: Game executables directory not found: ${GAME_EXECUTABLES_DIR}${NC}"
    exit 1
fi

# Upload each game executable
upload_game() {
    local file_path="$1"
    local file_name=$(basename "$file_path")
    local s3_key="${S3_PREFIX}/${file_name}"
    
    echo -e "${YELLOW}Uploading: ${file_name}${NC}"
    
    # Upload to S3 with public-read ACL (if bucket allows)
    # For private buckets, remove --acl and use presigned URLs instead
    aws s3 cp "$file_path" "s3://${S3_BUCKET}/${s3_key}" \
        --region "$S3_REGION" \
        --content-type "application/x-msdownload" \
        --metadata "game-executable=true,uploaded-by=deployment-script"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Uploaded: ${file_name}${NC}"
        
        # Generate the S3 URL
        local s3_url="https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3_key// /%20}"
        echo -e "${GREEN}  URL: ${s3_url}${NC}"
        echo ""
        
        return 0
    else
        echo -e "${RED}✗ Failed to upload: ${file_name}${NC}"
        return 1
    fi
}

# Upload all .exe files
uploaded_count=0
failed_count=0

for exe_file in "$GAME_EXECUTABLES_DIR"/*.exe; do
    if [ -f "$exe_file" ]; then
        if upload_game "$exe_file"; then
            ((uploaded_count++))
        else
            ((failed_count++))
        fi
    fi
done

echo -e "${GREEN}=== Upload Summary ===${NC}"
echo -e "${GREEN}Uploaded: ${uploaded_count}${NC}"
if [ $failed_count -gt 0 ]; then
    echo -e "${RED}Failed: ${failed_count}${NC}"
fi

# Generate SQL update statements
echo ""
echo -e "${GREEN}=== SQL Update Statements ===${NC}"
echo "-- Copy these statements to update the database:"
echo ""

for exe_file in "$GAME_EXECUTABLES_DIR"/*.exe; do
    if [ -f "$exe_file" ]; then
        file_name=$(basename "$exe_file")
        game_name="${file_name%.exe}"
        s3_key="${S3_PREFIX}/${file_name}"
        s3_url="https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3_key// /%20}"
        
        echo "UPDATE Products"
        echo "SET file_url = '${s3_url}'"
        echo "WHERE gameTitle = '${game_name}';"
        echo ""
    fi
done

echo -e "${GREEN}=== Complete ===${NC}"
