#!/usr/bin/env node

/**
 * Inside-Out Monitor Dashboard Server
 * Standalone executable that serves the React dashboard
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
let port = 5000;

// Parse arguments
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--port':
    case '-p':
      port = parseInt(args[++i]);
      break;
    case '--help':
      console.log(`
Inside-Out Monitor Dashboard Server

Usage: monitor-dashboard [options]

Options:
  -p, --port <port>        HTTP port to serve dashboard (default: 5000)
  --help                   Show this help message

Examples:
  monitor-dashboard
  monitor-dashboard --port 8080

Files Required:
  dist/                    Built React dashboard files

Note:
  The dashboard must be built first using 'npm run build' in the dashboard directory.
  The API URL is configured at build time.
`);
      process.exit(0);
    default:
      console.error(`Unknown option: ${args[i]}`);
      console.error('Use --help for usage information');
      process.exit(1);
  }
}

const app = express();

// Detect if running inside pkg executable
const isPackaged = typeof process.pkg !== 'undefined';

let distPath;

if (isPackaged) {
  // When packaged with pkg, assets are in the snapshot
  // Bundle is now in dashboard dir, so dist files are at ./dist
  distPath = join(__dirname, 'dist');
  console.log(`Running as packaged executable, serving from: ${distPath}`);
} else {
  // Development mode - find the dist directory
  const execDir = __dirname;
  const possiblePaths = [
    join(execDir, 'dist'),
    join(execDir, '..', 'dashboard', 'dist'),
    join(execDir, 'dashboard', 'dist'),
    join(process.cwd(), 'dashboard', 'dist')
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      distPath = path;
      console.log(`Found dashboard files at: ${path}`);
      break;
    }
  }

  if (!distPath) {
    console.error('ERROR: Could not find dashboard build files!');
    console.error('Tried the following locations:');
    possiblePaths.forEach(p => console.error(`  - ${p}`));
    console.error('');
    console.error('Make sure to run "npm run build" in the dashboard directory first.');
    process.exit(1);
  }
}

// Extract API URL from built JavaScript files
let apiUrl = 'Unknown';
try {
  const assetsPath = join(distPath, 'assets');
  if (existsSync(assetsPath)) {
    const files = readdirSync(assetsPath).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const content = readFileSync(join(assetsPath, file), 'utf8');
      // Look for the API_BASE constant: const bn="http://...
      const match = content.match(/const bn="(http:\/\/[^"]+)"/);
      if (match) {
        apiUrl = match[1];
        break;
      }
    }
  }
} catch (error) {
  // Ignore errors, just show Unknown
}

app.use(express.static(distPath));

// Handle React Router - serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('Inside-Out Monitor Dashboard');
  console.log('='.repeat(60));
  console.log(`  Dashboard URL: http://localhost:${port}`);
  console.log(`  Network: http://0.0.0.0:${port}`);
  console.log(`  API Server: ${apiUrl}`);
  console.log('='.repeat(60));
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');
});
