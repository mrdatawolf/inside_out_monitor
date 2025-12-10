#!/usr/bin/env node

/**
 * Inside-Out Monitor - Web & File Monitor CLI
 * Standalone executable entry point
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dgram from 'dgram';
import os from 'os';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import { checkTarget, loadTargets } from './web-file-monitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration defaults (modified by inject-config.js during build)
let embeddedSecretKey = 'PLACEHOLDER_SECRET_KEY';  // Injected during build from dist/secret.key
let configLocation = 'Unknown';  // Injected during build from config.js
let configSublocation = 'Unknown';  // Injected during build from config.js
let monitorName = os.hostname();
let serverHost = '192.168.203.241';  // Will be injected from config.js
let serverPort = 4000;
let defaultInterval = 60;
let configPath = join(process.cwd(), 'monitoring-targets.json');

const args = process.argv.slice(2);

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Inside-Out Monitor - Web & File Monitor

Usage:
  web-file-monitor [options]

Options:
  -n, --name <name>          Monitor name (default: hostname)
  -h, --host <host>          Server hostname or IP (default: from config.js)
  -p, --port <port>          Server UDP port (default: from config.js)
  -i, --interval <seconds>   Default check interval in seconds (default: 60)
  -c, --config <path>        Path to monitoring-targets.json (default: ./monitoring-targets.json)
  --help                     Show this help message

Example:
  web-file-monitor --host 192.168.1.100 --interval 120
  web-file-monitor --config /path/to/targets.json --name Office-Monitor

Environment Variables:
  MONITOR_NAME       Override monitor name
  MONITOR_HOST       Override server host
  MONITOR_PORT       Override server port
  MONITOR_INTERVAL   Override interval
`);
  process.exit(0);
}

// Parse arguments
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--name':
    case '-n':
      monitorName = args[++i];
      break;
    case '--host':
      serverHost = args[++i];
      break;
    case '--port':
    case '-p':
      serverPort = parseInt(args[++i]);
      break;
    case '--interval':
    case '-i':
      defaultInterval = parseInt(args[++i]);
      break;
    case '--config':
    case '-c':
      configPath = args[++i];
      break;
  }
}

// Override with environment variables if set
monitorName = process.env.MONITOR_NAME || monitorName;
serverHost = process.env.MONITOR_HOST || serverHost;
serverPort = parseInt(process.env.MONITOR_PORT || serverPort);
defaultInterval = parseInt(process.env.MONITOR_INTERVAL || defaultInterval);

// Load targets from config file
let targets = [];
try {
  // Try current working directory first, then script directory
  if (!existsSync(configPath)) {
    configPath = join(__dirname, 'monitoring-targets.json');
  }

  const configData = readFileSync(configPath, 'utf8');
  const config = JSON.parse(configData);
  targets = config.targets || [];
  console.log(`Loaded ${targets.length} targets from ${configPath}`);
} catch (error) {
  console.error('Error loading monitoring-targets.json:', error.message);
  console.error('Create a monitoring-targets.json file with format:');
  console.error(JSON.stringify({
    targets: [
      { type: 'web', url: 'https://example.com', name: 'Example Website', interval: 60 },
      { type: 'file', path: 'C:\\backups\\daily.zip', name: 'Daily Backup', interval: 3600 },
      { type: 'folder', path: 'C:\\backups', name: 'Backup Folder', interval: 3600 }
    ]
  }, null, 2));
  process.exit(1);
}

// Load secret key (use embedded key if available, otherwise load from file)
let secretKey;
if (embeddedSecretKey && embeddedSecretKey !== 'PLACEHOLDER_SECRET_KEY') {
  // Use embedded key (injected during build)
  try {
    secretKey = util.decodeBase64(embeddedSecretKey);
    if (secretKey.length !== nacl.secretbox.keyLength) {
      throw new Error(`Key must be ${nacl.secretbox.keyLength} bytes`);
    }
    console.log('✓ Using embedded secret key');
  } catch (error) {
    console.error('ERROR: Failed to decode embedded secret key');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
} else {
  // Fall back to loading from file (development mode or build without key)
  try {
    // Try current working directory first, then script directory
    let keyPath = join(process.cwd(), 'secret.key');
    if (!existsSync(keyPath)) {
      keyPath = join(__dirname, 'secret.key');
    }

    const keyBase64 = readFileSync(keyPath, 'utf8').trim();
    secretKey = util.decodeBase64(keyBase64);

    if (secretKey.length !== nacl.secretbox.keyLength) {
      throw new Error(`Key must be ${nacl.secretbox.keyLength} bytes`);
    }

    console.log('✓ Loaded secret.key from file');
  } catch (error) {
    console.error('ERROR: Failed to load secret.key');
    console.error('Place secret.key in the current directory or script directory');
    console.error('Or rebuild with secret.key in dist/ to embed it');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Send monitoring results to server
async function sendResults(results) {
  try {
    // Ensure results is an array
    const resultsArray = Array.isArray(results) ? results : [results];

    // Create message
    const message = {
      type: 'monitoring',
      name: monitorName,
      timestamp: Math.floor(Date.now() / 1000),
      location: configLocation,
      sublocation: configSublocation,
      results: resultsArray
    };

    const messageJson = JSON.stringify(message);
    const messageBytes = util.decodeUTF8(messageJson);

    // Generate nonce
    const nonce = nacl.randomBytes(24);

    // Encrypt
    const encrypted = nacl.secretbox(messageBytes, nonce, secretKey);

    // Combine nonce + encrypted
    const packet = new Uint8Array(nonce.length + encrypted.length);
    packet.set(nonce);
    packet.set(encrypted, nonce.length);

    // Send UDP packet
    const client = dgram.createSocket('udp4');

    await new Promise((resolve, reject) => {
      client.send(Buffer.from(packet), serverPort, serverHost, (error) => {
        client.close();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ERROR: Failed to send monitoring results: ${error.message}`);
    return false;
  }
}

// Get status emoji for display
function getStatusEmoji(result) {
  switch (result.status) {
    case 'online':
    case 'ok':
      return '✓';
    case 'offline':
    case 'missing':
    case 'error':
    case 'expired':
      return '✗';
    case 'warning':
    case 'changed':
      return '⚠';
    default:
      return '?';
  }
}

// Format result for console display
function formatResult(result) {
  const emoji = getStatusEmoji(result);
  const name = result.name || result.url || result.path;

  switch (result.type) {
    case 'web':
      const timeStr = result.response_time_ms !== null ? ` (${result.response_time_ms}ms)` : '';
      const codeStr = result.status_code ? ` [${result.status_code}]` : '';
      return `${emoji} ${name}${codeStr} - ${result.status}${timeStr}`;

    case 'ssl':
      const daysStr = result.days_until_expiry !== null ? ` (expires in ${result.days_until_expiry} days)` : '';
      return `${emoji} [SSL] ${name} - ${result.status}${daysStr}`;

    case 'file':
      const sizeStr = result.size !== null ? ` (${(result.size / 1024 / 1024).toFixed(2)} MB)` : '';
      const hashStr = result.hash_match !== null ? (result.hash_match ? ' [hash OK]' : ' [hash CHANGED]') : '';
      return `${emoji} ${name}${sizeStr}${hashStr} - ${result.status}`;

    case 'folder':
      const countStr = result.file_count !== null ? ` (${result.file_count} files, ${(result.total_size / 1024 / 1024).toFixed(2)} MB)` : '';
      return `${emoji} ${name}${countStr} - ${result.status}`;

    default:
      return `${emoji} ${name} - ${result.status}`;
  }
}

// Monitor a single target on its own schedule
async function monitorTarget(target) {
  const targetInterval = target.interval || defaultInterval;
  let iteration = 0;

  console.log(`[${target.name || target.url || target.path}] Starting monitor (interval: ${targetInterval}s, type: ${target.type})`);

  while (true) {
    iteration++;
    const timestamp = new Date().toISOString();

    try {
      const result = await checkTarget(target);
      console.log(`[${timestamp}] ${formatResult(result)}`);

      if (result.error) {
        console.log(`  └─ Error: ${result.error}`);
      }

      await sendResults(result);
    } catch (error) {
      console.error(`[${timestamp}] ERROR checking ${target.name || target.url || target.path}: ${error.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, targetInterval * 1000));
  }
}

// Main entry point
async function main() {
  // Set console window title
  const title = `Web & File Monitor - ${monitorName} → ${serverHost}:${serverPort} (${targets.length} targets)`;
  process.stdout.write(`\x1b]0;${title}\x07`);

  console.log('='.repeat(70));
  console.log('Inside-Out Monitor - Web & File Monitor');
  console.log('='.repeat(70));
  console.log(`Monitor Name: ${monitorName}`);
  console.log(`Server: ${serverHost}:${serverPort}`);
  console.log(`Targets: ${targets.length}`);
  console.log(`Default Interval: ${defaultInterval} seconds`);
  console.log('='.repeat(70));
  console.log('\nTarget Configuration:');

  targets.forEach(target => {
    const targetInterval = target.interval || defaultInterval;
    const identifier = target.url || target.path;
    console.log(`  - [${target.type.toUpperCase()}] ${target.name || identifier}: ${targetInterval}s interval`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('Starting per-target monitoring...');
  console.log('='.repeat(70) + '\n');

  // Start a monitoring loop for each target
  // Each target runs independently on its own schedule
  const monitoringPromises = targets.map(target => monitorTarget(target));

  // Wait for all monitoring loops (will run forever)
  await Promise.all(monitoringPromises);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
