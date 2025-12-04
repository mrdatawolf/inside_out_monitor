#!/bin/bash

#
# Creates a deployment package for the Inside-Out Monitor server
# Packages only the necessary production files for deployment to the server host.
#

set -e

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parameters
OUTPUT_PATH="${1:-../deploy/server}"

echo -e "${CYAN}Creating Inside-Out Monitor Server Deployment Package...${NC}"
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
    "server.js"
    "api.js"
    "db.js"
    "encryption.js"
    "validation.js"
    "package.json"
)

# Copy production files
echo ""
echo -e "${CYAN}Copying production files...${NC}"

for file in "${FILES_TO_COPY[@]}"; do
    if [ -f "$SCRIPT_DIR/$file" ]; then
        cp "$SCRIPT_DIR/$file" "$OUTPUT_DIR/"
        echo -e "${GREEN}  ✓ $file${NC}"
    else
        echo -e "${YELLOW}  ⚠ $file (not found, skipping)${NC}"
    fi
done

# Create a production package.json (without devDependencies)
echo ""
echo -e "${CYAN}Creating production package.json...${NC}"

# Use Node.js to strip devDependencies and test scripts
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$SCRIPT_DIR/package.json', 'utf8'));
delete pkg.devDependencies;
if (pkg.scripts) {
    delete pkg.scripts.test;
    delete pkg.scripts['test:watch'];
    delete pkg.scripts['test:coverage'];
    delete pkg.scripts.keygen;
}
fs.writeFileSync('$OUTPUT_DIR/package.json', JSON.stringify(pkg, null, 2));
"

echo -e "${GREEN}  ✓ Production package.json created${NC}"

# Create deployment README
echo ""
echo -e "${CYAN}Creating deployment README...${NC}"

cat > "$OUTPUT_DIR/DEPLOY.md" << 'EOF'
# Inside-Out Monitor Server - Deployment Package

This is a production-ready deployment package for the Inside-Out Monitor server.

## Quick Setup

### 1. Generate or Copy secret.key

**Option A: Generate new key (for fresh installation)**
```bash
# Install dependencies first
npm install

# Generate a new key
node -e "const nacl = require('tweetnacl'); const util = require('tweetnacl-util'); const key = nacl.randomBytes(32); require('fs').writeFileSync('secret.key', util.encodeBase64(key));"
```

**Option B: Copy existing key (if you have clients already)**
```bash
# Copy from your existing server
# The secret.key must be identical on all clients and the server
```

### 2. Install Dependencies

```bash
npm install
```

This installs only production dependencies (sql.js, tweetnacl, express, cors).

### 3. Start the Server

```bash
npm start
```

The server will:
- Listen for UDP heartbeats on port **4000**
- Serve REST API on port **3000**
- Create a `databases/` directory and `heartbeats.sqlite3` file automatically

### 4. Configure Firewall

Ensure the following ports are open:
- **UDP 4000** - For incoming heartbeat messages
- **TCP 3000** - For API access (if using dashboard)

**Linux (ufw):**
```bash
sudo ufw allow 4000/udp
sudo ufw allow 3000/tcp
```

**Linux (firewalld):**
```bash
sudo firewall-cmd --permanent --add-port=4000/udp
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

## Automation

### Linux (systemd service)

Create `/etc/systemd/system/inside-out-monitor.service`:

```ini
[Unit]
Description=Inside-Out Monitor Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then enable:
```bash
sudo systemctl enable inside-out-monitor
sudo systemctl start inside-out-monitor
sudo systemctl status inside-out-monitor
```

### macOS (launchd)

Create `~/Library/LaunchAgents/com.insideout.monitor.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.insideout.monitor</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/server/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/server</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Then load:
```bash
launchctl load ~/Library/LaunchAgents/com.insideout.monitor.plist
```

## File Structure

```
server/
├── server.js              # Main UDP server
├── api.js                 # REST API server
├── db.js                  # Database management
├── encryption.js          # Message encryption/decryption
├── validation.js          # Message validation
├── secret.key             # Pre-shared key (GENERATE THIS!)
├── package.json           # Production dependencies only
├── databases/             # Created automatically
│   └── heartbeats.sqlite3
└── node_modules/          # Install with 'npm install'
```

## Configuration

Edit **server.js** to change settings:

```javascript
const PORT = 4000;              // UDP listen port
const MAX_MESSAGE_AGE = 300;    // Max age in seconds (5 minutes)
```

Edit **api.js** to change API settings:

```javascript
const API_PORT = 3000;          // HTTP API port
```

## Troubleshooting

### "Failed to load secret.key"
- Generate a new key using the command in step 1
- Or copy from an existing server installation

### "Port already in use"
- Check if another instance is running: `ps aux | grep node`
- Stop the other instance or change the port

### "Permission denied" on Linux
- Ports below 1024 require root privileges
- Use ports 4000 and 3000 (default) which don't require root
- Or use `setcap` to allow Node.js to bind to privileged ports

### Database errors
- Ensure the `databases/` directory is writable
- Check disk space

## Security Notes

- **Keep `secret.key` secure** - it authenticates all clients
- Use the same key across all trusted clients
- If compromised, generate a new key and redistribute to all clients
- Transmitted data is encrypted with XSalsa20-Poly1305
- Consider running the server behind a firewall
- Only expose ports 4000 (UDP) and 3000 (TCP) if needed
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
PLACEHOLDER - GENERATE OR COPY ACTUAL KEY

To complete deployment:

Option A - Generate new key:
1. Run: npm install
2. Run: node -e "const nacl = require('tweetnacl'); const util = require('tweetnacl-util'); const key = nacl.randomBytes(32); require('fs').writeFileSync('secret.key', util.encodeBase64(key));"

Option B - Copy existing key:
1. Copy secret.key from your existing server
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
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Copy the entire folder to your server"
echo "  2. Generate or copy secret.key (see DEPLOY.md)"
echo "  3. Run: npm install"
echo "  4. Run: npm start"
echo "  5. Configure firewall for UDP 4000 and TCP 3000"
echo ""
echo -e "${CYAN}See $OUTPUT_DIR/DEPLOY.md for detailed instructions${NC}"
echo ""
