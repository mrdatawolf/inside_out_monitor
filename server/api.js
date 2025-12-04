import express from 'express';
import cors from 'cors';
import { getDb } from './db.js';

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

app.get('/api/health', (req, res) => {
  const db = getDb();
  res.json({
    status: db ? 'ok' : 'error',
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
    console.log(`     Health:`);
    console.log(`       GET /api/health\n`);
  });
}
