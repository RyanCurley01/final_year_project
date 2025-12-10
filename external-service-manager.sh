#!/bin/bash
# Wrapper script to manage dev container services from external terminal
# Run this from native WSL (outside dev container)

PROJECT_PATH="/workspaces/final_year_project"

# Check if running inside dev container
if [ -f "/.dockerenv" ] || grep -q "docker\|lxc" /proc/1/cgroup 2>/dev/null; then
    # Already inside container, run directly
    exec "$PROJECT_PATH/service-manager.sh" "$@"
fi

# Running outside container, find and execute inside
# Try to find container by label or by checking for the project path
CONTAINER_ID=$(docker ps --filter "label=devcontainer.local_folder" --format "{{.ID}}" | head -1)

if [ -z "$CONTAINER_ID" ]; then
    # Fallback: find container that has our project path
    CONTAINER_ID=$(docker ps --format "{{.ID}}" | while read id; do
        docker exec "$id" test -d "$PROJECT_PATH" 2>/dev/null && echo "$id" && break
    done)
fi

if [ -z "$CONTAINER_ID" ]; then
    echo "❌ Dev container not found"
    echo "Please start VS Code with dev container first"
    echo ""
    echo "Tip: You can also use the container ID directly:"
    echo "  docker exec -it <container_id> /bin/bash -c 'cd $PROJECT_PATH && ./service-manager.sh $*'"
    exit 1
fi

echo "📦 Using container: $CONTAINER_ID"

# Detect if we're in Git Bash/MinGW or have a proper TTY
# Git Bash sets MSYSTEM, MinGW sets TERM to specific values
if [[ -n "$MSYSTEM" ]] || [[ "$TERM" == "cygwin" ]] || [[ ! -t 0 ]]; then
    # Git Bash, MinGW, or no TTY - use -i only
    docker exec -i "$CONTAINER_ID" bash -c "cd $PROJECT_PATH && ./service-manager.sh $*"
else
    # Proper TTY available - use -it
    docker exec -it "$CONTAINER_ID" bash -c "cd $PROJECT_PATH && ./service-manager.sh $*"
fi
