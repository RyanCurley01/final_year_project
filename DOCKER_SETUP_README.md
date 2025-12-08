# Microservices Docker Setup for Codespaces

This project now runs each microservice in its own Docker container with memory limits to prevent Codespaces from crashing.

## Architecture Overview

- **Main Dev Container (`app`)**: Your development environment with all tools (2GB memory limit)
- **Database Container (`db`)**: MySQL 8.0 database
- **Microservice Containers**: Each Spring Boot service in its own container (512MB limit each)

## Memory Management

Each microservice is configured with:
- **Container Memory Limit**: 512MB
- **JVM Heap Size**: Max 256MB, Initial 128MB
- **JVM Metaspace**: Max 128MB
- **Garbage Collector**: SerialGC (lower memory footprint)

Total with 8GB Codespaces instance:
- System/VSCode: ~2GB
- Dev Container: ~2GB
- Database: ~512MB
- **Available for microservices**: ~3.5GB (supports 6-7 services concurrently)

## Quick Start

### Using the Management Script

The `manage-services.sh` script helps you control which services run:

```bash
# Start core services (recommended for most development)
./manage-services.sh start-core

# Start individual services
./manage-services.sh start accounts-service
./manage-services.sh start products-service

# Check status and memory usage
./manage-services.sh status

# View logs
./manage-services.sh logs accounts-service

# Stop all services
./manage-services.sh stop-all

# See all options
./manage-services.sh
```

### Core Services (Recommended)

Start these 4 services for typical development:
- `accounts-service` (8080) - User accounts and authentication
- `products-service` (8081) - Product catalog with S3 integration
- `orders-service` (8082) - Order management
- `payments-service` (8083) - Payment processing

```bash
./manage-services.sh start-core
```

### All Services (Use Sparingly)

Only start all services when necessary (high memory usage):

```bash
./manage-services.sh start-all
```

Additional services:
- `stock-service` (8084) - Inventory management
- `wishlist-service` (8085) - User wishlists
- `orderItems-service` (8086) - Order line items
- `customerSummary-service` (8087) - Customer analytics
- `soldProducts-service` (8088) - Sales tracking
- `purchasedProducts-service` (8089) - Purchase history

## Manual Docker Compose Commands

If you prefer using Docker Compose directly:

```bash
# Start specific services
cd /workspaces/final_year_project/.devcontainer
docker compose up -d accounts-service products-service

# Start all services
docker compose --profile full up -d

# Stop services
docker compose stop accounts-service

# View logs
docker compose logs -f accounts-service

# Rebuild a service after code changes
docker compose build accounts-service
docker compose up -d accounts-service

# Remove all containers
docker compose down
```

## Rebuilding After Code Changes

When you modify a microservice's code:

```bash
# Rebuild and restart the specific service
cd /workspaces/final_year_project/.devcontainer
docker compose build products-service
docker compose up -d products-service
```

## Monitoring Resources

```bash
# Check memory usage
./manage-services.sh status

# Or manually
free -h
docker stats
```

## Troubleshooting

### Codespace Still Crashing

1. **Reduce number of running services**: Stop services you're not actively developing
   ```bash
   ./manage-services.sh stop wishlist-service
   ```

2. **Check memory usage**:
   ```bash
   ./manage-services.sh status
   ```

3. **Restart services one at a time**: Give each service time to fully start
   ```bash
   ./manage-services.sh start accounts-service
   sleep 30
   ./manage-services.sh start products-service
   ```

### Service Won't Start

1. **Check logs**:
   ```bash
   ./manage-services.sh logs accounts-service
   ```

2. **Verify database is ready**:
   ```bash
   docker compose ps db
   ```

3. **Rebuild the container**:
   ```bash
   cd /workspaces/final_year_project/.devcontainer
   docker compose build accounts-service
   docker compose up -d accounts-service
   ```

### Out of Memory Errors

If you see OOM errors:

1. **Stop non-essential services**:
   ```bash
   ./manage-services.sh stop-all
   ./manage-services.sh start-core
   ```

2. **Check for zombie processes**:
   ```bash
   ps aux | grep java
   # Kill any defunct processes if needed
   ```

3. **Restart Codespace**: Sometimes a fresh start helps

## Development Workflow

### Typical Development Session

```bash
# 1. Start core services
./manage-services.sh start-core

# 2. Check they're running
./manage-services.sh status

# 3. Work on your code in the dev container
# (Use Gradle as normal: ./gradlew build, ./gradlew test, etc.)

# 4. If you need an additional service
./manage-services.sh start wishlist-service

# 5. View logs while developing
./manage-services.sh logs products-service

# 6. Stop services when done
./manage-services.sh stop-all
```

### Testing Changes

You can still run services directly with Gradle in the dev container for quick testing:

```bash
# Run in dev container (not containerized)
cd /workspaces/final_year_project/backend
./gradlew accounts-service:bootRun
```

Or use the containerized version:
```bash
# Rebuild and run in container
./manage-services.sh restart accounts-service
```

## Port Mapping

| Service | Port | URL |
|---------|------|-----|
| Frontend | 5173 | http://localhost:5173 |
| AI Service | 5000 | http://localhost:5000 |
| Accounts | 8080 | http://localhost:8080 |
| Products | 8081 | http://localhost:8081 |
| Orders | 8082 | http://localhost:8082 |
| Payments | 8083 | http://localhost:8083 |
| Stock | 8084 | http://localhost:8084 |
| Wishlist | 8085 | http://localhost:8085 |
| OrderItems | 8086 | http://localhost:8086 |
| CustomerSummary | 8087 | http://localhost:8087 |
| SoldProducts | 8088 | http://localhost:8088 |
| PurchasedProducts | 8089 | http://localhost:8089 |
| MySQL | 3306 | jdbc:mysql://db:3306 |

## Configuration Files

- **`.devcontainer/docker-compose.yml`**: Main orchestration file with all services
- **`backend/gradle.properties`**: Gradle memory limits for builds
- **`backend/*/Dockerfile`**: Individual service container definitions
- **`manage-services.sh`**: Helper script for service management

## Best Practices

1. **Start only what you need**: Don't run all 10 microservices simultaneously
2. **Use core services**: The 4 core services cover most development needs
3. **Monitor memory**: Check `./manage-services.sh status` periodically
4. **Stop when idle**: Stop services when switching to frontend/other work
5. **Use the script**: The management script helps prevent resource issues

## Next Steps

1. Rebuild your Codespace or run:
   ```bash
   cd /workspaces/final_year_project/.devcontainer
   docker compose build
   ```

2. Start the services you need:
   ```bash
   ./manage-services.sh start-core
   ```

3. Begin development!
