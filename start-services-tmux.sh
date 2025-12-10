#!/bin/bash
# Start multiple Spring Boot services in tmux sessions (outside VS Code)

SESSION="microservices"

# Kill existing session if it exists
tmux kill-session -t $SESSION 2>/dev/null

# Create new session with first service
echo "Starting accounts-service..."
tmux new-session -d -s $SESSION -n accounts "cd /workspaces/final_year_project/backend && ./gradlew :accounts-service:bootRun"

# Create windows for other services
echo "Starting products-service..."
tmux new-window -t $SESSION -n products "cd /workspaces/final_year_project/backend && ./gradlew :products-service:bootRun"

echo "Starting orders-service..."
tmux new-window -t $SESSION -n orders "cd /workspaces/final_year_project/backend && ./gradlew :orders-service:bootRun"

echo "Starting payments-service..."
tmux new-window -t $SESSION -n payments "cd /workspaces/final_year_project/backend && ./gradlew :payments-service:bootRun"

echo "Starting AI service..."
tmux new-window -t $SESSION -n ai "cd /workspaces/final_year_project/ai_service && python main.py"

echo ""
echo "✓ All services started in tmux session '$SESSION'"
echo ""
echo "Commands:"
echo "  tmux attach -t $SESSION       # Attach to session"
echo "  tmux list-windows -t $SESSION # List all services"
echo "  tmux kill-session -t $SESSION # Stop all services"
echo ""
echo "Inside tmux:"
echo "  Ctrl+B then 0-4   # Switch between service windows"
echo "  Ctrl+B then d     # Detach (services keep running)"
echo "  Ctrl+C            # Stop current service"
