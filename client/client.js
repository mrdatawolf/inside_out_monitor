import dgram from 'dgram';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getNetworkInterfaces } from './network-stats.js';

const { decodeUTF8, decodeBase64 } = util;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration - can be overridden by environment variables
const SERVER_HOST = process.env.MONITOR_HOST || '127.0.0.1';
const SERVER_PORT = parseInt(process.env.MONITOR_PORT || '4000');
const DEVICE_NAME = process.env.MONITOR_DEVICE_NAME || 'unknown-device';

// Load pre-shared key
let sharedKey;
try {
  const keyPath = join(__dirname, 'secret.key');
  const keyBase64 = readFileSync(keyPath, 'utf8').trim();
  sharedKey = decodeBase64(keyBase64);

  if (sharedKey.length !== nacl.secretbox.keyLength) {
    throw new Error(`Key must be ${nacl.secretbox.keyLength} bytes`);
  }
} catch (error) {
  console.error('ERROR: Failed to load secret.key');
  console.error('Copy the pre-shared key from the server to client/secret.key');
  process.exit(1);
}

// Get network interface information
const networkInterfaces = getNetworkInterfaces();

// Create heartbeat message
const message = {
  name: DEVICE_NAME,
  timestamp: Math.floor(Date.now() / 1000),
  network_interfaces: networkInterfaces
};

// Encrypt message
const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
const messageUint8 = decodeUTF8(JSON.stringify(message));
const box = nacl.secretbox(messageUint8, nonce, sharedKey);

// Combine nonce + encrypted message
const packet = new Uint8Array(nonce.length + box.length);
packet.set(nonce);
packet.set(box, nonce.length);

// Send UDP packet
const client = dgram.createSocket('udp4');

client.send(Buffer.from(packet), SERVER_PORT, SERVER_HOST, (error) => {
  if (error) {
    console.error('Failed to send heartbeat:', error.message);
    client.close();
    process.exit(1);
  }

  console.log(`✓ Heartbeat sent: ${DEVICE_NAME} -> ${SERVER_HOST}:${SERVER_PORT}`);
  console.log(`  Network interfaces: ${networkInterfaces.length}`);
  client.close();
});
