#!/bin/bash
# Control microservices running in separate Docker containers
# This keeps VS Code lightweight while services run independently

COMPOSE_FILE="docker-compose.services.yml"
PROJECT_NAME="gamestore_services"

show_usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  start [service]     Start all services or specific service"
    echo "  stop [service]      Stop all services or specific service"
    echo "  restart [service]   Restart all services or specific service"
    echo "  status              Show running services"
    echo "  logs [service]      Show logs for all or specific service"
    echo "  build               Build all service images"
    echo "  down                Stop and remove all containers"
    echo ""
    echo "Services:"
    echo "  - accounts-service"
    echo "  - products-service"
    echo "  - orders-service"
    echo "  - payments-service"
    echo "  - audio-service"
    echo "  - db (database)"
    echo ""
    echo "Examples:"
    echo "  $0 start                    # Start all services"
    echo "  $0 start accounts-service   # Start only accounts service"
    echo "  $0 logs products-service    # View products service logs"
    echo "  $0 status                   # Show what's running"
}

start_services() {
    # Check if services are already running
    if docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps -q 2>/dev/null | grep -q .; then
        echo "⚠️  Services are already running. Use 'restart' to restart them."
        show_status
        exit 0
    fi
    
    if [ -z "$1" ]; then
        echo "🚀 Starting all microservices..."
        echo "📦 This will start: database, accounts, products, orders, payments, and ai services"
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d
        echo "✅ All services started"
        echo ""
        echo "📝 Note: These services run OUTSIDE your dev container"
        echo "   Frontend dev server should run INSIDE VS Code terminal"
    else
        echo "🚀 Starting $1..."
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d "$1"
        echo "✅ $1 started"
    fi
}

stop_services() {
    if [ -z "$1" ]; then
        echo "🛑 Stopping all microservices..."
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" stop
        echo "✅ All services stopped"
    else
        echo "🛑 Stopping $1..."
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" stop "$1"
        echo "✅ $1 stopped"
    fi
}

restart_services() {
    if [ -z "$1" ]; then
        echo "🔄 Restarting all microservices..."
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" restart
        echo "✅ All services restarted"
    else
        echo "🔄 Restarting $1..."
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" restart "$1"
        echo "✅ $1 restarted"
    fi
}

show_status() {
    echo "📊 Service Status:"
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps
    echo ""
    echo "💾 Resource Usage:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" \
        $(docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps -q 2>/dev/null) 2>/dev/null || echo "No containers running"
}

show_logs() {
    if [ -z "$1" ]; then
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs -f
    else
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs -f "$1"
    fi
}

build_services() {
    echo "🔨 Building service images..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" build
    echo "✅ Build complete"
}

down_services() {
    echo "🛑 Stopping and removing all containers..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down
    echo "✅ All containers removed"
}

# Main logic
case "$1" in
    start)
        start_services "$2"
        ;;
    stop)
        stop_services "$2"
        ;;
    restart)
        restart_services "$2"
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$2"
        ;;
    build)
        build_services
        ;;
    down)
        down_services
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
