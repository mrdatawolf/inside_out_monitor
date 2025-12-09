# Inside-Out Monitor - System Architecture

## System Overview

Inside-Out Monitor is a network monitoring system where **monitored devices actively report their status** to a central server (inside-out approach). The system uses encrypted UDP for communication and provides a REST API + web dashboard for viewing device status.

### Core Concept: Inside-Out Monitoring
Traditional monitoring systems actively poll devices from a central location. Inside-Out Monitor reverses this: devices send encrypted heartbeats to the server, eliminating the need for firewall rules or open ports on monitored devices.

## System Components

```
┌─────────────────┐      Encrypted UDP       ┌──────────────────┐
│  Client Devices │ ───────────────────────> │  Monitor Server  │
│                 │    (Port 4000)           │                  │
│ • Heartbeat     │                          │ • UDP Receiver   │
│ • Ping Monitor  │                          │ • SQLite DB      │
└─────────────────┘                          │ • REST API       │
                                             └──────────────────┘
                                                      │
                                                      │ HTTP API
                                                      │ (Port 3000)
                                                      ▼
                                             ┌──────────────────┐
                                             │  Web Dashboard   │
                                             │                  │
                                             │ • Electron App   │
                                             │ • Vue.js UI      │
                                             └──────────────────┘
```

### 1. Server (`server/`)
**Purpose:** Central receiving point for all monitoring data

**Components:**
- **UDP Server** (port 4000) - Receives encrypted messages from clients
- **SQLite Database** - Stores heartbeats, network stats, and ping results
- **REST API** (port 3000) - Provides device data to dashboard/external tools
- **Encryption Handler** - Decrypts messages using TweetNaCl

**Executables:**
- `dist/monitor-server-win.exe` - Self-contained server with embedded SQLite WASM

### 2. Clients (`client/`)
**Purpose:** Run on monitored devices to report status

**Client Types:**

#### Heartbeat Client (`client-cli.js`)
- Sends device hostname + network interface stats
- Default interval: 60 seconds
- Reports: interface names, IP addresses, rx/tx bytes, link speeds

#### Ping Monitor (`ping-monitor-cli.js`)
- Pings configured targets (printers, switches, cameras, etc.)
- Sends aggregated ping results to server
- **Per-target configurable intervals**: Each target can have its own ping frequency (1-N seconds)
- Default interval: 60 seconds (if not specified per-target)
- Reports: target status (online/offline), response times
- **Flexible monitoring**: Critical infrastructure can be checked every 1-5 seconds, while less critical devices use longer intervals

**Executables:**
- `dist/monitor-client-win.exe` - Heartbeat client
- `dist/ping-monitor-win.exe` - Ping monitor

### 3. Dashboard (`dashboard/`)
**Purpose:** Web UI for viewing monitoring data

**Components:**
- **Electron App** - Self-contained desktop application
- **Vue.js Frontend** - Interactive UI for device status
- **Express Backend** - Serves static files and proxies API calls

**Executables:**
- `dist/monitor-dashboard-win.exe` - Self-contained Electron app with embedded Vue build

## Communication Protocol

### Transport: Encrypted UDP
- **Port:** 4000 (configurable)
- **Protocol:** UDP (fire-and-forget, no handshake required)
- **Encryption:** TweetNaCl secretbox (symmetric encryption)
- **Key Management:** Shared secret in `secret.key` file (32 bytes)

### Encryption Details
```javascript
// Encryption (Client side)
const nonce = nacl.randomBytes(24);  // 24-byte random nonce
const message = JSON.stringify(data);
const encrypted = nacl.secretbox(
  util.decodeUTF8(message),
  nonce,
  secretKey
);
const packet = concat(nonce, encrypted);  // Nonce prefix + ciphertext
```

```javascript
// Decryption (Server side)
const nonce = packet.slice(0, 24);
const ciphertext = packet.slice(24);
const decrypted = nacl.secretbox.open(
  ciphertext,
  nonce,
  secretKey
);
const message = JSON.parse(util.encodeUTF8(decrypted));
```

### Message Validation
The server validates all messages before processing:
- **Timestamp check:** Message age must be < 300 seconds (prevents replay attacks)
- **Name validation:** `message.name` must be a non-empty string
- **Type routing:** Messages routed based on `type` field

## Message Formats

### Heartbeat Message
```javascript
{
  // type field is optional (defaults to heartbeat if omitted)
  "name": "DESKTOP-ABC123",           // Device hostname
  "timestamp": 1733270400,            // Unix timestamp (seconds)
  "network_interfaces": [             // Array of network adapters
    {
      "name": "Ethernet",
      "ip": "192.168.1.100",
      "rx_bytes": 1234567890,         // Received bytes
      "tx_bytes": 9876543210,         // Transmitted bytes
      "max_speed_mbps": 1000          // Link speed (Mbps)
    }
  ]
}
```

### Ping Message
```javascript
{
  "type": "ping",                     // Explicit type for routing
  "name": "BTNETDOC",                 // Monitor hostname
  "timestamp": 1733270400,            // Unix timestamp (seconds)
  "results": [                        // Array of ping results
    {
      "ip": "192.168.203.42",
      "name": "Tech Printer Lexmark",
      "status": "online",             // "online" or "offline"
      "response_time_ms": 19          // Ping latency (milliseconds)
    }
  ]
}
```

## Database Schema

### Database File
- **Location:** `dist/databases/heartbeats.sqlite3`
- **Technology:** SQLite via sql.js (WASM-based, no native dependencies)
- **Persistence:** Auto-saves every 5 minutes + on shutdown

### Table: `heartbeats`
```sql
CREATE TABLE heartbeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_name TEXT NOT NULL,
  device_timestamp INTEGER NOT NULL,  -- Client's timestamp
  received_at INTEGER NOT NULL        -- Server's timestamp
);
CREATE INDEX idx_device_name ON heartbeats(device_name);
CREATE INDEX idx_received_at ON heartbeats(received_at);
```

**Note:** Both `device_timestamp` and `received_at` are stored to detect clock drift and measure network latency.

### Table: `network_interfaces`
```sql
CREATE TABLE network_interfaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  heartbeat_id INTEGER NOT NULL,
  interface_name TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  rx_bytes INTEGER NOT NULL,
  tx_bytes INTEGER NOT NULL,
  max_speed_mbps INTEGER NOT NULL,
  FOREIGN KEY (heartbeat_id) REFERENCES heartbeats(id)
);
CREATE INDEX idx_heartbeat_id ON network_interfaces(heartbeat_id);
```

**Purpose:** Stores network adapter statistics tied to each heartbeat for bandwidth tracking.

### Table: `ping_results`
```sql
CREATE TABLE ping_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_name TEXT NOT NULL,         -- Which ping monitor sent this
  target_ip TEXT NOT NULL,
  target_name TEXT,                   -- Friendly name (e.g., "Front Printer")
  status TEXT NOT NULL,               -- "online" or "offline"
  response_time_ms REAL,              -- NULL if offline
  timestamp INTEGER NOT NULL,         -- When ping was performed
  received_at INTEGER NOT NULL        -- When server received it
);
CREATE INDEX idx_monitor_name ON ping_results(monitor_name);
CREATE INDEX idx_target_ip ON ping_results(target_ip);
CREATE INDEX idx_ping_received_at ON ping_results(received_at);
```

## REST API Endpoints

### Device Heartbeat Endpoints

#### `GET /api/devices`
List all devices with last heartbeat time.

**Response:**
```json
{
  "devices": [
    {
      "device_name": "DESKTOP-ABC123",
      "last_seen": 1733270400,
      "heartbeat_count": 1234,
      "status": "online",              // online if last_seen < 10 min ago
      "last_seen_ago": 45              // seconds since last heartbeat
    }
  ]
}
```

#### `GET /api/devices/:name`
Get detailed info for a specific device.

**Response:**
```json
{
  "device": {
    "name": "DESKTOP-ABC123",
    "last_seen": 1733270400,
    "last_seen_ago": 45,
    "status": "online",
    "device_timestamp": 1733270398,
    "interfaces": [
      {
        "interface_name": "Ethernet",
        "ip_address": "192.168.1.100",
        "rx_bytes": 1234567890,
        "tx_bytes": 9876543210,
        "max_speed_mbps": 1000
      }
    ]
  }
}
```

#### `GET /api/devices/:name/history`
Get heartbeat history for a device.

**Query Parameters:**
- `hours=24` - Time window (default: 24)
- `limit=100` - Max results (default: 100)

**Response:**
```json
{
  "heartbeats": [
    {
      "id": 5678,
      "device_timestamp": 1733270400,
      "received_at": 1733270401
    }
  ]
}
```

#### `GET /api/devices/:name/interfaces`
Get network interface data with bandwidth history.

**Query Parameters:**
- `limit=50` - Max datapoints (default: 50)

**Response:**
```json
{
  "interfaces": [
    {
      "name": "Ethernet",
      "ip": "192.168.1.100",
      "max_speed_mbps": 1000,
      "history": [
        {
          "timestamp": 1733270400,
          "rx_bytes": 1234567890,
          "tx_bytes": 9876543210
        }
      ]
    }
  ]
}
```

#### `GET /api/stats`
Overall system statistics.

**Response:**
```json
{
  "stats": {
    "total_devices": 10,
    "online_devices": 8,
    "offline_devices": 2,
    "total_heartbeats": 12345,
    "oldest_heartbeat": 1733000000,
    "newest_heartbeat": 1733270400,
    "uptime_seconds": 270400
  }
}
```

### Ping Monitoring Endpoints

#### `GET /api/ping-monitors`
List all ping monitors.

**Response:**
```json
{
  "monitors": [
    {
      "monitor_name": "BTNETDOC",
      "last_seen": 1733270400,
      "ping_count": 500
    }
  ]
}
```

#### `GET /api/ping-targets`
List all ping targets with current status.

**Response:**
```json
{
  "targets": [
    {
      "target_ip": "192.168.203.42",
      "target_name": "Tech Printer Lexmark",
      "monitor_name": "BTNETDOC",
      "status": "online",
      "response_time_ms": 19,
      "last_check": 1733270400,
      "last_check_ago": 30
    }
  ]
}
```

#### `GET /api/ping-targets/:ip/history`
Get ping history for a specific target.

**Query Parameters:**
- `hours=24` - Time window (default: 24)
- `limit=100` - Max results (default: 100)

**Response:**
```json
{
  "history": [
    {
      "monitor_name": "BTNETDOC",
      "target_ip": "192.168.203.42",
      "target_name": "Tech Printer Lexmark",
      "status": "online",
      "response_time_ms": 19,
      "timestamp": 1733270400,
      "received_at": 1733270401
    }
  ]
}
```

#### `GET /api/ping-stats`
Overall ping monitoring statistics.

**Response:**
```json
{
  "stats": {
    "total_targets": 15,
    "online_targets": 12,
    "offline_targets": 3,
    "total_pings": 45000,
    "total_monitors": 2
  }
}
```

#### `GET /api/health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1733270400
}
```

## Build System & Packaging

### Technology: `pkg` by Vercel
All executables are built using `pkg`, which bundles Node.js + dependencies into single-file executables.

### Build Commands

**IMPORTANT: All build commands should be run from the root directory.**

Never `cd` into subdirectories to build - the root `package.json` handles everything.

```bash
# Build all components for Windows
npm run build:win

# Build individual components
npm run build:server:win    # Server executable → dist/monitor-server-win.exe
npm run build:client:win    # Client executables → dist/monitor-client-win.exe, dist/ping-monitor-win.exe
npm run build:dashboard:win # Dashboard web server → dist/monitor-dashboard-win.exe

# Build Electron desktop app (optional - not used by default)
npm run build:electron:win  # Electron app → dist/electron/Inside-Out Monitor.exe

# Cross-platform builds
npm run build:linux         # Linux binaries
npm run build:macos         # macOS binaries
npm run build:electron:linux
npm run build:electron:macos
```

**Build Outputs:**
- `dist/monitor-server-win.exe` - UDP server + SQLite database + REST API
- `dist/monitor-client-win.exe` - Heartbeat client (reports device status)
- `dist/ping-monitor-win.exe` - Ping monitor (pings network devices)
- `dist/monitor-dashboard-win.exe` - Web server serving React dashboard (port 8080)
- `dist/electron/` - Electron desktop app ⚠️ **NOT FUNCTIONAL** - Use monitor-dashboard-win.exe instead

### Critical pkg Bundling Quirks

#### 1. SQLite WASM File Must Be External
`sql.js` uses a WASM binary that **cannot** be embedded by pkg.

**Solution:**
- Copy `sql-wasm.wasm` to `dist/` during build
- Server loads it at runtime using `readFileSync()`
- Build script: `server/package.json` → `copy-wasm` script

**Code Reference:** `server/db.js:16-22`

#### 2. Dashboard Static Files Must Be Manually Structured
`pkg` glob patterns (e.g., `dist/**/*`) don't work reliably on Windows.

**Solution:**
- Custom script `dashboard/prepare-pkg.js` manually copies `dist/` files into correct structure
- Detection of pkg environment via `process.pkg`
- Static path resolution: `dashboard/dashboard-server.js:63-67`

**Build Script:** `dashboard/package.json` → `prepare-pkg` step

#### 3. Dynamic Requires Are Not Supported
`pkg` requires static analysis of `require()` calls. Dynamic requires fail.

**Solution:**
- Use esbuild to bundle dependencies before pkg
- Mark certain modules as `--external` (like `sql.js`)
- Warning about `Cannot resolve 'mod'` is expected and harmless

#### 4. __dirname Behaves Differently in pkg
In pkg executables, `__dirname` points to a virtual snapshot path, not the actual executable location.

**Solution:**
```javascript
const __dirname = process.pkg
  ? dirname(process.execPath)  // Use executable directory
  : dirname(fileURLToPath(import.meta.url));  // Use source directory
```

**Code References:**
- `server/db.js:7`
- `dashboard/dashboard-server.js:63-67`

## Directory Structure

```
inside_out_monitor/
├── client/                  # Client executables (heartbeat + ping)
│   ├── client.js            # Heartbeat client library
│   ├── client-cli.js        # Heartbeat client CLI (pkg entry point)
│   ├── ping-monitor.js      # Ping monitor library
│   ├── ping-monitor-cli.js  # Ping monitor CLI (pkg entry point)
│   ├── network-stats.js     # Network interface stats helper
│   └── package.json         # Client build scripts
├── server/                  # Server components
│   ├── server-cli.js        # UDP server + message routing (pkg entry point)
│   ├── db.js                # SQLite database operations
│   ├── api.js               # REST API endpoints
│   └── package.json         # Server build scripts
├── dashboard/               # Web dashboard
│   ├── src/                 # Vue.js source files
│   ├── dist/                # Built Vue.js app (generated)
│   ├── dashboard-server.js  # Express server for dashboard
│   ├── prepare-pkg.js       # pkg bundling helper script
│   └── package.json         # Dashboard build scripts
├── dist/                    # Build output directory
│   ├── monitor-server-win.exe
│   ├── monitor-client-win.exe
│   ├── ping-monitor-win.exe
│   ├── monitor-dashboard-win.exe
│   ├── sql-wasm.wasm        # SQLite WASM (required by server)
│   ├── secret.key           # Shared encryption key (32 bytes)
│   └── databases/           # SQLite database files
│       └── heartbeats.sqlite3
├── scripts/
│   └── inject-config.js     # Pre-build config injection
├── __tests__/               # Integration tests
├── config.example.js        # Example configuration file
└── package.json             # Root build scripts
```

## Configuration Files

### `secret.key`
**Location:** `dist/secret.key`
**Format:** 32-byte binary file (TweetNaCl secretbox key)
**Usage:** Must be identical on server and all clients
**Generation:** `node -e "console.log(require('tweetnacl').randomBytes(32))"`

**Security Note:** Keep this file secure. Anyone with the key can decrypt all traffic and forge messages.

### `ping-targets.json` (Ping Monitor)
**Location:** `dist/ping-targets.json` or `client/ping-targets.json.example`
**Format:** JSON configuration file
**Purpose:** Configure ping targets with per-target intervals

**Example:**
```json
{
  "targets": [
    {
      "ip": "192.168.203.42",
      "name": "Tech Printer Lexmark",
      "interval": 60
    },
    {
      "ip": "192.168.203.199",
      "name": "Front Printer HP",
      "interval": 60
    },
    {
      "ip": "192.168.203.159",
      "name": "Testing Camera",
      "interval": 30
    },
    {
      "ip": "192.168.203.102",
      "name": "Network Switch",
      "interval": 5
    }
  ],
  "_comment": "Interval is in seconds. Minimum: 1 second, Default: 60 seconds. Each target can have its own interval."
}
```

**Per-Target Interval Feature:**
- Each target can have a custom `interval` field (in seconds)
- Minimum interval: 1 second
- Default interval: 60 seconds (if not specified)
- Critical devices (switches, routers) can be monitored more frequently (e.g., 5-10 seconds)
- Less critical devices (printers, cameras) can use longer intervals (e.g., 60-120 seconds)
- This allows efficient resource usage while maintaining appropriate monitoring frequency per device

**Note:** The global `--interval` command-line parameter is used as a fallback for targets without an explicit interval.

## Developer Guidelines

### Working Directory
**Always work from the project root directory.** All npm scripts in the root `package.json` are designed to handle subdirectory navigation automatically.

**DO:**
```bash
# From root directory
npm run build:win
npm run build:server:win
npm run build:dashboard:win
npm test
```

**DON'T:**
```bash
# Don't manually cd into subdirectories
cd server && npm run build:win  # ❌ Wrong
cd dashboard && npm run build:dashboard:win  # ❌ Wrong
```

The root `package.json` contains wrapper scripts that handle all the `cd` operations internally. This ensures:
- Consistent build process
- Correct relative paths
- Proper output directory (`dist/` at root level)

### Making Changes
When modifying code:
1. Edit files in their respective directories (`server/`, `client/`, `dashboard/`)
2. Run builds from root: `npm run build:component:win`
3. Test executables from root: `./dist/component-win.exe`

## Deployment Workflow

### Initial Setup
1. Generate `secret.key`:
   ```bash
   node -e "require('fs').writeFileSync('dist/secret.key', require('tweetnacl').randomBytes(32))"
   ```

2. Create ping monitor config:
   ```bash
   cp config.example.js dist/config.js
   # Edit dist/config.js with your targets
   ```

3. Build executables:
   ```bash
   npm install
   npm run build:win
   ```

### Server Deployment
```bash
# Copy to server
dist/monitor-server-win.exe
dist/sql-wasm.wasm
dist/secret.key

# Run (creates databases/ directory automatically)
./monitor-server-win.exe
```

**Optional Arguments:**
- `--udp-port 4000` - UDP listening port
- `--api-port 3000` - REST API port
- `--max-age 300` - Max message age (seconds)

### Client Deployment
```bash
# Copy to each monitored device
dist/monitor-client-win.exe  # For heartbeat
dist/ping-monitor-win.exe    # For ping monitoring
dist/config.js               # For ping monitor
dist/secret.key              # For encryption

# Run heartbeat client
./monitor-client-win.exe --server-host 192.168.1.100

# Run ping monitor
./ping-monitor-win.exe --server-host 192.168.1.100
```

### Dashboard Deployment
```bash
# Copy dashboard executable
dist/monitor-dashboard-win.exe

# Run (opens Electron window)
./monitor-dashboard-win.exe
```

## Troubleshooting

### Common Issues

#### "Invalid device name" Error
**Symptom:** Server rejects messages with validation error
**Cause:** Encryption key mismatch between client and server
**Fix:** Ensure `secret.key` is identical on both sides

#### "Database not initialized" API Errors
**Symptom:** API returns 503 errors
**Cause:** `sql-wasm.wasm` file missing from server directory
**Fix:** Ensure `sql-wasm.wasm` is in same directory as server executable

#### Dashboard Shows "Failed to fetch"
**Symptom:** Dashboard can't connect to API
**Cause:** Server not running or API port mismatch
**Fix:** Verify server is running on expected port (default: 3000)

#### Ping Monitor Not Sending Data
**Symptom:** No ping results in database
**Cause:** Message type routing not implemented or config missing
**Fix:** Ensure server has ping message routing (added in recent fix)

#### pkg Warning "Cannot resolve 'mod'"
**Symptom:** Warning during build process
**Severity:** Harmless - expected behavior for dynamic requires
**Action:** Safe to ignore

## Performance Characteristics

### Server Capacity
- **Expected Load:** 100-1000 devices sending heartbeats every 60 seconds
- **Database Growth:** ~1-2 GB per year for 100 devices (with auto-cleanup recommended)
- **Memory Usage:** ~50-100 MB (mostly SQLite WASM)
- **CPU Usage:** Negligible (UDP is lightweight)

### Network Bandwidth
- **Heartbeat Size:** ~500-1000 bytes encrypted (varies with # of network interfaces)
- **Ping Message Size:** ~300-800 bytes encrypted (depends on # of targets)
- **Total Bandwidth:** ~1 KB/min per device (minimal)

## Security Considerations

### Threat Model
- **Protected Against:** Eavesdropping, message tampering, replay attacks (via timestamp validation)
- **Not Protected Against:** DoS (UDP is connectionless), key compromise

### Best Practices
1. **Rotate `secret.key` periodically** (requires redistributing to all clients)
2. **Restrict API access** (consider adding authentication if exposed publicly)
3. **Run server in isolated network segment** (defense in depth)
4. **Monitor database size** (implement cleanup for old data)

## Phase 5: Alerting System (Complete)

Real-time webhook notifications when devices or network equipment change status.

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

### Database Schema

**Tables Added:**
```sql
CREATE TABLE device_states (
  device_name TEXT PRIMARY KEY,
  status TEXT NOT NULL,              -- 'online' or 'offline'
  last_seen INTEGER NOT NULL,        -- Unix timestamp
  last_status_change INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE ping_target_states (
  target_ip TEXT PRIMARY KEY,
  target_name TEXT,
  monitor_name TEXT NOT NULL,
  status TEXT NOT NULL,              -- 'online' or 'offline'
  last_check INTEGER NOT NULL,
  last_status_change INTEGER NOT NULL,
  response_time_ms REAL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE alert_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,         -- 'device' or 'ping_target'
  entity_name TEXT NOT NULL,
  event_type TEXT NOT NULL,          -- 'online', 'offline', 'new_device', etc.
  webhook_type TEXT NOT NULL,        -- 'discord' or 'teams'
  webhook_name TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  status TEXT NOT NULL,              -- 'sent' or 'failed'
  error_message TEXT
);
```

### Files Added
- `server/alerting.js` - Core alerting engine
- `server/webhooks/discord.js` - Discord webhook client
- `server/webhooks/teams.js` - Microsoft Teams webhook client
- `ALERTING.md` - Complete documentation

See [ALERTING.md](../ALERTING.md) for complete setup and configuration guide.

## Phase 6: UniFi Network Monitoring (Complete)

Integration with Ubiquiti UniFi network controllers to monitor all connected clients (wireless and wired) on the network.

### Architecture Overview

```
┌─────────────────────┐                          ┌──────────────────┐
│  UniFi Controller   │                          │  Monitor Server  │
│  (Dream Router)     │                          │                  │
│                     │                          │  ┌────────────┐  │
│  • Wireless Clients │◀──── HTTPS API ─────────│  │   UniFi    │  │
│  • Wired Clients    │      (443)              │  │  Monitor   │  │
│  • IoT Devices      │                          │  └─────┬──────┘  │
│  • Connection Stats │                          │        │         │
└─────────────────────┘                          │  ┌─────▼──────┐  │
                                                 │  │   UniFi    │  │
                                                 │  │  Database  │  │
                                                 │  └────────────┘  │
                                                 └──────────────────┘
                                                          │
                                                          │ HTTP API
                                                          │ (Port 3000)
                                                          ▼
                                                 ┌──────────────────┐
                                                 │  Web Dashboard   │
                                                 │  UniFi Clients   │
                                                 │  Component       │
                                                 └──────────────────┘
```

### Features Implemented

**UniFi Monitor Client** (`client/unifi-monitor.js`)
- ✅ Authenticates with UniFi Controller API
- ✅ Polls connected clients at configurable intervals
- ✅ Collects client details: MAC, IP, hostname, device type
- ✅ Tracks traffic statistics (RX/TX bytes, rates)
- ✅ Monitors wireless signal strength and channel info
- ✅ Encrypts and sends data to monitor server via UDP
- ✅ Supports UniFi Dream Router, UDM Pro, and UniFi OS controllers
- ✅ SSL certificate validation bypass for self-signed certs

**UniFi API Client** (`client/unifi-api.js`)
- ✅ Complete UniFi Controller REST API wrapper
- ✅ Session management with cookie/CSRF token handling
- ✅ Active client enumeration
- ✅ Device type detection (wired, wireless, IoT, Apple, Android)
- ✅ Connection testing and health checks
- ✅ Manufacturer identification via OUI lookup

**Server-Side Processing** (`server/unifi-db.js`)
- ✅ Dedicated UniFi SQLite database
- ✅ Client snapshot storage with full historical data
- ✅ Connection state tracking (online/offline transitions)
- ✅ Connection event logging (connected/disconnected events)
- ✅ Automatic stale client detection
- ✅ Auto-save mechanism every 5 minutes

**Dashboard Integration** (`dashboard/src/components/UniFiClients.jsx`)
- ✅ Real-time client list with auto-refresh (5s interval)
- ✅ Connection status indicators (connected/disconnected)
- ✅ Client filtering by hostname, MAC, IP, manufacturer
- ✅ Device type filtering (all, wired, wireless)
- ✅ Device icons based on type (🍎 Apple, 📱 Android, 💡 IoT, 🖥️ Wired, 📡 Wireless)
- ✅ Traffic statistics display (RX/TX bytes)
- ✅ Wireless signal strength display
- ✅ Client detail view with connection history
- ✅ Statistics overview (total clients, connected, wired/wireless)

### Database Schema

**Table: `unifi_clients`**
```sql
CREATE TABLE unifi_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mac TEXT NOT NULL,
  ip TEXT,
  hostname TEXT,
  name TEXT,
  manufacturer TEXT,
  device_type TEXT,
  is_wired INTEGER NOT NULL,
  rx_bytes INTEGER,
  tx_bytes INTEGER,
  rx_rate INTEGER,
  tx_rate INTEGER,
  signal INTEGER,
  channel INTEGER,
  essid TEXT,
  is_connected INTEGER NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
```

**Table: `unifi_connection_events`**
```sql
CREATE TABLE unifi_connection_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mac TEXT NOT NULL,
  event_type TEXT NOT NULL,         -- 'connected' or 'disconnected'
  timestamp INTEGER NOT NULL,
  hostname TEXT,
  ip TEXT
);
```

**Table: `unifi_client_states`**
```sql
CREATE TABLE unifi_client_states (
  mac TEXT PRIMARY KEY,
  hostname TEXT,
  ip TEXT,
  is_connected INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  last_state_change INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### REST API Endpoints

**GET /api/unifi/clients**
- Returns all UniFi clients (connected and disconnected)
- Includes: MAC, IP, hostname, device type, connection status, traffic stats

**GET /api/unifi/clients/:mac**
- Returns detailed information for a specific client
- Includes: Full device details, current status, traffic statistics

**GET /api/unifi/clients/:mac/history**
- Returns connection event history for a client
- Shows: Connection/disconnection events with timestamps

**GET /api/unifi/stats**
- Returns overall UniFi monitoring statistics
- Includes: Total clients, connected count, wired/wireless breakdown

### Configuration

Configuration in `config.js`:
```javascript
unifi: {
  host: '192.168.203.254',          // UniFi Controller IP/hostname
  port: 443,                        // HTTPS port
  username: 'monitor',              // Admin username
  password: 'your-password',        // Admin password
  site: 'default',                  // Site name
  interval: 60,                     // Poll interval in seconds
  ignoreSsl: true                   // Ignore self-signed SSL certs
}
```

### Build Output

```bash
npm run build:unifi:win   # Windows executable
npm run build:unifi:linux # Linux executable
npm run build:unifi:macos # macOS executable
```

Produces: `dist/unifi-monitor-win.exe` (or Linux/macOS equivalent)

### Use Cases

- **Network Visibility**: Monitor all devices connected to your network in real-time
- **Guest Tracking**: Identify when guests connect/disconnect from WiFi
- **IoT Monitoring**: Track smart home devices and their connectivity
- **Device Inventory**: Maintain a database of all devices that have connected
- **Bandwidth Analysis**: Review traffic patterns per client
- **Connection History**: Audit client connection/disconnection events

### Files Added

**Client Files:**
- `client/unifi-monitor.js` - Main monitor executable
- `client/unifi-api.js` - UniFi Controller API library
- `client/test-unifi.js` - Testing utility
- `client/test-unifi-sites.js` - Multi-site testing utility

**Server Files:**
- `server/unifi-db.js` - UniFi database operations
- API endpoints added to `server/api.js`

**Dashboard Files:**
- `dashboard/src/components/UniFiClients.jsx` - Client list view
- `dashboard/src/components/UniFiClients.css` - Styling
- `dashboard/src/components/UniFiClientDetail.jsx` - Individual client details
- `dashboard/src/components/UniFiClientDetail.css` - Detail view styling

## Other Future Enhancements

### Recommended Improvements
- [ ] Add database cleanup job (delete data older than X days)
- [ ] Implement API authentication (JWT tokens)
- [ ] Support for custom metrics (temperature, disk space, etc.)
- [ ] Multi-tenancy (separate namespaces for different networks)
- [ ] TLS for API endpoints

### Performance Optimizations
- [ ] Batch database writes (reduce saveDb() calls)
- [ ] Add database connection pooling
- [ ] Implement pagination for large history queries
- [ ] Add caching layer for frequently accessed data
