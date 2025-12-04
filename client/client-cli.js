#!/usr/bin/env node

/**
 * Inside-Out Monitor Client CLI
 * Standalone executable wrapper for the heartbeat client
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dgram from 'dgram';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import os from 'os';
import { getNetworkInterfaces } from './network-stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
let deviceName = os.hostname();
let serverHost = '127.0.0.1';
let serverPort = 4000;
let interval = 0;

// Parse arguments
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--name':
    case '-n':
      deviceName = args[++i];
      break;
    case '--host':
    case '-h':
      serverHost = args[++i];
      break;
    case '--port':
    case '-p':
      serverPort = parseInt(args[++i]);
      break;
    case '--interval':
    case '-i':
      interval = parseInt(args[++i]);
      break;
    case '--help':
      console.log(`
Inside-Out Monitor Client

Usage: monitor-client [options]

Options:
  -n, --name <name>        Device name (default: hostname)
  -h, --host <host>        Server hostname or IP (default: 127.0.0.1)
  -p, --port <port>        Server UDP port (default: 4000)
  -i, --interval <seconds> Send heartbeat every N seconds (0 = run once)
  --help                   Show this help message

Examples:
  monitor-client --host 192.168.1.100
  monitor-client --host 192.168.1.100 --interval 60
  monitor-client -n web-server-01 -h monitor.example.com -i 300

Environment Variables:
  MONITOR_DEVICE_NAME      Override device name
  MONITOR_HOST             Override server host
  MONITOR_PORT             Override server port
`);
      process.exit(0);
    default:
      console.error(`Unknown option: ${args[i]}`);
      console.error('Use --help for usage information');
      process.exit(1);
  }
}

// Override with environment variables if set
if (process.env.MONITOR_DEVICE_NAME) deviceName = process.env.MONITOR_DEVICE_NAME;
if (process.env.MONITOR_HOST) serverHost = process.env.MONITOR_HOST;
if (process.env.MONITOR_PORT) serverPort = parseInt(process.env.MONITOR_PORT);

// Load secret key
let secretKey;
try {
  // Try current directory first (for packaged exe)
  const keyPath = join(process.cwd(), 'secret.key');
  const keyBase64 = readFileSync(keyPath, 'utf8').trim();
  secretKey = util.decodeBase64(keyBase64);
} catch (error) {
  try {
    // Try script directory (for development)
    const keyPath = join(__dirname, 'secret.key');
    const keyBase64 = readFileSync(keyPath, 'utf8').trim();
    secretKey = util.decodeBase64(keyBase64);
  } catch (err) {
    console.error('ERROR: Failed to load secret.key');
    console.error('Place secret.key in the same directory as this executable');
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Function to send heartbeat
async function sendHeartbeat() {
  try {
    // Get network stats
    const networkInterfaces = await getNetworkInterfaces();

    // Create message
    const message = {
      name: deviceName,
      timestamp: Math.floor(Date.now() / 1000),
      network_interfaces: networkInterfaces
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
    console.error(`[${new Date().toISOString()}] ERROR: Failed to send heartbeat: ${error.message}`);
    return false;
  }
}

// Main execution
async function main() {
  // Set console window title
  const title = `Inside-Out Monitor Client - ${deviceName} → ${serverHost}:${serverPort}`;
  process.stdout.write(`\x1b]0;${title}\x07`);

  if (interval > 0) {
    // Continuous mode
    console.log(`Starting continuous heartbeat mode (every ${interval} seconds)`);
    console.log(`Device: ${deviceName}`);
    console.log(`Server: ${serverHost}:${serverPort}`);
    console.log('Press Ctrl+C to stop');
    console.log('');

    let iteration = 0;
    while (true) {
      iteration++;
      console.log(`=== Iteration ${iteration} ===`);

      const success = await sendHeartbeat();
      if (success) {
        console.log(`[${new Date().toISOString()}] Heartbeat sent to ${serverHost}:${serverPort}`);
      }

      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    }
  } else {
    // Single run mode
    const success = await sendHeartbeat();
    if (success) {
      console.log(`[${new Date().toISOString()}] Heartbeat sent to ${serverHost}:${serverPort}`);
      process.exit(0);
    } else {
      process.exit(1);
    }
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
