import express from 'express';
import cors from 'cors';
import { getDb } from './db.js';
import { getUnifiDb } from './unifi-db.js';

const app = express();
const API_PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to convert sql.js results to JSON
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

// GET /api/devices - List all devices with last heartbeat
app.get('/api/devices', (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const result = db.exec(`
      SELECT
        device_name,
        MAX(received_at) as last_seen,
        COUNT(*) as heartbeat_count
      FROM heartbeats
      GROUP BY device_name
      ORDER BY last_seen DESC
    `);

    const devices = sqlToJson(result);

    // Calculate status based on last heartbeat (10 minutes threshold)
    const now = Math.floor(Date.now() / 1000);
    const devicesWithStatus = devices.map(device => ({
      ...device,
      status: (now - device.last_seen) < 600 ? 'online' : 'offline',
      last_seen_ago: now - device.last_seen
    }));

    res.json({ devices: devicesWithStatus });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/devices/:name - Get device details with latest heartbeat
app.get('/api/devices/:name', (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const deviceName = req.params.name;

    // Get latest heartbeat
    const heartbeatResult = db.exec(`
      SELECT *
      FROM heartbeats
      WHERE device_name = ?
      ORDER BY received_at DESC
      LIMIT 1
    `, [deviceName]);

    if (!heartbeatResult || heartbeatResult.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const heartbeat = sqlToJson(heartbeatResult)[0];

    // Get network interfaces for latest heartbeat
    const interfacesResult = db.exec(`
      SELECT
        interface_name,
        ip_address,
        rx_bytes,
        tx_bytes,
        max_speed_mbps
      FROM network_interfaces
      WHERE heartbeat_id = ?
    `, [heartbeat.id]);

    const interfaces = sqlToJson(interfacesResult);

    const now = Math.floor(Date.now() / 1000);
    res.json({
      device: {
        name: heartbeat.device_name,
        last_seen: heartbeat.received_at,
        last_seen_ago: now - heartbeat.received_at,
        status: (now - heartbeat.received_at) < 600 ? 'online' : 'offline',
        device_timestamp: heartbeat.device_timestamp,
        interfaces: interfaces
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/devices/:name/history - Get heartbeat history for device
app.get('/api/devices/:name/history', (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const deviceName = req.params.name;
    const limit = parseInt(req.query.limit) || 100;
    const hours = parseInt(req.query.hours) || 24;

    const sinceTimestamp = Math.floor(Date.now() / 1000) - (hours * 3600);

    const result = db.exec(`
      SELECT
        id,
        device_timestamp,
        received_at
      FROM heartbeats
      WHERE device_name = ? AND received_at > ?
      ORDER BY received_at DESC
      LIMIT ?
    `, [deviceName, sinceTimestamp, limit]);

    const heartbeats = sqlToJson(result);

    res.json({ heartbeats });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/devices/:name/interfaces - Get network interface data with history
app.get('/api/devices/:name/interfaces', (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const deviceName = req.params.name;
    const limit = parseInt(req.query.limit) || 50;

    // Get recent heartbeats with network interfaces
    const result = db.exec(`
      SELECT
        h.id as heartbeat_id,
        h.received_at,
        ni.interface_name,
        ni.ip_address,
        ni.rx_bytes,
        ni.tx_bytes,
        ni.max_speed_mbps
      FROM heartbeats h
      JOIN network_interfaces ni ON h.id = ni.heartbeat_id
      WHERE h.device_name = ?
      ORDER BY h.received_at DESC, ni.interface_name
      LIMIT ?
    `, [deviceName, limit]);

    const data = sqlToJson(result);

    // Group by interface
    const interfaceMap = {};
    data.forEach(row => {
      if (!interfaceMap[row.interface_name]) {
        interfaceMap[row.interface_name] = {
          name: row.interface_name,
          ip: row.ip_address,
          max_speed_mbps: row.max_speed_mbps,
          history: []
        };
      }

      interfaceMap[row.interface_name].history.push({
        timestamp: row.received_at,
        rx_bytes: row.rx_bytes,
        tx_bytes: row.tx_bytes
      });
    });

    const interfaces = Object.values(interfaceMap);

    res.json({ interfaces });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/stats - Overall system statistics
app.get('/api/stats', (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    // Total devices
    const devicesResult = db.exec(`
      SELECT COUNT(DISTINCT device_name) as count
      FROM heartbeats
    `);
    const totalDevices = sqlToJson(devicesResult)[0].count;

    // Online devices (heartbeat in last 10 minutes)
    const now = Math.floor(Date.now() / 1000);
    const onlineThreshold = now - 600;

    const onlineResult = db.exec(`
      SELECT COUNT(DISTINCT device_name) as count
      FROM heartbeats
      WHERE received_at > ?
    `, [onlineThreshold]);
    const onlineDevices = sqlToJson(onlineResult)[0].count;

    // Total heartbeats
    const heartbeatsResult = db.exec(`
      SELECT COUNT(*) as count
      FROM heartbeats
    `);
    const totalHeartbeats = sqlToJson(heartbeatsResult)[0].count;

    // Oldest and newest heartbeat
    const rangeResult = db.exec(`
      SELECT
        MIN(received_at) as oldest,
        MAX(received_at) as newest
      FROM heartbeats
    `);
    const range = sqlToJson(rangeResult)[0];

    res.json({
      stats: {
        total_devices: totalDevices,
        online_devices: onlineDevices,
        offline_devices: totalDevices - onlineDevices,
        total_heartbeats: totalHeartbeats,
        oldest_heartbeat: range.oldest,
        newest_heartbeat: range.newest,
        uptime_seconds: range.newest - range.oldest
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
// GET /api/ping-monitors - List all ping monitors
app.get('/api/ping-monitors', (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const result = db.exec(`
      SELECT
        monitor_name,
        MAX(received_at) as last_seen,
        COUNT(*) as ping_count
      FROM ping_results
      GROUP BY monitor_name
      ORDER BY last_seen DESC
    `);

    const monitors = sqlToJson(result);
    res.json({ monitors });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ping-targets - List all ping targets with current status
app.get('/api/ping-targets', (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    // Get latest status for each target
    const result = db.exec(`
      SELECT
        p.target_ip,
        p.target_name,
        p.monitor_name,
        p.status,
        p.response_time_ms,
        p.received_at as last_check,
        (? - p.received_at) as last_check_ago
      FROM ping_results p
      INNER JOIN (
        SELECT target_ip, MAX(received_at) as max_received
        FROM ping_results
        GROUP BY target_ip
      ) latest ON p.target_ip = latest.target_ip AND p.received_at = latest.max_received
      ORDER BY p.target_name, p.target_ip
    `, [Math.floor(Date.now() / 1000)]);

    const targets = sqlToJson(result);
    res.json({ targets });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ping-targets/:ip/history - Get ping history for a specific IP
app.get('/api/ping-targets/:ip/history', (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const targetIp = decodeURIComponent(req.params.ip);
    const hours = parseInt(req.query.hours) || 24;
    const limit = parseInt(req.query.limit) || 100;
    const now = Math.floor(Date.now() / 1000);
    const since = now - (hours * 3600);

    const result = db.exec(`
      SELECT
        monitor_name,
        target_ip,
        target_name,
        status,
        response_time_ms,
        timestamp,
        received_at
      FROM ping_results
      WHERE target_ip = ? AND received_at > ?
      ORDER BY received_at DESC
      LIMIT ?
    `, [targetIp, since, limit]);

    const history = sqlToJson(result);
    res.json({ history });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ping-stats - Overall ping monitoring statistics
app.get('/api/ping-stats', (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    // Total monitored targets
    const targetsResult = db.exec(`
      SELECT COUNT(DISTINCT target_ip) as count
      FROM ping_results
    `);
    const totalTargets = sqlToJson(targetsResult)[0]?.count || 0;

    // Online targets (based on latest ping)
    const onlineResult = db.exec(`
      SELECT COUNT(DISTINCT p.target_ip) as count
      FROM ping_results p
      INNER JOIN (
        SELECT target_ip, MAX(received_at) as max_received
        FROM ping_results
        GROUP BY target_ip
      ) latest ON p.target_ip = latest.target_ip AND p.received_at = latest.max_received
      WHERE p.status = 'online'
    `);
    const onlineTargets = sqlToJson(onlineResult)[0]?.count || 0;

    // Total ping checks
    const pingsResult = db.exec(`
      SELECT COUNT(*) as count
      FROM ping_results
    `);
    const totalPings = sqlToJson(pingsResult)[0]?.count || 0;

    // Active monitors
    const monitorsResult = db.exec(`
      SELECT COUNT(DISTINCT monitor_name) as count
      FROM ping_results
    `);
    const totalMonitors = sqlToJson(monitorsResult)[0]?.count || 0;

    res.json({
      stats: {
        total_targets: totalTargets,
        online_targets: onlineTargets,
        offline_targets: totalTargets - onlineTargets,
        total_pings: totalPings,
        total_monitors: totalMonitors
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/unifi/clients - Get all UniFi clients (currently connected + previously seen)
app.get('/api/unifi/clients', (req, res) => {
  try {
    const db = getUnifiDb();
    if (!db) {
      return res.status(503).json({ error: 'UniFi database not initialized' });
    }

    const now = Math.floor(Date.now() / 1000);

    // Get all unique clients with their latest state
    const result = db.exec(`
      SELECT
        cs.mac,
        cs.hostname,
        cs.ip,
        cs.is_connected,
        cs.last_seen,
        c.manufacturer,
        c.device_type,
        c.is_wired,
        c.signal,
        c.rx_bytes,
        c.tx_bytes
      FROM unifi_client_states cs
      LEFT JOIN (
        SELECT mac, manufacturer, device_type, is_wired, signal, rx_bytes, tx_bytes
        FROM unifi_clients
        WHERE id IN (
          SELECT MAX(id)
          FROM unifi_clients
          GROUP BY mac
        )
      ) c ON cs.mac = c.mac
      ORDER BY cs.is_connected DESC, cs.last_seen DESC
    `);

    const clients = sqlToJson(result).map(client => ({
      ...client,
      is_connected: client.is_connected === 1,
      is_wired: client.is_wired === 1,
      last_seen_ago: now - client.last_seen
    }));

    res.json({ clients });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/unifi/clients/:mac - Get specific client details
app.get('/api/unifi/clients/:mac', (req, res) => {
  try {
    const db = getUnifiDb();
    if (!db) {
      return res.status(503).json({ error: 'UniFi database not initialized' });
    }

    const mac = req.params.mac;

    // Get client state
    const stateResult = db.exec(`
      SELECT * FROM unifi_client_states WHERE mac = ?
    `, [mac]);

    if (!stateResult || stateResult.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const state = sqlToJson(stateResult)[0];

    // Get latest client details
    const detailsResult = db.exec(`
      SELECT * FROM unifi_clients
      WHERE mac = ?
      ORDER BY received_at DESC
      LIMIT 1
    `, [mac]);

    const details = detailsResult && detailsResult.length > 0 ?
      sqlToJson(detailsResult)[0] : {};

    // Get connection events
    const eventsResult = db.exec(`
      SELECT * FROM unifi_connection_events
      WHERE mac = ?
      ORDER BY timestamp DESC
      LIMIT 50
    `, [mac]);

    const events = sqlToJson(eventsResult);

    const now = Math.floor(Date.now() / 1000);
    res.json({
      client: {
        ...state,
        ...details,
        is_connected: state.is_connected === 1,
        is_wired: details.is_wired === 1,
        last_seen_ago: now - state.last_seen,
        events
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/unifi/clients/:mac/history - Get client connection history
app.get('/api/unifi/clients/:mac/history', (req, res) => {
  try {
    const db = getUnifiDb();
    if (!db) {
      return res.status(503).json({ error: 'UniFi database not initialized' });
    }

    const mac = req.params.mac;
    const hours = parseInt(req.query.hours) || 24;
    const limit = parseInt(req.query.limit) || 100;

    const sinceTimestamp = Math.floor(Date.now() / 1000) - (hours * 3600);

    const result = db.exec(`
      SELECT
        received_at,
        rx_bytes,
        tx_bytes,
        rx_rate,
        tx_rate,
        signal
      FROM unifi_clients
      WHERE mac = ? AND received_at > ?
      ORDER BY received_at DESC
      LIMIT ?
    `, [mac, sinceTimestamp, limit]);

    const history = sqlToJson(result);

    res.json({ history });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/unifi/stats - UniFi monitoring statistics
app.get('/api/unifi/stats', (req, res) => {
  try {
    const db = getUnifiDb();
    if (!db) {
      return res.status(503).json({ error: 'UniFi database not initialized' });
    }

    // Total clients (ever seen)
    const totalResult = db.exec(`
      SELECT COUNT(DISTINCT mac) as count
      FROM unifi_client_states
    `);
    const totalClients = sqlToJson(totalResult)[0]?.count || 0;

    // Currently connected clients
    const connectedResult = db.exec(`
      SELECT COUNT(*) as count
      FROM unifi_client_states
      WHERE is_connected = 1
    `);
    const connectedClients = sqlToJson(connectedResult)[0]?.count || 0;

    // Wired vs wireless breakdown
    const typeResult = db.exec(`
      SELECT
        SUM(CASE WHEN c.is_wired = 1 THEN 1 ELSE 0 END) as wired,
        SUM(CASE WHEN c.is_wired = 0 THEN 1 ELSE 0 END) as wireless
      FROM unifi_client_states cs
      JOIN (
        SELECT mac, is_wired
        FROM unifi_clients
        WHERE id IN (
          SELECT MAX(id)
          FROM unifi_clients
          GROUP BY mac
        )
      ) c ON cs.mac = c.mac
      WHERE cs.is_connected = 1
    `);
    const types = sqlToJson(typeResult)[0] || { wired: 0, wireless: 0 };

    // Total snapshots recorded
    const snapshotsResult = db.exec(`
      SELECT COUNT(*) as count
      FROM unifi_clients
    `);
    const totalSnapshots = sqlToJson(snapshotsResult)[0]?.count || 0;

    res.json({
      stats: {
        total_clients: totalClients,
        connected_clients: connectedClients,
        disconnected_clients: totalClients - connectedClients,
        wired_clients: types.wired || 0,
        wireless_clients: types.wireless || 0,
        total_snapshots: totalSnapshots
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  const db = getDb();
  const unifiDb = getUnifiDb();
  res.json({
    status: (db && unifiDb) ? 'ok' : 'error',
    heartbeat_db: db ? 'ok' : 'error',
    unifi_db: unifiDb ? 'ok' : 'error',
    timestamp: Math.floor(Date.now() / 1000)
  });
});

export function startApi(port = API_PORT) {
  app.listen(port, () => {
    console.log(`\n🌐 API Server`);
    console.log(`   Listening on http://localhost:${port}`);
    console.log(`   Endpoints:`);
    console.log(`     Device Heartbeat Endpoints:`);
    console.log(`       GET /api/devices`);
    console.log(`       GET /api/devices/:name`);
    console.log(`       GET /api/devices/:name/history`);
    console.log(`       GET /api/devices/:name/interfaces`);
    console.log(`       GET /api/stats`);
    console.log(`     Ping Monitoring Endpoints:`);
    console.log(`       GET /api/ping-monitors`);
    console.log(`       GET /api/ping-targets`);
    console.log(`       GET /api/ping-targets/:ip/history`);
    console.log(`       GET /api/ping-stats`);
    console.log(`     UniFi Monitoring Endpoints:`);
    console.log(`       GET /api/unifi/clients`);
    console.log(`       GET /api/unifi/clients/:mac`);
    console.log(`       GET /api/unifi/clients/:mac/history`);
    console.log(`       GET /api/unifi/stats`);
    console.log(`     Health:`);
    console.log(`       GET /api/health\n`);
  });
}
