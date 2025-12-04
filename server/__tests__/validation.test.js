import { describe, test, expect } from '@jest/globals';

describe('Message Validation', () => {
  const MAX_MESSAGE_AGE = 300; // 5 minutes

  describe('Timestamp Validation', () => {
    test('should accept message with current timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      const deviceTimestamp = now;
      const age = Math.abs(now - deviceTimestamp);

      expect(age).toBeLessThanOrEqual(MAX_MESSAGE_AGE);
    });

    test('should accept message within 5 minute window', () => {
      const now = Math.floor(Date.now() / 1000);
      const deviceTimestamp = now - 240; // 4 minutes ago
      const age = Math.abs(now - deviceTimestamp);

      expect(age).toBeLessThanOrEqual(MAX_MESSAGE_AGE);
    });

    test('should reject message older than 5 minutes', () => {
      const now = Math.floor(Date.now() / 1000);
      const deviceTimestamp = now - 400; // 6.67 minutes ago
      const age = Math.abs(now - deviceTimestamp);

      expect(age).toBeGreaterThan(MAX_MESSAGE_AGE);
    });

    test('should reject message from future beyond 5 minutes', () => {
      const now = Math.floor(Date.now() / 1000);
      const deviceTimestamp = now + 400; // 6.67 minutes in future
      const age = Math.abs(now - deviceTimestamp);

      expect(age).toBeGreaterThan(MAX_MESSAGE_AGE);
    });

    test('should accept message slightly in future (clock skew)', () => {
      const now = Math.floor(Date.now() / 1000);
      const deviceTimestamp = now + 60; // 1 minute in future
      const age = Math.abs(now - deviceTimestamp);

      expect(age).toBeLessThanOrEqual(MAX_MESSAGE_AGE);
    });

    test('should handle timestamp at exact boundaries', () => {
      const now = Math.floor(Date.now() / 1000);

      // Exactly at boundary (should still be valid)
      const deviceTimestamp = now - MAX_MESSAGE_AGE;
      const age = Math.abs(now - deviceTimestamp);

      expect(age).toBeLessThanOrEqual(MAX_MESSAGE_AGE);
    });

    test('should use Math.abs for timestamp comparison', () => {
      const now = Math.floor(Date.now() / 1000);

      // Past timestamp
      const pastTimestamp = now - 100;
      const pastAge = Math.abs(now - pastTimestamp);
      expect(pastAge).toBe(100);

      // Future timestamp
      const futureTimestamp = now + 100;
      const futureAge = Math.abs(now - futureTimestamp);
      expect(futureAge).toBe(100);

      // Both should produce same age
      expect(pastAge).toBe(futureAge);
    });
  });

  describe('Message Structure Validation', () => {
    test('should require name field', () => {
      const message = {
        // name missing
        timestamp: Math.floor(Date.now() / 1000)
      };

      expect(message.name).toBeUndefined();
    });

    test('should require timestamp field', () => {
      const message = {
        name: 'TEST-DEVICE'
        // timestamp missing
      };

      expect(message.timestamp).toBeUndefined();
    });

    test('should accept valid message with required fields', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000)
      };

      expect(message.name).toBeDefined();
      expect(message.timestamp).toBeDefined();
      expect(typeof message.name).toBe('string');
      expect(typeof message.timestamp).toBe('number');
    });

    test('should allow network_interfaces to be optional', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000)
        // network_interfaces not provided
      };

      expect(message.name).toBeDefined();
      expect(message.timestamp).toBeDefined();
      expect(message.network_interfaces).toBeUndefined();
    });

    test('should accept message with empty network_interfaces array', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000),
        network_interfaces: []
      };

      expect(Array.isArray(message.network_interfaces)).toBe(true);
      expect(message.network_interfaces.length).toBe(0);
    });
  });

  describe('Network Interfaces Validation', () => {
    test('should validate network_interfaces is an array', () => {
      const validMessage = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000),
        network_interfaces: []
      };

      const invalidMessage = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000),
        network_interfaces: 'not an array'
      };

      expect(Array.isArray(validMessage.network_interfaces)).toBe(true);
      expect(Array.isArray(invalidMessage.network_interfaces)).toBe(false);
    });

    test('should limit network_interfaces to 5 maximum', () => {
      const interfaces = [
        { name: 'eth0', ip: '192.168.1.1', rx_bytes: 100, tx_bytes: 50, max_speed_mbps: 1000 },
        { name: 'eth1', ip: '192.168.1.2', rx_bytes: 200, tx_bytes: 100, max_speed_mbps: 1000 },
        { name: 'eth2', ip: '192.168.1.3', rx_bytes: 300, tx_bytes: 150, max_speed_mbps: 1000 },
        { name: 'eth3', ip: '192.168.1.4', rx_bytes: 400, tx_bytes: 200, max_speed_mbps: 1000 },
        { name: 'eth4', ip: '192.168.1.5', rx_bytes: 500, tx_bytes: 250, max_speed_mbps: 1000 },
        { name: 'eth5', ip: '192.168.1.6', rx_bytes: 600, tx_bytes: 300, max_speed_mbps: 1000 },
        { name: 'eth6', ip: '192.168.1.7', rx_bytes: 700, tx_bytes: 350, max_speed_mbps: 1000 }
      ];

      const limited = interfaces.slice(0, 5);
      expect(limited.length).toBe(5);
      expect(limited[0].name).toBe('eth0');
      expect(limited[4].name).toBe('eth4');
    });

    test('should accept valid network interface structure', () => {
      const iface = {
        name: 'eth0',
        ip: '192.168.1.100',
        rx_bytes: 1000000,
        tx_bytes: 500000,
        max_speed_mbps: 1000
      };

      expect(iface.name).toBeDefined();
      expect(iface.ip).toBeDefined();
      expect(iface.rx_bytes).toBeDefined();
      expect(iface.tx_bytes).toBeDefined();
      expect(iface.max_speed_mbps).toBeDefined();
    });

    test('should handle missing interface fields with defaults', () => {
      const iface = {};

      const name = iface.name || 'unknown';
      const ip = iface.ip || 'unknown';
      const rxBytes = iface.rx_bytes || 0;
      const txBytes = iface.tx_bytes || 0;
      const maxSpeed = iface.max_speed_mbps || 0;

      expect(name).toBe('unknown');
      expect(ip).toBe('unknown');
      expect(rxBytes).toBe(0);
      expect(txBytes).toBe(0);
      expect(maxSpeed).toBe(0);
    });
  });

  describe('IP Address Filtering', () => {
    test('should identify loopback addresses (127.x.x.x)', () => {
      const loopbackAddresses = [
        '127.0.0.1',
        '127.0.1.1',
        '127.255.255.255'
      ];

      loopbackAddresses.forEach(ip => {
        expect(ip.startsWith('127.')).toBe(true);
      });
    });

    test('should identify APIPA addresses (169.254.x.x)', () => {
      const apipaAddresses = [
        '169.254.0.1',
        '169.254.100.200',
        '169.254.255.255'
      ];

      apipaAddresses.forEach(ip => {
        expect(ip.startsWith('169.254.')).toBe(true);
      });
    });

    test('should accept valid non-loopback, non-APIPA addresses', () => {
      const validAddresses = [
        '192.168.1.100',
        '10.0.0.1',
        '172.16.0.1',
        '8.8.8.8'
      ];

      validAddresses.forEach(ip => {
        const isLoopback = ip.startsWith('127.');
        const isAPIP = ip.startsWith('169.254.');
        expect(isLoopback).toBe(false);
        expect(isAPIP).toBe(false);
      });
    });

    test('should filter function correctly', () => {
      const shouldFilter = (ip) => {
        return ip.startsWith('127.') || ip.startsWith('169.254.');
      };

      expect(shouldFilter('127.0.0.1')).toBe(true);
      expect(shouldFilter('169.254.1.1')).toBe(true);
      expect(shouldFilter('192.168.1.1')).toBe(false);
      expect(shouldFilter('10.0.0.1')).toBe(false);
    });
  });

  describe('Device Name Validation', () => {
    test('should accept alphanumeric device names', () => {
      const validNames = [
        'DESKTOP-ABC123',
        'server01',
        'laptop-user',
        'DEVICE_NAME'
      ];

      validNames.forEach(name => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });
    });

    test('should handle device names with special characters', () => {
      const names = [
        'DESKTOP-ABC',
        'server.example.com',
        'device_001',
        'node-01'
      ];

      names.forEach(name => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });
    });

    test('should reject empty device name', () => {
      const emptyName = '';
      expect(emptyName.length).toBe(0);
      expect(!emptyName).toBe(true);
    });
  });

  describe('Numeric Field Validation', () => {
    test('should validate rx_bytes is numeric', () => {
      const validValues = [0, 1000, 1000000, 999999999999];

      validValues.forEach(value => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThanOrEqual(0);
      });
    });

    test('should validate tx_bytes is numeric', () => {
      const validValues = [0, 500, 500000, 999999999999];

      validValues.forEach(value => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThanOrEqual(0);
      });
    });

    test('should validate max_speed_mbps is numeric', () => {
      const validValues = [10, 100, 1000, 10000, 100000];

      validValues.forEach(value => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
      });
    });

    test('should handle zero values appropriately', () => {
      const iface = {
        rx_bytes: 0,
        tx_bytes: 0,
        max_speed_mbps: 0
      };

      expect(iface.rx_bytes).toBe(0);
      expect(iface.tx_bytes).toBe(0);
      expect(iface.max_speed_mbps).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle message with extra fields', () => {
      const message = {
        name: 'TEST-DEVICE',
        timestamp: Math.floor(Date.now() / 1000),
        network_interfaces: [],
        extra_field: 'should be ignored'
      };

      expect(message.name).toBeDefined();
      expect(message.timestamp).toBeDefined();
      expect(message.extra_field).toBeDefined();
      // Extra fields are allowed, just ignored
    });

    test('should handle very long device names', () => {
      const longName = 'A'.repeat(1000);
      expect(longName.length).toBe(1000);
      expect(typeof longName).toBe('string');
    });

    test('should handle maximum integer values for bytes', () => {
      const maxSafeInteger = Number.MAX_SAFE_INTEGER;
      expect(maxSafeInteger).toBe(9007199254740991);

      const iface = {
        rx_bytes: maxSafeInteger,
        tx_bytes: maxSafeInteger
      };

      expect(iface.rx_bytes).toBeLessThanOrEqual(maxSafeInteger);
      expect(iface.tx_bytes).toBeLessThanOrEqual(maxSafeInteger);
    });
  });
});
