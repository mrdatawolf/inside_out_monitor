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

// Update dashboard/src/api.js
const apiFilePath = join(rootDir, 'dashboard', 'src', 'api.js');
try {
  let apiContent = readFileSync(apiFilePath, 'utf8');

  // Replace the API URL in the production condition
  apiContent = apiContent.replace(
    /\? '.*?'  \/\/ Production - change this to your server IP/,
    `? '${config.api.url}/api'  // Production - configured from root config.js`
  );

  writeFileSync(apiFilePath, apiContent, 'utf8');
  console.log(`✅ Updated dashboard API URL: ${config.api.url}/api`);
} catch (error) {
  console.error('❌ Error updating dashboard/src/api.js:', error.message);
  process.exit(1);
}

console.log('✅ Configuration injection complete!');
