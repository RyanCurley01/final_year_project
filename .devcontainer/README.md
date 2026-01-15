# Dev Container Setup

## Architecture

This project uses a **two-container architecture** to keep VS Code lightweight:

### 1. Dev Container (This Container)
- **Purpose**: Lightweight development environment for VS Code
- **Runs**: Only the frontend development tools and IDE
- **Ports**: 
  - `5173` - Vite dev server (frontend)
  - `3000` - Alternative frontend port
- **Network**: Connects to host machine via `host.docker.internal`

### 2. External Services (Separate Containers)
- **Purpose**: Run all backend microservices and database independently
- **Managed by**: `./services-control.sh` script at project root
- **Services**:
  - MySQL Database (port 3306)
  - Audio Service (port 5000)
  - Accounts Service (port 8080)
  - Products Service (port 8081)
  - Orders Service (port 8082)
  - Payments Service (port 8083)

## Why This Setup?

✅ **Keeps VS Code fast** - Dev container only runs IDE, not heavy backend services  
✅ **Independent services** - Backend can run/restart without affecting VS Code  
✅ **No port conflicts** - Services run in separate Docker network  
✅ **Better resource management** - Can control service memory/CPU independently  

## How to Use

### Starting the Services

From your **host machine** (outside VS Code):

```bash
cd /path/to/final_year_project

# Start all services
./services-control.sh start

# Start specific service
./services-control.sh start accounts-service

# Check status
./services-control.sh status

# View logs
./services-control.sh logs

# Stop all services
./services-control.sh stop

# Stop and remove containers
./services-control.sh down
```

### Starting Frontend (Inside Dev Container)

From **VS Code terminal**:

```bash
cd frontend
npm run dev
```

The frontend will connect to backend services at `localhost:8080`, `localhost:8081`, etc.

## Connection Details

The dev container connects to external services via:
- **Database**: `host.docker.internal:3306`
- **Backend Services**: `localhost:8080-8089` (forwarded from host)

## Troubleshooting

### Port Already in Use

If you see "port is already allocated":
```bash
# Stop external services first
./services-control.sh down

# Then rebuild dev container
```

### Services Not Responding

Check if services are running:
```bash
./services-control.sh status
```

Restart services:
```bash
./services-control.sh restart
```

### Database Connection Issues

Ensure database is healthy:
```bash
./services-control.sh logs db
```

## Files

- `.devcontainer/docker-compose.yml` - Dev container configuration
- `docker-compose.services.yml` - External services configuration  
- `services-control.sh` - Service management script
