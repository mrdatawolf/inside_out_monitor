#!/usr/bin/env node

// UniFi Monitor - Poll UniFi Dream Router for connected clients and send to server
import dgram from 'dgram';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { UniFiAPI } from './unifi-api.js';

const { decodeUTF8, encodeBase64, decodeBase64 } = util;

// Get __dirname equivalent in ES modules
const __dirname = dirname(fileURLToPath(import.meta.url));

// Main async function to handle top-level await
(async () => {

// Build-time config injection (replaced by esbuild --define during build)
// These will be replaced with actual values from config.js
const BUILD_CONFIG = typeof BUILD_CONFIG !== 'undefined' ? BUILD_CONFIG : {
  SERVER_HOST: '127.0.0.1',
  SERVER_PORT: 4000,
  UNIFI_HOST: '',
  UNIFI_PORT: 443,
  UNIFI_USERNAME: 'admin',
  UNIFI_PASSWORD: '',
  UNIFI_SITE: 'default',
  UNIFI_INTERVAL: 60,
  UNIFI_IGNORE_SSL: true,
  UNIFI_SERVER_PORT: 4000
};

// Parse command line arguments
const args = process.argv.slice(2);
const parsedArgs = {};

// Show help
if (args.includes('--help')) {
  console.log(`
Inside-Out Monitor - UniFi Client Monitor

Usage:
  unifi-monitor [options]

Options:
  --host <host>           UniFi controller hostname or IP (default: from config.js)
  --port <port>           UniFi controller port (default: from config.js)
  --username <username>   UniFi admin username (default: from config.js)
  --password <password>   UniFi admin password (default: from config.js)
  --site <site>           UniFi site name (default: from config.js)
  --server <host>         Monitor server hostname or IP (default: from config.js)
  --server-port <port>    Monitor server UDP port (default: from config.js)
  --interval <seconds>    Poll interval in seconds (default: from config.js)
  --ignore-ssl <bool>     Ignore SSL certificate errors (default: from config.js)
  --help                  Show this help message

Examples:
  unifi-monitor --host 192.168.1.1 --password mypass
  unifi-monitor --host udm.local --username admin --password secret --site default
  unifi-monitor --host 10.0.0.1 --password pass --server 192.168.1.100 --interval 120

Files Required:
  secret.key              Pre-shared encryption key (must be in same directory)

Note:
  Default values are injected from config.js during build.
  Command-line arguments override these defaults.
`);
  process.exit(0);
}

for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace(/^--/, '');
  const value = args[i + 1];
  parsedArgs[key] = value;
}

// Configuration (command-line args override build-time config)
const UNIFI_HOST = parsedArgs.host || BUILD_CONFIG.UNIFI_HOST;
const UNIFI_PORT = parseInt(parsedArgs.port || BUILD_CONFIG.UNIFI_PORT);
const UNIFI_USERNAME = parsedArgs.username || BUILD_CONFIG.UNIFI_USERNAME;
const UNIFI_PASSWORD = parsedArgs.password || BUILD_CONFIG.UNIFI_PASSWORD;
const UNIFI_SITE = parsedArgs.site || BUILD_CONFIG.UNIFI_SITE;
const SERVER_HOST = parsedArgs.server || BUILD_CONFIG.SERVER_HOST;
const SERVER_PORT = parseInt(parsedArgs['server-port'] || BUILD_CONFIG.UNIFI_SERVER_PORT);
const POLL_INTERVAL = parseInt(parsedArgs.interval || BUILD_CONFIG.UNIFI_INTERVAL);
const IGNORE_SSL = parsedArgs['ignore-ssl'] !== 'false' && BUILD_CONFIG.UNIFI_IGNORE_SSL;

// Validate configuration
if (!UNIFI_HOST) {
  console.error('ERROR: UniFi host not configured');
  console.error('Use --host parameter or set unifi.host in config.js');
  console.error('Example: unifi-monitor --host 192.168.1.1 --password yourpass');
  process.exit(1);
}

if (!UNIFI_PASSWORD) {
  console.error('ERROR: UniFi password not configured');
  console.error('Use --password parameter or set unifi.password in config.js');
  console.error('Example: unifi-monitor --host 192.168.1.1 --password yourpass');
  process.exit(1);
}

// Load pre-shared key
let sharedKey;
try {
  const keyPath = join(__dirname, 'secret.key');
  const keyBase64 = readFileSync(keyPath, 'utf8').trim();
  sharedKey = decodeBase64(keyBase64);

  if (sharedKey.length !== nacl.secretbox.keyLength) {
    throw new Error(`Key must be ${nacl.secretbox.keyLength} bytes`);
  }

  console.log('✓ Pre-shared key loaded');
} catch (error) {
  console.error('ERROR: Failed to load secret.key');
  console.error('Copy server/secret.key to client/secret.key');
  process.exit(1);
}

// Initialize UniFi API client
const unifiApi = new UniFiAPI({
  host: UNIFI_HOST,
  port: UNIFI_PORT,
  username: UNIFI_USERNAME,
  password: UNIFI_PASSWORD,
  site: UNIFI_SITE,
  ignoreSsl: IGNORE_SSL
});

// Create UDP client
const client = dgram.createSocket('udp4');

/**
 * Send encrypted message to server
 */
function sendMessage(payload) {
  try {
    // Convert payload to JSON
    const message = JSON.stringify(payload);

    // Generate random nonce
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

    // Encrypt message
    const messageUint8 = decodeUTF8(message);
    const encrypted = nacl.secretbox(messageUint8, nonce, sharedKey);

    // Concatenate nonce + encrypted message
    const packet = new Uint8Array(nonce.length + encrypted.length);
    packet.set(nonce);
    packet.set(encrypted, nonce.length);

    // Send via UDP
    client.send(packet, SERVER_PORT, SERVER_HOST, (error) => {
      if (error) {
        console.error('⚠ Failed to send:', error.message);
      }
    });

  } catch (error) {
    console.error('⚠ Error creating message:', error.message);
  }
}

/**
 * Poll UniFi controller and send client data
 */
async function pollUniFi() {
  try {
    // Login to UniFi controller
    await unifiApi.login();

    // Get active clients
    const activeClients = await unifiApi.getActiveClients();

    // Parse and format client data
    const clients = activeClients.map(client => unifiApi.parseClient(client));

    // Create message payload
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = {
      type: 'unifi',
      timestamp,
      clients
    };

    // Send to server
    sendMessage(payload);

    console.log(`✓ Sent ${clients.length} UniFi client(s) to ${SERVER_HOST}:${SERVER_PORT}`);

    // Logout
    await unifiApi.logout();

  } catch (error) {
    console.error(`⚠ Poll error: ${error.message}`);
  }
}

// Display startup info
console.log('\n🔷 Inside-Out Monitor - UniFi Client Monitor');
console.log(`   UniFi Host: ${UNIFI_HOST}:${UNIFI_PORT}`);
console.log(`   Site: ${UNIFI_SITE}`);
console.log(`   Server: ${SERVER_HOST}:${SERVER_PORT}`);
console.log(`   Poll Interval: ${POLL_INTERVAL}s\n`);

// Test connection on startup
console.log('Testing connection to UniFi controller...');
unifiApi.testConnection().then(success => {
  if (success) {
    // Start polling
    console.log(`Starting continuous monitoring (every ${POLL_INTERVAL}s)...\n`);

    // Initial poll
    pollUniFi();

    // Set up interval
    setInterval(pollUniFi, POLL_INTERVAL * 1000);
  } else {
    console.error('\nFailed to connect to UniFi controller');
    console.error('Check your configuration and network connectivity');
    process.exit(1);
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠ Shutting down...');
  client.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  client.close();
  process.exit(0);
});

})().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
