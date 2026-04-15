#!/usr/bin/env bash
set -euo pipefail

echo "Running devcontainer post-create steps..."

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
max_attempts=30
attempt=0
# Try different connection methods for Codespaces and local devcontainer compatibility
until mysql -h db -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "SELECT 1" >/dev/null 2>&1 || \
      mysql -h localhost -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "SELECT 1" >/dev/null 2>&1 || \
      mysql --protocol=TCP -h 127.0.0.1 -P 3306 -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "SELECT 1" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ $attempt -ge $max_attempts ]; then
    echo "MySQL did not become ready in time"
    break
  fi
  echo "Waiting for MySQL... (attempt $attempt/$max_attempts)"
  sleep 2
done

# Try db service first, then localhost, then TCP 127.0.0.1
if mysql -h db -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "SELECT 1" >/dev/null 2>&1 || \
   mysql -h localhost -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "SELECT 1" >/dev/null 2>&1 || \
   mysql --protocol=TCP -h 127.0.0.1 -P 3306 -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "SELECT 1" >/dev/null 2>&1; then
  echo "MySQL is ready!"
  
  # Run the database initialization script
  echo "Initializing database schema and data..."
  
  # Determine which connection method works
  if mysql -h db -u root -p"${MYSQL_ROOT_PASSWORD}" -e "SELECT 1" >/dev/null 2>&1; then
    DB_HOST="db"
  elif mysql -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" -e "SELECT 1" >/dev/null 2>&1; then
    DB_HOST="localhost"
  else
    DB_HOST="127.0.0.1"
  fi
  
  echo "Using database host: $DB_HOST"
  
  # Extract and run the SQL from init-database.sh using root credentials
  sed 's/\r$//' /workspaces/final_year_project/init-database.sh | \
    sed -n '/<<-.*EOSQL/,/^EOSQL/p' | \
    sed '1d;$d' | \
    MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql -h "$DB_HOST" -u root Game_Store_System
  
  echo "Database initialization complete!"
  echo "Verifying database setup..."
  mysql -h "$DB_HOST" -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "USE Game_Store_System; SHOW TABLES;" || true
else
  echo "Warning: Could not connect to MySQL"
fi

# Ensure pip and npm are up to date
python3 -m pip install --upgrade pip
if command -v npm >/dev/null 2>&1; then
  npm --version || true
fi

# Ensure the venv PATH is available for this script
VENV_PATH=${VENV_PATH:-/opt/venv}
export PATH="$VENV_PATH/bin:$PATH"

# Install frontend deps if package.json exists in frontend directory
if [ -f ./frontend/package.json ]; then
  echo "Found frontend/package.json — installing npm dependencies..."
  cd ./frontend && npm install || true
  cd ..
fi

# Install Puppeteer and FFmpeg dependencies if package.json exists in root
if [ -f ./package.json ]; then
  echo "Found root package.json — installing npm dependencies (including Puppeteer)..."
  npm install || true
  
  # Set Puppeteer environment variables for the user
  echo "Configuring Puppeteer to use system Chrome..."
  if ! grep -q "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD" /home/vscode/.bashrc; then
    echo 'export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true' >> /home/vscode/.bashrc
    echo 'export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable' >> /home/vscode/.bashrc
  fi
fi

# Install python deps if requirements.txt exists (for AI service)
if [ -f ./audio_service/requirements.txt ]; then
  echo "Found audio_service/requirements.txt — installing Python dependencies into venv..."
  "$VENV_PATH/bin/pip" install --upgrade pip || true
  "$VENV_PATH/bin/pip" install -r ./audio_service/requirements.txt || true
fi

# Install python deps if requirements.txt exists in root
if [ -f requirements.txt ]; then
  echo "Found requirements.txt — installing Python dependencies..."
  "$VENV_PATH/bin/pip" install -r requirements.txt || true
fi

# Pre-cache Gradle dependencies for any Java projects to avoid fetching at first build
if [ -f ./backend/gradlew ]; then
  echo "Found Gradle wrapper — pre-caching dependencies..."
  cd ./backend && ./gradlew dependencies --no-daemon || true
  cd ..
fi

# Initialize Git LFS for the repository
if command -v git-lfs >/dev/null 2>&1; then
  echo "Initializing Git LFS..."
  git lfs install || true
  git lfs pull || true
fi

echo "Devcontainer setup complete."
