// Alerting Configuration Example
// Copy this to alerting-config.js and customize for your needs

export default {
  // Enable/disable alerting system
  enabled: true,

  // Webhook configurations
  webhooks: {
    discord: [
      {
        // Discord webhook URL (from Channel Settings > Integrations > Webhooks)
        url: 'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN',
        name: 'IT Alerts',

        // Device filter: ["*"] for all devices, or specific device names
        devices: ['*'],

        // Ping target filter: ["*"] for all targets, or specific IPs
        pingTargets: ['*'],

        // Events to alert on: "online", "offline", "new_device", "new_ping_target"
        events: ['offline', 'online'],

        // Optional: mention roles or users (e.g., "<@&ROLE_ID>" or "<@USER_ID>")
        mentions: []
      }
    ],

    teams: [
      {
        // Microsoft Teams webhook URL (from Workflows or Connectors)
        url: 'https://YOUR_TENANT.webhook.office.com/webhookb2/YOUR_WEBHOOK_ID/IncomingWebhook/YOUR_CHANNEL_ID/YOUR_CONNECTOR_ID',
        name: 'Network Monitoring',

        // Device filter
        devices: ['router-*', 'switch-*'],

        // Ping target filter
        pingTargets: ['*'],

        // Events to alert on (only alert on failures for critical infrastructure)
        events: ['offline'],

        // Severity levels: "info", "warning", "critical"
        severity: 'critical'
      }
    ]
  },

  // Alerting behavior configuration
  alerting: {
    // Wait time before alerting on status change (prevents flapping alerts)
    debounceSeconds: 300, // 5 minutes

    // Grace period for brief outages (device must be down for this long)
    gracePeriodSeconds: 120, // 2 minutes

    // Batch multiple alerts within this window into a single notification
    batchDelaySeconds: 30,

    // How often to check for status changes
    checkIntervalSeconds: 60, // 1 minute

    // Online threshold (same as API - 10 minutes)
    onlineThresholdSeconds: 600,

    // Cooldown period before re-alerting on the same device
    cooldownSeconds: 3600 // 1 hour
  },

  // Alert message customization (optional)
  messages: {
    heartbeat: {
      offline: {
        title: '🔴 Device Offline',
        color: 0xFF0000, // Red
        description: 'Device **{device_name}** has gone offline'
      },
      online: {
        title: '🟢 Device Online',
        color: 0x00FF00, // Green
        description: 'Device **{device_name}** is back online'
      },
      new: {
        title: '🆕 New Device Detected',
        color: 0x0099FF, // Blue
        description: 'New device **{device_name}** has been detected'
      }
    },
    ping: {
      offline: {
        title: '🔴 Ping Target Unreachable',
        color: 0xFF0000,
        description: 'Target **{target_name}** ({target_ip}) is unreachable'
      },
      online: {
        title: '🟢 Ping Target Restored',
        color: 0x00FF00,
        description: 'Target **{target_name}** ({target_ip}) is responding'
      },
      new: {
        title: '🆕 New Ping Target',
        color: 0x0099FF,
        description: 'New target **{target_name}** ({target_ip}) detected'
      }
    }
  }
};
