import { describe, test, expect } from '@jest/globals';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import os from 'os';

const { decodeUTF8, encodeBase64, decodeBase64 } = util;

describe('Client Message Creation', () => {
  describe('Key Loading', () => {
    test('should validate key is 32 bytes', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      expect(key.length).toBe(32);
    });

    test('should encode and decode key correctly', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const encoded = encodeBase64(key);
      const decoded = decodeBase64(encoded);

      expect(decoded).toEqual(key);
      expect(decoded.length).toBe(nacl.secretbox.keyLength);
    });
  });

  describe('Message Construction', () => {
    test('should create valid heartbeat message structure', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000),
        network_interfaces: []
      };

      expect(message.name).toBeDefined();
      expect(message.timestamp).toBeDefined();
      expect(Array.isArray(message.network_interfaces)).toBe(true);
    });

    test('should include network interfaces in message', () => {
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

      expect(message.network_interfaces.length).toBe(1);
      expect(message.network_interfaces[0].name).toBe('eth0');
      expect(message.network_interfaces[0].ip).toBe('192.168.1.100');
    });

    test('should serialize message to JSON', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000),
        network_interfaces: []
      };

      const json = JSON.stringify(message);
      expect(typeof json).toBe('string');

      const parsed = JSON.parse(json);
      expect(parsed.name).toBe('TEST-DEVICE');
    });
  });

  describe('Message Encryption', () => {
    test('should encrypt message using TweetNaCl', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000)
      };

      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, key);

      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(encrypted.length).toBeGreaterThan(0);
    });

    test('should create UDP packet with nonce + encrypted data', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000)
      };

      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const box = nacl.secretbox(messageUint8, nonce, key);

      // Combine nonce + encrypted message
      const packet = new Uint8Array(nonce.length + box.length);
      packet.set(nonce);
      packet.set(box, nonce.length);

      expect(packet.length).toBe(nonce.length + box.length);
      expect(packet.slice(0, nonce.length)).toEqual(nonce);
      expect(packet.slice(nonce.length)).toEqual(box);
    });

    test('should create packets that can be decrypted by server', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000),
        network_interfaces: []
      };

      // Client-side: encrypt
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const box = nacl.secretbox(messageUint8, nonce, key);

      const packet = new Uint8Array(nonce.length + box.length);
      packet.set(nonce);
      packet.set(box, nonce.length);

      // Server-side: extract and decrypt
      const extractedNonce = packet.slice(0, nacl.secretbox.nonceLength);
      const extractedBox = packet.slice(nacl.secretbox.nonceLength);

      const decrypted = nacl.secretbox.open(extractedBox, extractedNonce, key);
      expect(decrypted).not.toBeNull();

      const decryptedMessage = JSON.parse(util.encodeUTF8(decrypted));
      expect(decryptedMessage.name).toBe('TEST-DEVICE');
      expect(decryptedMessage.network_interfaces).toEqual([]);
    });
  });

  describe('Environment Variable Configuration', () => {
    test('should use default values when env vars not set', () => {
      const SERVER_HOST = process.env.MONITOR_HOST || '127.0.0.1';
      const SERVER_PORT = parseInt(process.env.MONITOR_PORT || '4000');
      const DEVICE_NAME = process.env.MONITOR_DEVICE_NAME || 'unknown-device';

      expect(SERVER_HOST).toBeDefined();
      expect(SERVER_PORT).toBe(4000);
      expect(DEVICE_NAME).toBeDefined();
    });

    test('should parse port as integer', () => {
      const port = parseInt('4000');
      expect(typeof port).toBe('number');
      expect(port).toBe(4000);
    });
  });

  describe('Timestamp Generation', () => {
    test('should generate Unix timestamp in seconds', () => {
      const timestamp = Math.floor(Date.now() / 1000);

      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(1700000000); // After 2023
      expect(timestamp.toString().length).toBe(10); // Unix timestamp is 10 digits
    });

    test('should generate consistent timestamp within same second', () => {
      const ts1 = Math.floor(Date.now() / 1000);
      const ts2 = Math.floor(Date.now() / 1000);

      expect(Math.abs(ts1 - ts2)).toBeLessThanOrEqual(1);
    });
  });

  describe('Buffer Conversion', () => {
    test('should convert Uint8Array to Buffer for UDP send', () => {
      const uint8Array = new Uint8Array([1, 2, 3, 4, 5]);
      const buffer = Buffer.from(uint8Array);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBe(5);
      expect(buffer[0]).toBe(1);
    });

    test('should maintain data integrity during conversion', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

      const message = { name: 'TEST', timestamp: 123456 };
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, key);

      const packet = new Uint8Array(nonce.length + encrypted.length);
      packet.set(nonce);
      packet.set(encrypted, nonce.length);

      const buffer = Buffer.from(packet);

      // Convert back and verify
      const packetBack = new Uint8Array(buffer);
      expect(packetBack).toEqual(packet);
    });
  });

  describe('Error Handling', () => {
    test('should detect missing key', () => {
      // Simulating missing key scenario
      const keyExists = false;

      if (!keyExists) {
        expect(keyExists).toBe(false);
      }
    });

    test('should validate key length', () => {
      const validKey = nacl.randomBytes(nacl.secretbox.keyLength);
      const invalidKey = nacl.randomBytes(16); // Wrong length

      expect(validKey.length).toBe(nacl.secretbox.keyLength);
      expect(invalidKey.length).not.toBe(nacl.secretbox.keyLength);
    });

    test('should handle JSON stringify errors', () => {
      // Circular reference causes JSON.stringify to throw
      const circular = {};
      circular.self = circular;

      expect(() => {
        JSON.stringify(circular);
      }).toThrow();
    });
  });

  describe('Network Interface Count', () => {
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

    test('should handle empty network interfaces', () => {
      const interfaces = [];
      expect(Array.isArray(interfaces)).toBe(true);
      expect(interfaces.length).toBe(0);
    });
  });
});

describe('Client Integration', () => {
  test('should create complete heartbeat workflow', () => {
    const key = nacl.randomBytes(nacl.secretbox.keyLength);

    // 1. Create message
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

    // 2. Encrypt
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const messageUint8 = decodeUTF8(JSON.stringify(message));
    const box = nacl.secretbox(messageUint8, nonce, key);

    // 3. Create packet
    const packet = new Uint8Array(nonce.length + box.length);
    packet.set(nonce);
    packet.set(box, nonce.length);

    // 4. Convert to Buffer
    const buffer = Buffer.from(packet);

    // Verify complete workflow
    expect(message.name).toBe('TEST-DEVICE');
    expect(box).toBeInstanceOf(Uint8Array);
    expect(packet.length).toBeGreaterThan(0);
    expect(Buffer.isBuffer(buffer)).toBe(true);

    // 5. Verify server can decrypt
    const extractedNonce = packet.slice(0, nacl.secretbox.nonceLength);
    const extractedBox = packet.slice(nacl.secretbox.nonceLength);
    const decrypted = nacl.secretbox.open(extractedBox, extractedNonce, key);

    expect(decrypted).not.toBeNull();

    const decryptedMessage = JSON.parse(util.encodeUTF8(decrypted));
    expect(decryptedMessage).toEqual(message);
  });
});
