#!/usr/bin/env node

/**
 * Inject Configuration Script
 *
 * Reads config.js and injects values into dashboard/src/api.js
 * This runs automatically before builds.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('📝 Injecting configuration from config.js...');

// Load config
let config;
try {
  // Convert path to file:// URL for Windows compatibility
  const configPath = join(rootDir, 'config.js');
  const configUrl = new URL(`file:///${configPath.replace(/\\/g, '/')}`);
  const configModule = await import(configUrl.href);
  config = configModule.default;
} catch (error) {
  console.error('❌ Error loading config.js:', error.message);
  console.error('Make sure config.js exists in the root directory.');
  console.error('You can copy config.example.js to config.js and customize it.');
  process.exit(1);
}

// Validate config structure
if (!config.serverUrl || !config.serverUrl.host) {
  console.error('❌ Error: config.js must have serverUrl.host defined');
  console.error('Please update your config.js to match config.example.js structure');
  process.exit(1);
}

const serverHost = config.serverUrl.host;
const serverUdpPort = config.serverUrl.udpPort || 4000;
const serverApiPort = config.serverUrl.apiPort || 3000;
const apiUrl = `http://${serverHost}:${serverApiPort}`;

// Update dashboard/src/api.js
const apiFilePath = join(rootDir, 'dashboard', 'src', 'api.js');
try {
  let apiContent = readFileSync(apiFilePath, 'utf8');

  // Replace the API URL in the production condition
  apiContent = apiContent.replace(
    /\? '.*?'  \/\/ Production - configured from root config\.js/,
    `? '${apiUrl}/api'  // Production - configured from root config.js`
  );

  writeFileSync(apiFilePath, apiContent, 'utf8');
  console.log(`✅ Updated dashboard API URL: ${apiUrl}/api`);
} catch (error) {
  console.error('❌ Error updating dashboard/src/api.js:', error.message);
  process.exit(1);
}

// Update client/client-cli.js
const clientCliPath = join(rootDir, 'client', 'client-cli.js');
try {
  let clientContent = readFileSync(clientCliPath, 'utf8');

  // Replace the default serverHost
  clientContent = clientContent.replace(
    /let serverHost = '.*?';/,
    `let serverHost = '${serverHost}';`
  );

  // Replace the default serverPort
  clientContent = clientContent.replace(
    /let serverPort = \d+;/,
    `let serverPort = ${serverUdpPort};`
  );

  writeFileSync(clientCliPath, clientContent, 'utf8');
  console.log(`✅ Updated client default server: ${serverHost}:${serverUdpPort}`);
} catch (error) {
  console.error('❌ Error updating client/client-cli.js:', error.message);
  process.exit(1);
}

// Update client/ping-monitor-cli.js
const pingCliPath = join(rootDir, 'client', 'ping-monitor-cli.js');
try {
  let pingContent = readFileSync(pingCliPath, 'utf8');

  // Replace the default serverHost
  pingContent = pingContent.replace(
    /let serverHost = '.*?';/,
    `let serverHost = '${serverHost}';`
  );

  // Replace the default serverPort
  pingContent = pingContent.replace(
    /let serverPort = \d+;/,
    `let serverPort = ${serverUdpPort};`
  );

  writeFileSync(pingCliPath, pingContent, 'utf8');
  console.log(`✅ Updated ping-monitor default server: ${serverHost}:${serverUdpPort}`);
} catch (error) {
  console.error('❌ Error updating client/ping-monitor-cli.js:', error.message);
  process.exit(1);
}

console.log('✅ Configuration injection complete!');
