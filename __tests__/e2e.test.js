import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import dgram from 'dgram';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import initSqlJs from 'sql.js';

const { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } = util;
const __dirname = dirname(fileURLToPath(import.meta.url));

describe('End-to-End Integration Tests', () => {
  const TEST_PORT = 4002;
  let testKey;
  let testServer;
  let testDb;
  let SQL;

  beforeAll(async () => {
    // Generate test key
    testKey = nacl.randomBytes(nacl.secretbox.keyLength);

    // Initialize test database
    SQL = await initSqlJs();
    testDb = new SQL.Database();

    // Create schema
    testDb.run(`
      CREATE TABLE heartbeats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_name TEXT NOT NULL,
        device_timestamp INTEGER NOT NULL,
        received_at INTEGER NOT NULL
      )
    `);

    testDb.run(`
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

    // Create test server
    testServer = dgram.createSocket('udp4');

    testServer.on('message', (msg, rinfo) => {
      try {
        // Extract nonce and encrypted data
        const nonce = msg.slice(0, nacl.secretbox.nonceLength);
        const box = msg.slice(nacl.secretbox.nonceLength);

        // Decrypt
        const decrypted = nacl.secretbox.open(box, nonce, testKey);

        if (!decrypted) {
          console.log('Failed to decrypt message');
          return;
        }

        // Parse JSON payload
        const message = JSON.parse(encodeUTF8(decrypted));

        // Validate timestamp
        const now = Math.floor(Date.now() / 1000);
        const deviceTimestamp = Math.floor(message.timestamp);
        const age = Math.abs(now - deviceTimestamp);

        if (age > 300) {
          console.log('Stale message');
          return;
        }

        // Insert into database
        testDb.run(
          'INSERT INTO heartbeats (device_name, device_timestamp, received_at) VALUES (?, ?, ?)',
          [message.name, deviceTimestamp, now]
        );

        const result = testDb.exec('SELECT last_insert_rowid() as id');
        const heartbeatId = result[0].values[0][0];

        // Insert network interfaces
        if (message.network_interfaces && Array.isArray(message.network_interfaces)) {
          const interfaces = message.network_interfaces.slice(0, 5);
          for (const iface of interfaces) {
            testDb.run(
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
      } catch (error) {
        console.error('Error processing message:', error.message);
      }
    });

    // Bind server
    await new Promise((resolve) => {
      testServer.bind(TEST_PORT, () => {
        resolve();
      });
    });
  });

  afterAll(() => {
    if (testServer) {
      testServer.close();
    }
    if (testDb) {
      testDb.close();
    }
  });

  test('should send and receive heartbeat without network interfaces', (done) => {
    const deviceName = 'TEST-DEVICE-1';
    const message = {
      name: deviceName,
      timestamp: Math.floor(Date.now() / 1000)
    };

    // Encrypt message
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const messageUint8 = decodeUTF8(JSON.stringify(message));
    const box = nacl.secretbox(messageUint8, nonce, testKey);

    // Create packet
    const packet = new Uint8Array(nonce.length + box.length);
    packet.set(nonce);
    packet.set(box, nonce.length);

    // Send to server
    const client = dgram.createSocket('udp4');
    client.send(Buffer.from(packet), TEST_PORT, '127.0.0.1', (error) => {
      expect(error).toBeFalsy();
      client.close();

      // Wait for processing
      setTimeout(() => {
        // Check database
        const result = testDb.exec('SELECT * FROM heartbeats WHERE device_name = ?', [deviceName]);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].values.length).toBeGreaterThan(0);
        expect(result[0].values[0][1]).toBe(deviceName);

        done();
      }, 100);
    });
  });

  test('should send and receive heartbeat with network interfaces', (done) => {
    const deviceName = 'TEST-DEVICE-2';
    const message = {
      name: deviceName,
      timestamp: Math.floor(Date.now() / 1000),
      network_interfaces: [
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
      ]
    };

    // Encrypt message
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const messageUint8 = decodeUTF8(JSON.stringify(message));
    const box = nacl.secretbox(messageUint8, nonce, testKey);

    // Create packet
    const packet = new Uint8Array(nonce.length + box.length);
    packet.set(nonce);
    packet.set(box, nonce.length);

    // Send to server
    const client = dgram.createSocket('udp4');
    client.send(Buffer.from(packet), TEST_PORT, '127.0.0.1', (error) => {
      expect(error).toBeFalsy();
      client.close();

      // Wait for processing
      setTimeout(() => {
        // Check heartbeat
        const heartbeatResult = testDb.exec('SELECT * FROM heartbeats WHERE device_name = ?', [deviceName]);
        expect(heartbeatResult.length).toBeGreaterThan(0);
        expect(heartbeatResult[0].values[0][1]).toBe(deviceName);

        const heartbeatId = heartbeatResult[0].values[0][0];

        // Check network interfaces
        const interfacesResult = testDb.exec('SELECT * FROM network_interfaces WHERE heartbeat_id = ?', [heartbeatId]);
        expect(interfacesResult.length).toBeGreaterThan(0);
        expect(interfacesResult[0].values.length).toBe(2);

        // Check first interface
        const iface1 = interfacesResult[0].values[0];
        expect(iface1[2]).toBe('eth0');
        expect(iface1[3]).toBe('192.168.1.100');
        expect(iface1[4]).toBe(1000000);
        expect(iface1[5]).toBe(500000);
        expect(iface1[6]).toBe(1000);

        done();
      }, 100);
    });
  });

  test('should reject message with wrong key', (done) => {
    const wrongKey = nacl.randomBytes(nacl.secretbox.keyLength);
    const deviceName = 'TEST-DEVICE-WRONG-KEY';
    const message = {
      name: deviceName,
      timestamp: Math.floor(Date.now() / 1000)
    };

    // Encrypt with wrong key
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const messageUint8 = decodeUTF8(JSON.stringify(message));
    const box = nacl.secretbox(messageUint8, nonce, wrongKey);

    // Create packet
    const packet = new Uint8Array(nonce.length + box.length);
    packet.set(nonce);
    packet.set(box, nonce.length);

    // Send to server
    const client = dgram.createSocket('udp4');
    client.send(Buffer.from(packet), TEST_PORT, '127.0.0.1', (error) => {
      expect(error).toBeFalsy();
      client.close();

      // Wait for processing
      setTimeout(() => {
        // Should not be in database
        const result = testDb.exec('SELECT * FROM heartbeats WHERE device_name = ?', [deviceName]);
        expect(result.length).toBe(0);

        done();
      }, 100);
    });
  });

  test('should reject stale message (old timestamp)', (done) => {
    const deviceName = 'TEST-DEVICE-STALE';
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
    const message = {
      name: deviceName,
      timestamp: oldTimestamp
    };

    // Encrypt message
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const messageUint8 = decodeUTF8(JSON.stringify(message));
    const box = nacl.secretbox(messageUint8, nonce, testKey);

    // Create packet
    const packet = new Uint8Array(nonce.length + box.length);
    packet.set(nonce);
    packet.set(box, nonce.length);

    // Send to server
    const client = dgram.createSocket('udp4');
    client.send(Buffer.from(packet), TEST_PORT, '127.0.0.1', (error) => {
      expect(error).toBeFalsy();
      client.close();

      // Wait for processing
      setTimeout(() => {
        // Should not be in database
        const result = testDb.exec('SELECT * FROM heartbeats WHERE device_name = ?', [deviceName]);
        expect(result.length).toBe(0);

        done();
      }, 100);
    });
  });

  test('should limit network interfaces to 5', (done) => {
    const deviceName = 'TEST-DEVICE-MANY-INTERFACES';
    const networkInterfaces = Array(10).fill(null).map((_, i) => ({
      name: `eth${i}`,
      ip: `192.168.1.${100 + i}`,
      rx_bytes: 1000000 * (i + 1),
      tx_bytes: 500000 * (i + 1),
      max_speed_mbps: 1000
    }));

    const message = {
      name: deviceName,
      timestamp: Math.floor(Date.now() / 1000),
      network_interfaces: networkInterfaces
    };

    // Encrypt message
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const messageUint8 = decodeUTF8(JSON.stringify(message));
    const box = nacl.secretbox(messageUint8, nonce, testKey);

    // Create packet
    const packet = new Uint8Array(nonce.length + box.length);
    packet.set(nonce);
    packet.set(box, nonce.length);

    // Send to server
    const client = dgram.createSocket('udp4');
    client.send(Buffer.from(packet), TEST_PORT, '127.0.0.1', (error) => {
      expect(error).toBeFalsy();
      client.close();

      // Wait for processing
      setTimeout(() => {
        // Check heartbeat
        const heartbeatResult = testDb.exec('SELECT * FROM heartbeats WHERE device_name = ?', [deviceName]);
        expect(heartbeatResult.length).toBeGreaterThan(0);

        const heartbeatId = heartbeatResult[0].values[0][0];

        // Check network interfaces (should be limited to 5)
        const interfacesResult = testDb.exec('SELECT COUNT(*) as count FROM network_interfaces WHERE heartbeat_id = ?', [heartbeatId]);
        expect(interfacesResult[0].values[0][0]).toBe(5);

        done();
      }, 100);
    });
  });

  test('should handle multiple sequential heartbeats', (done) => {
    const deviceName = 'TEST-DEVICE-SEQUENTIAL';
    const sendHeartbeat = (index, callback) => {
      const message = {
        name: deviceName,
        timestamp: Math.floor(Date.now() / 1000) + index
      };

      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const box = nacl.secretbox(messageUint8, nonce, testKey);

      const packet = new Uint8Array(nonce.length + box.length);
      packet.set(nonce);
      packet.set(box, nonce.length);

      const client = dgram.createSocket('udp4');
      client.send(Buffer.from(packet), TEST_PORT, '127.0.0.1', (error) => {
        client.close();
        callback(error);
      });
    };

    // Send 5 heartbeats
    let completed = 0;
    for (let i = 0; i < 5; i++) {
      sendHeartbeat(i, (error) => {
        expect(error).toBeFalsy();
        completed++;

        if (completed === 5) {
          // Wait for all to process
          setTimeout(() => {
            const result = testDb.exec('SELECT COUNT(*) as count FROM heartbeats WHERE device_name = ?', [deviceName]);
            expect(result[0].values[0][0]).toBe(5);
            done();
          }, 200);
        }
      });
    }
  });

  test('should maintain data integrity across multiple devices', (done) => {
    const devices = ['DEVICE-A', 'DEVICE-B', 'DEVICE-C'];
    let completed = 0;

    devices.forEach((deviceName) => {
      const message = {
        name: deviceName,
        timestamp: Math.floor(Date.now() / 1000),
        network_interfaces: [
          {
            name: 'eth0',
            ip: '192.168.1.100',
            rx_bytes: 1000000,
            tx_bytes: 500000,
            max_speed_mbps: 1000
          }
        ]
      };

      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const box = nacl.secretbox(messageUint8, nonce, testKey);

      const packet = new Uint8Array(nonce.length + box.length);
      packet.set(nonce);
      packet.set(box, nonce.length);

      const client = dgram.createSocket('udp4');
      client.send(Buffer.from(packet), TEST_PORT, '127.0.0.1', (error) => {
        expect(error).toBeFalsy();
        client.close();
        completed++;

        if (completed === devices.length) {
          setTimeout(() => {
            // Check all devices are in database
            devices.forEach((name) => {
              const result = testDb.exec('SELECT * FROM heartbeats WHERE device_name = ?', [name]);
              expect(result.length).toBeGreaterThan(0);
              expect(result[0].values[0][1]).toBe(name);
            });

            done();
          }, 200);
        }
      });
    });
  });
});
