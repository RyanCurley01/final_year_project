#!/usr/bin/env bash
set -euo pipefail

echo "Running devcontainer post-create steps..."

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
max_attempts=30
attempt=0
until mysql -h localhost -u gamestore_user -pgamestore_pass -e "SELECT 1" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ $attempt -ge $max_attempts ]; then
    echo "MySQL did not become ready in time"
    break
  fi
  echo "Waiting for MySQL... (attempt $attempt/$max_attempts)"
  sleep 2
done

if mysql -h localhost -u gamestore_user -pgamestore_pass -e "SELECT 1" >/dev/null 2>&1; then
  echo "MySQL is ready!"
  
  # Run the database initialization script
  echo "Initializing database schema and data..."
  
  # Extract and run the SQL from init-database.sh
  # Use root credentials with TCP protocol since the script needs full privileges
  sed 's/\r$//' /workspaces/final_year_project/.devcontainer/init-database.sh | \
    sed -n '/<<-.*EOSQL/,/^EOSQL/p' | \
    sed '1d;$d' | \
    MYSQL_PWD=rootpassword mysql --protocol=TCP -h 127.0.0.1 -P 3306 -u root Game_Store_System
  
  echo "Database initialization complete!"
  echo "Verifying database setup..."
  mysql -h localhost -u gamestore_user -pgamestore_pass -e "USE Game_Store_System; SHOW TABLES;" || true
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

# Install python deps if requirements.txt exists (for AI service)
if [ -f ./ai_service/requirements.txt ]; then
  echo "Found ai_service/requirements.txt — installing Python dependencies into venv..."
  "$VENV_PATH/bin/pip" install --upgrade pip || true
  "$VENV_PATH/bin/pip" install -r ./ai_service/requirements.txt || true
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
