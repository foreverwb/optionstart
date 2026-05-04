#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/fronted"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8018}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5189}"
INSTALL_DEPS="${INSTALL_DEPS:-1}"

export FUTU_CONNECT_ON_STARTUP="${FUTU_CONNECT_ON_STARTUP:-false}"
export REDIS_ENABLED="${REDIS_ENABLED:-false}"
export DATABASE_URL="${DATABASE_URL:-sqlite:///./optionstart.db}"
export VITE_QUOTES_WS_URL="${VITE_QUOTES_WS_URL:-ws://${BACKEND_HOST}:${BACKEND_PORT}/ws/quotes}"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo
  echo "Stopping services..."
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_port_free() {
  local port="$1"
  local label="$2"
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      echo "${label} port ${port} is in use (PIDs: ${pids}). Killing..."
      echo "$pids" | xargs kill 2>/dev/null || true
      sleep 1
      pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
      if [[ -n "$pids" ]]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
      fi
    fi
  fi
}

prepare_frontend() {
  require_command npm
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    if [[ "$INSTALL_DEPS" == "1" ]]; then
      echo "Installing frontend dependencies..."
      (cd "$FRONTEND_DIR" && npm install)
    else
      echo "Frontend dependencies are missing." >&2
      echo "Run: INSTALL_DEPS=1 ./start.sh" >&2
      exit 1
    fi
  fi
}

prepare_backend() {
  require_command python3

  if [[ ! -x "$BACKEND_DIR/.venv/bin/python" ]]; then
    if [[ "$INSTALL_DEPS" == "1" ]]; then
      echo "Creating backend virtual environment..."
      python3 -m venv "$BACKEND_DIR/.venv"
    else
      echo "Backend virtual environment is missing." >&2
      echo "Run: INSTALL_DEPS=1 ./start.sh" >&2
      exit 1
    fi
  fi

  PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"

  if ! "$PYTHON_BIN" -c "import fastapi, uvicorn, sqlalchemy, pydantic" >/dev/null 2>&1; then
    if [[ "$INSTALL_DEPS" == "1" ]]; then
      echo "Installing backend dependencies into backend/.venv..."
      "$PYTHON_BIN" -m pip install --upgrade pip
      "$PYTHON_BIN" -m pip install -r "$BACKEND_DIR/requirements.txt"
    else
      echo "Backend Python dependencies are missing." >&2
      echo "Run: INSTALL_DEPS=1 ./start.sh" >&2
      exit 1
    fi
  fi
}

start_backend() {
  echo "Starting backend: http://${BACKEND_HOST}:${BACKEND_PORT}"
  (
    cd "$BACKEND_DIR"
    "$PYTHON_BIN" -m uvicorn main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT"
  ) &
  BACKEND_PID="$!"
}

start_frontend() {
  echo "Starting frontend: http://${FRONTEND_HOST}:${FRONTEND_PORT}"
  (
    cd "$FRONTEND_DIR"
    npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT"
  ) &
  FRONTEND_PID="$!"
}

prepare_backend
prepare_frontend
ensure_port_free "$BACKEND_PORT" "BACKEND"
ensure_port_free "$FRONTEND_PORT" "FRONTEND"
start_backend
start_frontend

echo
echo "Services are starting."
echo "Frontend: http://${FRONTEND_HOST}:${FRONTEND_PORT}"
echo "Backend:  http://${BACKEND_HOST}:${BACKEND_PORT}"
echo "Press Ctrl+C to stop both services."

while true; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "Backend process exited." >&2
    exit 1
  fi
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "Frontend process exited." >&2
    exit 1
  fi
  sleep 1
done
