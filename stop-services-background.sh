#!/bin/bash
# Stop all background microservices

# Auto-detect project directory (works in both dev container and native WSL)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
LOG_DIR="$PROJECT_DIR/logs"

echo "🛑 Stopping all microservices..."

# Function to stop a service by PID file
stop_service() {
    local service=$1
    local pidfile="$LOG_DIR/${service}.pid"
    
    if [ -f "$pidfile" ]; then
        local pid=$(cat "$pidfile")
        if ps -p $pid > /dev/null 2>&1; then
            echo "Stopping $service (PID: $pid)..."
            kill $pid 2>/dev/null
            sleep 2
            # Force kill if still running
            if ps -p $pid > /dev/null 2>&1; then
                kill -9 $pid 2>/dev/null
            fi
            echo "  ✓ $service stopped"
        else
            echo "  ⚠ $service not running (PID $pid not found)"
        fi
        rm "$pidfile"
    else
        echo "  ⚠ No PID file for $service"
    fi
}

# Stop all services
stop_service "accounts-service"
stop_service "products-service"
stop_service "orders-service"
stop_service "payments-service"
stop_service "ai-service"

# Kill any remaining Gradle processes
echo ""
echo "Cleaning up remaining processes..."
pkill -f "gradlew.*bootRun" 2>/dev/null && echo "  ✓ Killed remaining Gradle processes"
pkill -f "python.*main.py" 2>/dev/null && echo "  ✓ Killed remaining Python processes"

# Free up ports
for port in 8080 8081 8082 8083 5000; do
    lsof -ti:$port | xargs kill -9 2>/dev/null
done

echo ""
echo "✅ All services stopped"
