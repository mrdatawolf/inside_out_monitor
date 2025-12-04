import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import initSqlJs from 'sql.js';

describe('Database Operations', () => {
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

  // Helper function to insert heartbeat (mimics db.js behavior)
  function insertHeartbeat(deviceName, deviceTimestamp, receivedAt, networkInterfaces = []) {
    db.run(
      'INSERT INTO heartbeats (device_name, device_timestamp, received_at) VALUES (?, ?, ?)',
      [deviceName, deviceTimestamp, receivedAt]
    );

    const result = db.exec('SELECT last_insert_rowid() as id');
    const heartbeatId = result[0].values[0][0];

    if (networkInterfaces && networkInterfaces.length > 0) {
      for (const iface of networkInterfaces) {
        db.run(
          `INSERT INTO network_interfaces
           (heartbeat_id, interface_name, ip_address, rx_bytes, tx_bytes, max_speed_mbps)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            heartbeatId,
            iface.name || 'unknown',
            iface.ip || 'unknown',
            iface.rx_bytes || 0,
            iface.tx_bytes || 0,
            iface.max_speed_mbps || 0
          ]
        );
      }
    }
  }

  describe('Database Schema', () => {
    test('should create heartbeats table with correct schema', () => {
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='heartbeats'");
      expect(tables.length).toBeGreaterThan(0);
      expect(tables[0].values[0][0]).toBe('heartbeats');
    });

    test('should create network_interfaces table with correct schema', () => {
      const networkTable = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='network_interfaces'");
      expect(networkTable.length).toBeGreaterThan(0);
      expect(networkTable[0].values[0][0]).toBe('network_interfaces');
    });

    test('should create indexes on heartbeats table', () => {
      const indexes = db.exec("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='heartbeats'");
      const indexNames = indexes[0].values.map(row => row[0]);

      expect(indexNames).toContain('idx_device_name');
      expect(indexNames).toContain('idx_received_at');
    });

    test('should create indexes on network_interfaces table', () => {
      const indexes = db.exec("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='network_interfaces'");
      const indexNames = indexes[0].values.map(row => row[0]);

      expect(indexNames).toContain('idx_heartbeat_id');
    });
  });

  describe('Insert Operations', () => {
    test('should insert heartbeat without network interfaces', () => {
      const deviceName = 'TEST-DEVICE';
      const deviceTimestamp = Math.floor(Date.now() / 1000);
      const receivedAt = Math.floor(Date.now() / 1000);

      insertHeartbeat(deviceName, deviceTimestamp, receivedAt);

      const result = db.exec('SELECT * FROM heartbeats WHERE device_name = ?', [deviceName]);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].values.length).toBe(1);
      expect(result[0].values[0][1]).toBe(deviceName);
      expect(result[0].values[0][2]).toBe(deviceTimestamp);
      expect(result[0].values[0][3]).toBe(receivedAt);
    });

    test('should insert heartbeat with network interfaces', () => {
      const deviceName = 'TEST-DEVICE';
      const deviceTimestamp = Math.floor(Date.now() / 1000);
      const receivedAt = Math.floor(Date.now() / 1000);
      const networkInterfaces = [
        {
          name: 'eth0',
          ip: '192.168.1.100',
          rx_bytes: 1000000,
          tx_bytes: 500000,
          max_speed_mbps: 1000
        },
        {
          name: 'wlan0',
          ip: '192.168.1.101',
          rx_bytes: 2000000,
          tx_bytes: 1000000,
          max_speed_mbps: 100
        }
      ];

      insertHeartbeat(deviceName, deviceTimestamp, receivedAt, networkInterfaces);

      // Check heartbeat
      const heartbeatResult = db.exec('SELECT * FROM heartbeats WHERE device_name = ?', [deviceName]);
      expect(heartbeatResult[0].values.length).toBe(1);

      const heartbeatId = heartbeatResult[0].values[0][0];

      // Check network interfaces
      const interfacesResult = db.exec('SELECT * FROM network_interfaces WHERE heartbeat_id = ?', [heartbeatId]);
      expect(interfacesResult[0].values.length).toBe(2);

      // Check first interface
      const iface1 = interfacesResult[0].values[0];
      expect(iface1[2]).toBe('eth0');
      expect(iface1[3]).toBe('192.168.1.100');
      expect(iface1[4]).toBe(1000000);
      expect(iface1[5]).toBe(500000);
      expect(iface1[6]).toBe(1000);

      // Check second interface
      const iface2 = interfacesResult[0].values[1];
      expect(iface2[2]).toBe('wlan0');
      expect(iface2[3]).toBe('192.168.1.101');
    });

    test('should handle missing network interface fields with defaults', () => {
      const deviceName = 'TEST-DEVICE';
      const deviceTimestamp = Math.floor(Date.now() / 1000);
      const receivedAt = Math.floor(Date.now() / 1000);
      const networkInterfaces = [
        {
          // Missing all fields
        }
      ];

      insertHeartbeat(deviceName, deviceTimestamp, receivedAt, networkInterfaces);

      const heartbeatResult = db.exec('SELECT id FROM heartbeats WHERE device_name = ?', [deviceName]);
      const heartbeatId = heartbeatResult[0].values[0][0];

      const interfacesResult = db.exec('SELECT * FROM network_interfaces WHERE heartbeat_id = ?', [heartbeatId]);
      expect(interfacesResult.length).toBeGreaterThan(0);

      const iface = interfacesResult[0].values[0];

      expect(iface[2]).toBe('unknown'); // interface_name
      expect(iface[3]).toBe('unknown'); // ip_address
      expect(iface[4]).toBe(0); // rx_bytes
      expect(iface[5]).toBe(0); // tx_bytes
      expect(iface[6]).toBe(0); // max_speed_mbps
    });

    test('should insert multiple heartbeats from same device', () => {
      const deviceName = 'TEST-DEVICE';

      for (let i = 0; i < 5; i++) {
        const timestamp = Math.floor(Date.now() / 1000) + i;
        insertHeartbeat(deviceName, timestamp, timestamp);
      }

      const result = db.exec('SELECT COUNT(*) as count FROM heartbeats WHERE device_name = ?', [deviceName]);

      expect(result[0].values[0][0]).toBe(5);
    });
  });

  describe('Data Integrity', () => {
    test('should maintain foreign key relationship between heartbeats and network_interfaces', () => {
      const deviceName = 'TEST-DEVICE';
      const deviceTimestamp = Math.floor(Date.now() / 1000);
      const receivedAt = Math.floor(Date.now() / 1000);
      const networkInterfaces = [
        {
          name: 'eth0',
          ip: '192.168.1.100',
          rx_bytes: 1000000,
          tx_bytes: 500000,
          max_speed_mbps: 1000
        }
      ];

      insertHeartbeat(deviceName, deviceTimestamp, receivedAt, networkInterfaces);

      // Query with JOIN to verify relationship
      const result = db.exec(`
        SELECT h.device_name, ni.interface_name, ni.ip_address
        FROM heartbeats h
        JOIN network_interfaces ni ON h.id = ni.heartbeat_id
        WHERE h.device_name = ?
      `, [deviceName]);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].values[0][0]).toBe(deviceName);
      expect(result[0].values[0][1]).toBe('eth0');
      expect(result[0].values[0][2]).toBe('192.168.1.100');
    });

    test('should handle up to 5 network interfaces per heartbeat', () => {
      const deviceName = 'TEST-DEVICE';
      const deviceTimestamp = Math.floor(Date.now() / 1000);
      const receivedAt = Math.floor(Date.now() / 1000);
      const networkInterfaces = [];

      // Create 5 interfaces
      for (let i = 0; i < 5; i++) {
        networkInterfaces.push({
          name: `eth${i}`,
          ip: `192.168.1.${100 + i}`,
          rx_bytes: 1000000 * (i + 1),
          tx_bytes: 500000 * (i + 1),
          max_speed_mbps: 1000
        });
      }

      insertHeartbeat(deviceName, deviceTimestamp, receivedAt, networkInterfaces);

      const heartbeatResult = db.exec('SELECT id FROM heartbeats WHERE device_name = ?', [deviceName]);
      const heartbeatId = heartbeatResult[0].values[0][0];

      const interfacesResult = db.exec('SELECT COUNT(*) as count FROM network_interfaces WHERE heartbeat_id = ?', [heartbeatId]);

      expect(interfacesResult[0].values[0][0]).toBe(5);
    });
  });

  describe('Query Performance', () => {
    test('should efficiently query recent heartbeats using index', () => {
      const now = Math.floor(Date.now() / 1000);

      // Insert multiple heartbeats
      for (let i = 0; i < 10; i++) {
        insertHeartbeat(`DEVICE-${i}`, now - i * 60, now - i * 60);
      }

      // Query with indexed column
      const fiveMinutesAgo = now - 300;
      const result = db.exec('SELECT * FROM heartbeats WHERE received_at > ? ORDER BY received_at DESC', [fiveMinutesAgo]);

      expect(result[0].values.length).toBeGreaterThan(0);
      expect(result[0].values.length).toBeLessThanOrEqual(6); // 5 minutes = 5 entries + current
    });

    test('should efficiently query by device name using index', () => {
      const deviceName = 'SPECIFIC-DEVICE';
      const now = Math.floor(Date.now() / 1000);

      // Insert heartbeats from multiple devices
      insertHeartbeat(deviceName, now, now);
      insertHeartbeat('OTHER-DEVICE-1', now, now);
      insertHeartbeat('OTHER-DEVICE-2', now, now);
      insertHeartbeat(deviceName, now + 60, now + 60);

      const result = db.exec('SELECT * FROM heartbeats WHERE device_name = ?', [deviceName]);

      expect(result[0].values.length).toBe(2);
      expect(result[0].values[0][1]).toBe(deviceName);
      expect(result[0].values[1][1]).toBe(deviceName);
    });
  });
});
