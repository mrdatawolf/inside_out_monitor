#!/usr/bin/env node

/**
 * UniFi Site Discovery Test
 * Discovers available sites on your UniFi controller
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import https from 'https';

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
  console.error(`   Details: ${error.message}`);
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('🔷 UniFi Site Discovery');
console.log('='.repeat(70));

const baseUrl = `https://${config.unifi.host}:${config.unifi.port || 443}`;
let cookie = null;

/**
 * Make HTTP request
 */
function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      rejectUnauthorized: !config.unifi.ignoreSsl
    };

    if (cookie) {
      options.headers['Cookie'] = cookie;
    }

    const req = https.request(url, options, (res) => {
      let body = '';

      if (res.headers['set-cookie']) {
        cookie = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
      }

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(body);
            resolve({ status: res.statusCode, data: json });
          } catch (error) {
            resolve({ status: res.statusCode, data: body });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Step 1: Login
console.log('\n🔐 Step 1: Logging in...');
console.log(`   Host: ${config.unifi.host}`);
console.log(`   Username: ${config.unifi.username}`);

try {
  const loginResponse = await request('POST', '/api/auth/login', {
    username: config.unifi.username,
    password: config.unifi.password,
    remember: false
  });

  // UniFi OS returns user data directly (no meta.rc field)
  if ((loginResponse.data.meta && loginResponse.data.meta.rc === 'ok') || loginResponse.data.username) {
    console.log('   ✅ Login successful!');
  } else {
    console.log('   ❌ Login failed');
    console.log('   Response:', JSON.stringify(loginResponse.data, null, 2));
    process.exit(1);
  }
} catch (error) {
  console.log('   ❌ Login failed:', error.message);
  process.exit(1);
}

// Step 2: Get list of sites
console.log('\n📋 Step 2: Fetching available sites...');

try {
  // Try the UniFi OS endpoint first
  const sitesResponse = await request('GET', '/proxy/network/api/self/sites');

  if (sitesResponse.data.meta && sitesResponse.data.meta.rc === 'ok') {
    const sites = sitesResponse.data.data;

    console.log(`   ✅ Found ${sites.length} site(s):\n`);

    sites.forEach((site, index) => {
      console.log(`   ${index + 1}. Site Name: "${site.name}" (Display: "${site.desc}")`);
      console.log(`      - Site ID: ${site._id}`);
      console.log(`      - Role: ${site.role}`);
      console.log(`      - Attr Hidden ID: ${site.attr_hidden_id || 'N/A'}`);
      console.log('');
    });

    console.log('='.repeat(70));
    console.log('💡 What to do next:');
    console.log('='.repeat(70));

    if (sites.length === 1) {
      const site = sites[0];
      console.log(`\n✅ You have one site. Use this in your config.js:\n`);
      console.log(`   unifi: {`);
      console.log(`     ...`);
      console.log(`     site: '${site.name}',  // <-- Update this`);
      console.log(`     ...`);
      console.log(`   }\n`);

      if (config.unifi.site !== site.name) {
        console.log(`⚠️  Your config currently has: site: '${config.unifi.site}'`);
        console.log(`   Change it to: site: '${site.name}'\n`);
      }
    } else {
      console.log(`\n📌 You have multiple sites. Choose the correct one:\n`);
      console.log(`   Update config.js with the site "name" (not the display name):\n`);
      console.log(`   unifi: {`);
      console.log(`     ...`);
      console.log(`     site: 'YOUR_SITE_NAME_HERE',  // Use the "Site Name" value from above`);
      console.log(`     ...`);
      console.log(`   }\n`);
      console.log(`   Current config value: '${config.unifi.site}'\n`);
    }

  } else {
    console.log('   ❌ Unexpected response format');
    console.log('   Response:', JSON.stringify(sitesResponse.data, null, 2));
  }

} catch (error) {
  console.log('   ❌ Failed to fetch sites:', error.message);

  // Try alternative endpoint
  console.log('\n   Trying alternative endpoint...');
  try {
    const altResponse = await request('GET', '/api/self/sites');
    console.log('   Response:', JSON.stringify(altResponse.data, null, 2));
  } catch (altError) {
    console.log('   ❌ Alternative endpoint also failed:', altError.message);
  }
}

// Logout
try {
  await request('POST', '/api/auth/logout');
  console.log('\n🚪 Logged out successfully\n');
} catch (error) {
  console.log('\n⚠️  Logout warning:', error.message, '\n');
}
