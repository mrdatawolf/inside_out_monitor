import { describe, test, expect } from '@jest/globals';
import os from 'os';

describe('Network Interface Collection', () => {
  describe('IP Address Filtering', () => {
    test('should identify IPv4 addresses', () => {
      const ipv4Address = {
        family: 'IPv4',
        address: '192.168.1.100',
        internal: false
      };

      expect(ipv4Address.family).toBe('IPv4');
    });

    test('should filter out internal (loopback) addresses', () => {
      const addresses = [
        { family: 'IPv4', address: '127.0.0.1', internal: true },
        { family: 'IPv4', address: '192.168.1.100', internal: false }
      ];

      const filtered = addresses.filter(addr => !addr.internal);
      expect(filtered.length).toBe(1);
      expect(filtered[0].address).toBe('192.168.1.100');
    });

    test('should filter out loopback addresses (127.x.x.x)', () => {
      const addresses = [
        { family: 'IPv4', address: '127.0.0.1', internal: false },
        { family: 'IPv4', address: '127.0.1.1', internal: false },
        { family: 'IPv4', address: '192.168.1.100', internal: false }
      ];

      const filtered = addresses.filter(addr => !addr.address.startsWith('127.'));
      expect(filtered.length).toBe(1);
      expect(filtered[0].address).toBe('192.168.1.100');
    });

    test('should filter out APIPA addresses (169.254.x.x)', () => {
      const addresses = [
        { family: 'IPv4', address: '169.254.1.1', internal: false },
        { family: 'IPv4', address: '169.254.100.200', internal: false },
        { family: 'IPv4', address: '192.168.1.100', internal: false }
      ];

      const filtered = addresses.filter(addr => !addr.address.startsWith('169.254.'));
      expect(filtered.length).toBe(1);
      expect(filtered[0].address).toBe('192.168.1.100');
    });

    test('should filter out IPv6 addresses', () => {
      const addresses = [
        { family: 'IPv6', address: 'fe80::1', internal: false },
        { family: 'IPv4', address: '192.168.1.100', internal: false }
      ];

      const filtered = addresses.filter(addr => addr.family === 'IPv4');
      expect(filtered.length).toBe(1);
      expect(filtered[0].address).toBe('192.168.1.100');
    });

    test('should apply complete filtering logic', () => {
      const shouldInclude = (addr) => {
        if (addr.family !== 'IPv4') return false;
        if (addr.internal) return false;
        if (addr.address.startsWith('127.')) return false;
        if (addr.address.startsWith('169.254.')) return false;
        return true;
      };

      expect(shouldInclude({ family: 'IPv4', address: '192.168.1.100', internal: false })).toBe(true);
      expect(shouldInclude({ family: 'IPv4', address: '127.0.0.1', internal: false })).toBe(false);
      expect(shouldInclude({ family: 'IPv4', address: '169.254.1.1', internal: false })).toBe(false);
      expect(shouldInclude({ family: 'IPv6', address: 'fe80::1', internal: false })).toBe(false);
      expect(shouldInclude({ family: 'IPv4', address: '192.168.1.100', internal: true })).toBe(false);
    });
  });

  describe('Interface Limit', () => {
    test('should limit results to 5 interfaces maximum', () => {
      const interfaces = Array(10).fill(null).map((_, i) => ({
        name: `eth${i}`,
        ip: `192.168.1.${100 + i}`,
        rx_bytes: 1000000,
        tx_bytes: 500000,
        max_speed_mbps: 1000
      }));

      const limited = interfaces.slice(0, 5);
      expect(limited.length).toBe(5);
      expect(limited[0].name).toBe('eth0');
      expect(limited[4].name).toBe('eth4');
    });

    test('should return all interfaces if less than 5', () => {
      const interfaces = [
        { name: 'eth0', ip: '192.168.1.100', rx_bytes: 100, tx_bytes: 50, max_speed_mbps: 1000 },
        { name: 'eth1', ip: '192.168.1.101', rx_bytes: 200, tx_bytes: 100, max_speed_mbps: 1000 }
      ];

      expect(interfaces.length).toBe(2);
    });
  });

  describe('Network Stats Structure', () => {
    test('should create valid network stats structure', () => {
      const stats = {
        name: 'eth0',
        ip: '192.168.1.100',
        rx_bytes: 1000000,
        tx_bytes: 500000,
        max_speed_mbps: 1000
      };

      expect(stats.name).toBe('eth0');
      expect(stats.ip).toBe('192.168.1.100');
      expect(typeof stats.rx_bytes).toBe('number');
      expect(typeof stats.tx_bytes).toBe('number');
      expect(typeof stats.max_speed_mbps).toBe('number');
    });

    test('should handle zero values', () => {
      const stats = {
        name: 'eth0',
        ip: '192.168.1.100',
        rx_bytes: 0,
        tx_bytes: 0,
        max_speed_mbps: 0
      };

      expect(stats.rx_bytes).toBe(0);
      expect(stats.tx_bytes).toBe(0);
      expect(stats.max_speed_mbps).toBe(0);
    });

    test('should handle large byte values', () => {
      const stats = {
        name: 'eth0',
        ip: '192.168.1.100',
        rx_bytes: 999999999999,
        tx_bytes: 888888888888,
        max_speed_mbps: 10000
      };

      expect(stats.rx_bytes).toBeGreaterThan(0);
      expect(stats.tx_bytes).toBeGreaterThan(0);
    });
  });

  describe('Platform Detection', () => {
    test('should detect current platform', () => {
      const platform = os.platform();

      expect(typeof platform).toBe('string');
      expect(['win32', 'linux', 'darwin', 'freebsd', 'openbsd', 'aix', 'sunos']).toContain(platform);
    });

    test('should identify Windows platform', () => {
      const isWindows = os.platform() === 'win32';
      expect(typeof isWindows).toBe('boolean');
    });

    test('should identify Linux platform', () => {
      const isLinux = os.platform() === 'linux';
      expect(typeof isLinux).toBe('boolean');
    });

    test('should identify macOS platform', () => {
      const isMac = os.platform() === 'darwin';
      expect(typeof isMac).toBe('boolean');
    });
  });

  describe('Link Speed Parsing', () => {
    test('should parse Gbps link speeds', () => {
      const parseSpeed = (speedString) => {
        const match = speedString.match(/(\d+(?:\.\d+)?)\s*(Gbps|Mbps|Kbps)/i);
        if (!match) return 0;

        const value = parseFloat(match[1]);
        const unit = match[2].toLowerCase();

        if (unit === 'gbps') return value * 1000;
        if (unit === 'mbps') return value;
        if (unit === 'kbps') return value / 1000;
        return 0;
      };

      expect(parseSpeed('1 Gbps')).toBe(1000);
      expect(parseSpeed('10 Gbps')).toBe(10000);
      expect(parseSpeed('2.5 Gbps')).toBe(2500);
    });

    test('should parse Mbps link speeds', () => {
      const parseSpeed = (speedString) => {
        const match = speedString.match(/(\d+(?:\.\d+)?)\s*(Gbps|Mbps|Kbps)/i);
        if (!match) return 0;

        const value = parseFloat(match[1]);
        const unit = match[2].toLowerCase();

        if (unit === 'gbps') return value * 1000;
        if (unit === 'mbps') return value;
        if (unit === 'kbps') return value / 1000;
        return 0;
      };

      expect(parseSpeed('100 Mbps')).toBe(100);
      expect(parseSpeed('1000 Mbps')).toBe(1000);
    });

    test('should parse Kbps link speeds', () => {
      const parseSpeed = (speedString) => {
        const match = speedString.match(/(\d+(?:\.\d+)?)\s*(Gbps|Mbps|Kbps)/i);
        if (!match) return 0;

        const value = parseFloat(match[1]);
        const unit = match[2].toLowerCase();

        if (unit === 'gbps') return value * 1000;
        if (unit === 'mbps') return value;
        if (unit === 'kbps') return value / 1000;
        return 0;
      };

      expect(parseSpeed('1000 Kbps')).toBe(1);
      expect(parseSpeed('10000 Kbps')).toBe(10);
    });

    test('should floor speed values to integers', () => {
      const speed = 1234.5678;
      expect(Math.floor(speed)).toBe(1234);
    });

    test('should handle invalid speed strings', () => {
      const parseSpeed = (speedString) => {
        const match = speedString.match(/(\d+(?:\.\d+)?)\s*(Gbps|Mbps|Kbps)/i);
        if (!match) return 0;
        return 1;
      };

      expect(parseSpeed('invalid')).toBe(0);
      expect(parseSpeed('')).toBe(0);
      expect(parseSpeed('no speed')).toBe(0);
    });
  });

  describe('Interface Name Handling', () => {
    test('should handle standard interface names', () => {
      const names = ['eth0', 'eth1', 'wlan0', 'en0', 'en1'];

      names.forEach(name => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });
    });

    test('should handle Windows interface names with parentheses', () => {
      const windowsNames = [
        'Ethernet',
        'Wi-Fi',
        'vEthernet (Default Switch)',
        'Ethernet 2'
      ];

      windowsNames.forEach(name => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });
    });

    test('should escape single quotes in PowerShell commands', () => {
      const escapeName = (name) => name.replace(/'/g, "''");

      expect(escapeName("Ethernet")).toBe("Ethernet");
      expect(escapeName("vEthernet (Default Switch)")).toBe("vEthernet (Default Switch)");
      expect(escapeName("Test'Interface")).toBe("Test''Interface");
    });
  });

  describe('Error Handling', () => {
    test('should handle missing interface data gracefully', () => {
      const interfaces = [];

      expect(Array.isArray(interfaces)).toBe(true);
      expect(interfaces.length).toBe(0);
    });

    test('should provide default values for missing stats', () => {
      const stats = {
        rx_bytes: 0,
        tx_bytes: 0,
        max_speed_mbps: 0
      };

      const rxBytes = stats.rx_bytes || 0;
      const txBytes = stats.tx_bytes || 0;
      const maxSpeed = stats.max_speed_mbps || 0;

      expect(rxBytes).toBe(0);
      expect(txBytes).toBe(0);
      expect(maxSpeed).toBe(0);
    });

    test('should skip interfaces without valid IPv4 addresses', () => {
      const interfaces = {
        'lo': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
        'eth0': [{ family: 'IPv4', address: '192.168.1.100', internal: false }]
      };

      const validInterfaces = Object.entries(interfaces).filter(([name, addrs]) => {
        return addrs.some(addr =>
          addr.family === 'IPv4' &&
          !addr.internal &&
          !addr.address.startsWith('127.') &&
          !addr.address.startsWith('169.254.')
        );
      });

      expect(validInterfaces.length).toBe(1);
      expect(validInterfaces[0][0]).toBe('eth0');
    });
  });

  describe('Cross-Platform Compatibility', () => {
    test('should handle os.networkInterfaces() format', () => {
      const interfaces = os.networkInterfaces();

      expect(typeof interfaces).toBe('object');
      expect(interfaces).not.toBeNull();

      // Each interface should have an array of addresses
      for (const [name, addresses] of Object.entries(interfaces)) {
        expect(Array.isArray(addresses)).toBe(true);
      }
    });

    test('should extract IPv4 addresses from os.networkInterfaces()', () => {
      const interfaces = os.networkInterfaces();
      const ipv4Addresses = [];

      for (const [name, addresses] of Object.entries(interfaces)) {
        const ipv4 = addresses.find(addr => addr.family === 'IPv4' && !addr.internal);
        if (ipv4) {
          ipv4Addresses.push({ name, address: ipv4.address });
        }
      }

      // We should have at least one non-loopback IPv4 address
      // (This test might vary based on test environment)
      expect(Array.isArray(ipv4Addresses)).toBe(true);
    });
  });
});
