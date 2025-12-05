// Alerting Engine for Inside-Out Monitor
// Monitors device and ping target status changes and sends alerts via webhooks

import { getDb } from './db.js';
import { sendDiscordAlert } from './webhooks/discord.js';
import { sendTeamsAlert } from './webhooks/teams.js';

let config = null;
let checkInterval = null;
let alertQueue = [];
let batchTimeout = null;

/**
 * Initialize the alerting system
 * @param {Object} alertConfig - Alerting configuration from config.js
 */
export function initAlerting(alertConfig) {
  if (!alertConfig || !alertConfig.enabled) {
    console.log('⚠ Alerting system is disabled in configuration');
    return;
  }

  config = alertConfig;

  console.log('✓ Alerting system initialized');
  console.log(`  Check interval: ${config.behavior.checkIntervalSeconds}s`);
  console.log(`  Discord webhooks: ${config.webhooks.discord?.length || 0}`);
  console.log(`  Teams webhooks: ${config.webhooks.teams?.length || 0}`);

  // Start periodic status checking
  checkInterval = setInterval(() => {
    checkDeviceStatus();
    checkPingTargetStatus();
  }, config.behavior.checkIntervalSeconds * 1000);

  console.log('✓ Alerting monitoring started');
}

/**
 * Stop the alerting system
 */
export function stopAlerting() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }
  console.log('⚠ Alerting system stopped');
}

/**
 * Check device heartbeat status for changes
 */
function checkDeviceStatus() {
  const db = getDb();
  if (!db) return;

  try {
    const now = Math.floor(Date.now() / 1000);
    const onlineThreshold = now - config.behavior.onlineThresholdSeconds;

    // Get all devices with their latest heartbeat
    const result = db.exec(`
      SELECT
        device_name,
        MAX(received_at) as last_seen
      FROM heartbeats
      GROUP BY device_name
    `);

    if (!result || result.length === 0) return;

    const devices = sqlToJson(result);

    // Check each device
    devices.forEach(device => {
      const currentStatus = device.last_seen > onlineThreshold ? 'online' : 'offline';
      updateDeviceState(device.device_name, currentStatus, device.last_seen, now);
    });

  } catch (error) {
    console.error('Error checking device status:', error.message);
  }
}

/**
 * Check ping target status for changes
 */
function checkPingTargetStatus() {
  const db = getDb();
  if (!db) return;

  try {
    const now = Math.floor(Date.now() / 1000);

    // Get latest ping result for each target
    const result = db.exec(`
      SELECT
        p.target_ip,
        p.target_name,
        p.monitor_name,
        p.status,
        p.response_time_ms,
        p.received_at as last_check
      FROM ping_results p
      INNER JOIN (
        SELECT target_ip, MAX(received_at) as max_received
        FROM ping_results
        GROUP BY target_ip
      ) latest ON p.target_ip = latest.target_ip AND p.received_at = latest.max_received
    `);

    if (!result || result.length === 0) return;

    const targets = sqlToJson(result);

    // Check each target
    targets.forEach(target => {
      updatePingTargetState(
        target.target_ip,
        target.target_name,
        target.monitor_name,
        target.status,
        target.last_check,
        target.response_time_ms,
        now
      );
    });

  } catch (error) {
    console.error('Error checking ping target status:', error.message);
  }
}

/**
 * Update device state and trigger alerts if status changed
 */
function updateDeviceState(deviceName, currentStatus, lastSeen, now) {
  const db = getDb();
  if (!db) return;

  try {
    // Get existing state
    const stateResult = db.exec(`
      SELECT * FROM device_states WHERE device_name = ?
    `, [deviceName]);

    const existingState = stateResult && stateResult.length > 0 ? sqlToJson(stateResult)[0] : null;

    if (!existingState) {
      // New device detected
      db.run(`
        INSERT INTO device_states (device_name, status, last_seen, last_status_change, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `, [deviceName, currentStatus, lastSeen, now, now]);

      queueAlert({
        entity_type: 'device',
        entity_name: deviceName,
        event_type: 'new_device',
        title: '🆕 New Device Detected',
        description: `Device **${deviceName}** has been detected`,
        color: 0x0099FF,
        last_seen: lastSeen
      });

    } else if (existingState.status !== currentStatus) {
      // Status changed
      const changeAge = now - existingState.last_status_change;

      // Apply grace period and debouncing
      if (changeAge >= config.behavior.gracePeriodSeconds) {
        // Check cooldown (don't re-alert too frequently)
        const lastAlertResult = db.exec(`
          SELECT MAX(sent_at) as last_alert
          FROM alert_log
          WHERE entity_type = 'device' AND entity_name = ? AND event_type = ?
        `, [deviceName, currentStatus]);

        const lastAlert = lastAlertResult && lastAlertResult.length > 0 ?
          sqlToJson(lastAlertResult)[0].last_alert : null;

        const shouldAlert = !lastAlert || (now - lastAlert) >= config.behavior.cooldownSeconds;

        if (shouldAlert) {
          // Update state
          db.run(`
            UPDATE device_states
            SET status = ?, last_seen = ?, last_status_change = ?, updated_at = ?
            WHERE device_name = ?
          `, [currentStatus, lastSeen, now, now, deviceName]);

          // Queue alert
          const isOffline = currentStatus === 'offline';
          queueAlert({
            entity_type: 'device',
            entity_name: deviceName,
            event_type: currentStatus,
            title: isOffline ? '🔴 Device Offline' : '🟢 Device Online',
            description: isOffline ?
              `Device **${deviceName}** has gone offline` :
              `Device **${deviceName}** is back online`,
            color: isOffline ? 0xFF0000 : 0x00FF00,
            last_seen: lastSeen
          });
        }
      }

    } else {
      // No status change, just update last_seen
      db.run(`
        UPDATE device_states
        SET last_seen = ?, updated_at = ?
        WHERE device_name = ?
      `, [lastSeen, now, deviceName]);
    }

  } catch (error) {
    console.error(`Error updating device state for ${deviceName}:`, error.message);
  }
}

/**
 * Update ping target state and trigger alerts if status changed
 */
function updatePingTargetState(targetIp, targetName, monitorName, currentStatus, lastCheck, responseTime, now) {
  const db = getDb();
  if (!db) return;

  try {
    // Get existing state
    const stateResult = db.exec(`
      SELECT * FROM ping_target_states WHERE target_ip = ?
    `, [targetIp]);

    const existingState = stateResult && stateResult.length > 0 ? sqlToJson(stateResult)[0] : null;

    if (!existingState) {
      // New ping target detected
      db.run(`
        INSERT INTO ping_target_states
        (target_ip, target_name, monitor_name, status, last_check, last_status_change, response_time_ms, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [targetIp, targetName, monitorName, currentStatus, lastCheck, now, responseTime, now]);

      queueAlert({
        entity_type: 'ping_target',
        entity_name: targetName || targetIp,
        entity_ip: targetIp,
        event_type: 'new_ping_target',
        title: '🆕 New Ping Target',
        description: `New target **${targetName || targetIp}** detected`,
        color: 0x0099FF,
        last_seen: lastCheck,
        response_time_ms: responseTime
      });

    } else if (existingState.status !== currentStatus) {
      // Status changed
      const changeAge = now - existingState.last_status_change;

      // Apply grace period and debouncing
      if (changeAge >= config.behavior.gracePeriodSeconds) {
        // Check cooldown
        const lastAlertResult = db.exec(`
          SELECT MAX(sent_at) as last_alert
          FROM alert_log
          WHERE entity_type = 'ping_target' AND entity_name = ? AND event_type = ?
        `, [targetIp, currentStatus]);

        const lastAlert = lastAlertResult && lastAlertResult.length > 0 ?
          sqlToJson(lastAlertResult)[0].last_alert : null;

        const shouldAlert = !lastAlert || (now - lastAlert) >= config.behavior.cooldownSeconds;

        if (shouldAlert) {
          // Update state
          db.run(`
            UPDATE ping_target_states
            SET target_name = ?, monitor_name = ?, status = ?, last_check = ?,
                last_status_change = ?, response_time_ms = ?, updated_at = ?
            WHERE target_ip = ?
          `, [targetName, monitorName, currentStatus, lastCheck, now, responseTime, now, targetIp]);

          // Queue alert
          const isOffline = currentStatus === 'offline';
          queueAlert({
            entity_type: 'ping_target',
            entity_name: targetName || targetIp,
            entity_ip: targetIp,
            event_type: currentStatus,
            title: isOffline ? '🔴 Ping Target Unreachable' : '🟢 Ping Target Restored',
            description: isOffline ?
              `Target **${targetName || targetIp}** is unreachable` :
              `Target **${targetName || targetIp}** is responding`,
            color: isOffline ? 0xFF0000 : 0x00FF00,
            last_seen: lastCheck,
            response_time_ms: responseTime
          });
        }
      }

    } else {
      // No status change, just update last_check
      db.run(`
        UPDATE ping_target_states
        SET target_name = ?, monitor_name = ?, last_check = ?, response_time_ms = ?, updated_at = ?
        WHERE target_ip = ?
      `, [targetName, monitorName, lastCheck, responseTime, now, targetIp]);
    }

  } catch (error) {
    console.error(`Error updating ping target state for ${targetIp}:`, error.message);
  }
}

/**
 * Queue an alert for batched sending
 */
function queueAlert(alert) {
  alertQueue.push(alert);

  // Set batch timeout if not already set
  if (!batchTimeout) {
    batchTimeout = setTimeout(() => {
      processAlertQueue();
      batchTimeout = null;
    }, config.behavior.batchDelaySeconds * 1000);
  }
}

/**
 * Process queued alerts and send to webhooks
 */
async function processAlertQueue() {
  if (alertQueue.length === 0) return;

  const alerts = [...alertQueue];
  alertQueue = [];

  console.log(`📢 Processing ${alerts.length} queued alert(s)...`);

  for (const alert of alerts) {
    await sendAlertToWebhooks(alert);
  }
}

/**
 * Send alert to all matching webhooks
 */
async function sendAlertToWebhooks(alert) {
  const now = Math.floor(Date.now() / 1000);

  // Send to Discord webhooks
  if (config.webhooks.discord) {
    for (const webhook of config.webhooks.discord) {
      if (shouldSendAlert(alert, webhook)) {
        const result = await sendDiscordAlert(webhook.url, alert, webhook);
        logAlert(alert, result, now);
      }
    }
  }

  // Send to Teams webhooks
  if (config.webhooks.teams) {
    for (const webhook of config.webhooks.teams) {
      if (shouldSendAlert(alert, webhook)) {
        const result = await sendTeamsAlert(webhook.url, alert, webhook);
        logAlert(alert, result, now);
      }
    }
  }
}

/**
 * Check if alert should be sent to a specific webhook based on filters
 */
function shouldSendAlert(alert, webhook) {
  // Check event type filter
  if (!webhook.events || !webhook.events.includes(alert.event_type)) {
    return false;
  }

  // Check device/target filter
  if (alert.entity_type === 'device') {
    return matchesFilter(alert.entity_name, webhook.devices || ['*']);
  } else if (alert.entity_type === 'ping_target') {
    return matchesFilter(alert.entity_ip || alert.entity_name, webhook.pingTargets || ['*']);
  }

  return true;
}

/**
 * Check if entity name matches filter patterns
 */
function matchesFilter(entityName, filters) {
  if (!filters || filters.length === 0) return false;
  if (filters.includes('*')) return true;

  for (const filter of filters) {
    if (filter.includes('*')) {
      // Wildcard pattern matching
      const pattern = filter.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`, 'i');
      if (regex.test(entityName)) return true;
    } else {
      // Exact match
      if (entityName === filter) return true;
    }
  }

  return false;
}

/**
 * Log alert to database
 */
function logAlert(alert, result, timestamp) {
  const db = getDb();
  if (!db) return;

  try {
    db.run(`
      INSERT INTO alert_log
      (alert_type, entity_type, entity_name, event_type, webhook_type, webhook_name, sent_at, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'webhook',
      alert.entity_type,
      alert.entity_name,
      alert.event_type,
      result.webhook_type,
      result.webhook_name,
      timestamp,
      result.success ? 'sent' : 'failed',
      result.error || null
    ]);

    if (result.success) {
      console.log(`  ✓ Alert sent: ${alert.title} → ${result.webhook_type}/${result.webhook_name}`);
    } else {
      console.error(`  ✗ Alert failed: ${alert.title} → ${result.webhook_type}/${result.webhook_name} - ${result.error}`);
    }

  } catch (error) {
    console.error('Error logging alert:', error.message);
  }
}

/**
 * Helper function to convert sql.js results to JSON
 */
function sqlToJson(result) {
  if (!result || result.length === 0) return [];

  const columns = result[0].columns;
  const values = result[0].values;

  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}
