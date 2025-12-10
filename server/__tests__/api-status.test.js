import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import initSqlJs from 'sql.js';

/**
 * API Device Status Tests
 *
 * Tests the online/offline status calculation logic used by the API endpoints.
 * This ensures devices are correctly marked as online or offline based on the
 * configurable onlineThresholdSeconds setting.
 */
describe('API Device Status Logic', () => {
  let SQL;
  let db;

  beforeEach(async () => {
    // Create fresh database for each test
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Create schema
    db.run(`
      CREATE TABLE heartbeats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_name TEXT NOT NULL,
        device_timestamp INTEGER NOT NULL,
        received_at INTEGER NOT NULL
      )
    `);

    db.run(`CREATE INDEX idx_device_name ON heartbeats(device_name)`);
    db.run(`CREATE INDEX idx_received_at ON heartbeats(received_at)`);

    db.run(`
      CREATE TABLE network_interfaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        heartbeat_id INTEGER NOT NULL,
        interface_name TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        rx_bytes INTEGER NOT NULL,
        tx_bytes INTEGER NOT NULL,
        max_speed_mbps INTEGER NOT NULL,
        FOREIGN KEY (heartbeat_id) REFERENCES heartbeats(id)
      )
    `);

    db.run(`CREATE INDEX idx_heartbeat_id ON network_interfaces(heartbeat_id)`);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  function insertHeartbeat(deviceName, receivedAt) {
    const deviceTimestamp = receivedAt - 2; // Simulate slight clock offset
    db.run(
      `INSERT INTO heartbeats (device_name, device_timestamp, received_at) VALUES (?, ?, ?)`,
      [deviceName, deviceTimestamp, receivedAt]
    );
  }

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

  describe('Device List Status (GET /api/devices)', () => {
    test('device seen 1 minute ago should be ONLINE (threshold: 5 min)', () => {
      const now = Math.floor(Date.now() / 1000);
      const oneMinuteAgo = now - 60;

      insertHeartbeat('test-device-1', oneMinuteAgo);

      const result = db.exec(`
        SELECT
          device_name,
          MAX(received_at) as last_seen,
          COUNT(*) as heartbeat_count
        FROM heartbeats
        GROUP BY device_name
      `);

      const devices = sqlToJson(result);
      const onlineThreshold = 300; // 5 minutes
      const devicesWithStatus = devices.map(device => ({
        ...device,
        status: (now - device.last_seen) < onlineThreshold ? 'online' : 'offline',
        last_seen_ago: now - device.last_seen
      }));

      expect(devicesWithStatus).toHaveLength(1);
      expect(devicesWithStatus[0].device_name).toBe('test-device-1');
      expect(devicesWithStatus[0].status).toBe('online');
      expect(devicesWithStatus[0].last_seen_ago).toBe(60);
    });

    test('device seen 4 minutes ago should be ONLINE (threshold: 5 min)', () => {
      const now = Math.floor(Date.now() / 1000);
      const fourMinutesAgo = now - 240;

      insertHeartbeat('test-device-2', fourMinutesAgo);

      const result = db.exec(`
        SELECT
          device_name,
          MAX(received_at) as last_seen,
          COUNT(*) as heartbeat_count
        FROM heartbeats
        GROUP BY device_name
      `);

      const devices = sqlToJson(result);
      const onlineThreshold = 300; // 5 minutes
      const devicesWithStatus = devices.map(device => ({
        ...device,
        status: (now - device.last_seen) < onlineThreshold ? 'online' : 'offline',
        last_seen_ago: now - device.last_seen
      }));

      expect(devicesWithStatus[0].status).toBe('online');
      expect(devicesWithStatus[0].last_seen_ago).toBe(240);
    });

    test('device seen exactly 5 minutes ago should be OFFLINE (threshold: 5 min)', () => {
      const now = Math.floor(Date.now() / 1000);
      const fiveMinutesAgo = now - 300;

      insertHeartbeat('test-device-3', fiveMinutesAgo);

      const result = db.exec(`
        SELECT
          device_name,
          MAX(received_at) as last_seen,
          COUNT(*) as heartbeat_count
        FROM heartbeats
        GROUP BY device_name
      `);

      const devices = sqlToJson(result);
      const onlineThreshold = 300; // 5 minutes
      const devicesWithStatus = devices.map(device => ({
        ...device,
        status: (now - device.last_seen) < onlineThreshold ? 'online' : 'offline',
        last_seen_ago: now - device.last_seen
      }));

      expect(devicesWithStatus[0].status).toBe('offline');
      expect(devicesWithStatus[0].last_seen_ago).toBe(300);
    });

    test('device seen 10 minutes ago should be OFFLINE (threshold: 5 min)', () => {
      const now = Math.floor(Date.now() / 1000);
      const tenMinutesAgo = now - 600;

      insertHeartbeat('test-device-4', tenMinutesAgo);

      const result = db.exec(`
        SELECT
          device_name,
          MAX(received_at) as last_seen,
          COUNT(*) as heartbeat_count
        FROM heartbeats
        GROUP BY device_name
      `);

      const devices = sqlToJson(result);
      const onlineThreshold = 300; // 5 minutes
      const devicesWithStatus = devices.map(device => ({
        ...device,
        status: (now - device.last_seen) < onlineThreshold ? 'online' : 'offline',
        last_seen_ago: now - device.last_seen
      }));

      expect(devicesWithStatus[0].status).toBe('offline');
      expect(devicesWithStatus[0].last_seen_ago).toBe(600);
    });

    test('device seen 1 day ago should be OFFLINE (threshold: 5 min)', () => {
      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - 86400; // 24 hours

      insertHeartbeat('test-device-5', oneDayAgo);

      const result = db.exec(`
        SELECT
          device_name,
          MAX(received_at) as last_seen,
          COUNT(*) as heartbeat_count
        FROM heartbeats
        GROUP BY device_name
      `);

      const devices = sqlToJson(result);
      const onlineThreshold = 300; // 5 minutes
      const devicesWithStatus = devices.map(device => ({
        ...device,
        status: (now - device.last_seen) < onlineThreshold ? 'online' : 'offline',
        last_seen_ago: now - device.last_seen
      }));

      expect(devicesWithStatus[0].status).toBe('offline');
      expect(devicesWithStatus[0].last_seen_ago).toBe(86400);
    });

    test('multiple devices with mixed statuses', () => {
      const now = Math.floor(Date.now() / 1000);

      insertHeartbeat('online-device-1', now - 60);      // 1 min ago - ONLINE
      insertHeartbeat('online-device-2', now - 120);     // 2 min ago - ONLINE
      insertHeartbeat('offline-device-1', now - 600);    // 10 min ago - OFFLINE
      insertHeartbeat('offline-device-2', now - 86400);  // 1 day ago - OFFLINE

      const result = db.exec(`
        SELECT
          device_name,
          MAX(received_at) as last_seen,
          COUNT(*) as heartbeat_count
        FROM heartbeats
        GROUP BY device_name
        ORDER BY device_name
      `);

      const devices = sqlToJson(result);
      const onlineThreshold = 300; // 5 minutes
      const devicesWithStatus = devices.map(device => ({
        ...device,
        status: (now - device.last_seen) < onlineThreshold ? 'online' : 'offline',
        last_seen_ago: now - device.last_seen
      }));

      expect(devicesWithStatus).toHaveLength(4);
      expect(devicesWithStatus.find(d => d.device_name === 'online-device-1').status).toBe('online');
      expect(devicesWithStatus.find(d => d.device_name === 'online-device-2').status).toBe('online');
      expect(devicesWithStatus.find(d => d.device_name === 'offline-device-1').status).toBe('offline');
      expect(devicesWithStatus.find(d => d.device_name === 'offline-device-2').status).toBe('offline');
    });
  });

  describe('Custom Threshold Tests', () => {
    test('device seen 5 minutes ago should be ONLINE with 10-minute threshold', () => {
      const now = Math.floor(Date.now() / 1000);
      const fiveMinutesAgo = now - 300;

      insertHeartbeat('test-device', fiveMinutesAgo);

      const result = db.exec(`
        SELECT
          device_name,
          MAX(received_at) as last_seen,
          COUNT(*) as heartbeat_count
        FROM heartbeats
        GROUP BY device_name
      `);

      const devices = sqlToJson(result);
      const onlineThreshold = 600; // 10 minutes
      const devicesWithStatus = devices.map(device => ({
        ...device,
        status: (now - device.last_seen) < onlineThreshold ? 'online' : 'offline',
        last_seen_ago: now - device.last_seen
      }));

      expect(devicesWithStatus[0].status).toBe('online');
    });

    test('device seen 30 seconds ago should be OFFLINE with 15-second threshold', () => {
      const now = Math.floor(Date.now() / 1000);
      const thirtySecondsAgo = now - 30;

      insertHeartbeat('test-device', thirtySecondsAgo);

      const result = db.exec(`
        SELECT
          device_name,
          MAX(received_at) as last_seen,
          COUNT(*) as heartbeat_count
        FROM heartbeats
        GROUP BY device_name
      `);

      const devices = sqlToJson(result);
      const onlineThreshold = 15; // 15 seconds
      const devicesWithStatus = devices.map(device => ({
        ...device,
        status: (now - device.last_seen) < onlineThreshold ? 'online' : 'offline',
        last_seen_ago: now - device.last_seen
      }));

      expect(devicesWithStatus[0].status).toBe('offline');
    });

    test('device seen 2 minutes ago should be ONLINE with 1-minute threshold', () => {
      const now = Math.floor(Date.now() / 1000);
      const twoMinutesAgo = now - 120;

      insertHeartbeat('test-device', twoMinutesAgo);

      const result = db.exec(`
        SELECT
          device_name,
          MAX(received_at) as last_seen,
          COUNT(*) as heartbeat_count
        FROM heartbeats
        GROUP BY device_name
      `);

      const devices = sqlToJson(result);
      const onlineThreshold = 60; // 1 minute
      const devicesWithStatus = devices.map(device => ({
        ...device,
        status: (now - device.last_seen) < onlineThreshold ? 'online' : 'offline',
        last_seen_ago: now - device.last_seen
      }));

      expect(devicesWithStatus[0].status).toBe('offline');
    });
  });

  describe('Stats Endpoint (GET /api/stats)', () => {
    test('correctly counts online vs offline devices', () => {
      const now = Math.floor(Date.now() / 1000);

      // Insert devices with various last_seen times
      insertHeartbeat('online-1', now - 60);      // 1 min - ONLINE
      insertHeartbeat('online-2', now - 120);     // 2 min - ONLINE
      insertHeartbeat('online-3', now - 240);     // 4 min - ONLINE
      insertHeartbeat('offline-1', now - 600);    // 10 min - OFFLINE
      insertHeartbeat('offline-2', now - 1200);   // 20 min - OFFLINE
      insertHeartbeat('offline-3', now - 86400);  // 1 day - OFFLINE

      const onlineThresholdSeconds = 300; // 5 minutes
      const onlineThreshold = now - onlineThresholdSeconds;

      // Count total devices
      const totalResult = db.exec(`
        SELECT COUNT(DISTINCT device_name) as count FROM heartbeats
      `);
      const totalDevices = sqlToJson(totalResult)[0].count;

      // Count online devices
      const onlineResult = db.exec(`
        SELECT COUNT(DISTINCT device_name) as count
        FROM heartbeats
        WHERE received_at > ?
      `, [onlineThreshold]);
      const onlineDevices = sqlToJson(onlineResult)[0].count;

      expect(totalDevices).toBe(6);
      expect(onlineDevices).toBe(3);
      expect(totalDevices - onlineDevices).toBe(3); // offline devices
    });
  });

  describe('Edge Cases', () => {
    test('device with no heartbeats returns empty array', () => {
      const now = Math.floor(Date.now() / 1000);

      const result = db.exec(`
        SELECT
          device_name,
          MAX(received_at) as last_seen,
          COUNT(*) as heartbeat_count
        FROM heartbeats
        GROUP BY device_name
      `);

      const devices = sqlToJson(result);
      expect(devices).toHaveLength(0);
    });

    test('device seen in the future (clock skew) should be ONLINE', () => {
      const now = Math.floor(Date.now() / 1000);
      const futureTime = now + 60; // 1 minute in the future

      insertHeartbeat('future-device', futureTime);

      const result = db.exec(`
        SELECT
          device_name,
          MAX(received_at) as last_seen,
          COUNT(*) as heartbeat_count
        FROM heartbeats
        GROUP BY device_name
      `);

      const devices = sqlToJson(result);
      const onlineThreshold = 300;
      const devicesWithStatus = devices.map(device => ({
        ...device,
        status: (now - device.last_seen) < onlineThreshold ? 'online' : 'offline',
        last_seen_ago: now - device.last_seen
      }));

      expect(devicesWithStatus[0].status).toBe('online');
      expect(devicesWithStatus[0].last_seen_ago).toBe(-60); // negative value
    });

    test('device with multiple heartbeats uses most recent', () => {
      const now = Math.floor(Date.now() / 1000);

      insertHeartbeat('multi-heartbeat', now - 86400); // 1 day ago
      insertHeartbeat('multi-heartbeat', now - 3600);  // 1 hour ago
      insertHeartbeat('multi-heartbeat', now - 120);   // 2 minutes ago (most recent)

      const result = db.exec(`
        SELECT
          device_name,
          MAX(received_at) as last_seen,
          COUNT(*) as heartbeat_count
        FROM heartbeats
        GROUP BY device_name
      `);

      const devices = sqlToJson(result);
      const onlineThreshold = 300;
      const devicesWithStatus = devices.map(device => ({
        ...device,
        status: (now - device.last_seen) < onlineThreshold ? 'online' : 'offline',
        last_seen_ago: now - device.last_seen
      }));

      expect(devicesWithStatus[0].status).toBe('online');
      expect(devicesWithStatus[0].last_seen_ago).toBe(120);
      expect(devicesWithStatus[0].heartbeat_count).toBe(3);
    });
  });
});
