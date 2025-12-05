# Alerting System (Phase 5)

The alerting system monitors device and network equipment status changes and sends real-time notifications to Discord and Microsoft Teams via webhooks.

## Features

- **Status Change Detection**: Automatically detects when devices or ping targets go online/offline
- **Multi-Platform Support**: Send alerts to Discord, Microsoft Teams, or both
- **Smart Filtering**: Configure which devices/targets trigger alerts
- **Debouncing**: Prevents alert spam from brief outages
- **Cooldown Periods**: Avoid re-alerting on the same device too frequently
- **Batch Alerts**: Groups multiple alerts into efficient batches
- **Rich Formatting**: Beautiful embeds (Discord) and Adaptive Cards (Teams)

## Configuration

All alerting configuration is in [config.js](config.js). Copy from [config.example.js](config.example.js) to get started.

### Basic Setup

```javascript
alerting: {
  enabled: true,  // Set to true to enable alerting

  // Webhook configurations
  webhooks: {
    discord: [
      {
        url: 'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN',
        name: 'IT Alerts',
        devices: ['*'],                     // Monitor all devices
        pingTargets: ['*'],                 // Monitor all ping targets
        events: ['offline', 'online'],      // Alert on status changes
        mentions: []                        // Optional Discord mentions
      }
    ],

    teams: [
      {
        url: 'https://YOUR_TENANT.webhook.office.com/webhookb2/YOUR_WEBHOOK_ID',
        name: 'Network Monitoring',
        devices: ['router-*', 'switch-*'],  // Monitor specific devices with wildcard
        pingTargets: ['192.168.1.*'],       // Monitor specific IP ranges
        events: ['offline'],                // Only alert on failures
        severity: 'critical'
      }
    ]
  },

  // Alert behavior settings
  behavior: {
    debounceSeconds: 300,        // Wait 5 min before alerting
    gracePeriodSeconds: 120,     // Grace period for brief outages (2 min)
    batchDelaySeconds: 30,       // Batch alerts within 30 seconds
    checkIntervalSeconds: 60,    // Check status every 60 seconds
    onlineThresholdSeconds: 600, // Device offline after 10 min
    cooldownSeconds: 3600        // Re-alert after 1 hour
  }
}
```

## Setting Up Webhooks

### Discord Webhook

1. Open your Discord server
2. Go to **Server Settings** → **Integrations** → **Webhooks**
3. Click **New Webhook**
4. Give it a name (e.g., "Monitor Alerts")
5. Select the channel for alerts
6. Click **Copy Webhook URL**
7. Paste the URL into your `config.js` under `webhooks.discord[].url`

### Microsoft Teams Webhook

#### For Teams (Modern - Workflows)

1. Open your Teams channel
2. Click **•••** (More options) → **Workflows**
3. Search for "webhook" and select **Post to a channel when a webhook request is received**
4. Click **Add workflow**
5. Select the team and channel
6. Click **Add workflow** and copy the webhook URL
7. Paste the URL into your `config.js` under `webhooks.teams[].url`

#### For Teams (Legacy - Incoming Webhook Connector)

1. Open your Teams channel
2. Click **•••** → **Connectors** → **Incoming Webhook**
3. Click **Configure**
4. Give it a name and upload an image (optional)
5. Click **Create** and copy the webhook URL
6. Paste the URL into your `config.js` under `webhooks.teams[].url`

## Alert Types

The alerting system supports the following event types:

### Heartbeat Device Events

- **`offline`**: Device stops sending heartbeats (no heartbeat for 10+ minutes)
- **`online`**: Device resumes sending heartbeats after being offline
- **`new_device`**: First time a device is seen by the monitoring system

### Ping Target Events

- **`offline`**: Ping target becomes unreachable
- **`online`**: Ping target becomes reachable again
- **`new_ping_target`**: First time a ping target is monitored

## Filtering

### Device Filtering

Control which devices trigger alerts:

```javascript
devices: ['*']                        // All devices
devices: ['web-server', 'db-server']  // Specific devices
devices: ['router-*', 'switch-*']     // Wildcard patterns
```

### Ping Target Filtering

Control which ping targets trigger alerts:

```javascript
pingTargets: ['*']                    // All targets
pingTargets: ['192.168.1.1']          // Specific IP
pingTargets: ['192.168.1.*']          // IP range with wildcard
pingTargets: ['printer-*']            // Name-based wildcards
```

## Alert Behavior

### Debouncing

**Purpose**: Prevents alert spam from brief network hiccups

**How it works**: When a status change is detected, the system waits `debounceSeconds` before sending an alert. If the status changes back during this time, no alert is sent.

**Example**: With `debounceSeconds: 300` (5 minutes), if a device goes offline for 2 minutes and comes back online, you won't get an alert.

### Grace Period

**Purpose**: Allows devices to be briefly unreachable without triggering alerts

**How it works**: A device must be in a new status for at least `gracePeriodSeconds` before the status change is considered real.

**Example**: With `gracePeriodSeconds: 120` (2 minutes), a device must be offline for at least 2 minutes before an offline alert is sent.

### Cooldown Period

**Purpose**: Prevents repeated alerts for the same device

**How it works**: After sending an alert for a device, the system won't send another alert of the same type for that device until `cooldownSeconds` has passed.

**Example**: With `cooldownSeconds: 3600` (1 hour), if a device goes offline and you get an alert, you won't get another offline alert for that device for 1 hour, even if it goes offline again.

### Batch Delay

**Purpose**: Groups multiple alerts into a single delivery window

**How it works**: When an alert is queued, the system waits `batchDelaySeconds` before sending. Any additional alerts during this time are included in the same batch.

**Example**: With `batchDelaySeconds: 30`, if 3 devices go offline within 30 seconds, all 3 alerts are processed together.

## Alert Messages

### Discord

Discord alerts use rich embeds with:
- Color coding (🔴 Red = offline, 🟢 Green = online, 🔵 Blue = new)
- Device/target name
- Last seen timestamp
- Response time (for ping targets)
- Optional @mentions for critical alerts

### Microsoft Teams

Teams alerts use MessageCard format with:
- Theme color based on severity
- Structured facts (device name, last seen, etc.)
- Professional formatting
- Action buttons (optional - can link to dashboard)

## Examples

### Example 1: Alert on All Critical Infrastructure

```javascript
webhooks: {
  discord: [
    {
      url: 'https://discord.com/api/webhooks/...',
      name: 'Critical Infrastructure',
      devices: ['router-*', 'firewall-*', 'core-switch-*'],
      pingTargets: ['192.168.1.1', '192.168.1.2'],
      events: ['offline', 'online'],
      mentions: ['<@&ROLE_ID>']  // Mention IT team role
    }
  ]
}
```

### Example 2: Different Alerts for Different Teams

```javascript
webhooks: {
  discord: [
    {
      url: 'https://discord.com/api/webhooks/DEV_WEBHOOK',
      name: 'Dev Team',
      devices: ['dev-*', 'staging-*'],
      pingTargets: [],
      events: ['offline']
    }
  ],
  teams: [
    {
      url: 'https://TENANT.webhook.office.com/PROD_WEBHOOK',
      name: 'Production Ops',
      devices: ['prod-*'],
      pingTargets: ['*'],
      events: ['offline'],
      severity: 'critical'
    }
  ]
}
```

### Example 3: New Device Detection Only

```javascript
webhooks: {
  discord: [
    {
      url: 'https://discord.com/api/webhooks/...',
      name: 'Security Alerts',
      devices: ['*'],
      pingTargets: ['*'],
      events: ['new_device', 'new_ping_target']
    }
  ]
}
```

## Testing Webhooks

After configuring webhooks, you can test them by:

1. **Enable alerting**: Set `enabled: true` in config.js
2. **Restart the server**: The alerting system starts automatically
3. **Trigger a test**:
   - Stop a heartbeat client to trigger an offline alert
   - Or add a new device to trigger a new device alert

The server logs will show:
```
✓ Alerting system initialized
  Check interval: 60s
  Discord webhooks: 1
  Teams webhooks: 1
✓ Alerting monitoring started
```

When an alert is sent:
```
📢 Processing 1 queued alert(s)...
  ✓ Alert sent: 🔴 Device Offline → discord/IT Alerts
```

## Database Schema

The alerting system uses three new tables:

### device_states

Tracks the current status of each heartbeat device:

```sql
CREATE TABLE device_states (
  device_name TEXT PRIMARY KEY,
  status TEXT NOT NULL,              -- 'online' or 'offline'
  last_seen INTEGER NOT NULL,        -- Unix timestamp
  last_status_change INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### ping_target_states

Tracks the current status of each ping target:

```sql
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
```

### alert_log

Records all alerts sent:

```sql
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

## Troubleshooting

### Alerts not being sent

1. **Check alerting is enabled**: `config.alerting.enabled: true`
2. **Check webhook URLs**: Ensure URLs are valid and not expired
3. **Check filters**: Ensure device/target names match your filters
4. **Check event types**: Ensure the event type is in the `events` array
5. **Check server logs**: Look for error messages

### Too many alerts

1. **Increase debounceSeconds**: Give devices more time to stabilize
2. **Increase cooldownSeconds**: Space out repeated alerts
3. **Adjust filters**: Be more specific about which devices to monitor
4. **Use 'offline' only**: Don't alert on 'online' events

### Alerts delayed

1. **Check checkIntervalSeconds**: Alerts are only checked at this interval
2. **Check gracePeriodSeconds**: Status changes must persist for this duration
3. **Check batchDelaySeconds**: Alerts are batched within this window

### Discord webhook errors

- **401 Unauthorized**: Webhook URL is invalid or deleted
- **404 Not Found**: Webhook was deleted from Discord
- **429 Rate Limited**: Too many messages sent too quickly (increase batchDelaySeconds)

### Teams webhook errors

- **400 Bad Request**: Payload format error (should not happen with current implementation)
- **404 Not Found**: Webhook was deleted or expired
- **429 Too Many Requests**: Rate limited (increase batchDelaySeconds)

## Best Practices

1. **Start conservative**: Begin with longer debounce and cooldown periods
2. **Filter wisely**: Don't alert on everything - focus on what matters
3. **Test first**: Use a test webhook/channel before deploying to production
4. **Monitor alert volume**: Check the alert_log table to see how many alerts are being sent
5. **Use different webhooks**: Separate critical and non-critical alerts into different channels
6. **Document your setup**: Keep track of which webhooks go where and why

## Future Enhancements (Phase 5+)

Potential additions to the alerting system:

- **Email notifications** via SMTP
- **Slack integration**
- **PagerDuty integration** for on-call rotation
- **SMS alerts** via Twilio
- **Alert acknowledgment** tracking
- **Alert history** and analytics dashboard
- **Custom alert templates** per device/target
- **Time-based alert suppression** (maintenance windows)
- **Alert escalation** chains
- **High latency warnings** for ping targets
