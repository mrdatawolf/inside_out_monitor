#!/usr/bin/env node

/**
 * Inside-Out Monitor Dashboard Server
 * Standalone executable that serves the React dashboard
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

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
  console.log(`  Server running at: http://localhost:${port}`);
  console.log(`  Network accessible at: http://0.0.0.0:${port}`);
  console.log('='.repeat(60));
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');
});
