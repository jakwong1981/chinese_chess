#!/usr/bin/env bash
# 3D Xiangqi — deployment runbook (Ubuntu 22.04/24.04, with macOS support).
#
# Usage:
#   bash deploy/deploy.sh              # run unit tests, then deploy (Node mock backend)
#   bash deploy/deploy.sh --java       # run tests, then deploy the Spring Boot backend
#   bash deploy/deploy.sh --dry-run    # run unit tests, then print what WOULD happen
#   bash deploy/deploy.sh --skip-tests # deploy without re-running tests (not recommended)
#   bash deploy/deploy.sh --local      # macOS/local dev: skip Docker, just verify tests
#
# The script is idempotent and non-destructive: it never deletes data volumes and
# never restarts services that are already healthy.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deploy"
ENV_FILE="$DEPLOY_DIR/.env"
DRY_RUN=0
SKIP_TESTS=0
LOCAL_MODE=0
JAVA_MODE=0

for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --local)      LOCAL_MODE=1 ;;
    --java)       JAVA_MODE=1 ;;
    -h|--help)    sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

log()  { printf '\033[1;32m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    log "DRY-RUN: $*"
  else
    "$@"
  fi
}

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi
fi

# Detect OS
OS_TYPE="$(uname -s)"
IS_MACOS=0
if [ "$OS_TYPE" = "Darwin" ]; then
  IS_MACOS=1
  warn "macOS detected — skipping Linux-specific steps (UFW, Certbot, system Nginx)."
fi

# Local mode (macOS dev): skip Docker, just verify tests
if [ "$LOCAL_MODE" -eq 1 ]; then
  log "Local mode: skipping Docker deployment."
  log "To run the app locally, use: npm start"
  log "Then open: http://localhost:8080"
  exit 0
fi

if [ "$IS_MACOS" -eq 1 ] && [ "$LOCAL_MODE" -eq 0 ]; then
  warn "For local development on macOS, consider using: bash deploy/deploy.sh --local"
  warn "Or simply: npm start"
fi

# ---------------------------------------------------------------------------
# Step 0 — Unit tests gate. Deployment must not proceed on a failing suite.
# ---------------------------------------------------------------------------
if [ "$SKIP_TESTS" -eq 1 ]; then
  warn "Skipping unit tests (--skip-tests)."
else
  log "Running unit tests (gate)..."
  if ! (cd "$REPO_ROOT" && npm test); then
    die "Unit tests FAILED — aborting deployment."
  fi
  log "Node unit tests passed."
  if [ "$JAVA_MODE" -eq 1 ]; then
    log "Running Spring Boot tests (gate)..."
    if ! (cd "$REPO_ROOT/server-java" && ./mvnw -q test); then
      die "Spring Boot tests FAILED — aborting deployment."
    fi
    log "Spring Boot tests passed."
  fi
fi

# ---------------------------------------------------------------------------
# Step 1 — Prerequisites: Docker, UFW, Certbot.
# ---------------------------------------------------------------------------
log "Checking prerequisites..."
if ! command -v docker >/dev/null 2>&1; then
  if [ "$IS_MACOS" -eq 1 ]; then
    die "Docker not found. Install Docker Desktop for Mac from https://docker.com"
  fi
  log "Installing Docker..."
  run $SUDO apt-get update -y
  run $SUDO apt-get install -y docker.io docker-compose-v2
  run $SUDO systemctl enable --now docker
else
  log "Docker already installed: $(docker --version)"
fi

# Check if Docker daemon is running
if ! docker info >/dev/null 2>&1; then
  warn "Docker daemon is not running."
  if [ "$IS_MACOS" -eq 1 ]; then
    log "Starting Docker Desktop..."
    if [ "$DRY_RUN" -eq 0 ]; then
      open -a Docker
      # Wait for Docker to be ready (up to 30 seconds)
      for i in {1..30}; do
        if docker info >/dev/null 2>&1; then
          log "Docker Desktop started successfully."
          break
        fi
        if [ "$i" -eq 30 ]; then
          die "Docker Desktop failed to start. Please start it manually."
        fi
        sleep 1
      done
    else
      log "DRY-RUN: would start Docker Desktop"
    fi
  else
    log "Starting Docker service..."
    run $SUDO systemctl start docker
    sleep 2
    if ! docker info >/dev/null 2>&1; then
      die "Failed to start Docker daemon."
    fi
  fi
else
  log "Docker daemon is running."
fi

# UFW, Certbot, and system Nginx are Linux-only
if [ "$IS_MACOS" -eq 0 ]; then
  if ! command -v ufw >/dev/null 2>&1; then
    log "Installing UFW..."
    run $SUDO apt-get install -y ufw
  fi
  log "Configuring UFW (allow 22, 80, 443)..."
  run $SUDO ufw allow 22/tcp
  run $SUDO ufw allow 80/tcp
  run $SUDO ufw allow 443/tcp
  run $SUDO ufw --force enable || warn "UFW enable skipped (dry-run or already active)."

  if ! command -v certbot >/dev/null 2>&1; then
    log "Installing Certbot..."
    run $SUDO apt-get install -y certbot python3-certbot-nginx
  else
    log "Certbot already installed."
  fi
fi

# ---------------------------------------------------------------------------
# Step 2 — Environment file.
# ---------------------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  log "Creating $ENV_FILE from template — EDIT IT BEFORE PRODUCTION USE."
  run cp "$DEPLOY_DIR/.env.example" "$ENV_FILE"
  if [ "$DRY_RUN" -eq 0 ]; then
    warn "Populated $ENV_FILE with placeholder secrets. Update them, then re-run."
  fi
else
  log "Using existing $ENV_FILE."
fi
# shellcheck disable=SC1090
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

# ---------------------------------------------------------------------------
# Step 3 — Build & start the stack.
# ---------------------------------------------------------------------------
log "Checking for existing containers..."
# Check if containers already exist and remove them for a clean reinstall
if docker compose -f "$DEPLOY_DIR/docker-compose.yml" ps -q 2>/dev/null | grep -q .; then
  warn "Existing containers found. Removing for clean reinstall..."
  run docker compose -f "$DEPLOY_DIR/docker-compose.yml" down --remove-orphans
  log "Old containers removed."
else
  log "No existing containers found."
fi

if [ "$JAVA_MODE" -eq 1 ]; then
  log "Building and starting the Spring Boot backend (xq_backend_java)..."
  run docker compose -f "$DEPLOY_DIR/docker-compose.yml" --env-file "$ENV_FILE" up -d --build xq_backend_java
else
  log "Building and starting containers (xq_postgres, xq_redis, xq_backend)..."
  run docker compose -f "$DEPLOY_DIR/docker-compose.yml" --env-file "$ENV_FILE" up -d --build
fi
run docker compose -f "$DEPLOY_DIR/docker-compose.yml" ps

# ---------------------------------------------------------------------------
# Step 4 — Nginx reverse proxy with WebSocket upgrade (Linux only).
# ---------------------------------------------------------------------------
if [ "$IS_MACOS" -eq 0 ]; then
  log "Installing Nginx site config..."
  NGINX_CONF_SRC="$DEPLOY_DIR/nginx/xiangqi.conf"
  NGINX_CONF_DST="/etc/nginx/sites-available/xiangqi"
  DOMAIN="${DOMAIN:-example.com}"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "DRY-RUN: would install $NGINX_CONF_DST (server_name $DOMAIN)"
  else
    $SUDO mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /var/www/certbot
    # Substitute the placeholder domain into a temp copy, then install.
    sed "s/example\.com/${DOMAIN}/g" "$NGINX_CONF_SRC" > /tmp/xiangqi.conf
    $SUDO cp /tmp/xiangqi.conf "$NGINX_CONF_DST"
    $SUDO ln -sf "$NGINX_CONF_DST" /etc/nginx/sites-enabled/xiangqi
    $SUDO nginx -t && $SUDO systemctl reload nginx
    log "Nginx configured for $DOMAIN with WebSocket upgrade on /ws."
  fi
else
  warn "Skipping system Nginx setup on macOS. Docker containers handle proxying."
fi

# ---------------------------------------------------------------------------
# Step 5 — TLS certificate (optional; requires a real DOMAIN + DNS, Linux only).
# ---------------------------------------------------------------------------
if [ "$IS_MACOS" -eq 0 ] && [ "${DOMAIN:-example.com}" != "example.com" ]; then
  log "Requesting TLS certificate for $DOMAIN..."
  run $SUDO certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
      -m "${CERTBOT_EMAIL:-admin@example.com}" --redirect
elif [ "$IS_MACOS" -eq 0 ]; then
  warn "DOMAIN is still the placeholder; skipping Certbot. Set DOMAIN in $ENV_FILE and re-run."
fi

log "Deployment complete."
if [ "$JAVA_MODE" -eq 1 ]; then
  log "App (Java): http://localhost:${BACKEND_PORT_JAVA:-8081}/  (or https://${DOMAIN:-example.com})"
  log "WebSocket:  ws://localhost:${BACKEND_PORT_JAVA:-8081}/ws"
else
  log "App:      http://localhost:${BACKEND_PORT:-8080}/  (or https://${DOMAIN:-example.com})"
  log "WebSocket: ws://localhost:${BACKEND_PORT:-8080}/ws"
fi
