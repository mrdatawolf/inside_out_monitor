/**
 * Inside-Out Monitor - Configuration Example
 *
 * Copy this file to config.js and customize for your environment.
 */

export default {
  // Location Configuration (Phase 7: Multi-Site Support)
  // Used to identify which physical location this monitor is running in
  // Sent with every packet to the server for multi-site deployments
  location: {
    location: 'Main Office',      // Primary location (e.g., "Main Office", "Branch-NYC", "HomeNet")
    sublocation: 'Server Room'    // Sub-location (e.g., "Server Room", "Floor 2", "Building A")
  },

  // Server URL - IMPORTANT: Change this to your server's IP address or hostname
  // This is used by the client, ping-monitor, and dashboard to connect to the server
  serverUrl: {
    host: 'YOUR_SERVER_IP',  // Server IP address or hostname
    udpPort: 4000,           // UDP port for heartbeats
    apiPort: 3000            // HTTP API port for dashboard
  },

  // Server Configuration
  server: {
    udpPort: 4000,           // Port for receiving heartbeat messages
    apiPort: 3000,           // Port for HTTP API
    maxMessageAge: 300,      // Maximum message age in seconds (5 minutes)
    host: '0.0.0.0',         // Bind to all interfaces
    requireApiKey: true      // Require API key for read access (recommended for cloud deployments)
  },

  // Dashboard Configuration
  dashboard: {
    refreshInterval: 5000,   // Refresh data every 5 seconds
    historyHours: 24,        // Default history view (hours)
    serverPort: 5000         // Port for dashboard web server mode
  },

  // Client Configuration
  client: {
    defaultInterval: 60,     // Default heartbeat interval (seconds)
    defaultServerPort: 4000  // Default server port to connect to
  },

  // Ping Monitor Configuration
  ping: {
    defaultInterval: 60,     // Default ping interval (seconds) - used as fallback
                             // Note: Each target in ping-targets.json can override this
                             // with its own interval (minimum: 1 second)
    timeout: 5000,           // Ping timeout in milliseconds
    defaultServerPort: 4000  // Default server port to report to
  },

  // UniFi Monitor Configuration (Phase 6)
  unifi: {
    enabled: false,          // Set to true to enable UniFi monitoring
    host: 'YOUR_UNIFI_HOST', // UniFi Dream Router IP or hostname
    port: 443,               // HTTPS port (443 for UniFi OS devices)
    username: 'admin',       // Local admin username
    password: '',            // Local admin password
    site: 'default',         // Site name (usually 'default')
    interval: 60,            // Poll interval in seconds
    ignoreSsl: true,         // Ignore SSL certificate errors (for self-signed certs)
    defaultServerPort: 4000  // Server port to report to
  },

  // Web & File Monitoring Configuration (Phase 7)
  monitoring: {
    enabled: false,          // Set to true to enable web/file monitoring
    defaultInterval: 60,     // Default check interval (seconds) - used as fallback
                             // Note: Each target in monitoring-targets.json can override this
    defaultTimeout: 5000,    // Default HTTP timeout in milliseconds
    ignoreSsl: true,         // Ignore SSL certificate errors for web checks
    defaultServerPort: 4000  // Server port to report to
  },

  // File Paths (relative to executable location)
  paths: {
    secretKey: './secret.key',        // Encryption key for UDP packets
    apiReadKey: './api_read.key',     // API authentication key (Phase 7: Multi-Site)
    database: './databases',
    pingTargets: './ping-targets.json',
    monitoringTargets: './monitoring-targets.json'  // Web & file monitoring targets (Phase 7)
  },

  // Alerting Configuration (Phase 5)
  alerting: {
    enabled: false,  // Set to true to enable alerting

    // Webhook configurations
    webhooks: {
      discord: [
        // Example Discord webhook
        // {
        //   url: 'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN',
        //   name: 'IT Alerts',
        //   devices: ['*'],              // ["*"] for all devices, or specific device names
        //   pingTargets: ['*'],          // ["*"] for all targets, or specific IPs
        //   events: ['offline', 'online'], // "online", "offline", "new_device", "new_ping_target"
        //   mentions: []                 // Optional: ["<@&ROLE_ID>", "<@USER_ID>"]
        // }
      ],

      teams: [
        // Example Microsoft Teams webhook
        // {
        //   url: 'https://YOUR_TENANT.webhook.office.com/webhookb2/YOUR_WEBHOOK_ID',
        //   name: 'Network Monitoring',
        //   devices: ['router-*', 'switch-*'],
        //   pingTargets: ['*'],
        //   events: ['offline'],
        //   severity: 'critical'         // "info", "warning", "critical"
        // }
      ]
    },

    // Alert behavior settings
    behavior: {
      debounceSeconds: 300,          // Wait time before alerting (5 min)
      gracePeriodSeconds: 120,       // Grace period for brief outages (2 min)
      batchDelaySeconds: 30,         // Batch alerts within this window
      checkIntervalSeconds: 60,      // Status check frequency (1 min)
      onlineThresholdSeconds: 300,   // Consider device offline after 5 min (used by dashboard & alerts)
      cooldownSeconds: 3600          // Re-alert cooldown (1 hour)
    }
  }
}
