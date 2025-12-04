import os from 'os';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

/**
 * Get network interface statistics
 * Returns up to 5 interfaces with IP, traffic stats, and link speed
 * Filters out loopback and APIPA addresses
 */
export function getNetworkInterfaces() {
  const interfaces = os.networkInterfaces();
  const platform = os.platform();
  const results = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    // Get IPv4 address (skip loopback and APIPA)
    const ipv4 = addresses.find(addr => {
      if (addr.family !== 'IPv4') return false;
      if (addr.internal) return false; // Skip loopback
      if (addr.address.startsWith('127.')) return false;
      if (addr.address.startsWith('169.254.')) return false; // Skip APIPA
      return true;
    });

    if (!ipv4) continue;

    try {
      let stats = null;

      if (platform === 'win32') {
        stats = getWindowsStats(name);
      } else if (platform === 'linux') {
        stats = getLinuxStats(name);
      } else if (platform === 'darwin') {
        stats = getMacStats(name);
      }

      if (stats) {
        results.push({
          name: name,
          ip: ipv4.address,
          rx_bytes: stats.rx_bytes,
          tx_bytes: stats.tx_bytes,
          max_speed_mbps: stats.max_speed_mbps
        });
      }

      // Limit to 5 interfaces
      if (results.length >= 5) break;

    } catch (error) {
      // Skip interfaces we can't get stats for
      console.error(`Warning: Could not get stats for ${name}: ${error.message}`);
    }
  }

  return results;
}

/**
 * Get network stats on Windows using PowerShell
 */
function getWindowsStats(interfaceName) {
  try {
    // Escape single quotes in interface name for PowerShell
    const escapedName = interfaceName.replace(/'/g, "''");

    // Get statistics - use single quotes around interface name in PowerShell
    const statsCmd = `(Get-NetAdapterStatistics -Name '${escapedName}' | Select-Object ReceivedBytes,SentBytes | ConvertTo-Json -Compress)`;
    const statsOutput = execSync(`powershell -NoProfile -Command "${statsCmd}"`, { encoding: 'utf8', timeout: 5000 });
    const stats = JSON.parse(statsOutput);

    // Get link speed
    const speedCmd = `(Get-NetAdapter -Name '${escapedName}' | Select-Object LinkSpeed | ConvertTo-Json -Compress)`;
    const speedOutput = execSync(`powershell -NoProfile -Command "${speedCmd}"`, { encoding: 'utf8', timeout: 5000 });
    const speed = JSON.parse(speedOutput);

    // Parse link speed (format: "1 Gbps", "100 Mbps", etc.)
    let maxSpeedMbps = 0;
    if (speed.LinkSpeed) {
      const match = speed.LinkSpeed.match(/(\d+(?:\.\d+)?)\s*(Gbps|Mbps|Kbps)/i);
      if (match) {
        const value = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        if (unit === 'gbps') {
          maxSpeedMbps = value * 1000;
        } else if (unit === 'mbps') {
          maxSpeedMbps = value;
        } else if (unit === 'kbps') {
          maxSpeedMbps = value / 1000;
        }
      }
    }

    return {
      rx_bytes: stats.ReceivedBytes || 0,
      tx_bytes: stats.SentBytes || 0,
      max_speed_mbps: Math.floor(maxSpeedMbps)
    };
  } catch (error) {
    throw new Error(`Failed to get Windows stats: ${error.message}`);
  }
}

/**
 * Get network stats on Linux from /sys filesystem
 */
function getLinuxStats(interfaceName) {
  try {
    const basePath = `/sys/class/net/${interfaceName}`;

    const rxBytes = parseInt(readFileSync(`${basePath}/statistics/rx_bytes`, 'utf8').trim());
    const txBytes = parseInt(readFileSync(`${basePath}/statistics/tx_bytes`, 'utf8').trim());

    // Get link speed (in Mbps)
    let maxSpeedMbps = 0;
    try {
      const speed = readFileSync(`${basePath}/speed`, 'utf8').trim();
      maxSpeedMbps = parseInt(speed);
      if (maxSpeedMbps < 0) maxSpeedMbps = 0; // Handle "Unknown" (-1)
    } catch (e) {
      // Some interfaces don't report speed
      maxSpeedMbps = 0;
    }

    return {
      rx_bytes: rxBytes || 0,
      tx_bytes: txBytes || 0,
      max_speed_mbps: maxSpeedMbps
    };
  } catch (error) {
    throw new Error(`Failed to get Linux stats: ${error.message}`);
  }
}

/**
 * Get network stats on macOS using netstat
 */
function getMacStats(interfaceName) {
  try {
    // Get traffic statistics
    const output = execSync(`netstat -ibn | grep "${interfaceName}"`, { encoding: 'utf8', timeout: 5000 });
    const lines = output.trim().split('\n');

    let rxBytes = 0;
    let txBytes = 0;

    // Parse netstat output (format varies, we want the line with IP address)
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 10) {
        // Column 7 is Ibytes (received), column 10 is Obytes (sent)
        const ibytes = parseInt(parts[6]);
        const obytes = parseInt(parts[9]);
        if (!isNaN(ibytes) && !isNaN(obytes)) {
          rxBytes = ibytes;
          txBytes = obytes;
          break;
        }
      }
    }

    // Get link speed using ifconfig
    const ifconfigOutput = execSync(`ifconfig ${interfaceName}`, { encoding: 'utf8', timeout: 5000 });
    let maxSpeedMbps = 0;

    // Look for "media:" line with speed info
    const mediaMatch = ifconfigOutput.match(/media:.*?(\d+)(Gbase|base)T/i);
    if (mediaMatch) {
      const value = parseInt(mediaMatch[1]);
      if (mediaMatch[2].toLowerCase().startsWith('g')) {
        maxSpeedMbps = value * 1000; // Gbps to Mbps
      } else {
        maxSpeedMbps = value;
      }
    }

    return {
      rx_bytes: rxBytes || 0,
      tx_bytes: txBytes || 0,
      max_speed_mbps: maxSpeedMbps
    };
  } catch (error) {
    throw new Error(`Failed to get macOS stats: ${error.message}`);
  }
}
