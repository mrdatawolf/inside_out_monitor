#!/usr/bin/env node

/**
 * Inside-Out Monitor - Ping Monitor
 * Monitors multiple internal IPs via ping and reports results to server
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dgram from 'dgram';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const MONITOR_NAME = process.env.MONITOR_NAME || os.hostname();
const SERVER_HOST = process.env.MONITOR_HOST || '127.0.0.1';
const SERVER_PORT = parseInt(process.env.MONITOR_PORT || '4000');
const INTERVAL = parseInt(process.env.MONITOR_INTERVAL || '60'); // seconds
const PING_TIMEOUT = 5; // seconds

// Load targets from config file
let targets = [];
try {
  const configPath = join(__dirname, 'ping-targets.json');
  const configData = readFileSync(configPath, 'utf8');
  const config = JSON.parse(configData);
  targets = config.targets || [];
  console.log(`Loaded ${targets.length} targets from ping-targets.json`);
} catch (error) {
  console.error('Error loading ping-targets.json:', error.message);
  console.error('Create a ping-targets.json file with format:');
  console.error(JSON.stringify({
    targets: [
      { ip: '192.168.1.10', name: 'Printer-Office' },
      { ip: '192.168.1.20', name: 'PC-Reception' }
    ]
  }, null, 2));
  process.exit(1);
}

// Load secret key
let secretKey;
try {
  const keyPath = join(__dirname, 'secret.key');
  const keyBase64 = readFileSync(keyPath, 'utf8').trim();
  secretKey = util.decodeBase64(keyBase64);
} catch (error) {
  console.error('ERROR: Failed to load secret.key');
  console.error('Place secret.key in the same directory as this script');
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

// Ping a single IP
async function pingHost(ip) {
  const isWindows = os.platform() === 'win32';
  const pingCmd = isWindows
    ? `ping -n 1 -w ${PING_TIMEOUT * 1000} ${ip}`
    : `ping -c 1 -W ${PING_TIMEOUT} ${ip}`;

  try {
    const { stdout } = await execAsync(pingCmd);

    // Parse response time
    let responseTime = null;
    if (isWindows) {
      const match = stdout.match(/time[<=](\d+)ms/i);
      if (match) responseTime = parseInt(match[1]);
    } else {
      const match = stdout.match(/time=(\d+\.?\d*)\s*ms/i);
      if (match) responseTime = parseFloat(match[1]);
    }

    return {
      status: 'online',
      response_time_ms: responseTime
    };
  } catch (error) {
    return {
      status: 'offline',
      response_time_ms: null
    };
  }
}

// Ping all targets
async function pingAllTargets() {
  console.log(`\n[${new Date().toISOString()}] Starting ping sweep...`);

  const results = [];

  for (const target of targets) {
    const result = await pingHost(target.ip);
    results.push({
      ip: target.ip,
      name: target.name || target.ip,
      status: result.status,
      response_time_ms: result.response_time_ms
    });

    const statusEmoji = result.status === 'online' ? '✓' : '✗';
    const timeStr = result.response_time_ms !== null ? ` (${result.response_time_ms}ms)` : '';
    console.log(`  ${statusEmoji} ${target.name || target.ip} [${target.ip}] - ${result.status}${timeStr}`);
  }

  return results;
}

// Send ping results to server
async function sendPingResults(results) {
  try {
    // Create message
    const message = {
      type: 'ping',
      name: MONITOR_NAME,  // Changed from monitor_name to match server validation
      timestamp: Math.floor(Date.now() / 1000),
      results: results
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
      client.send(Buffer.from(packet), SERVER_PORT, SERVER_HOST, (error) => {
        client.close();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    console.log(`[${new Date().toISOString()}] Ping results sent to ${SERVER_HOST}:${SERVER_PORT}`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ERROR: Failed to send ping results: ${error.message}`);
    return false;
  }
}

// Main monitoring loop
async function main() {
  console.log('='.repeat(60));
  console.log('Inside-Out Monitor - Ping Monitor');
  console.log('='.repeat(60));
  console.log(`Monitor Name: ${MONITOR_NAME}`);
  console.log(`Server: ${SERVER_HOST}:${SERVER_PORT}`);
  console.log(`Targets: ${targets.length}`);
  console.log(`Interval: ${INTERVAL} seconds`);
  console.log('='.repeat(60));

  let iteration = 0;

  while (true) {
    iteration++;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Iteration ${iteration}`);
    console.log('='.repeat(60));

    const results = await pingAllTargets();
    await sendPingResults(results);

    const onlineCount = results.filter(r => r.status === 'online').length;
    console.log(`\nSummary: ${onlineCount}/${results.length} targets online`);

    await new Promise(resolve => setTimeout(resolve, INTERVAL * 1000));
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
