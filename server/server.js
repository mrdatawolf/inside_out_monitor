import dgram from 'dgram';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import { initDb, insertHeartbeat, insertPingResults } from './db.js';
import { startApi } from './api.js';
import { initAlerting, stopAlerting } from './alerting.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from '../config.js';

const { encodeUTF8, decodeBase64 } = util;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const PORT = 4000;
const MAX_MESSAGE_AGE = 300; // 5 minutes in seconds

// Async startup
async function startServer() {
  // Initialize database
  await initDb();

  // Initialize alerting system if enabled
  if (config.alerting && config.alerting.enabled) {
    initAlerting(config.alerting);
  }

  // Load pre-shared key
  let sharedKey;
  try {
    const keyBase64 = readFileSync(join(__dirname, 'secret.key'), 'utf8').trim();
    sharedKey = decodeBase64(keyBase64);

    if (sharedKey.length !== nacl.secretbox.keyLength) {
      throw new Error(`Key must be ${nacl.secretbox.keyLength} bytes`);
    }

    console.log('✓ Pre-shared key loaded successfully');
  } catch (error) {
    console.error('ERROR: Failed to load secret.key');
    console.error('Run: npm run keygen');
    process.exit(1);
  }

  // Create UDP server
  const server = dgram.createSocket('udp4');

  server.on('error', (err) => {
    console.error(`Server error:\n${err.stack}`);
    server.close();
  });

  server.on('message', (msg, rinfo) => {
    try {
      // Message format: nonce (24 bytes) + encrypted data
      if (msg.length < nacl.secretbox.nonceLength) {
        console.log(`⚠ Invalid message from ${rinfo.address}:${rinfo.port} - too short`);
        return;
      }

      // Extract nonce and encrypted data
      const nonce = msg.slice(0, nacl.secretbox.nonceLength);
      const box = msg.slice(nacl.secretbox.nonceLength);

      // Decrypt
      const decrypted = nacl.secretbox.open(box, nonce, sharedKey);

      if (!decrypted) {
        console.log(`⚠ Failed to decrypt message from ${rinfo.address}:${rinfo.port} - invalid key or corrupted`);
        return;
      }

      // Parse JSON payload
      const message = JSON.parse(encodeUTF8(decrypted));

      // Validate timestamp freshness
      const now = Math.floor(Date.now() / 1000);
      const deviceTimestamp = Math.floor(message.timestamp);
      const age = Math.abs(now - deviceTimestamp);

      if (age > MAX_MESSAGE_AGE) {
        console.log(`⚠ Stale message - age: ${age}s (max: ${MAX_MESSAGE_AGE}s)`);
        return;
      }

      // Handle different message types
      if (message.type === 'ping') {
        // Ping monitor message
        if (!message.monitor_name || !message.results || !Array.isArray(message.results)) {
          console.log(`⚠ Invalid ping payload from ${rinfo.address}:${rinfo.port} - missing fields`);
          return;
        }

        // Store ping results
        insertPingResults(message.monitor_name, deviceTimestamp, message.results);

        const onlineCount = message.results.filter(r => r.status === 'online').length;
        console.log(`✓ Ping results from ${message.monitor_name} [age: ${age}s, targets: ${message.results.length}, online: ${onlineCount}]`);

      } else {
        // Heartbeat message (default/legacy)
        if (!message.name || !message.timestamp) {
          console.log(`⚠ Invalid heartbeat payload from ${rinfo.address}:${rinfo.port} - missing fields`);
          return;
        }

        // Validate network interfaces (optional field)
        let networkInterfaces = [];
        if (message.network_interfaces && Array.isArray(message.network_interfaces)) {
          networkInterfaces = message.network_interfaces.slice(0, 5); // Limit to 5
        }

        // Store in database
        insertHeartbeat(message.name, deviceTimestamp, now, networkInterfaces);

        console.log(`✓ Heartbeat from ${message.name} [age: ${age}s, interfaces: ${networkInterfaces.length}]`);
      }

    } catch (error) {
      console.error(`⚠ Error processing message from ${rinfo.address}:${rinfo.port}:`, error.message);
    }
  });

  server.on('listening', () => {
    const address = server.address();
    console.log(`\n🚀 Inside-Out Monitor Server`);
    console.log(`   Listening on UDP port ${address.port}`);
    console.log(`   Max message age: ${MAX_MESSAGE_AGE}s\n`);
  });

  server.bind(PORT);

  // Start API server
  startApi();
}

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
