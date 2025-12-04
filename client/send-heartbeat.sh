#!/bin/bash

#
# send-heartbeat.sh - Sends encrypted heartbeat to Inside-Out Monitor server
#
# This script sends a device heartbeat to the monitoring server using
# encrypted UDP packets with libsodium (via TweetNaCl).
#
# Usage:
#   ./send-heartbeat.sh [device_name] [server_host] [server_port] [interval]
#
# Examples:
#   ./send-heartbeat.sh "web-server-01" "monitor.example.com" 4000
#   ./send-heartbeat.sh "web-server-01" "monitor.example.com" 4000 60  # Run every 60 seconds
#   ./send-heartbeat.sh  # Uses defaults
#

# Configuration
DEVICE_NAME="${1:-$(hostname)}"
SERVER_HOST="${2:-127.0.0.1}"
SERVER_PORT="${3:-4000}"
INTERVAL="${4:-0}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH" >&2
    echo "Install Node.js from: https://nodejs.org/" >&2
    exit 1
fi

# Check if client.js exists
CLIENT_SCRIPT="$SCRIPT_DIR/client.js"
if [ ! -f "$CLIENT_SCRIPT" ]; then
    echo "ERROR: client.js not found at: $CLIENT_SCRIPT" >&2
    exit 1
fi

# Check if secret.key exists
KEY_FILE="$SCRIPT_DIR/secret.key"
if [ ! -f "$KEY_FILE" ]; then
    echo "ERROR: secret.key not found at: $KEY_FILE" >&2
    echo "Copy the pre-shared key from the server to this location" >&2
    exit 1
fi

# Set environment variables for client.js
export MONITOR_DEVICE_NAME="$DEVICE_NAME"
export MONITOR_HOST="$SERVER_HOST"
export MONITOR_PORT="$SERVER_PORT"

# Function to send heartbeat
send_heartbeat() {
    if node "$CLIENT_SCRIPT"; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Heartbeat sent to $SERVER_HOST:$SERVER_PORT"
        return 0
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Failed to send heartbeat (exit code: $?)" >&2
        return 1
    fi
}

# Run based on interval setting
if [ "$INTERVAL" -gt 0 ]; then
    # Continuous mode
    echo "Starting continuous heartbeat mode (every $INTERVAL seconds)"
    echo "Device: $DEVICE_NAME"
    echo "Server: $SERVER_HOST:$SERVER_PORT"
    echo "Press Ctrl+C to stop"
    echo ""

    iteration=0
    while true; do
        iteration=$((iteration + 1))
        echo "=== Iteration $iteration ==="
        send_heartbeat

        sleep "$INTERVAL"
    done
else
    # Single run mode
    send_heartbeat
    exit $?
fi
