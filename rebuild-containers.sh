#!/bin/bash
# Quick rebuild script for the new Docker setup

set -e

echo "=========================================="
echo "Rebuilding Docker Containers"
echo "=========================================="
echo ""
echo "This will rebuild all microservice containers."
echo "This may take 10-15 minutes on first run."
echo ""

read -p "Continue? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Rebuild cancelled"
    exit 0
fi

cd /workspaces/final_year_project/.devcontainer

echo ""
echo "Step 1/3: Building core microservices..."
docker compose build accounts-service products-service orders-service payments-service

echo ""
echo "Step 2/3: Building additional microservices..."
docker compose build stock-service wishlist-service

echo ""
echo "Step 3/3: Building optional microservices..."
docker compose build orderItems-service customerSummary-service soldProducts-service purchasedProducts-service 2>/dev/null || echo "Optional services will be built on demand"

echo ""
echo "=========================================="
echo "Build Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Start core services: ./manage-services.sh start-core"
echo "  2. Check status: ./manage-services.sh status"
echo "  3. View logs: ./manage-services.sh logs <service-name>"
echo ""
echo "See DOCKER_SETUP_README.md for full documentation"
