#!/bin/bash
# Helper script to manage microservices in Docker Compose
# This script helps control which services run to manage memory usage

set -e

COMPOSE_FILE="/workspaces/final_year_project/.devcontainer/docker-compose.yml"
PROJECT_NAME="final_year_project"

show_usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  start <service>     Start a specific microservice"
    echo "  stop <service>      Stop a specific microservice"
    echo "  restart <service>   Restart a specific microservice"
    echo "  start-core          Start core services (accounts, products, orders, payments)"
    echo "  start-all           Start all microservices (use with caution - high memory usage)"
    echo "  stop-all            Stop all microservices"
    echo "  status              Show running services and memory usage"
    echo "  logs <service>      Show logs for a specific service"
    echo ""
    echo "Available services:"
    echo "  - accounts-service (port 8080)"
    echo "  - products-service (port 8081)"
    echo "  - orders-service (port 8082)"
    echo "  - payments-service (port 8083)"
    echo "  - stock-service (port 8084)"
    echo "  - wishlist-service (port 8085)"
    echo "  - orderItems-service (port 8086) [full profile]"
    echo "  - customerSummary-service (port 8087) [full profile]"
    echo "  - soldProducts-service (port 8088) [full profile]"
    echo "  - purchasedProducts-service (port 8089) [full profile]"
    echo ""
}

start_service() {
    local service=$1
    echo "Starting $service..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d "$service"
    echo "$service started successfully"
}

stop_service() {
    local service=$1
    echo "Stopping $service..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" stop "$service"
    echo "$service stopped successfully"
}

restart_service() {
    local service=$1
    echo "Restarting $service..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" restart "$service"
    echo "$service restarted successfully"
}

start_core_services() {
    echo "Starting core microservices..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d \
        accounts-service \
        products-service \
        orders-service \
        payments-service
    echo "Core services started successfully"
}

start_all_services() {
    echo "⚠️  WARNING: Starting all services will consume significant memory (>4GB)"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Starting all microservices..."
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" --profile full up -d
        echo "All services started successfully"
    else
        echo "Operation cancelled"
    fi
}

stop_all_services() {
    echo "Stopping all microservices..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" stop \
        accounts-service \
        products-service \
        orders-service \
        payments-service \
        stock-service \
        wishlist-service \
        orderItems-service \
        customerSummary-service \
        soldProducts-service \
        purchasedProducts-service 2>/dev/null || true
    echo "All services stopped successfully"
}

show_status() {
    echo "=== Docker Services Status ==="
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps
    echo ""
    echo "=== Memory Usage ==="
    free -h
    echo ""
    echo "=== Container Memory Usage ==="
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" || true
}

show_logs() {
    local service=$1
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs -f "$service"
}

# Main command handler
case "${1:-}" in
    start)
        if [ -z "$2" ]; then
            echo "Error: Service name required"
            show_usage
            exit 1
        fi
        start_service "$2"
        ;;
    stop)
        if [ -z "$2" ]; then
            echo "Error: Service name required"
            show_usage
            exit 1
        fi
        stop_service "$2"
        ;;
    restart)
        if [ -z "$2" ]; then
            echo "Error: Service name required"
            show_usage
            exit 1
        fi
        restart_service "$2"
        ;;
    start-core)
        start_core_services
        ;;
    start-all)
        start_all_services
        ;;
    stop-all)
        stop_all_services
        ;;
    status)
        show_status
        ;;
    logs)
        if [ -z "$2" ]; then
            echo "Error: Service name required"
            show_usage
            exit 1
        fi
        show_logs "$2"
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
