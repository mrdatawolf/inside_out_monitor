# Inside-Out Monitor

A distributed device monitoring system that allows devices across multiple networks to send encrypted heartbeat messages to an external server via UDP.

**✨ Deploy as standalone executables** - no Node.js required on target systems!

## Quick Start

```bash
# 1. Configure (first time only)
cp config.example.js config.js
nano config.js  # Edit api.url to your server IP

# 2. Build everything
npm run build:win   # Windows
# or
npm run build:linux # Linux
# or
npm run build:macos # macOS

# 3. Copy shared secret key to dist/
cp client/secret.key dist/secret.key

# 4. Deploy from dist/ folder!
```

📖 **Guides:**
- [BUILD-QUICK.md](BUILD-QUICK.md) - Fast build instructions
- [CONFIGURATION.md](CONFIGURATION.md) - Configuration options
- [BUILD.md](BUILD.md) - Detailed build guide

## Overview

**Phase 1** (Complete): Core heartbeat system
- Devices send encrypted heartbeat messages (name + timestamp + network interfaces)
- Network interface monitoring (up to 5 interfaces with traffic stats and link speed)
- Automatic filtering of loopback and APIPA addresses
- Pre-shared key authentication using libsodium/TweetNaCl
- UDP transport on port 4000
- One-way communication (fire-and-forget)
- Timestamp freshness validation (5-minute window)
- SQLite storage with relational schema

**Phase 2** (Complete): Comprehensive testing framework with Jest

**Phase 3** (Complete): REST API and React Dashboard
- Express.js REST API on port 3000
- CORS-enabled for external frontends
- React dashboard with Vite
- Real-time device monitoring
- Network throughput charts with Recharts
- Auto-refresh capabilities
- Responsive, modern UI

**Phase 4** (Complete): Ping Monitoring
- Central monitoring box pings multiple internal IPs
- Monitor devices that can't run heartbeat client (printers, IoT, embedded devices)
- Encrypted ping results sent to server
- Tracks online/offline status and response times
- Separate database table for ping results
- API endpoints for ping data
- Available as standalone executable (no Node.js required)
- See [client/PING-MONITOR.md](client/PING-MONITOR.md) for details

**Phase 5** (Complete): Alerting System
- Discord and Microsoft Teams webhook integration for real-time alerts
- Status change detection (device online/offline transitions)
- Ping target status alerts (network device failures)
- Configurable alert rules and debouncing to prevent spam
- Rich message formatting with embeds (Discord) and Adaptive Cards (Teams)
- Cooldown periods to prevent alert fatigue
- See [ALERTING.md](ALERTING.md) for complete documentation

**Phase 6** (Complete): UniFi Network Monitoring
- Integration with Ubiquiti UniFi Controllers
- Monitor all wireless and wired clients
- Track connection/disconnection events
- Device type detection (Apple, Android, IoT, etc.)
- Traffic statistics and signal strength monitoring
- Dashboard integration with real-time client list
- See [ARCHITECTURE.md](ARCHITECTURE.md#phase-6-unifi-network-monitoring-complete) for details

**Phase 7** (Planned): Extended Reporting
- Historical trend analysis
- Uptime/downtime statistics
- Network bandwidth reports
- Custom report generation

**Phase 8** (Planned): External Server Deployment
- Test the server running on an external public accessible server
- Add more encryption and checking to harden the system
- Use it to test the Linux deployment chain

## Architecture

```
┌─────────────┐                    ┌─────────────┐
│   Device A  │───┐                │             │
│ (Windows)   │   │                │   Server    │
└─────────────┘   │                │   UDP:4000  │
                  ├─── UDP ───────▶│             │
┌─────────────┐   │   Encrypted    │   SQLite    │
│   Device B  │───┤   Messages     │             │
│  (Linux)    │   │                └─────────────┘
└─────────────┘   │
                  │
┌─────────────┐   │
│   Device C  │───┘
│   (macOS)   │
└─────────────┘
```

## Security

- **Encryption**: Authenticated encryption using NaCl secretbox (XSalsa20-Poly1305)
- **Authentication**: Pre-shared key (32 bytes)
- **Anti-replay**: Timestamp freshness validation (±5 minutes)
- **Transport**: UDP (no TLS needed - encryption at message level)

## Requirements

### Option 1: Standalone Executables (Recommended)
- **No requirements!** Executables include Node.js runtime
- Just need the executable + secret.key file
- See [Standalone Executables](#standalone-executables-recommended) section

### Option 2: Node.js Scripts

**Server:**
- Node.js 16+ (ES modules support)
- UDP port 4000 open

**Clients:**
- **PowerShell 7+** (Windows/Linux/macOS) - The PowerShell script will automatically:
  - Check for PowerShell 7+ and warn if using older version
  - Install Node.js LTS via winget if not present
  - Install npm dependencies if node_modules is missing
- **Bash** (Linux/macOS) - Requires Node.js 16+ pre-installed

## Installation

### 1. Server Setup

```bash
cd server
npm install
npm run keygen
```

This generates `server/secret.key` containing your pre-shared key. **Keep this secure!**

The server will automatically create a `databases/` directory on first run to store the SQLite database.

Start the server:
```bash
npm start
```

The server will:
- Listen on UDP port 4000
- Store heartbeats in `server/databases/heartbeats.sqlite3`
- Reject messages older than 5 minutes

### 2. Client Setup

Copy the pre-shared key from the server to each client:

```bash
# Copy server/secret.key to client/secret.key on each device
```

#### Windows (PowerShell 7):

**The PowerShell script automatically handles setup!** It will:
- Check for PowerShell 7+ (warn if using old version)
- Auto-install Node.js LTS via winget if needed
- Auto-run `npm install` if node_modules is missing

Just run the script:

```powershell
# Local testing (defaults to 127.0.0.1)
.\send-heartbeat.ps1

# Production deployment
.\send-heartbeat.ps1 -DeviceName "web-server-01" -ServerHost "monitor.example.com"

# Continuous mode - send heartbeat every 60 seconds
.\send-heartbeat.ps1 -ServerHost "monitor.example.com" -Interval 60
```

**Note:** If you get a PowerShell version error, install PowerShell 7+:
```powershell
winget install Microsoft.PowerShell
```

#### Linux/macOS (Bash):

First, install dependencies manually:
```bash
cd client
npm install
```

Then run the script:
```bash
chmod +x send-heartbeat.sh

# Local testing (defaults to 127.0.0.1)
./send-heartbeat.sh

# Production deployment
./send-heartbeat.sh "web-server-01" "monitor.example.com" 4000

# Continuous mode - send heartbeat every 60 seconds
./send-heartbeat.sh "web-server-01" "monitor.example.com" 4000 60
```

**Note:** The client scripts default to `127.0.0.1` for easy local testing. For production, specify the server host as shown above or use environment variables.

**Continuous Mode:** Use the `-Interval` parameter (PowerShell) or 4th argument (Bash) to run the script continuously, sending heartbeats at regular intervals. This is more reliable than using Task Scheduler/cron for repeated execution.

## Standalone Executables (Recommended)

For the simplest deployment, build standalone executables that require **no Node.js installation**:

### Client Executable

Build self-contained executables for all platforms:

```bash
cd client
npm install  # Install dependencies (including pkg)
npm run build
```

This creates:
- `dist/monitor-client-win.exe` (Windows)
- `dist/monitor-client-linux` (Linux)
- `dist/monitor-client-macos` (macOS)

**Usage:**
```bash
# Windows
monitor-client-win.exe --host 192.168.1.100 --interval 60

# Linux/macOS
./monitor-client-linux --host 192.168.1.100 --interval 60
```

**Deployment:** Copy the exe + `secret.key` to each device. That's it!

### Server Executable

Build self-contained server executable:

```bash
cd server
npm install
npm run build:win  # or build:linux, build:macos
```

**Usage:**
```bash
# Windows
monitor-server-win.exe

# With custom ports
monitor-server-win.exe --udp-port 5000 --api-port 3001
```

**Deployment:** Copy the exe + `secret.key` + `sql-wasm.wasm` to your server. Create a `databases/` folder. Run!

**Note:** The `sql-wasm.wasm` file is automatically copied to `dist/` during the build process and must be in the same directory as the server executable.

### Dashboard Desktop App (Electron) ⭐ Recommended

Build a true desktop application with embedded browser - **no separate browser needed!**

```bash
cd dashboard
npm install
# Configure API URL in src/api.js first!
npm run electron:build:win   # Windows
npm run electron:build:linux # Linux
npm run electron:build:mac   # macOS
```

This creates:
- `dist/electron/Inside-Out Monitor 1.0.0.exe` (Windows)
- Or `dist/electron/Inside-Out Monitor-1.0.0.AppImage` (Linux)
- Or `dist/electron/Inside-Out Monitor-1.0.0.dmg` (macOS)

**Usage:**
```bash
# Just double-click the executable!
# Or run from command line:
cd dist/electron
"./Inside-Out Monitor 1.0.0.exe"
```

**Advantages:**
- Launches directly as desktop app
- No browser needed - embedded Chromium
- Works completely offline
- Single file distribution

**Size:** ~85-90 MB (includes browser + runtime)

---

**Alternative: Web Server Mode**

For remote/network access, use the web server executable instead:
```bash
cd dashboard
npm run build
npm run build:server:win  # Creates dist/monitor-dashboard-server-win.exe
```

Run and access via browser at `http://localhost:5000`

### Ping Monitor Executable

Build the ping monitor for deployment to a central monitoring box:

```bash
cd client
npm install
npm run build:ping       # All platforms
npm run build:ping:win   # Windows only
npm run build:ping:linux # Linux only
```

**Usage:**
```bash
# Windows
ping-monitor-win.exe --host 192.168.1.100 --interval 120 --config ping-targets.json

# Linux/macOS
./ping-monitor-linux --host 192.168.1.100 --interval 120 --config ping-targets.json
```

**Deployment:** Copy exe + `secret.key` + `ping-targets.json` to your monitoring box. Run!

### Advantages

- ✅ No Node.js required on target systems
- ✅ No npm install needed
- ✅ No dependency conflicts
- ✅ Single file to distribute (+ secret.key)
- ✅ Works on systems without internet access
- ✅ Easier to set up with Task Scheduler/systemd

## Deployment

Use the deployment scripts to create production-ready packages for each component:

### Server Deployment

Package the server for deployment to your monitoring host:

**Windows (PowerShell):**
```powershell
cd server
.\create-deployment.ps1
```

**Linux/macOS (Bash):**
```bash
cd server
chmod +x create-deployment.sh
./create-deployment.sh
```

This creates `deploy/server/` containing:
- Production server files
- Instructions for generating/copying secret.key
- Systemd/Task Scheduler setup guides

See `deploy/server/DEPLOY.md` for detailed instructions.

### Client Deployment

Package the client for distribution to monitored devices:

**Windows (PowerShell):**
```powershell
cd client
.\create-deployment.ps1
```

**Linux/macOS (Bash):**
```bash
cd client
chmod +x create-deployment.sh
./create-deployment.sh
```

This creates `deploy/client/` containing:
- Production files only (no tests, dev dependencies)
- Pre-configured with your server IP
- Deployment instructions (DEPLOY.md)

**Steps:**
1. Copy `server/secret.key` to `deploy/client/secret.key`
2. Distribute the entire `deploy/client/` folder to each device
3. On each device, run: `.\send-heartbeat.ps1 -ServerHost "YOUR_SERVER" -Interval 60`

See `deploy/client/DEPLOY.md` for detailed instructions.

### Dashboard Deployment

Build and package the React dashboard for production:

**Windows (PowerShell):**
```powershell
cd dashboard
.\create-deployment.ps1 -ApiUrl "http://192.168.1.100:3000"
```

**Linux/macOS (Bash):**
```bash
cd dashboard
chmod +x create-deployment.sh
./create-deployment.sh ../deploy/dashboard http://192.168.1.100:3000
```

This creates `deploy/dashboard/` containing:
- Production-optimized React build
- Pre-configured with your API URL
- Deployment instructions for nginx, Apache, Docker, IIS

**Quick test:**
```bash
npm install -g serve
cd deploy/dashboard
serve -s . -p 5000
```

See `deploy/dashboard/DEPLOY.md` for all deployment options.

## Configuration

### Server
Edit [server/server.js](server/server.js):
- `PORT`: UDP listen port (default: 4000)
- `MAX_MESSAGE_AGE`: Maximum message age in seconds (default: 300)

### Client

**Script Defaults:**
- `ServerHost`: 127.0.0.1 (for local testing)
- `ServerPort`: 4000
- `DeviceName`: hostname/computername

**Override via command-line arguments or environment variables:**

**PowerShell:**
```powershell
$env:MONITOR_DEVICE_NAME = "my-device"
$env:MONITOR_HOST = "monitor.example.com"
$env:MONITOR_PORT = "4000"
.\send-heartbeat.ps1
```

**Bash:**
```bash
export MONITOR_DEVICE_NAME="my-device"
export MONITOR_HOST="monitor.example.com"
export MONITOR_PORT="4000"
./send-heartbeat.sh
```

## Testing

The project includes a comprehensive test suite covering unit tests, integration tests, and end-to-end tests.

### Quick Start

```bash
# Install test dependencies
npm install

# Run all tests
npm run test:all

# Run specific test suites
npm run test:server    # Server tests only
npm run test:client    # Client tests only
npm test               # E2E tests only

# Run with coverage
npm run test:coverage
```

### Test Coverage

The test suite includes:

- **Database Tests**: Schema, insertions, queries, integrity
- **Encryption Tests**: Key generation, encryption/decryption, security
- **Validation Tests**: Timestamp validation, message structure, IP filtering
- **Server Integration**: Message processing, error handling, performance
- **Client Tests**: Message creation, encryption, UDP packet format
- **Network Stats Tests**: Interface collection, platform detection, parsing
- **End-to-End Tests**: Complete client-to-server workflow

**Coverage Targets**: 70% server, 60% client

See [TESTING.md](TESTING.md) for detailed documentation.

## Dashboard Setup (Phase 3)

The dashboard provides a web-based interface for monitoring your devices in real-time.

### Start the API Server

The API server runs alongside the UDP server:

```bash
cd server
npm install  # Install express and cors if not already installed
npm start
```

This starts:
- **UDP Server** on port 4000 (heartbeat ingestion)
- **API Server** on port 3000 (HTTP REST API)

### Start the Dashboard

**Development Mode:**
```bash
cd dashboard
npm install
npm run dev
```

Dashboard available at `http://localhost:5173`

**Production Build:**
```bash
cd dashboard
npm run build

# Serve the built files
npm install -g serve
serve -s dist
```

### Dashboard Features

- **Device List**: View all devices with online/offline status
- **System Stats**: Total devices, online count, heartbeat totals
- **Device Details**: Detailed view per device with network interface data
- **Network Charts**: Real-time throughput visualization (Mbps)
- **Auto-refresh**: Dashboard updates every 30s, details every 15s

### API Endpoints

- `GET /api/devices` - List all devices
- `GET /api/devices/:name` - Device details
- `GET /api/devices/:name/history` - Historical heartbeats
- `GET /api/devices/:name/interfaces` - Interface throughput data
- `GET /api/stats` - System statistics
- `GET /api/health` - Health check

See [dashboard/README.md](dashboard/README.md) for deployment options and configuration.

## Automation

### Option 1: Continuous Mode (Recommended)

The simplest and most reliable method is to use the built-in continuous mode:

**Windows (Task Scheduler - Run at Login):**
```powershell
$action = New-ScheduledTaskAction -Execute "pwsh" `
    -Argument "-File C:\path\to\send-heartbeat.ps1 -ServerHost monitor.example.com -Interval 60" `
    -WorkingDirectory "C:\path\to"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "MonitorHeartbeat" -Action $action -Trigger $trigger -RunLevel Highest
```

**Linux (systemd service):**
Create `/etc/systemd/system/monitor-heartbeat.service`:
```ini
[Unit]
Description=Inside-Out Monitor Heartbeat
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/client
ExecStart=/path/to/client/send-heartbeat.sh "device-name" "monitor.example.com" 4000 60
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then enable:
```bash
sudo systemctl enable monitor-heartbeat
sudo systemctl start monitor-heartbeat
```

### Option 2: Scheduled Tasks (Legacy)

**Windows (Task Scheduler - Repeated):**
```powershell
$action = New-ScheduledTaskAction -Execute "pwsh" -Argument "-File C:\path\to\send-heartbeat.ps1"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "MonitorHeartbeat" -Action $action -Trigger $trigger
```

**Linux (Cron):**
```bash
# Send heartbeat every 5 minutes
*/5 * * * * /path/to/send-heartbeat.sh >> /var/log/monitor-heartbeat.log 2>&1
```

**macOS (launchd - Continuous Mode):**
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
        <string>device-name</string>
        <string>monitor.example.com</string>
        <string>4000</string>
        <string>60</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/path/to/client</string>
</dict>
</plist>
```

Then load it:
```bash
launchctl load ~/Library/LaunchAgents/com.monitor.heartbeat.plist
```

**macOS (launchd - Repeated Mode):**
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

## Database Schema

```sql
CREATE TABLE heartbeats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_name TEXT NOT NULL,
    device_timestamp INTEGER NOT NULL,  -- Unix timestamp from device
    received_at INTEGER NOT NULL        -- Unix timestamp when received
);

CREATE TABLE network_interfaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    heartbeat_id INTEGER NOT NULL,
    interface_name TEXT NOT NULL,       -- Interface name (e.g., eth0, Ethernet)
    ip_address TEXT NOT NULL,           -- IPv4 address
    rx_bytes INTEGER NOT NULL,          -- Bytes received
    tx_bytes INTEGER NOT NULL,          -- Bytes transmitted
    max_speed_mbps INTEGER NOT NULL,    -- Link speed in Mbps
    FOREIGN KEY (heartbeat_id) REFERENCES heartbeats(id)
);
```

Query examples:
```sql
-- Recent heartbeats with network info
SELECT
    h.device_name,
    datetime(h.received_at, 'unixepoch') as last_seen,
    COUNT(n.id) as interface_count
FROM heartbeats h
LEFT JOIN network_interfaces n ON h.id = n.heartbeat_id
GROUP BY h.device_name
ORDER BY h.received_at DESC;

-- Device activity in last hour
SELECT device_name, COUNT(*) as heartbeats
FROM heartbeats
WHERE received_at > strftime('%s', 'now', '-1 hour')
GROUP BY device_name;

-- Network interface stats for a device
SELECT
    h.device_name,
    n.interface_name,
    n.ip_address,
    n.rx_bytes,
    n.tx_bytes,
    n.max_speed_mbps,
    datetime(h.received_at, 'unixepoch') as recorded_at
FROM heartbeats h
JOIN network_interfaces n ON h.id = n.heartbeat_id
WHERE h.device_name = 'my-device'
ORDER BY h.received_at DESC
LIMIT 10;
```

## Troubleshooting

### "Failed to decrypt message"
- Ensure secret.key is identical on server and client
- Check that the key file has no extra whitespace

### "Stale message"
- Ensure device clocks are synchronized (use NTP)
- Check MAX_MESSAGE_AGE setting on server

### "Connection refused" / No messages received
- Verify server is running and listening on port 4000
- Check firewall allows UDP port 4000
- Verify SERVER_HOST is correct from client perspective

### PowerShell: "Node.js is not installed"
- Install Node.js from https://nodejs.org/
- Ensure `node` is in PATH
- Restart PowerShell after installation

## Message Format

Encrypted UDP packet structure:
```
[ Nonce: 24 bytes ][ Encrypted JSON + Auth Tag ]
```

Decrypted JSON payload:
```json
{
  "name": "device-name",
  "timestamp": 1733097600,
  "network_interfaces": [
    {
      "name": "eth0",
      "ip": "192.168.1.100",
      "rx_bytes": 1234567890,
      "tx_bytes": 987654321,
      "max_speed_mbps": 1000
    },
    {
      "name": "wlan0",
      "ip": "192.168.1.101",
      "rx_bytes": 555666777,
      "tx_bytes": 111222333,
      "max_speed_mbps": 300
    }
  ]
}
```

**Note:** Network interfaces automatically exclude:
- Loopback addresses (127.x.x.x)
- APIPA addresses (169.254.x.x - failed DHCP)
- Maximum of 5 interfaces reported

## Roadmap

- ✅ **Phase 1**: Core heartbeat system with encryption
- ✅ **Phase 2**: Comprehensive testing framework
  - Unit tests for all components
  - Integration tests for server and client
  - End-to-end tests for complete workflow
  - 70%+ code coverage on server, 60%+ on client
- ✅ **Phase 3**: REST API and React Dashboard
  - Express.js REST API on port 3000
  - React dashboard with Vite
  - Real-time device monitoring
  - Network throughput visualization
  - Responsive, modern UI
- ✅ **Phase 4**: Ping monitoring for network devices
- ✅ **Phase 5**: Alerting system ([ALERTING.md](ALERTING.md))
- ✅ **Phase 6**: UniFi network monitoring ([ARCHITECTURE.md](ARCHITECTURE.md#phase-6-unifi-network-monitoring-complete))
- 📋 **Phase 7**: Extended reporting
- 📋 **Phase 8**: External server deployment

## Phase 5: Alerting System (Complete)

The alerting system monitors device and network equipment status changes and sends real-time notifications to Discord and Microsoft Teams via webhooks.

### Features Implemented

**Alert Detection:**
- ✅ Status change detection for heartbeat devices (online/offline transitions)
- ✅ Status change detection for ping targets (reachable/unreachable)
- ✅ New device/target detection
- ✅ Debouncing logic to prevent alert spam
- ✅ Grace period for brief outages
- ✅ Cooldown periods to prevent alert fatigue

**Webhook Integrations:**
- ✅ Discord webhooks with rich embeds and color coding
- ✅ Microsoft Teams webhooks with MessageCard format
- ✅ Configurable device/target filtering with wildcards
- ✅ Event type filtering (online, offline, new device, etc.)
- ✅ Optional @mentions for Discord alerts

**Alert Management:**
- ✅ Alert queue system with batching
- ✅ Alert logging to database
- ✅ Background monitoring service
- ✅ Configurable check intervals
- ✅ Pattern-based filtering (e.g., "router-*")

### Configuration

All alerting settings are configured in [config.js](config.js). Example:

```javascript
alerting: {
  enabled: true,
  webhooks: {
    discord: [
      {
        url: 'https://discord.com/api/webhooks/...',
        name: 'IT Alerts',
        devices: ['*'],
        pingTargets: ['*'],
        events: ['offline', 'online']
      }
    ],
    teams: [
      {
        url: 'https://YOUR_TENANT.webhook.office.com/webhookb2/...',
        name: 'Network Monitoring',
        devices: ['router-*', 'switch-*'],
        events: ['offline']
      }
    ]
  },
  behavior: {
    debounceSeconds: 300,
    gracePeriodSeconds: 120,
    cooldownSeconds: 3600
  }
}
```

### Documentation

See [ALERTING.md](ALERTING.md) for:
- Complete setup guide
- Webhook configuration for Discord and Teams
- Alert filtering and customization
- Behavior tuning (debouncing, grace periods, cooldown)
- Troubleshooting guide
- Best practices

### Files Added

- `server/alerting.js` - Core alerting engine
- `server/webhooks/discord.js` - Discord webhook client
- `server/webhooks/teams.js` - Microsoft Teams webhook client
- `ALERTING.md` - Complete documentation
- Updated `config.js` with alerting configuration
- Added 3 database tables: `device_states`, `ping_target_states`, `alert_log`

## Phase 6: UniFi Network Monitoring (Complete)

The UniFi monitoring system integrates with Ubiquiti UniFi network controllers to track all connected clients (wireless and wired) on your network.

### Features Implemented

**UniFi Integration:**
- ✅ Connects to UniFi Dream Router, UDM Pro, and UniFi OS controllers
- ✅ Authenticates via UniFi Controller REST API
- ✅ Polls connected clients at configurable intervals
- ✅ Encrypts and sends client data to monitor server
- ✅ Supports self-signed SSL certificates

**Client Monitoring:**
- ✅ Tracks MAC address, IP, hostname, device name
- ✅ Identifies device manufacturer via OUI lookup
- ✅ Detects device type (wired, wireless, Apple, Android, IoT)
- ✅ Monitors traffic statistics (RX/TX bytes and rates)
- ✅ Records wireless signal strength and channel information
- ✅ Logs connection/disconnection events

**Dashboard Features:**
- ✅ Real-time client list with 5-second auto-refresh
- ✅ Connection status indicators (connected/disconnected)
- ✅ Filter by hostname, MAC address, IP, or manufacturer
- ✅ Device type filtering (all, wired, wireless)
- ✅ Device icons based on type (Apple, Android, IoT, etc.)
- ✅ Traffic statistics display
- ✅ Individual client detail views with connection history
- ✅ Statistics overview (total clients, connected count, wired/wireless breakdown)

### Configuration

All UniFi settings are configured in [config.js](config.js). Example:

```javascript
unifi: {
  host: '192.168.1.1',              // UniFi Controller IP
  port: 443,                        // HTTPS port
  username: 'monitor',              // Admin username
  password: 'your-password',        // Password
  site: 'default',                  // Site name (usually 'default')
  interval: 60,                     // Poll interval in seconds
  ignoreSsl: true                   // Ignore self-signed certs
}
```

### UniFi Monitor Executable

Build the UniFi monitor for deployment:

```bash
npm run build:unifi:win   # Windows
npm run build:unifi:linux # Linux
npm run build:unifi:macos # macOS
```

**Usage:**
```bash
# Windows
unifi-monitor-win.exe --host 192.168.1.1 --password yourpass --interval 60

# Linux/macOS
./unifi-monitor-linux --host 192.168.1.1 --password yourpass --interval 60
```

**Deployment:** Copy the exe + `secret.key` to your monitoring box. Run!

### Database Schema

The UniFi monitoring system uses a separate `unifi.sqlite3` database with three tables:

- `unifi_clients` - Historical snapshot of all client connections
- `unifi_client_states` - Current connection state for each client
- `unifi_connection_events` - Log of connect/disconnect events

### API Endpoints

- `GET /api/unifi/clients` - List all clients (connected and historical)
- `GET /api/unifi/clients/:mac` - Client details
- `GET /api/unifi/clients/:mac/history` - Connection event history
- `GET /api/unifi/stats` - Overall statistics

### Files Added

- `client/unifi-monitor.js` - UniFi monitor executable
- `client/unifi-api.js` - UniFi Controller API client library
- `server/unifi-db.js` - UniFi database operations
- `dashboard/src/components/UniFiClients.jsx` - Dashboard client list
- `dashboard/src/components/UniFiClientDetail.jsx` - Dashboard client details
- API endpoints added to `server/api.js`
- Added 3 database tables: `unifi_clients`, `unifi_client_states`, `unifi_connection_events`

## License

MIT
