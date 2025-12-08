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

// Load secret.key and convert to base64 for embedding
let secretKeyBase64 = '';
try {
  const secretKeyPath = join(rootDir, 'dist', 'secret.key');
  secretKeyBase64 = readFileSync(secretKeyPath, 'utf8').trim();
  console.log('✅ Loaded secret.key for embedding');
} catch (error) {
  console.error('⚠️  Warning: Could not load dist/secret.key:', error.message);
  console.error('   Executables will need secret.key file at runtime');
  secretKeyBase64 = 'PLACEHOLDER_SECRET_KEY';
}

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

  // Replace the embedded secret key
  clientContent = clientContent.replace(
    /let embeddedSecretKey = '.*?';/,
    `let embeddedSecretKey = '${secretKeyBase64}';`
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

  // Replace the embedded secret key
  pingContent = pingContent.replace(
    /let embeddedSecretKey = '.*?';/,
    `let embeddedSecretKey = '${secretKeyBase64}';`
  );

  writeFileSync(pingCliPath, pingContent, 'utf8');
  console.log(`✅ Updated ping-monitor default server: ${serverHost}:${serverUdpPort}`);
} catch (error) {
  console.error('❌ Error updating client/ping-monitor-cli.js:', error.message);
  process.exit(1);
}

// Update client/unifi-monitor.js
const unifiPath = join(rootDir, 'client', 'unifi-monitor.js');
try {
  let unifiContent = readFileSync(unifiPath, 'utf8');

  // Get UniFi config
  const unifiConfig = config.unifi || {};
  const unifiHost = unifiConfig.host || '';
  const unifiPort = unifiConfig.port || 443;
  const unifiUsername = unifiConfig.username || 'admin';
  const unifiPassword = unifiConfig.password || '';
  const unifiSite = unifiConfig.site || 'default';
  const unifiInterval = unifiConfig.interval || 60;
  const unifiIgnoreSsl = unifiConfig.ignoreSsl !== false;

  // Replace UniFi configuration values
  unifiContent = unifiContent.replace(
    /let configServerHost = '.*?';/,
    `let configServerHost = '${serverHost}';`
  );
  unifiContent = unifiContent.replace(
    /let configServerPort = \d+;/,
    `let configServerPort = ${serverUdpPort};`
  );
  unifiContent = unifiContent.replace(
    /let configUnifiHost = '.*?';/,
    `let configUnifiHost = '${unifiHost}';`
  );
  unifiContent = unifiContent.replace(
    /let configUnifiPort = \d+;/,
    `let configUnifiPort = ${unifiPort};`
  );
  unifiContent = unifiContent.replace(
    /let configUnifiUsername = '.*?';/,
    `let configUnifiUsername = '${unifiUsername}';`
  );
  unifiContent = unifiContent.replace(
    /let configUnifiPassword = '.*?';/,
    `let configUnifiPassword = '${unifiPassword}';`
  );
  unifiContent = unifiContent.replace(
    /let configUnifiSite = '.*?';/,
    `let configUnifiSite = '${unifiSite}';`
  );
  unifiContent = unifiContent.replace(
    /let configUnifiInterval = \d+;/,
    `let configUnifiInterval = ${unifiInterval};`
  );
  unifiContent = unifiContent.replace(
    /let configUnifiIgnoreSsl = (true|false);/,
    `let configUnifiIgnoreSsl = ${unifiIgnoreSsl};`
  );

  // Replace the embedded secret key
  unifiContent = unifiContent.replace(
    /let embeddedSecretKey = '.*?';/,
    `let embeddedSecretKey = '${secretKeyBase64}';`
  );

  writeFileSync(unifiPath, unifiContent, 'utf8');
  console.log(`✅ Updated unifi-monitor config: ${unifiHost || '(not configured)'}`);
} catch (error) {
  console.error('❌ Error updating client/unifi-monitor.js:', error.message);
  process.exit(1);
}

console.log('✅ Configuration injection complete!');
