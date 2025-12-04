#!/bin/bash

#
# Creates a deployment package for the Inside-Out Monitor client
# Packages only the necessary production files for deployment to remote devices.
#

set -e

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parameters
OUTPUT_PATH="${1:-../deploy/client}"
SERVER_HOST="${2:-}"

# Prompt for server IP if not provided
if [ -z "$SERVER_HOST" ]; then
    echo -e "${YELLOW}Enter the monitor server IP address or hostname:${NC}"
    echo -e "${NC}(This will be set as the default in client scripts)${NC}"
    read -p "Server host: " SERVER_HOST

    if [ -z "$SERVER_HOST" ]; then
        echo -e "${YELLOW}⚠ No server host provided. Using '127.0.0.1' (localhost)${NC}"
        SERVER_HOST="127.0.0.1"
    fi
fi

echo ""
echo -e "${GREEN}Server host: $SERVER_HOST${NC}"
echo ""

echo -e "${CYAN}Creating Inside-Out Monitor Client Deployment Package...${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
OUTPUT_DIR="$(cd "$(dirname "$OUTPUT_PATH")" 2>/dev/null && pwd)/$(basename "$OUTPUT_PATH")" || OUTPUT_DIR="$SCRIPT_DIR/$OUTPUT_PATH"

# Create output directory
if [ -d "$OUTPUT_DIR" ]; then
    echo -e "${YELLOW}⚠ Output directory already exists. Cleaning...${NC}"
    rm -rf "$OUTPUT_DIR"
fi

mkdir -p "$OUTPUT_DIR"
echo -e "${GREEN}✓ Created output directory: $OUTPUT_DIR${NC}"

# Files to include
FILES_TO_COPY=(
    "client.js"
    "network-stats.js"
    "send-heartbeat.ps1"
    "send-heartbeat.sh"
    "package.json"
)

# Copy production files
echo ""
echo -e "${CYAN}Copying production files...${NC}"

for file in "${FILES_TO_COPY[@]}"; do
    if [ -f "$SCRIPT_DIR/$file" ]; then
        # Special handling for script files - update default server host
        if [ "$file" = "send-heartbeat.ps1" ]; then
            sed "s/ServerHost = \"127\.0\.0\.1\"/ServerHost = \"$SERVER_HOST\"/" "$SCRIPT_DIR/$file" > "$OUTPUT_DIR/$file"
            echo -e "${GREEN}  ✓ $file (configured with server: $SERVER_HOST)${NC}"
        elif [ "$file" = "send-heartbeat.sh" ]; then
            sed "s/SERVER_HOST=\"\${2:-127\.0\.0\.1}\"/SERVER_HOST=\"\${2:-$SERVER_HOST}\"/" "$SCRIPT_DIR/$file" > "$OUTPUT_DIR/$file"
            echo -e "${GREEN}  ✓ $file (configured with server: $SERVER_HOST)${NC}"
        else
            cp "$SCRIPT_DIR/$file" "$OUTPUT_DIR/"
            echo -e "${GREEN}  ✓ $file${NC}"
        fi
    else
        echo -e "${YELLOW}  ⚠ $file (not found, skipping)${NC}"
    fi
done

# Make scripts executable
chmod +x "$OUTPUT_DIR/send-heartbeat.sh" 2>/dev/null || true

# Create a production package.json (without devDependencies)
echo ""
echo -e "${CYAN}Creating production package.json...${NC}"

# Use Node.js to strip devDependencies
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$SCRIPT_DIR/package.json', 'utf8'));
delete pkg.devDependencies;
if (pkg.scripts) {
    delete pkg.scripts.test;
    delete pkg.scripts['test:watch'];
    delete pkg.scripts['test:coverage'];
}
fs.writeFileSync('$OUTPUT_DIR/package.json', JSON.stringify(pkg, null, 2));
"

echo -e "${GREEN}  ✓ Production package.json created${NC}"

# Create deployment README
echo ""
echo -e "${CYAN}Creating deployment README...${NC}"

cat > "$OUTPUT_DIR/DEPLOY.md" << 'EOF'
# Inside-Out Monitor Client - Deployment Package

This is a production-ready deployment package for the Inside-Out Monitor client.

## Quick Setup

### 1. Copy secret.key

Copy the `secret.key` file from your server to this directory:

```bash
# The secret.key should be copied from: server/secret.key
```

**IMPORTANT**: Each client device must have the same `secret.key` as the server.

### 2. Install Dependencies

```bash
npm install
```

This installs only production dependencies (tweetnacl, tweetnacl-util).

### 3. Test the Client

#### Windows (PowerShell):
```powershell
.\send-heartbeat.ps1 -ServerHost "your-server-ip" -ServerPort 4000
```

#### Linux/macOS (Bash):
```bash
chmod +x send-heartbeat.sh
./send-heartbeat.sh "my-device-name" "your-server-ip" 4000
```

### 4. Configure Environment Variables (Optional)

Instead of passing arguments every time, set environment variables:

#### Windows:
```powershell
$env:MONITOR_DEVICE_NAME = "$env:COMPUTERNAME"
$env:MONITOR_HOST = "your-server-ip"
$env:MONITOR_PORT = "4000"
```

#### Linux/macOS:
```bash
export MONITOR_DEVICE_NAME="$(hostname)"
export MONITOR_HOST="your-server-ip"
export MONITOR_PORT="4000"
```

## Automation

### Windows (Task Scheduler)
```powershell
$action = New-ScheduledTaskAction -Execute "pwsh" -Argument "-File C:\path\to\send-heartbeat.ps1"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "MonitorHeartbeat" -Action $action -Trigger $trigger
```

### Linux (Cron)
```bash
# Edit crontab
crontab -e

# Add this line (runs every 5 minutes)
*/5 * * * * cd /path/to/client && ./send-heartbeat.sh >> /var/log/monitor-heartbeat.log 2>&1
```

### macOS (launchd)
Create `~/Library/LaunchAgents/com.monitor.heartbeat.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.monitor.heartbeat</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/send-heartbeat.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>300</integer>
</dict>
</plist>
```

Then load it:
```bash
launchctl load ~/Library/LaunchAgents/com.monitor.heartbeat.plist
```

## File Structure

```
client/
├── client.js              # Main client code
├── network-stats.js       # Network interface collection
├── send-heartbeat.ps1     # Windows wrapper script
├── send-heartbeat.sh      # Linux/macOS wrapper script
├── secret.key             # Pre-shared key (COPY FROM SERVER)
├── package.json           # Production dependencies only
└── node_modules/          # Install with 'npm install'
```

## Troubleshooting

### "Failed to load secret.key"
- Ensure `secret.key` exists in this directory
- Copy it from `server/secret.key` on your monitor server

### "Failed to decrypt message" (on server)
- Ensure `secret.key` is identical on client and server
- Check for extra whitespace or line endings

### "Connection refused"
- Verify the server is running and listening on port 4000
- Check firewall allows UDP traffic on port 4000
- Verify `ServerHost` IP address is correct

### No network interfaces reported
- The client filters out loopback (127.x.x.x) and APIPA (169.254.x.x) addresses
- Ensure the device has at least one valid network interface with an IP

## Security Notes

- **Keep `secret.key` secure** - it authenticates all clients
- Use the same key across all trusted clients
- If compromised, generate a new key on the server and redistribute
- Transmitted data is encrypted with XSalsa20-Poly1305
EOF

echo -e "${GREEN}  ✓ DEPLOY.md created${NC}"

# Create .npmrc to ensure production install
echo ""
echo -e "${CYAN}Creating .npmrc...${NC}"

cat > "$OUTPUT_DIR/.npmrc" << 'EOF'
# Production dependencies only
production=true
EOF

echo -e "${GREEN}  ✓ .npmrc created${NC}"

# Create a note about secret.key
echo ""
echo -e "${CYAN}Creating secret.key placeholder...${NC}"

cat > "$OUTPUT_DIR/secret.key.PLACEHOLDER" << 'EOF'
PLACEHOLDER - COPY ACTUAL KEY FROM SERVER

To complete deployment:
1. Copy server/secret.key from your monitor server
2. Replace this file with the actual secret.key
3. The key must be identical on all clients and the server
EOF

echo -e "${GREEN}  ✓ secret.key.PLACEHOLDER created${NC}"

# Summary
echo ""
echo -e "${CYAN}================================================================${NC}"
echo -e "${GREEN}Deployment package created successfully!${NC}"
echo -e "${CYAN}================================================================${NC}"
echo ""
echo -e "Location: ${OUTPUT_DIR}"
echo ""
echo -e "${CYAN}Configuration:${NC}"
echo -e "  Server host: $SERVER_HOST (pre-configured in scripts)"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Copy server/secret.key to: $OUTPUT_DIR/secret.key"
echo "  2. Distribute the entire folder to target devices"
echo "  3. On each device, run: npm install"
echo "  4. Test with: ./send-heartbeat.sh (server IP already set!)"
echo ""
echo -e "${CYAN}See $OUTPUT_DIR/DEPLOY.md for detailed instructions${NC}"
echo ""
