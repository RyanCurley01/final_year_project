#!/bin/bash
# Simple service management script for running services outside VS Code
# This keeps services isolated and reduces VS Code memory usage

# Auto-detect project directory (works in both dev container and native WSL)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
BACKEND_DIR="$PROJECT_DIR/backend"
AI_DIR="$PROJECT_DIR/ai_service"
LOG_DIR="$PROJECT_DIR/logs"

show_usage() {
    echo "Usage: $0 {start|stop|restart|status|logs} [service]"
    echo ""
    echo "Services: accounts, products, orders, payments, ai"
    echo ""
    echo "Examples:"
    echo "  $0 start accounts    # Start accounts-service"
    echo "  $0 start             # Start all core services"
    echo "  $0 stop              # Stop all services"
    echo "  $0 status            # Show running services"
    echo "  $0 logs products     # Tail products-service logs"
}

start_java_service() {
    local name=$1
    local service="${name}-service"
    local pidfile="$LOG_DIR/${service}.pid"
    local logfile="$LOG_DIR/${service}.log"
    
    if [ -f "$pidfile" ] && ps -p $(cat "$pidfile") > /dev/null 2>&1; then
        echo "⚠  $service already running (PID: $(cat $pidfile))"
        return
    fi
    
    echo "🚀 Starting $service..."
    cd "$BACKEND_DIR"
    # Use --no-daemon to prevent daemon accumulation
    nohup ./gradlew :${service}:bootRun --no-daemon > "$logfile" 2>&1 &
    echo $! > "$pidfile"
    echo "✓  Started on PID $(cat $pidfile)"
}

start_ai_service() {
    local pidfile="$LOG_DIR/ai-service.pid"
    local logfile="$LOG_DIR/ai-service.log"
    
    if [ -f "$pidfile" ] && ps -p $(cat "$pidfile") > /dev/null 2>&1; then
        echo "⚠  ai-service already running (PID: $(cat $pidfile))"
        return
    fi
    
    echo "🚀 Starting ai-service..."
    cd "$AI_DIR"
    nohup python main.py > "$logfile" 2>&1 &
    echo $! > "$pidfile"
    echo "✓  Started on PID $(cat $pidfile)"
}

stop_service() {
    local name=$1
    local pidfile="$LOG_DIR/${name}-service.pid"
    
    if [ ! -f "$pidfile" ]; then
        echo "⚠  ${name}-service not running (no PID file)"
        return
    fi
    
    local pid=$(cat "$pidfile")
    if ps -p $pid > /dev/null 2>&1; then
        echo "🛑 Stopping ${name}-service (PID: $pid)..."
        kill $pid 2>/dev/null
        sleep 2
        if ps -p $pid > /dev/null 2>&1; then
            kill -9 $pid 2>/dev/null
        fi
        echo "✓  Stopped"
    else
        echo "⚠  ${name}-service not running"
    fi
    rm "$pidfile" 2>/dev/null
}

show_status() {
    echo "📊 Service Status:"
    echo ""
    for service in accounts products orders payments ai; do
        local pidfile="$LOG_DIR/${service}-service.pid"
        if [ -f "$pidfile" ]; then
            local pid=$(cat "$pidfile")
            if ps -p $pid > /dev/null 2>&1; then
                echo "  ✅ ${service}-service: RUNNING (PID: $pid)"
            else
                echo "  ❌ ${service}-service: STOPPED (stale PID: $pid)"
            fi
        else
            echo "  ⚪ ${service}-service: NOT STARTED"
        fi
    done
    echo ""
    echo "Port Status:"
    for port in 8080 8081 8082 8083 5000; do
        if lsof -i :$port > /dev/null 2>&1; then
            echo "  🟢 Port $port: IN USE"
        else
            echo "  ⚪ Port $port: FREE"
        fi
    done
}

tail_logs() {
    local service=$1
    local logfile="$LOG_DIR/${service}-service.log"
    
    if [ ! -f "$logfile" ]; then
        echo "❌ No log file found for $service"
        echo "Expected: $logfile"
        exit 1
    fi
    
    echo "📝 Tailing logs for ${service}-service (Ctrl+C to exit)"
    echo "---"
    tail -f "$logfile"
}

# Main logic
mkdir -p "$LOG_DIR"

case "$1" in
    start)
        if [ -z "$2" ]; then
            echo "Starting all core services..."
            start_java_service "accounts"
            sleep 2
            start_java_service "products"
            sleep 2
            start_java_service "orders"
            sleep 2
            start_java_service "payments"
            echo ""
            echo "✅ Core services started"
        else
            case "$2" in
                accounts|products|orders|payments)
                    start_java_service "$2"
                    ;;
                ai)
                    start_ai_service
                    ;;
                *)
                    echo "Unknown service: $2"
                    show_usage
                    exit 1
                    ;;
            esac
        fi
        ;;
    stop)
        if [ -z "$2" ]; then
            echo "Stopping all services..."
            stop_service "accounts"
            stop_service "products"
            stop_service "orders"
            stop_service "payments"
            stop_service "ai"
            echo ""
            echo "✅ All services stopped"
        else
            stop_service "$2"
        fi
        ;;
    restart)
        $0 stop "$2"
        sleep 2
        $0 start "$2"
        ;;
    status)
        show_status
        ;;
    logs)
        if [ -z "$2" ]; then
            echo "❌ Please specify a service to view logs"
            show_usage
            exit 1
        fi
        tail_logs "$2"
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
