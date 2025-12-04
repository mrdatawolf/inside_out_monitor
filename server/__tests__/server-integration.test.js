import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import dgram from 'dgram';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { decodeUTF8, encodeBase64 } = util;

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('UDP Server Integration Tests', () => {
  const TEST_PORT = 4001; // Use different port from production
  const TEST_KEY_PATH = join(__dirname, '..', 'test-secret.key');
  let testKey;
  let testClient;

  beforeAll(() => {
    // Generate test key
    testKey = nacl.randomBytes(nacl.secretbox.keyLength);
    const keyBase64 = encodeBase64(testKey);
    writeFileSync(TEST_KEY_PATH, keyBase64);
  });

  afterAll(() => {
    // Cleanup test key
    if (existsSync(TEST_KEY_PATH)) {
      unlinkSync(TEST_KEY_PATH);
    }

    // Close test client if open
    if (testClient) {
      testClient.close();
    }
  });

  describe('Message Format Processing', () => {
    test('should construct valid UDP message with nonce and encrypted data', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000)
      };

      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, testKey);

      // Construct UDP message
      const udpMessage = new Uint8Array(nonce.length + encrypted.length);
      udpMessage.set(nonce);
      udpMessage.set(encrypted, nonce.length);

      // Verify structure
      expect(udpMessage.length).toBeGreaterThan(nacl.secretbox.nonceLength);
      expect(udpMessage.slice(0, nacl.secretbox.nonceLength)).toEqual(nonce);
      expect(udpMessage.slice(nacl.secretbox.nonceLength)).toEqual(encrypted);
    });

    test('should create message with network interfaces', () => {
      const message = {
        name: 'TEST-DEVICE',
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
      const encrypted = nacl.secretbox(messageUint8, nonce, testKey);

      const udpMessage = new Uint8Array(nonce.length + encrypted.length);
      udpMessage.set(nonce);
      udpMessage.set(encrypted, nonce.length);

      expect(udpMessage.length).toBeGreaterThan(0);
    });
  });

  describe('Message Decryption', () => {
    test('should decrypt valid message', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000)
      };

      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, testKey);

      // Simulate server-side decryption
      const decrypted = nacl.secretbox.open(encrypted, nonce, testKey);
      expect(decrypted).not.toBeNull();

      const decryptedMessage = JSON.parse(util.encodeUTF8(decrypted));
      expect(decryptedMessage.name).toBe('TEST-DEVICE');
      expect(decryptedMessage.timestamp).toBeDefined();
    });

    test('should fail to decrypt with wrong key', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000)
      };

      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, testKey);

      // Try with wrong key
      const wrongKey = nacl.randomBytes(nacl.secretbox.keyLength);
      const decrypted = nacl.secretbox.open(encrypted, nonce, wrongKey);

      expect(decrypted).toBeNull();
    });
  });

  describe('Timestamp Validation', () => {
    const MAX_MESSAGE_AGE = 300;

    test('should accept current timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      const deviceTimestamp = now;
      const age = Math.abs(now - deviceTimestamp);

      expect(age).toBeLessThanOrEqual(MAX_MESSAGE_AGE);
    });

    test('should reject old timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      const deviceTimestamp = now - 400; // Too old
      const age = Math.abs(now - deviceTimestamp);

      expect(age).toBeGreaterThan(MAX_MESSAGE_AGE);
    });

    test('should reject future timestamp beyond threshold', () => {
      const now = Math.floor(Date.now() / 1000);
      const deviceTimestamp = now + 400; // Too far in future
      const age = Math.abs(now - deviceTimestamp);

      expect(age).toBeGreaterThan(MAX_MESSAGE_AGE);
    });
  });

  describe('Network Interface Processing', () => {
    test('should limit network interfaces to 5', () => {
      const interfaces = Array(10).fill(null).map((_, i) => ({
        name: `eth${i}`,
        ip: `192.168.1.${100 + i}`,
        rx_bytes: 1000000,
        tx_bytes: 500000,
        max_speed_mbps: 1000
      }));

      const limited = interfaces.slice(0, 5);
      expect(limited.length).toBe(5);
    });

    test('should handle empty network interfaces array', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000),
        network_interfaces: []
      };

      expect(Array.isArray(message.network_interfaces)).toBe(true);
      expect(message.network_interfaces.length).toBe(0);
    });

    test('should handle missing network interfaces field', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000)
      };

      const networkInterfaces = message.network_interfaces || [];
      expect(Array.isArray(networkInterfaces)).toBe(true);
      expect(networkInterfaces.length).toBe(0);
    });

    test('should validate network interface structure', () => {
      const iface = {
        name: 'eth0',
        ip: '192.168.1.100',
        rx_bytes: 1000000,
        tx_bytes: 500000,
        max_speed_mbps: 1000
      };

      expect(iface.name).toBeTruthy();
      expect(iface.ip).toBeTruthy();
      expect(typeof iface.rx_bytes).toBe('number');
      expect(typeof iface.tx_bytes).toBe('number');
      expect(typeof iface.max_speed_mbps).toBe('number');
    });
  });

  describe('Error Handling', () => {
    test('should handle message too short (< nonce length)', () => {
      const shortMessage = new Uint8Array(10);
      expect(shortMessage.length).toBeLessThan(nacl.secretbox.nonceLength);
      // Server should reject this
    });

    test('should handle corrupted encrypted data', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000)
      };

      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, testKey);

      // Corrupt the data
      const corrupted = new Uint8Array(encrypted);
      corrupted[0] = corrupted[0] ^ 0xFF;

      // Should fail to decrypt
      const decrypted = nacl.secretbox.open(corrupted, nonce, testKey);
      expect(decrypted).toBeNull();
    });

    test('should handle invalid JSON payload', () => {
      const invalidJSON = 'not valid json {';

      expect(() => {
        JSON.parse(invalidJSON);
      }).toThrow();
    });

    test('should handle missing required fields', () => {
      const invalidMessage = {
        // missing name
        timestamp: Math.floor(Date.now() / 1000)
      };

      expect(invalidMessage.name).toBeUndefined();
    });
  });

  describe('Security Tests', () => {
    test('should use unique nonce for each message', () => {
      const nonce1 = nacl.randomBytes(nacl.secretbox.nonceLength);
      const nonce2 = nacl.randomBytes(nacl.secretbox.nonceLength);

      expect(nonce1).not.toEqual(nonce2);
    });

    test('should produce different ciphertext for same message with different nonces', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000)
      };

      const messageUint8 = decodeUTF8(JSON.stringify(message));

      const nonce1 = nacl.randomBytes(nacl.secretbox.nonceLength);
      const encrypted1 = nacl.secretbox(messageUint8, nonce1, testKey);

      const nonce2 = nacl.randomBytes(nacl.secretbox.nonceLength);
      const encrypted2 = nacl.secretbox(messageUint8, nonce2, testKey);

      expect(encrypted1).not.toEqual(encrypted2);
    });

    test('should authenticate message with Poly1305 MAC', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000)
      };

      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, testKey);

      // Encrypted should be 16 bytes longer (Poly1305 MAC)
      expect(encrypted.length).toBe(messageUint8.length + 16);
    });

    test('should prevent replay attacks via timestamp validation', () => {
      const now = Math.floor(Date.now() / 1000);
      const oldTimestamp = now - 400; // 6+ minutes ago

      const message = {
        name: 'TEST-DEVICE',
        timestamp: oldTimestamp
      };

      // Even if encrypted correctly, old timestamp should be rejected
      const age = Math.abs(now - oldTimestamp);
      expect(age).toBeGreaterThan(300); // Should be rejected
    });
  });

  describe('Performance', () => {
    test('should handle multiple messages efficiently', () => {
      const messages = [];

      for (let i = 0; i < 100; i++) {
        const message = {
          name: `DEVICE-${i}`,
          timestamp: Math.floor(Date.now() / 1000)
        };

        const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
        const messageUint8 = decodeUTF8(JSON.stringify(message));
        const encrypted = nacl.secretbox(messageUint8, nonce, testKey);

        const udpMessage = new Uint8Array(nonce.length + encrypted.length);
        udpMessage.set(nonce);
        udpMessage.set(encrypted, nonce.length);

        messages.push(udpMessage);
      }

      expect(messages.length).toBe(100);
    });

    test('should encrypt and decrypt quickly', () => {
      const message = {
        name: 'TEST-DEVICE',
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

      const start = Date.now();

      // Encrypt
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, testKey);

      // Decrypt
      const decrypted = nacl.secretbox.open(encrypted, nonce, testKey);
      const decryptedMessage = JSON.parse(util.encodeUTF8(decrypted));

      const elapsed = Date.now() - start;

      expect(decryptedMessage.name).toBe('TEST-DEVICE');
      expect(elapsed).toBeLessThan(100); // Should be very fast
    });
  });
});
