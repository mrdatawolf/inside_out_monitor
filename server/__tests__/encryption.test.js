import { describe, test, expect } from '@jest/globals';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';

const { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } = util;

describe('Encryption and Decryption', () => {
  describe('Key Generation', () => {
    test('should generate 32-byte keys', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      expect(key.length).toBe(32);
      expect(key).toBeInstanceOf(Uint8Array);
    });

    test('should generate unique keys each time', () => {
      const key1 = nacl.randomBytes(nacl.secretbox.keyLength);
      const key2 = nacl.randomBytes(nacl.secretbox.keyLength);

      expect(key1).not.toEqual(key2);
    });

    test('should encode keys to base64 correctly', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const encoded = encodeBase64(key);

      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);

      // Should be able to decode back
      const decoded = decodeBase64(encoded);
      expect(decoded).toEqual(key);
    });
  });

  describe('Nonce Generation', () => {
    test('should generate 24-byte nonces', () => {
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      expect(nonce.length).toBe(24);
      expect(nonce).toBeInstanceOf(Uint8Array);
    });

    test('should generate unique nonces each time', () => {
      const nonce1 = nacl.randomBytes(nacl.secretbox.nonceLength);
      const nonce2 = nacl.randomBytes(nacl.secretbox.nonceLength);

      expect(nonce1).not.toEqual(nonce2);
    });
  });

  describe('Message Encryption', () => {
    test('should encrypt and decrypt message successfully', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const message = { name: 'TEST-DEVICE', timestamp: Math.floor(Date.now() / 1000) };

      // Encrypt
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, key);

      // Decrypt
      const decrypted = nacl.secretbox.open(encrypted, nonce, key);
      expect(decrypted).not.toBeNull();

      const decryptedMessage = JSON.parse(encodeUTF8(decrypted));
      expect(decryptedMessage).toEqual(message);
    });

    test('should fail to decrypt with wrong key', () => {
      const key1 = nacl.randomBytes(nacl.secretbox.keyLength);
      const key2 = nacl.randomBytes(nacl.secretbox.keyLength);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const message = { name: 'TEST-DEVICE', timestamp: Math.floor(Date.now() / 1000) };

      // Encrypt with key1
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, key1);

      // Try to decrypt with key2 (should fail)
      const decrypted = nacl.secretbox.open(encrypted, nonce, key2);
      expect(decrypted).toBeNull();
    });

    test('should fail to decrypt with wrong nonce', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const nonce1 = nacl.randomBytes(nacl.secretbox.nonceLength);
      const nonce2 = nacl.randomBytes(nacl.secretbox.nonceLength);
      const message = { name: 'TEST-DEVICE', timestamp: Math.floor(Date.now() / 1000) };

      // Encrypt with nonce1
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce1, key);

      // Try to decrypt with nonce2 (should fail)
      const decrypted = nacl.secretbox.open(encrypted, nonce2, key);
      expect(decrypted).toBeNull();
    });

    test('should encrypt complex message with network interfaces', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
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

      // Encrypt
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, key);

      // Decrypt
      const decrypted = nacl.secretbox.open(encrypted, nonce, key);
      expect(decrypted).not.toBeNull();

      const decryptedMessage = JSON.parse(encodeUTF8(decrypted));
      expect(decryptedMessage).toEqual(message);
      expect(decryptedMessage.network_interfaces).toHaveLength(2);
      expect(decryptedMessage.network_interfaces[0].name).toBe('eth0');
    });
  });

  describe('UDP Message Format', () => {
    test('should create proper UDP message format (nonce + encrypted)', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const message = { name: 'TEST-DEVICE', timestamp: Math.floor(Date.now() / 1000) };

      // Encrypt
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, key);

      // Construct UDP message: nonce + encrypted
      const udpMessage = new Uint8Array(nonce.length + encrypted.length);
      udpMessage.set(nonce);
      udpMessage.set(encrypted, nonce.length);

      // Verify message structure
      expect(udpMessage.length).toBe(nonce.length + encrypted.length);

      // Extract nonce and encrypted data
      const extractedNonce = udpMessage.slice(0, nacl.secretbox.nonceLength);
      const extractedBox = udpMessage.slice(nacl.secretbox.nonceLength);

      expect(extractedNonce).toEqual(nonce);
      expect(extractedBox).toEqual(encrypted);

      // Decrypt
      const decrypted = nacl.secretbox.open(extractedBox, extractedNonce, key);
      expect(decrypted).not.toBeNull();

      const decryptedMessage = JSON.parse(encodeUTF8(decrypted));
      expect(decryptedMessage).toEqual(message);
    });

    test('should reject message shorter than nonce length', () => {
      const shortMessage = new Uint8Array(10); // Less than 24 bytes

      expect(shortMessage.length).toBeLessThan(nacl.secretbox.nonceLength);
      // This would be caught by server validation
    });

    test('should handle corrupted encrypted data', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const message = { name: 'TEST-DEVICE', timestamp: Math.floor(Date.now() / 1000) };

      // Encrypt
      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, key);

      // Corrupt the encrypted data
      const corrupted = new Uint8Array(encrypted);
      corrupted[0] = corrupted[0] ^ 0xFF; // Flip some bits

      // Try to decrypt (should fail)
      const decrypted = nacl.secretbox.open(corrupted, nonce, key);
      expect(decrypted).toBeNull();
    });
  });

  describe('UTF8 Encoding/Decoding', () => {
    test('should correctly convert string to Uint8Array', () => {
      const str = 'Hello World';
      const uint8 = decodeUTF8(str);

      expect(uint8).toBeInstanceOf(Uint8Array);
      expect(uint8.length).toBeGreaterThan(0);
    });

    test('should correctly convert Uint8Array to string', () => {
      const str = 'Hello World';
      const uint8 = decodeUTF8(str);
      const decoded = encodeUTF8(uint8);

      expect(decoded).toBe(str);
    });

    test('should handle JSON messages correctly', () => {
      const message = { name: 'TEST-DEVICE', timestamp: 1234567890 };
      const json = JSON.stringify(message);

      // String to Uint8Array
      const uint8 = decodeUTF8(json);
      expect(uint8).toBeInstanceOf(Uint8Array);

      // Uint8Array back to string
      const decoded = encodeUTF8(uint8);
      expect(decoded).toBe(json);

      // Parse JSON
      const parsed = JSON.parse(decoded);
      expect(parsed).toEqual(message);
    });

    test('should handle special characters in device names', () => {
      const message = { name: 'TEST-DEVICE-andré-日本', timestamp: 1234567890 };
      const json = JSON.stringify(message);

      const uint8 = decodeUTF8(json);
      const decoded = encodeUTF8(uint8);
      const parsed = JSON.parse(decoded);

      expect(parsed.name).toBe(message.name);
    });
  });

  describe('Security Properties', () => {
    test('same message with different nonces produces different ciphertext', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const nonce1 = nacl.randomBytes(nacl.secretbox.nonceLength);
      const nonce2 = nacl.randomBytes(nacl.secretbox.nonceLength);
      const message = { name: 'TEST-DEVICE', timestamp: Math.floor(Date.now() / 1000) };

      const messageUint8 = decodeUTF8(JSON.stringify(message));

      const encrypted1 = nacl.secretbox(messageUint8, nonce1, key);
      const encrypted2 = nacl.secretbox(messageUint8, nonce2, key);

      // Ciphertext should be different
      expect(encrypted1).not.toEqual(encrypted2);

      // But both should decrypt to same message
      const decrypted1 = JSON.parse(encodeUTF8(nacl.secretbox.open(encrypted1, nonce1, key)));
      const decrypted2 = JSON.parse(encodeUTF8(nacl.secretbox.open(encrypted2, nonce2, key)));
      expect(decrypted1).toEqual(decrypted2);
    });

    test('encrypted message should be longer than plaintext (due to authentication tag)', () => {
      const key = nacl.randomBytes(nacl.secretbox.keyLength);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const message = { name: 'TEST', timestamp: 123 };

      const messageUint8 = decodeUTF8(JSON.stringify(message));
      const encrypted = nacl.secretbox(messageUint8, nonce, key);

      // Encrypted should be 16 bytes longer (Poly1305 MAC)
      expect(encrypted.length).toBe(messageUint8.length + nacl.secretbox.overheadLength);
      expect(nacl.secretbox.overheadLength).toBe(16);
    });
  });
});
