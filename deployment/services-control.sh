#!/bin/bash
# Control microservices running in separate Docker containers
# This keeps VS Code lightweight while services run independently

COMPOSE_FILE="docker-compose.services.yml"
PROJECT_NAME="gamestore_services"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

recreate_db_service() {
    echo "🗄️  Recreating db container to refresh bind mounts..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d --force-recreate db
}

repair_order_tracking() {
    local trigger_sql="${SCRIPT_DIR}/add_order_triggers.sql"
    local backfill_sql="${SCRIPT_DIR}/backfill_order_tracking.sql"
    local attempts=0
    local max_attempts=30

    if [ ! -f "$trigger_sql" ] || [ ! -f "$backfill_sql" ]; then
        echo "⚠️  Skipping order tracking repair: SQL files not found"
        return 0
    fi

    echo "🔧 Ensuring order tracking trigger and backfill are applied..."
    until docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T db \
        sh -lc 'mysqladmin ping -h localhost -u root -p"$MYSQL_ROOT_PASSWORD" --silent' >/dev/null 2>&1; do
        attempts=$((attempts + 1))
        if [ "$attempts" -ge "$max_attempts" ]; then
            echo "⚠️  Database did not become ready in time; skipping order tracking repair"
            return 1
        fi
        sleep 2
    done

    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T db \
        sh -lc 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" Game_Store_System' < "$trigger_sql"
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T db \
        sh -lc 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" Game_Store_System' < "$backfill_sql"
    echo "✅ Order tracking trigger and backfill applied"
}

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
        if ! docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d 2>&1; then
            echo "⚠️  Some services failed to start (database may still be initialising)."
            echo "⏳ Waiting for database to become healthy before retrying..."
            local attempts=0
            local max_attempts=60
            until docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T db \
                sh -lc 'mysqladmin ping -h localhost -u root -p"$MYSQL_ROOT_PASSWORD" --silent' >/dev/null 2>&1; do
                attempts=$((attempts + 1))
                if [ "$attempts" -ge "$max_attempts" ]; then
                    echo "❌ Database did not become healthy after ${max_attempts} attempts. Check logs with: $0 logs db"
                    exit 1
                fi
                sleep 2
            done
            echo "✅ Database is healthy. Starting remaining services..."
            docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d
        fi
        repair_order_tracking
        echo "✅ All services started"
        echo ""
        echo "📝 Note: These services run OUTSIDE your dev container"
        echo "   Frontend dev server should run INSIDE VS Code terminal"
    else
        echo "🚀 Starting $1..."
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d "$1"
        if [ "$1" = "db" ]; then
            repair_order_tracking
        fi
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
        recreate_db_service
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" restart \
            accounts-service \
            products-service \
            orders-service \
            payments-service \
            stock-service \
            wishlist-service \
            order-items-service \
            customer-summary-service \
            purchased-products-service \
            sold-products-service \
            audio-service
        repair_order_tracking
        echo "✅ All services restarted"
    else
        echo "🔄 Restarting $1..."
        if [ "$1" = "db" ]; then
            recreate_db_service
            repair_order_tracking
        else
            docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" restart "$1"
        fi
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
