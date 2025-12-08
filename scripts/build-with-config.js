#!/usr/bin/env node

/**
 * Build script that reads config.js and injects values into executables
 * This allows users to configure once in config.js and get standalone executables
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(__dirname);
const configPath = join(rootDir, 'config.js');

// Load esbuild from client's node_modules
const esbuildPath = join(rootDir, 'client', 'node_modules', 'esbuild');
const { buildSync } = await import(pathToFileURL(join(esbuildPath, 'lib', 'main.js')).href);

// Load config.js
let config = {};
try {
  // Use dynamic import for ES modules
  const configUrl = `file://${configPath.replace(/\\/g, '/')}`;
  const configModule = await import(configUrl);
  config = configModule.default;
  console.log('✓ Loaded config.js');
} catch (error) {
  console.warn('⚠ Warning: Could not load config.js, using empty defaults');
  console.warn(`  ${error.message}`);
  config = {
    serverUrl: { host: '127.0.0.1', port: 3000 },
    unifi: {
      host: '',
      port: 443,
      username: 'admin',
      password: '',
      site: 'default',
      interval: 60,
      ignoreSsl: true,
      defaultServerPort: 4000
    }
  };
}

// Extract values with fallbacks
const serverHost = config.serverUrl?.host || '127.0.0.1';
const serverPort = config.serverUrl?.port || 3000;
const unifiHost = config.unifi?.host || '';
const unifiPort = config.unifi?.port || 443;
const unifiUsername = config.unifi?.username || 'admin';
const unifiPassword = config.unifi?.password || '';
const unifiSite = config.unifi?.site || 'default';
const unifiInterval = config.unifi?.interval || 60;
const unifiIgnoreSsl = config.unifi?.ignoreSsl !== false;
const unifiServerPort = config.unifi?.defaultServerPort || 4000;

// Create esbuild define object
// esbuild's define API requires string values that will be inlined
const defines = {
  'BUILD_CONFIG.SERVER_HOST': JSON.stringify(serverHost),
  'BUILD_CONFIG.SERVER_PORT': String(serverPort),
  'BUILD_CONFIG.UNIFI_HOST': JSON.stringify(unifiHost),
  'BUILD_CONFIG.UNIFI_PORT': String(unifiPort),
  'BUILD_CONFIG.UNIFI_USERNAME': JSON.stringify(unifiUsername),
  'BUILD_CONFIG.UNIFI_PASSWORD': JSON.stringify(unifiPassword),
  'BUILD_CONFIG.UNIFI_SITE': JSON.stringify(unifiSite),
  'BUILD_CONFIG.UNIFI_INTERVAL': String(unifiInterval),
  'BUILD_CONFIG.UNIFI_IGNORE_SSL': String(unifiIgnoreSsl),
  'BUILD_CONFIG.UNIFI_SERVER_PORT': String(unifiServerPort),
};

console.log('\n📦 Building with injected config values:');
console.log(`   Server: ${serverHost}:${serverPort}`);
console.log(`   UniFi Host: ${unifiHost || '(not set)'}`);
console.log(`   UniFi Username: ${unifiUsername}`);
console.log(`   UniFi Site: ${unifiSite}`);
console.log(`   UniFi Server: ${serverHost}:${unifiServerPort}`);
console.log('');

// Common esbuild settings
const banner = `const import_meta={url:require('url').pathToFileURL(__filename).href};`;

// Build commands
const distDir = join(rootDir, 'dist');
const clientDir = join(rootDir, 'client');

// Helper to run esbuild with JavaScript API
function runEsbuild(name, entryPoint, outfile) {
  console.log(`📦 Bundling ${name}...`);
  buildSync({
    entryPoints: [join(rootDir, entryPoint)],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    banner: { js: banner },
    define: {
      'import.meta': 'import_meta',
      ...defines
    },
    outfile: join(rootDir, outfile),
    logLevel: 'info'
  });
}

runEsbuild('client-cli.js', 'client/client-cli.js', 'dist/client-bundle.cjs');
runEsbuild('ping-monitor-cli.js', 'client/ping-monitor-cli.js', 'dist/ping-bundle.cjs');
runEsbuild('unifi-monitor.js', 'client/unifi-monitor.js', 'dist/unifi-bundle.cjs');

console.log('\n✅ All bundles created with config.js values injected');
console.log('   Next: Run pkg to create executables from bundles');
