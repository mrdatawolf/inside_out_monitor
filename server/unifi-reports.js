// UniFi Network Reporting Module
// Provides analytics and reporting queries for UniFi network data

import { getUnifiDb } from './unifi-db.js';

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

/**
 * Get time range in seconds based on period parameter
 */
function getTimeRange(period = '24h') {
  const now = Math.floor(Date.now() / 1000);
  const ranges = {
    '1h': 3600,
    '6h': 6 * 3600,
    '12h': 12 * 3600,
    '24h': 24 * 3600,
    '7d': 7 * 24 * 3600,
    '30d': 30 * 24 * 3600,
    '90d': 90 * 24 * 3600
  };

  const seconds = ranges[period] || ranges['24h'];
  return { start: now - seconds, end: now };
}

// ============================================================================
// REPORT 1: Network Health Overview
// ============================================================================

/**
 * Get network health summary
 * @param {string} period - Time period (1h, 6h, 24h, 7d, 30d, 90d)
 */
export function getNetworkHealthOverview(period = '24h') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const { start, end } = getTimeRange(period);
  const now = Math.floor(Date.now() / 1000);

  // Current status
  const currentStatus = db.exec(`
    SELECT
      COUNT(*) as total_clients,
      SUM(CASE WHEN cs.is_connected = 1 THEN 1 ELSE 0 END) as connected_clients,
      SUM(CASE WHEN cs.is_connected = 0 THEN 1 ELSE 0 END) as disconnected_clients,
      SUM(CASE WHEN c.is_wired = 1 THEN 1 ELSE 0 END) as wired_clients,
      SUM(CASE WHEN c.is_wired = 0 THEN 1 ELSE 0 END) as wireless_clients
    FROM unifi_client_states cs
    LEFT JOIN (
      SELECT mac, is_wired
      FROM unifi_clients
      GROUP BY mac
      HAVING MAX(received_at)
    ) c ON cs.mac = c.mac
  `);

  // Device type breakdown
  const deviceTypes = db.exec(`
    SELECT
      c.device_type,
      COUNT(*) as count
    FROM unifi_client_states cs
    LEFT JOIN (
      SELECT mac, device_type
      FROM unifi_clients
      GROUP BY mac
      HAVING MAX(received_at)
    ) c ON cs.mac = c.mac
    WHERE cs.is_connected = 1 AND c.device_type IS NOT NULL
    GROUP BY c.device_type
    ORDER BY count DESC
  `);

  // Average signal strength for wireless clients
  const signalStats = db.exec(`
    SELECT
      AVG(signal) as avg_signal,
      MIN(signal) as min_signal,
      MAX(signal) as max_signal,
      COUNT(CASE WHEN signal < -70 THEN 1 END) as poor_signal_count
    FROM (
      SELECT DISTINCT mac, signal
      FROM unifi_clients
      WHERE is_wired = 0
        AND is_connected = 1
        AND signal IS NOT NULL
        AND received_at >= ?
      ORDER BY received_at DESC
    ) as latest_signals
  `, [start]);

  // Connection events in period
  const events = db.exec(`
    SELECT
      COUNT(*) as total_events,
      SUM(CASE WHEN event_type = 'connected' THEN 1 ELSE 0 END) as connects,
      SUM(CASE WHEN event_type = 'disconnected' THEN 1 ELSE 0 END) as disconnects
    FROM unifi_connection_events
    WHERE timestamp >= ?
  `, [start]);

  // New devices detected
  const newDevices = db.exec(`
    SELECT COUNT(*) as new_device_count
    FROM unifi_client_states
    WHERE last_state_change >= ?
      AND last_state_change <= ?
  `, [start, end]);

  // Peak concurrent connections
  const peakConnections = db.exec(`
    SELECT MAX(concurrent_count) as peak_concurrent
    FROM (
      SELECT received_at, COUNT(*) as concurrent_count
      FROM unifi_clients
      WHERE received_at >= ?
        AND is_connected = 1
      GROUP BY received_at
    )
  `, [start]);

  return {
    period,
    timestamp: now,
    current: sqlToJson(currentStatus)[0] || {},
    device_types: sqlToJson(deviceTypes),
    signal_stats: sqlToJson(signalStats)[0] || {},
    events: sqlToJson(events)[0] || {},
    new_devices: sqlToJson(newDevices)[0] || {},
    peak_concurrent: sqlToJson(peakConnections)[0] || {}
  };
}

// ============================================================================
// REPORT 2: Connection Stability Reports
// ============================================================================

/**
 * Get flapping devices (frequent connect/disconnect cycles)
 * @param {number} threshold - Minimum number of events to be considered flapping
 * @param {string} period - Time period
 */
export function getFlappingDevices(threshold = 10, period = '24h') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const { start } = getTimeRange(period);

  const result = db.exec(`
    SELECT
      e.mac,
      cs.hostname,
      cs.ip,
      cs.is_connected,
      COUNT(*) as event_count,
      SUM(CASE WHEN e.event_type = 'connected' THEN 1 ELSE 0 END) as connect_count,
      SUM(CASE WHEN e.event_type = 'disconnected' THEN 1 ELSE 0 END) as disconnect_count,
      MIN(e.timestamp) as first_event,
      MAX(e.timestamp) as last_event
    FROM unifi_connection_events e
    LEFT JOIN unifi_client_states cs ON e.mac = cs.mac
    WHERE e.timestamp >= ?
    GROUP BY e.mac
    HAVING event_count >= ?
    ORDER BY event_count DESC
  `, [start, threshold]);

  return {
    period,
    threshold,
    devices: sqlToJson(result)
  };
}

/**
 * Get uptime statistics for all devices
 * @param {string} sort - Sort order (asc or desc)
 * @param {number} limit - Maximum number of results
 * @param {string} period - Time period
 */
export function getUptimeStats(sort = 'desc', limit = 50, period = '7d') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const { start, end } = getTimeRange(period);
  const totalSeconds = end - start;

  const result = db.exec(`
    SELECT
      cs.mac,
      cs.hostname,
      cs.ip,
      cs.is_connected,
      cs.last_seen,
      COUNT(CASE WHEN e.event_type = 'disconnected' THEN 1 END) as disconnect_count,
      (${totalSeconds} - COUNT(CASE WHEN e.event_type = 'disconnected' THEN 1 END) * 60) as estimated_uptime_seconds,
      ROUND((1.0 - (COUNT(CASE WHEN e.event_type = 'disconnected' THEN 1 END) * 60.0 / ${totalSeconds})) * 100, 2) as uptime_percentage
    FROM unifi_client_states cs
    LEFT JOIN unifi_connection_events e ON cs.mac = e.mac AND e.timestamp >= ?
    WHERE cs.last_seen >= ?
    GROUP BY cs.mac
    ORDER BY uptime_percentage ${sort === 'asc' ? 'ASC' : 'DESC'}
    LIMIT ?
  `, [start, start, limit]);

  return {
    period,
    total_period_seconds: totalSeconds,
    devices: sqlToJson(result)
  };
}

/**
 * Get connection quality trends
 * @param {string} period - Time period
 */
export function getConnectionQuality(period = '7d') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const { start } = getTimeRange(period);

  // Calculate average connection duration
  const durations = db.exec(`
    SELECT
      AVG(duration) as avg_duration,
      MIN(duration) as min_duration,
      MAX(duration) as max_duration,
      COUNT(*) as session_count
    FROM (
      SELECT
        mac,
        (LEAD(timestamp) OVER (PARTITION BY mac ORDER BY timestamp) - timestamp) as duration
      FROM unifi_connection_events
      WHERE timestamp >= ?
        AND event_type = 'connected'
    )
    WHERE duration IS NOT NULL
  `, [start]);

  // Disconnection frequency
  const disconnectFreq = db.exec(`
    SELECT
      COUNT(*) as total_disconnects,
      AVG(time_diff) as avg_time_between_disconnects
    FROM (
      SELECT
        mac,
        timestamp - LAG(timestamp) OVER (PARTITION BY mac ORDER BY timestamp) as time_diff
      FROM unifi_connection_events
      WHERE timestamp >= ?
        AND event_type = 'disconnected'
    )
    WHERE time_diff IS NOT NULL
  `, [start]);

  return {
    period,
    session_stats: sqlToJson(durations)[0] || {},
    disconnect_stats: sqlToJson(disconnectFreq)[0] || {}
  };
}

// ============================================================================
// REPORT 3: Wireless Network Quality
// ============================================================================

/**
 * Get signal strength distribution
 * @param {number} threshold - Signal threshold (e.g., -70 dBm)
 */
export function getSignalDistribution(threshold = -70) {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const result = db.exec(`
    SELECT
      CASE
        WHEN signal >= -30 THEN 'Excellent (-30 to 0)'
        WHEN signal >= -50 THEN 'Good (-50 to -30)'
        WHEN signal >= -60 THEN 'Fair (-60 to -50)'
        WHEN signal >= -70 THEN 'Weak (-70 to -60)'
        ELSE 'Poor (< -70)'
      END as signal_range,
      COUNT(*) as client_count,
      AVG(signal) as avg_signal
    FROM (
      SELECT DISTINCT mac, signal
      FROM unifi_clients
      WHERE is_wired = 0
        AND is_connected = 1
        AND signal IS NOT NULL
      ORDER BY received_at DESC
    )
    WHERE signal IS NOT NULL
    GROUP BY signal_range
    ORDER BY avg_signal DESC
  `);

  return {
    threshold,
    distribution: sqlToJson(result)
  };
}

/**
 * Get devices with poor signal strength
 * @param {number} threshold - Signal threshold (default -70 dBm)
 * @param {number} limit - Maximum number of results
 */
export function getPoorSignalDevices(threshold = -70, limit = 50) {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const result = db.exec(`
    SELECT
      cs.mac,
      cs.hostname,
      cs.ip,
      c.signal,
      c.channel,
      c.essid,
      c.last_seen
    FROM unifi_client_states cs
    INNER JOIN (
      SELECT mac, signal, channel, essid, last_seen
      FROM unifi_clients
      WHERE is_wired = 0
        AND is_connected = 1
        AND signal < ?
      ORDER BY received_at DESC
    ) c ON cs.mac = c.mac
    WHERE cs.is_connected = 1
    ORDER BY c.signal ASC
    LIMIT ?
  `, [threshold, limit]);

  return {
    threshold,
    devices: sqlToJson(result)
  };
}

/**
 * Get channel utilization statistics
 */
export function getChannelUtilization() {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const result = db.exec(`
    SELECT
      channel,
      COUNT(DISTINCT mac) as client_count,
      AVG(signal) as avg_signal,
      essid
    FROM (
      SELECT mac, channel, signal, essid
      FROM unifi_clients
      WHERE is_wired = 0
        AND is_connected = 1
        AND channel IS NOT NULL
      ORDER BY received_at DESC
    )
    WHERE channel IS NOT NULL
    GROUP BY channel, essid
    ORDER BY client_count DESC
  `);

  return {
    channels: sqlToJson(result)
  };
}

// ============================================================================
// REPORT 4: Device Inventory & Discovery
// ============================================================================

/**
 * Get complete device inventory
 * @param {string} status - Filter by status (all, connected, disconnected)
 * @param {string} period - Time period for "seen" filter
 */
export function getDeviceInventory(status = 'all', period = '30d') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const { start } = getTimeRange(period);

  let statusFilter = '';
  if (status === 'connected') {
    statusFilter = 'AND cs.is_connected = 1';
  } else if (status === 'disconnected') {
    statusFilter = 'AND cs.is_connected = 0';
  }

  const result = db.exec(`
    SELECT
      cs.mac,
      cs.hostname,
      cs.ip,
      cs.is_connected,
      cs.last_seen,
      cs.last_state_change,
      c.manufacturer,
      c.device_type,
      c.is_wired,
      c.first_seen
    FROM unifi_client_states cs
    LEFT JOIN (
      SELECT DISTINCT mac, manufacturer, device_type, is_wired, first_seen
      FROM unifi_clients
      ORDER BY received_at DESC
    ) c ON cs.mac = c.mac
    WHERE cs.last_seen >= ?
    ${statusFilter}
    ORDER BY cs.last_seen DESC
  `, [start]);

  return {
    period,
    status,
    devices: sqlToJson(result)
  };
}

/**
 * Get new devices detected in period
 * @param {string} period - Time period
 */
export function getNewDevices(period = '7d') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const { start } = getTimeRange(period);

  const result = db.exec(`
    SELECT
      cs.mac,
      cs.hostname,
      cs.ip,
      cs.is_connected,
      cs.last_seen,
      cs.last_state_change as first_detected,
      c.manufacturer,
      c.device_type,
      c.is_wired
    FROM unifi_client_states cs
    LEFT JOIN (
      SELECT DISTINCT mac, manufacturer, device_type, is_wired
      FROM unifi_clients
      ORDER BY received_at DESC
    ) c ON cs.mac = c.mac
    WHERE cs.last_state_change >= ?
    ORDER BY cs.last_state_change DESC
  `, [start]);

  return {
    period,
    devices: sqlToJson(result)
  };
}

/**
 * Get inactive devices
 * @param {number} threshold - Days of inactivity (default 30)
 */
export function getInactiveDevices(threshold = 30) {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const now = Math.floor(Date.now() / 1000);
  const thresholdSeconds = threshold * 24 * 3600;
  const cutoff = now - thresholdSeconds;

  const result = db.exec(`
    SELECT
      cs.mac,
      cs.hostname,
      cs.ip,
      cs.last_seen,
      c.manufacturer,
      c.device_type,
      c.is_wired,
      (? - cs.last_seen) as seconds_since_last_seen
    FROM unifi_client_states cs
    LEFT JOIN (
      SELECT DISTINCT mac, manufacturer, device_type, is_wired
      FROM unifi_clients
      ORDER BY received_at DESC
    ) c ON cs.mac = c.mac
    WHERE cs.last_seen < ?
      AND cs.is_connected = 0
    ORDER BY cs.last_seen ASC
  `, [now, cutoff]);

  return {
    threshold_days: threshold,
    devices: sqlToJson(result)
  };
}

/**
 * Get manufacturer breakdown
 */
export function getManufacturerBreakdown() {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const result = db.exec(`
    SELECT
      COALESCE(c.manufacturer, 'Unknown') as manufacturer,
      COUNT(DISTINCT cs.mac) as device_count,
      SUM(CASE WHEN cs.is_connected = 1 THEN 1 ELSE 0 END) as connected_count
    FROM unifi_client_states cs
    LEFT JOIN (
      SELECT DISTINCT mac, manufacturer
      FROM unifi_clients
      ORDER BY received_at DESC
    ) c ON cs.mac = c.mac
    GROUP BY manufacturer
    ORDER BY device_count DESC
  `);

  return {
    manufacturers: sqlToJson(result)
  };
}

// ============================================================================
// REPORT 5: Time-Based Analytics
// ============================================================================

/**
 * Get connection timeline (concurrent connections over time)
 * @param {string} period - Time period
 * @param {string} interval - Time interval (hourly, daily)
 */
export function getConnectionTimeline(period = '7d', interval = 'hourly') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const { start } = getTimeRange(period);

  let timeFormat;
  if (interval === 'hourly') {
    timeFormat = "datetime(received_at, 'unixepoch', 'start of hour')";
  } else {
    timeFormat = "datetime(received_at, 'unixepoch', 'start of day')";
  }

  const result = db.exec(`
    SELECT
      ${timeFormat} as time_bucket,
      COUNT(DISTINCT mac) as concurrent_connections,
      SUM(CASE WHEN is_wired = 1 THEN 1 ELSE 0 END) as wired_count,
      SUM(CASE WHEN is_wired = 0 THEN 1 ELSE 0 END) as wireless_count
    FROM unifi_clients
    WHERE received_at >= ?
      AND is_connected = 1
    GROUP BY time_bucket
    ORDER BY time_bucket ASC
  `, [start]);

  return {
    period,
    interval,
    timeline: sqlToJson(result)
  };
}

/**
 * Get peak connection hours
 * @param {string} period - Time period
 */
export function getPeakHours(period = '30d') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const { start } = getTimeRange(period);

  const result = db.exec(`
    SELECT
      CAST(strftime('%H', datetime(received_at, 'unixepoch')) AS INTEGER) as hour_of_day,
      AVG(client_count) as avg_clients,
      MAX(client_count) as peak_clients,
      COUNT(*) as sample_count
    FROM (
      SELECT
        received_at,
        COUNT(DISTINCT mac) as client_count
      FROM unifi_clients
      WHERE received_at >= ?
        AND is_connected = 1
      GROUP BY received_at
    )
    GROUP BY hour_of_day
    ORDER BY hour_of_day
  `, [start]);

  return {
    period,
    hours: sqlToJson(result)
  };
}

/**
 * Get session duration analysis
 * @param {string} groupBy - Group by field (device_type, is_wired, etc.)
 */
export function getSessionDuration(groupBy = 'device_type') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  // Calculate session durations from connection events
  const result = db.exec(`
    SELECT
      c.${groupBy} as category,
      COUNT(*) as session_count,
      AVG(duration) as avg_duration_seconds,
      MIN(duration) as min_duration_seconds,
      MAX(duration) as max_duration_seconds
    FROM (
      SELECT
        mac,
        (LEAD(timestamp) OVER (PARTITION BY mac ORDER BY timestamp) - timestamp) as duration
      FROM unifi_connection_events
      WHERE event_type = 'connected'
    ) sessions
    LEFT JOIN (
      SELECT DISTINCT mac, ${groupBy}
      FROM unifi_clients
    ) c ON sessions.mac = c.mac
    WHERE duration IS NOT NULL
      AND duration > 0
      AND duration < 86400
    GROUP BY category
    ORDER BY avg_duration_seconds DESC
  `);

  return {
    group_by: groupBy,
    sessions: sqlToJson(result)
  };
}

// ============================================================================
// REPORT 6: Alerting & Incident Reports
// ============================================================================

/**
 * Get event timeline
 * @param {string} period - Time period
 * @param {string} type - Event type filter (all, connected, disconnected)
 */
export function getEventTimeline(period = '24h', type = 'all') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const { start } = getTimeRange(period);

  let typeFilter = '';
  if (type !== 'all') {
    typeFilter = `AND event_type = '${type}'`;
  }

  const result = db.exec(`
    SELECT
      e.mac,
      e.event_type,
      e.timestamp,
      e.hostname,
      e.ip,
      cs.manufacturer,
      cs.device_type
    FROM unifi_connection_events e
    LEFT JOIN (
      SELECT DISTINCT mac, manufacturer, device_type
      FROM unifi_clients
    ) cs ON e.mac = cs.mac
    WHERE e.timestamp >= ?
    ${typeFilter}
    ORDER BY e.timestamp DESC
    LIMIT 500
  `, [start]);

  return {
    period,
    event_type: type,
    events: sqlToJson(result)
  };
}

/**
 * Get mass disconnection events (potential network outages)
 * @param {number} threshold - Minimum number of simultaneous disconnects
 * @param {string} period - Time period
 */
export function getMassEvents(threshold = 5, period = '7d') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const { start } = getTimeRange(period);

  // Find time windows with many disconnections
  const result = db.exec(`
    SELECT
      datetime(timestamp, 'unixepoch', 'start of minute') as event_window,
      COUNT(*) as event_count,
      GROUP_CONCAT(DISTINCT hostname) as affected_devices
    FROM unifi_connection_events
    WHERE timestamp >= ?
      AND event_type = 'disconnected'
    GROUP BY event_window
    HAVING event_count >= ?
    ORDER BY event_count DESC
  `, [start, threshold]);

  return {
    period,
    threshold,
    mass_events: sqlToJson(result)
  };
}

// ============================================================================
// REPORT 7: Bandwidth & Traffic Analysis
// ============================================================================

/**
 * Get top bandwidth consumers
 * @param {number} limit - Number of results
 * @param {string} period - Time period
 * @param {string} metric - Metric to sort by (total, rx, tx)
 */
export function getTopConsumers(limit = 20, period = '7d', metric = 'total') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const { start } = getTimeRange(period);

  let sortColumn;
  if (metric === 'rx') {
    sortColumn = 'total_rx';
  } else if (metric === 'tx') {
    sortColumn = 'total_tx';
  } else {
    sortColumn = 'total_traffic';
  }

  const result = db.exec(`
    SELECT
      cs.mac,
      cs.hostname,
      cs.ip,
      c.device_type,
      c.is_wired,
      SUM(c.rx_bytes) as total_rx,
      SUM(c.tx_bytes) as total_tx,
      SUM(c.rx_bytes + c.tx_bytes) as total_traffic,
      COUNT(*) as sample_count
    FROM unifi_clients c
    LEFT JOIN unifi_client_states cs ON c.mac = cs.mac
    WHERE c.received_at >= ?
    GROUP BY c.mac
    ORDER BY ${sortColumn} DESC
    LIMIT ?
  `, [start, limit]);

  return {
    period,
    metric,
    limit,
    consumers: sqlToJson(result)
  };
}

/**
 * Get traffic patterns (heatmap data)
 * @param {string} period - Time period
 */
export function getTrafficPatterns(period = '7d') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const { start } = getTimeRange(period);

  const result = db.exec(`
    SELECT
      CAST(strftime('%w', datetime(received_at, 'unixepoch')) AS INTEGER) as day_of_week,
      CAST(strftime('%H', datetime(received_at, 'unixepoch')) AS INTEGER) as hour_of_day,
      SUM(rx_bytes + tx_bytes) as total_bytes,
      COUNT(DISTINCT mac) as unique_clients
    FROM unifi_clients
    WHERE received_at >= ?
    GROUP BY day_of_week, hour_of_day
    ORDER BY day_of_week, hour_of_day
  `, [start]);

  return {
    period,
    heatmap: sqlToJson(result)
  };
}

/**
 * Get bandwidth heatmap
 * @param {string} period - Time period
 */
export function getBandwidthHeatmap(period = '7d') {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const { start } = getTimeRange(period);

  const result = db.exec(`
    SELECT
      datetime(received_at, 'unixepoch', 'start of hour') as time_bucket,
      SUM(rx_bytes) as total_rx,
      SUM(tx_bytes) as total_tx,
      SUM(rx_bytes + tx_bytes) as total_traffic,
      COUNT(DISTINCT mac) as active_clients
    FROM unifi_clients
    WHERE received_at >= ?
    GROUP BY time_bucket
    ORDER BY time_bucket ASC
  `, [start]);

  return {
    period,
    heatmap: sqlToJson(result)
  };
}

// ============================================================================
// REPORT 8: Security & Compliance
// ============================================================================

/**
 * Get unknown/unidentified devices
 */
export function getUnknownDevices() {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  const result = db.exec(`
    SELECT
      cs.mac,
      cs.hostname,
      cs.ip,
      cs.is_connected,
      cs.last_seen,
      c.manufacturer,
      c.device_type,
      c.is_wired
    FROM unifi_client_states cs
    LEFT JOIN (
      SELECT DISTINCT mac, manufacturer, device_type, is_wired
      FROM unifi_clients
      ORDER BY received_at DESC
    ) c ON cs.mac = c.mac
    WHERE (cs.hostname IS NULL OR cs.hostname = '')
       OR (c.manufacturer IS NULL OR c.manufacturer = '')
    ORDER BY cs.last_seen DESC
  `);

  return {
    devices: sqlToJson(result)
  };
}

/**
 * Get devices with suspicious connection patterns
 * @param {number} threshold - Minimum reconnect count to be suspicious
 */
export function getSuspiciousPatterns(threshold = 20) {
  const db = getUnifiDb();
  if (!db) {
    throw new Error('UniFi database not initialized');
  }

  // Very short sessions or very frequent reconnects
  const result = db.exec(`
    SELECT
      e.mac,
      cs.hostname,
      cs.ip,
      COUNT(*) as reconnect_count,
      AVG(duration) as avg_session_duration,
      MIN(duration) as min_session_duration
    FROM (
      SELECT
        mac,
        timestamp,
        (LEAD(timestamp) OVER (PARTITION BY mac ORDER BY timestamp) - timestamp) as duration
      FROM unifi_connection_events
      WHERE event_type = 'connected'
    ) e
    LEFT JOIN unifi_client_states cs ON e.mac = cs.mac
    WHERE duration IS NOT NULL
      AND duration < 300
    GROUP BY e.mac
    HAVING reconnect_count >= ?
    ORDER BY reconnect_count DESC
  `, [threshold]);

  return {
    threshold,
    devices: sqlToJson(result)
  };
}
