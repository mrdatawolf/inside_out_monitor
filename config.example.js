/**
 * Inside-Out Monitor - Configuration Example
 *
 * Copy this file to config.js and customize for your environment.
 */

export default {
  // Server Configuration
  server: {
    udpPort: 4000,           // Port for receiving heartbeat messages
    apiPort: 3000,           // Port for HTTP API
    maxMessageAge: 300,      // Maximum message age in seconds (5 minutes)
    host: '0.0.0.0'          // Bind to all interfaces
  },

  // API Configuration (for dashboard)
  api: {
    // IMPORTANT: Change this to your server's IP address or hostname
    url: 'http://YOUR_SERVER_IP:3000'
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
    defaultInterval: 60,     // Default ping interval (seconds)
    timeout: 5000,           // Ping timeout in milliseconds
    defaultServerPort: 4000  // Default server port to report to
  },

  // File Paths (relative to executable location)
  paths: {
    secretKey: './secret.key',
    database: './databases',
    pingTargets: './ping-targets.json'
  }
}
