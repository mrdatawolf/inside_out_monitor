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

## Phase 5: Alerting System (Planned)

Real-time webhook notifications when devices or network equipment change status.

### Architecture Overview

```
┌─────────────────┐
│  Monitor Server │
│                 │
│  ┌───────────┐  │     Webhooks
│  │ Heartbeat │  │        │
│  │  Handler  │  │        ▼
│  └─────┬─────┘  │   ┌──────────────┐
│        │        │   │   Discord    │
│  ┌─────▼─────┐  │   │   Channel    │
│  │  Alert    │──┼──▶└──────────────┘
│  │  Engine   │  │        │
│  └─────┬─────┘  │        ▼
│        │        │   ┌──────────────┐
│  ┌─────▼─────┐  │   │ Teams Channel│
│  │  Status   │  │   │  (Adaptive   │
│  │  Tracker  │  │   │   Cards)     │
│  └───────────┘  │   └──────────────┘
└─────────────────┘
```

### Step 1: Alert Detection System

**Components:**

1. **Status Monitor Service** (`server/alerting.js`)
   - Background service running in server process
   - Polls database every 60 seconds (configurable)
   - Compares current state with last known state
   - Triggers alerts on state transitions

2. **State Tracking Database Table**
   ```sql
   CREATE TABLE device_status (
     device_name TEXT PRIMARY KEY,
     device_type TEXT NOT NULL,  -- 'heartbeat' or 'ping_target'
     last_status TEXT NOT NULL,  -- 'online' or 'offline'
     last_change INTEGER NOT NULL,  -- Unix timestamp of last status change
     last_alert_sent INTEGER  -- Unix timestamp of last alert sent
   );
   ```

3. **Debouncing Logic**
   - Grace period before triggering alert (prevents flapping)
   - Cooldown period between repeated alerts for same device
   - Configurable thresholds per device type

**Detection Logic:**
- Device offline: No heartbeat received in > 10 minutes
- Device online: Heartbeat received after being offline
- Ping target offline: Latest ping status = 'offline'
- Ping target online: Ping status changes from 'offline' to 'online'

### Step 2: Webhook Integrations

**Discord Webhook Format:**
```javascript
{
  embeds: [{
    title: "🔴 Device Offline Alert",
    description: "SERVER-PROD-01 has gone offline",
    color: 0xEF4444,  // Red for offline, 0x22C55E for online
    fields: [
      { name: "Device", value: "SERVER-PROD-01", inline: true },
      { name: "Last Seen", value: "5 minutes ago", inline: true },
      { name: "Status", value: "Offline", inline: true }
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "Inside-Out Monitor" }
  }]
}
```

**Microsoft Teams Adaptive Card:**
```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "Device Offline Alert",
  "themeColor": "EF4444",
  "title": "🔴 Device Offline Alert",
  "sections": [{
    "activityTitle": "SERVER-PROD-01 has gone offline",
    "facts": [
      { "name": "Device", "value": "SERVER-PROD-01" },
      { "name": "Last Seen", "value": "5 minutes ago" },
      { "name": "Status", "value": "Offline" }
    ]
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "View in Dashboard",
    "targets": [{
      "os": "default",
      "uri": "http://192.168.203.241:8080/device/SERVER-PROD-01"
    }]
  }]
}
```

**Webhook Manager** (`server/webhooks/manager.js`)
- Queue system to batch multiple alerts
- Retry logic with exponential backoff
- Rate limiting (Discord: 30 requests/minute, Teams: varies)
- Error handling and logging

### Step 3: Alert Configuration

**Configuration File** (`server/alerting-config.js`):
```javascript
export default {
  // Enable/disable alerting globally
  enabled: true,

  // Monitoring intervals
  checkIntervalSeconds: 60,  // How often to check for status changes

  // Thresholds
  heartbeatOfflineThresholdSeconds: 600,  // 10 minutes
  pingOfflineThresholdSeconds: 300,  // 5 minutes

  // Debouncing
  gracePeriodSeconds: 120,  // Wait 2 min before first alert
  cooldownPeriodSeconds: 1800,  // Wait 30 min between repeated alerts

  // Batching
  batchDelaySeconds: 30,  // Batch alerts within 30 seconds

  // Discord webhooks
  discord: [
    {
      name: "IT Alerts",
      url: "https://discord.com/api/webhooks/...",
      enabled: true,
      devices: {
        heartbeat: ["*"],  // All heartbeat devices
        ping: ["router-*", "switch-*"]  // Only network gear
      },
      events: ["offline", "online", "new_device"],
      mentionRoles: ["123456789"],  // Discord role IDs to @mention
      severityThreshold: "warning"  // info, warning, critical
    }
  ],

  // Microsoft Teams webhooks
  teams: [
    {
      name: "Network Monitoring",
      url: "https://outlook.office.com/webhook/...",
      enabled: true,
      devices: {
        heartbeat: ["server-*", "database-*"],
        ping: ["*"]
      },
      events: ["offline"],  // Only alert on failures
      severityThreshold: "critical"
    }
  ],

  // Device-specific overrides
  deviceOverrides: {
    "test-server": {
      enabled: false  // Don't alert for this device
    },
    "critical-db-01": {
      gracePeriodSeconds: 60,  // Alert faster for critical systems
      cooldownPeriodSeconds: 600  // More frequent alerts
    }
  },

  // Maintenance windows (suppress alerts during scheduled maintenance)
  maintenanceWindows: [
    {
      name: "Weekly Maintenance",
      devices: ["server-*"],
      schedule: {
        dayOfWeek: 0,  // Sunday
        startTime: "02:00",
        endTime: "04:00",
        timezone: "America/New_York"
      }
    }
  ]
}
```

### Alert Types

**1. Heartbeat Device Alerts**
- `device.offline` - No heartbeat received in threshold period
- `device.online` - Device resumes sending heartbeats
- `device.new` - New device detected (first heartbeat ever)

**2. Ping Target Alerts**
- `ping.target.offline` - Ping target becomes unreachable
- `ping.target.online` - Ping target recovers
- `ping.target.slow` - Response time exceeds threshold (future)

**3. System Alerts**
- `server.started` - Monitor server started
- `server.stopped` - Monitor server shutting down (graceful)
- `database.error` - Database operation failed
- `alert.storm` - Too many alerts in short period (possible monitoring issue)

### Implementation Files

**New Files:**
```
server/
├── alerting.js              # Core alerting engine
├── alerting-config.js       # User configuration (gitignored)
├── alerting-config.example.js  # Configuration template
├── webhooks/
│   ├── manager.js           # Webhook queue and dispatch
│   ├── discord.js           # Discord webhook client
│   └── teams.js             # Teams webhook client
└── migrations/
    └── 003-add-device-status-table.sql
```

**Modified Files:**
- `server/server-cli.js` - Initialize alerting service
- `server/db.js` - Add device_status table and queries
- `config.example.js` - Add alerting config section

### Database Schema Changes

**New Table:**
```sql
CREATE TABLE device_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,  -- 'heartbeat' or 'ping_target'
  last_status TEXT NOT NULL,  -- 'online' or 'offline'
  last_change_at INTEGER NOT NULL,
  last_alert_sent_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(device_name, device_type)
);

CREATE INDEX idx_device_status_name ON device_status(device_name);
CREATE INDEX idx_device_status_change ON device_status(last_change_at);
```

**Alert History Table (optional):**
```sql
CREATE TABLE alert_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  webhook_name TEXT,
  sent_at INTEGER NOT NULL,
  success INTEGER NOT NULL  -- 1 = sent, 0 = failed
);
```

### Testing Strategy

1. **Unit Tests**
   - Status detection logic
   - Debouncing calculations
   - Webhook payload formatting
   - Configuration validation

2. **Integration Tests**
   - Database status tracking
   - Alert queue processing
   - Webhook dispatch (using mock servers)

3. **Manual Testing**
   - Test webhook endpoints with real Discord/Teams channels
   - Simulate device offline/online scenarios
   - Verify rate limiting and batching

### Future Alert Enhancements
- [ ] Slack integration
- [ ] Email notifications (SMTP)
- [ ] PagerDuty integration for on-call rotation
- [ ] SMS alerts via Twilio
- [ ] Alert acknowledgment tracking (mark as "seen")
- [ ] Alert history and analytics dashboard
- [ ] Custom webhook templates
- [ ] Alerting API for external integrations
- [ ] Multi-language alert messages
- [ ] Alert routing based on time of day

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
