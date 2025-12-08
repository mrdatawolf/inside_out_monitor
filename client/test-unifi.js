#!/usr/bin/env node

/**
 * UniFi Connection Test Suite
 * Tests connection to UniFi Dream Router and displays retrieved data
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { UniFiAPI } from './unifi-api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load configuration
let config;
try {
  const configPath = join(dirname(__dirname), 'config.js');
  const configUrl = pathToFileURL(configPath).href;
  const configModule = await import(configUrl);
  config = configModule.default;
} catch (error) {
  console.error('❌ ERROR: Failed to load config.js');
  console.error('   Make sure config.js exists in the project root');
  console.error(`   Details: ${error.message}`);
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('🔷 UniFi Connection Test Suite');
console.log('='.repeat(70));

// Display configuration
console.log('\n📋 Configuration from config.js:');
console.log(`   UniFi Enabled: ${config.unifi?.enabled}`);
console.log(`   Host: ${config.unifi?.host || 'NOT SET'}`);
console.log(`   Port: ${config.unifi?.port || 'NOT SET'}`);
console.log(`   Username: ${config.unifi?.username || 'NOT SET'}`);
console.log(`   Password: ${config.unifi?.password ? '***SET***' : 'NOT SET'}`);
console.log(`   Site: ${config.unifi?.site || 'NOT SET'}`);
console.log(`   Ignore SSL: ${config.unifi?.ignoreSsl}`);

// Validate configuration
console.log('\n🔍 Validating configuration...');
const errors = [];

if (!config.unifi) {
  errors.push('UniFi section missing from config.js');
} else {
  if (!config.unifi.host || config.unifi.host === 'YOUR_UNIFI_HOST') {
    errors.push('UniFi host not configured');
  }
  if (!config.unifi.password) {
    errors.push('UniFi password not configured');
  }
  if (!config.unifi.username) {
    errors.push('UniFi username not configured (using default: admin)');
  }
}

if (errors.length > 0) {
  console.log('❌ Configuration errors found:');
  errors.forEach(err => console.log(`   - ${err}`));
  console.log('\n💡 Please update config.js with your UniFi Dream Router credentials');
  process.exit(1);
}

console.log('✅ Configuration valid');

// Initialize UniFi API client
const unifiApi = new UniFiAPI({
  host: config.unifi.host,
  port: config.unifi.port || 443,
  username: config.unifi.username || 'admin',
  password: config.unifi.password,
  site: config.unifi.site || 'default',
  ignoreSsl: config.unifi.ignoreSsl !== false
});

// Test 1: DNS/Network connectivity
console.log('\n' + '='.repeat(70));
console.log('🌐 Test 1: Network Connectivity');
console.log('='.repeat(70));

try {
  console.log(`Testing connectivity to ${config.unifi.host}:${config.unifi.port || 443}...`);
  const testResult = await unifiApi.testConnection();

  if (testResult) {
    console.log('✅ Network connectivity OK');
  } else {
    console.log('❌ Connection test failed');
    console.log('   Possible issues:');
    console.log('   - Host unreachable (DNS, firewall, network)');
    console.log('   - UniFi controller not running');
    console.log('   - Port blocked');
    process.exit(1);
  }
} catch (error) {
  console.log('❌ Connection test threw error:');
  console.log(`   ${error.message}`);
  if (error.code) console.log(`   Error code: ${error.code}`);
  process.exit(1);
}

// Test 2: Authentication
console.log('\n' + '='.repeat(70));
console.log('🔐 Test 2: Authentication');
console.log('='.repeat(70));

try {
  console.log('Attempting to login...');
  await unifiApi.login();
  console.log('✅ Authentication successful');
  console.log(`   Logged in as: ${config.unifi.username}`);
  console.log(`   Site: ${config.unifi.site || 'default'}`);
} catch (error) {
  console.log('❌ Authentication failed:');
  console.log(`   ${error.message}`);
  console.log('\n   Possible issues:');
  console.log('   - Incorrect username or password');
  console.log('   - User account disabled');
  console.log('   - Two-factor authentication enabled (not supported)');
  console.log('   - API access disabled');
  process.exit(1);
}

// Test 3: Retrieve active clients
console.log('\n' + '='.repeat(70));
console.log('👥 Test 3: Active Clients');
console.log('='.repeat(70));

try {
  console.log('Fetching active clients...');
  const activeClients = await unifiApi.getActiveClients();

  console.log(`✅ Retrieved ${activeClients.length} active client(s)`);

  if (activeClients.length === 0) {
    console.log('\n⚠️  No active clients found');
    console.log('   This might be normal if no devices are currently connected');
  } else {
    console.log('\n📊 Client Summary:');
    const wiredClients = activeClients.filter(c => c.is_wired);
    const wirelessClients = activeClients.filter(c => !c.is_wired);
    console.log(`   Wired: ${wiredClients.length}`);
    console.log(`   Wireless: ${wirelessClients.length}`);

    // Show raw data for first client
    console.log('\n🔍 Raw data from first client:');
    console.log(JSON.stringify(activeClients[0], null, 2));

    // Parse and show formatted data
    console.log('\n📋 Parsed client data:');
    console.log('─'.repeat(70));

    activeClients.slice(0, 5).forEach((client, i) => {
      const parsed = unifiApi.parseClient(client);
      console.log(`\nClient ${i + 1}:`);
      console.log(`  MAC: ${parsed.mac}`);
      console.log(`  Hostname: ${parsed.hostname || 'Unknown'}`);
      console.log(`  IP: ${parsed.ip || 'N/A'}`);
      console.log(`  Type: ${parsed.is_wired ? 'Wired' : 'Wireless'}`);
      console.log(`  Manufacturer: ${parsed.manufacturer || 'Unknown'}`);
      console.log(`  Device Type: ${parsed.device_type || 'Unknown'}`);
      if (!parsed.is_wired && parsed.signal) {
        console.log(`  Signal: ${parsed.signal} dBm`);
      }
      console.log(`  RX: ${formatBytes(parsed.rx_bytes)}`);
      console.log(`  TX: ${formatBytes(parsed.tx_bytes)}`);
    });

    if (activeClients.length > 5) {
      console.log(`\n... and ${activeClients.length - 5} more clients`);
    }
  }

} catch (error) {
  console.log('❌ Failed to retrieve active clients:');
  console.log(`   ${error.message}`);
  console.log('\n   Possible issues:');
  console.log('   - Insufficient permissions');
  console.log('   - Site name incorrect');
  console.log('   - API endpoint changed');
  if (error.response) {
    console.log(`   HTTP Status: ${error.response.status}`);
  }
  process.exit(1);
}

// Test 4: Retrieve all clients (historical)
console.log('\n' + '='.repeat(70));
console.log('📚 Test 4: All Clients (Historical)');
console.log('='.repeat(70));

try {
  console.log('Fetching all known clients...');
  const allClients = await unifiApi.getAllClients();

  console.log(`✅ Retrieved ${allClients.length} total client(s)`);

  const connected = allClients.filter(c => c.is_connected);
  const disconnected = allClients.filter(c => !c.is_connected);

  console.log('\n📊 Summary:');
  console.log(`   Currently connected: ${connected.length}`);
  console.log(`   Previously connected: ${disconnected.length}`);

  if (disconnected.length > 0) {
    console.log('\n🔌 Sample of disconnected clients:');
    disconnected.slice(0, 3).forEach((client, i) => {
      const parsed = unifiApi.parseClient(client);
      console.log(`\n  ${i + 1}. ${parsed.hostname || parsed.mac}`);
      console.log(`     MAC: ${parsed.mac}`);
      console.log(`     Last seen: ${formatTimeAgo(parsed.last_seen_ago)}`);
    });
  }

} catch (error) {
  console.log('❌ Failed to retrieve all clients:');
  console.log(`   ${error.message}`);
}

// Logout
console.log('\n' + '='.repeat(70));
console.log('🚪 Logging out...');
try {
  await unifiApi.logout();
  console.log('✅ Logged out successfully');
} catch (error) {
  console.log('⚠️  Logout warning: ' + error.message);
}

// Final summary
console.log('\n' + '='.repeat(70));
console.log('✅ All tests completed successfully!');
console.log('='.repeat(70));
console.log('\n💡 Your UniFi integration is properly configured');
console.log('   You can now run the unifi-monitor to start sending data to the server\n');

// Helper functions
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatTimeAgo(seconds) {
  if (!seconds) return 'unknown';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
