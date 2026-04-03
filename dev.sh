#!/bin/bash
# Kill existing http-server on port 8080 and restart with no caching
PID=$(netstat -ano 2>/dev/null | grep ":8080.*LISTENING" | awk '{print $5}' | head -1)
if [ -n "$PID" ]; then
  echo "Killing old server (PID $PID)..."
  taskkill //PID "$PID" //F 2>/dev/null || kill "$PID" 2>/dev/null
  sleep 1
fi
echo "Starting http-server on :8080 (no cache)..."
cd "$(dirname "$0")"
npx http-server public -p 8080 -c-1
