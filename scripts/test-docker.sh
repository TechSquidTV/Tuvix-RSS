#!/bin/bash
# Docker testing script for local development
# Tests Docker Compose setup with health checks and validation
#
# Usage:
#   ./scripts/test-docker.sh
#   pnpm docker:test

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    docker compose down -v 2>/dev/null || true
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Main script
main() {
    echo "========================================="
    echo "🐳 Docker Compose Test Suite"
    echo "========================================="
    echo ""

    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    log_success "Docker is running"

    # Build images
    log_info "Building Docker images..."
    if docker compose build; then
        log_success "Images built successfully"
    else
        log_error "Failed to build images"
        exit 1
    fi

    # Check image sizes
    log_info "Checking image sizes..."
    API_SIZE=$(docker images --format "{{.Size}}" tuvixrss-api:latest)
    APP_SIZE=$(docker images --format "{{.Size}}" tuvixrss-app:latest)

    echo "  API: ${API_SIZE}"
    echo "  App: ${APP_SIZE}"
    log_success "Image sizes checked"

    # Start services
    log_info "Starting Docker Compose services..."
    export BETTER_AUTH_SECRET="test-secret-for-local-testing-minimum-32-chars-required"
    export DATABASE_PATH="/app/data/test.db"

    if docker compose up -d; then
        log_success "Services started"
    else
        log_error "Failed to start services"
        exit 1
    fi

    # Wait for API health
    log_info "Waiting for API to be healthy (max 60s)..."
    if timeout 60 bash -c 'until docker inspect --format="{{.State.Health.Status}}" tuvix-api 2>/dev/null | grep -q "healthy"; do sleep 2; done'; then
        log_success "API is healthy"
    else
        log_error "API failed to become healthy"
        docker logs tuvix-api
        exit 1
    fi

    # Wait for App health
    log_info "Waiting for App to be healthy (max 60s)..."
    if timeout 60 bash -c 'until docker inspect --format="{{.State.Health.Status}}" tuvix-app 2>/dev/null | grep -q "healthy"; do sleep 2; done'; then
        log_success "App is healthy"
    else
        log_error "App failed to become healthy"
        docker logs tuvix-app
        exit 1
    fi

    # Test API endpoint
    log_info "Testing API health endpoint..."
    RESPONSE=$(curl -s http://localhost:3001/health)
    if echo "$RESPONSE" | grep -q '"status":"ok"'; then
        log_success "API health check passed"
        echo "  Response: $RESPONSE"
    else
        log_error "API health check failed"
        echo "  Response: $RESPONSE"
        exit 1
    fi

    # Test App endpoint
    log_info "Testing App health endpoint..."
    RESPONSE=$(curl -s http://localhost:5173/health)
    if echo "$RESPONSE" | grep -q 'ok'; then
        log_success "App health check passed"
        echo "  Response: $RESPONSE"
    else
        log_error "App health check failed"
        echo "  Response: $RESPONSE"
        exit 1
    fi

    # Verify non-root users
    log_info "Verifying security (non-root users)..."
    API_USER=$(docker exec tuvix-api id -u)
    APP_USER=$(docker exec tuvix-app id -u)

    if [ "$API_USER" = "0" ] || [ "$APP_USER" = "0" ]; then
        log_error "Containers running as root!"
        echo "  API: uid $API_USER"
        echo "  App: uid $APP_USER"
        exit 1
    else
        log_success "All containers running as non-root"
        echo "  API: uid $API_USER (nodejs)"
        echo "  App: uid $APP_USER (nginx-app)"
    fi

    # Verify database
    log_info "Verifying database migrations..."
    if docker exec tuvix-api test -f /app/data/test.db; then
        log_success "Database file exists"
        docker exec tuvix-api ls -lh /app/data/test.db
    else
        log_warning "Database file not found (may not have created yet)"
    fi

    if docker logs tuvix-api 2>&1 | grep -q "Migrations complete\|✅ Migrations completed"; then
        log_success "Migrations executed"
    else
        log_warning "Migration logs not found (check manually if needed)"
    fi

    # Show container stats
    log_info "Container statistics:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

    echo ""
    echo "========================================="
    log_success "All tests passed!"
    echo "========================================="
    echo ""
    echo "Services are running at:"
    echo "  API:  http://localhost:3001"
    echo "  App:  http://localhost:5173"
    echo ""
    echo "To stop services, run:"
    echo "  docker compose down"
    echo ""
}

# Run main function
main "$@"
