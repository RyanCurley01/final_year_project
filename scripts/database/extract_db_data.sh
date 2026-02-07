#!/bin/bash

# Configuration
CONTAINER_NAME="gamestore_services-db-1"
DB_USER="root"
DB_PASS="rootpassword"
DB_NAME="Game_Store_System"

echo "Extracting data from Docker container '$CONTAINER_NAME'..."

# Output files
PRODUCTS_FILE="products_data.sql"
AUDIO_FILE="audio_features_data.sql"

# 1. Extract Products Table
echo "Generating $PRODUCTS_FILE..."
# --no-create-info: Don't output CREATE TABLE statements
# --complete-insert: Include column names in INSERT (safer)
# --compact: Less noise
# --skip-extended-insert: Use 1 line per row (to make it easier to merge/browse)
# --skip-comments: Clean output
docker exec "$CONTAINER_NAME" mysqldump -u "$DB_USER" -p"$DB_PASS" \
    --no-create-info \
    --complete-insert \
    --skip-extended-insert \
    --skip-comments \
    --compact \
    "$DB_NAME" Products > "$PRODUCTS_FILE"

# 2. Extract AudioFeatures Table
echo "Generating $AUDIO_FILE..."
docker exec "$CONTAINER_NAME" mysqldump -u "$DB_USER" -p"$DB_PASS" \
    --no-create-info \
    --complete-insert \
    --skip-extended-insert \
    --skip-comments \
    --compact \
    "$DB_NAME" AudioFeatures > "$AUDIO_FILE"

echo "Done!"
echo "--------------------------------------------------------"
echo "You can now copy the INSERT statements from:"
echo "  - $PRODUCTS_FILE"
echo "  - $AUDIO_FILE"
echo "into your deployment/init-database.sh and deployment/railway-init.sql scripts."
echo "--------------------------------------------------------"
