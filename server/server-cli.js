#!/usr/bin/env node

/**
 * Inside-Out Monitor Server CLI
 * Standalone executable wrapper for the monitor server
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dgram from 'dgram';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import { initDb, insertHeartbeat, insertPingResults, insertMonitoringResults } from './db.js';
import { initUnifiDb, insertUnifiClients, markDisconnectedClients } from './unifi-db.js';
import { startApi } from './api.js';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
let udpPort = 4000;
let apiPort = 3000;
let maxMessageAge = 300;

// Parse arguments
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--udp-port':
    case '-u':
      udpPort = parseInt(args[++i]);
      break;
    case '--api-port':
    case '-a':
      apiPort = parseInt(args[++i]);
      break;
    case '--max-age':
    case '-m':
      maxMessageAge = parseInt(args[++i]);
      break;
    case '--help':
      console.log(`
Inside-Out Monitor Server

Usage: monitor-server [options]

Options:
  -u, --udp-port <port>    UDP port for heartbeats (default: 4000)
  -a, --api-port <port>    HTTP API port (default: 3000)
  -m, --max-age <seconds>  Maximum message age in seconds (default: 300)
  --help                   Show this help message

Examples:
  monitor-server
  monitor-server --udp-port 5000 --api-port 3001
  monitor-server -u 4000 -a 3000 -m 600

Files Required:
  secret.key               Pre-shared encryption key (must be in same directory)

Directories Created:
  databases/               Database storage (created automatically)
`);
      process.exit(0);
    default:
      console.error(`Unknown option: ${args[i]}`);
      console.error('Use --help for usage information');
      process.exit(1);
  }
}

// Ensure databases directory exists
const dbDir = join(process.cwd(), 'databases');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
  console.log(`Created databases directory: ${dbDir}`);
}

// Load secret key
let secretKey;
try {
  // Try current directory first (for packaged exe)
  const keyPath = join(process.cwd(), 'secret.key');
  const keyBase64 = readFileSync(keyPath, 'utf8').trim();
  secretKey = util.decodeBase64(keyBase64);
  console.log(`Loaded secret key from: ${keyPath}`);
} catch (error) {
  try {
    // Try script directory (for development)
    const keyPath = join(__dirname, 'secret.key');
    const keyBase64 = readFileSync(keyPath, 'utf8').trim();
    secretKey = util.decodeBase64(keyBase64);
    console.log(`Loaded secret key from: ${keyPath}`);
  } catch (err) {
    console.error('ERROR: Failed to load secret.key');
    console.error('Place secret.key in the same directory as this executable');
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Decrypt and validate message
function decryptMessage(packet) {
  if (packet.length < 24) {
    throw new Error('Packet too short');
  }

  const nonce = packet.slice(0, 24);
  const encrypted = packet.slice(24);

  const decrypted = nacl.secretbox.open(encrypted, nonce, secretKey);
  if (!decrypted) {
    throw new Error('Decryption failed');
  }

  const messageJson = util.encodeUTF8(decrypted);
  return JSON.parse(messageJson);
}

// Validate message
function validateMessage(message) {
  const now = Math.floor(Date.now() / 1000);
  const age = Math.abs(now - message.timestamp);

  if (age > maxMessageAge) {
    throw new Error(`Message too old: ${age}s (max: ${maxMessageAge}s)`);
  }

  // UniFi messages don't have a 'name' field, they have 'clients'
  if (message.type !== 'unifi' && (!message.name || typeof message.name !== 'string')) {
    throw new Error('Invalid device name');
  }

  return true;
}

// Main server startup
async function startServer() {
  try {
    // Initialize database
    console.log('Initializing database...');
    await initDb();
    console.log('Database initialized');

    // Initialize UniFi database
    console.log('Initializing UniFi database...');
    await initUnifiDb();
    console.log('UniFi database initialized');

    // Create UDP server
    const server = dgram.createSocket('udp4');

    server.on('error', (err) => {
      console.error(`Server error: ${err.message}`);
      server.close();
      process.exit(1);
    });

    server.on('message', async (msg, rinfo) => {
      try {
        const message = decryptMessage(msg);

        // DEBUG: Log received message
        console.log(`[DEBUG] Received message:`, JSON.stringify(message, null, 2));
        console.log(`[DEBUG] message.name type: ${typeof message.name}, value:`, message.name);

        validateMessage(message);

        // Route message based on type
        if (message.type === 'ping') {
          // Handle ping results
          await insertPingResults(
            message.name,
            message.timestamp,
            message.results || []
          );
          console.log(`[${new Date().toISOString()}] Ping results from ${message.name} (${rinfo.address}:${rinfo.port}) - ${message.results?.length || 0} targets`);
        } else if (message.type === 'monitoring') {
          // Handle monitoring results (web, SSL, file, folder)
          if (!message.results || !Array.isArray(message.results)) {
            console.log(`[${new Date().toISOString()}] Invalid monitoring payload from ${rinfo.address}:${rinfo.port} - missing results array`);
            return;
          }
          await insertMonitoringResults(
            message.name,
            message.timestamp,
            message.results
          );
          const typeCounts = message.results.reduce((acc, r) => {
            acc[r.type] = (acc[r.type] || 0) + 1;
            return acc;
          }, {});
          const typeStr = Object.entries(typeCounts).map(([type, count]) => `${count} ${type}`).join(', ');
          console.log(`[${new Date().toISOString()}] Monitoring results from ${message.name} (${rinfo.address}:${rinfo.port}) - ${typeStr}`);
        } else if (message.type === 'unifi') {
          // Handle UniFi client data
          if (!message.clients || !Array.isArray(message.clients)) {
            console.log(`[${new Date().toISOString()}] Invalid UniFi payload from ${rinfo.address}:${rinfo.port} - missing clients array`);
            return;
          }
          insertUnifiClients(message.clients, message.timestamp);
          const connectedCount = message.clients.length;
          const wiredCount = message.clients.filter(c => c.is_wired).length;
          const wirelessCount = connectedCount - wiredCount;
          console.log(`[${new Date().toISOString()}] UniFi clients (${rinfo.address}:${rinfo.port}) - ${connectedCount} total, ${wiredCount} wired, ${wirelessCount} wireless`);
        } else {
          // Handle regular heartbeat
          await insertHeartbeat(
            message.name,
            message.timestamp,
            Math.floor(Date.now() / 1000),  // receivedAt timestamp
            message.network_interfaces || []
          );
          console.log(`[${new Date().toISOString()}] Heartbeat from ${message.name} (${rinfo.address}:${rinfo.port})`);
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Invalid message from ${rinfo.address}:${rinfo.port}: ${error.message}`);
      }
    });

    server.on('listening', () => {
      const address = server.address();
      console.log(`UDP Server listening on ${address.address}:${address.port}`);
    });

    server.bind(udpPort);

    // Start API server
    console.log('Starting API server...');
    startApi(apiPort);

    // Start periodic UniFi client disconnection check
    const unifiCheckInterval = 60; // Check every 60 seconds
    const onlineThresholdSeconds = config.alerting?.behavior?.onlineThresholdSeconds || 300;
    console.log(`\n✓ UniFi disconnect monitoring enabled`);
    console.log(`  Check interval: ${unifiCheckInterval}s`);
    console.log(`  Disconnect threshold: ${onlineThresholdSeconds}s (${Math.floor(onlineThresholdSeconds / 60)} min)`);

    setInterval(() => {
      markDisconnectedClients(onlineThresholdSeconds);
    }, unifiCheckInterval * 1000);

    console.log('');
    console.log('='.repeat(60));
    console.log('Inside-Out Monitor Server is running');
    console.log('='.repeat(60));
    console.log(`UDP Heartbeats: 0.0.0.0:${udpPort}`);
    console.log(`API Server:     http://0.0.0.0:${apiPort}`);
    console.log(`Max Message Age: ${maxMessageAge} seconds`);
    console.log('='.repeat(60));
    console.log('');
    console.log('Press Ctrl+C to stop');

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
