#!/bin/bash
# Start Spring Boot microservices in background (outside VS Code terminal)
# Services will continue running even if terminal is closed

# Auto-detect project directory (works in both dev container and native WSL)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
BACKEND_DIR="$PROJECT_DIR/backend"
AI_DIR="$PROJECT_DIR/ai_service"
LOG_DIR="$PROJECT_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

echo "🚀 Starting microservices in background..."
echo "Logs will be written to: $LOG_DIR"
echo ""

# Function to start a service
start_service() {
    local service=$1
    local port=$2
    
    echo "Starting $service on port $port..."
    cd "$BACKEND_DIR"
    nohup ./gradlew :${service}:bootRun > "$LOG_DIR/${service}.log" 2>&1 &
    echo $! > "$LOG_DIR/${service}.pid"
    echo "  ✓ PID: $(cat $LOG_DIR/${service}.pid) | Log: $LOG_DIR/${service}.log"
}

# Start core services
start_service "accounts-service" 8080
sleep 3
start_service "products-service" 8081
sleep 3
start_service "orders-service" 8082
sleep 3
start_service "payments-service" 8083
sleep 3

# Start AI service
echo "Starting ai_service on port 5000..."
cd "$AI_DIR"
nohup python main.py > "$LOG_DIR/ai-service.log" 2>&1 &
echo $! > "$LOG_DIR/ai-service.pid"
echo "  ✓ PID: $(cat $LOG_DIR/ai-service.pid) | Log: $LOG_DIR/ai-service.log"

echo ""
echo "✅ All services started in background!"
echo ""
echo "📊 Check status:"
echo "  ps aux | grep -E 'bootRun|main.py' | grep -v grep"
echo ""
echo "📝 View logs:"
echo "  tail -f $LOG_DIR/accounts-service.log"
echo "  tail -f $LOG_DIR/products-service.log"
echo "  tail -f $LOG_DIR/ai-service.log"
echo ""
echo "🛑 Stop all services:"
echo "  ./stop-services-background.sh"
