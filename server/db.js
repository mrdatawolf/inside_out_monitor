import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// In pkg executables, __dirname points to snapshot. Use process.cwd() or derive from execPath
const __dirname = process.pkg ? dirname(process.execPath) : dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'databases', 'heartbeats.sqlite3');

let db = null;
let SQL = null;

// Initialize database
export async function initDb() {
  // Load WASM file manually to work with pkg bundler
  const wasmPath = join(__dirname, 'sql-wasm.wasm');
  const wasmBinary = readFileSync(wasmPath);

  // Initialize SQL.js with the WASM binary
  SQL = await initSqlJs({
    wasmBinary: wasmBinary
  });

  // Load existing database or create new one
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('✓ Database loaded from disk');
  } else {
    db = new SQL.Database();
    console.log('✓ New database created');
  }

  // Create heartbeats table
  db.run(`
    CREATE TABLE IF NOT EXISTS heartbeats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_name TEXT NOT NULL,
      device_timestamp INTEGER NOT NULL,
      received_at INTEGER NOT NULL
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_device_name ON heartbeats(device_name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_received_at ON heartbeats(received_at)`);

  // Create network interfaces table
  db.run(`
    CREATE TABLE IF NOT EXISTS network_interfaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      heartbeat_id INTEGER NOT NULL,
      interface_name TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      rx_bytes INTEGER NOT NULL,
      tx_bytes INTEGER NOT NULL,
      max_speed_mbps INTEGER NOT NULL,
      FOREIGN KEY (heartbeat_id) REFERENCES heartbeats(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_heartbeat_id ON network_interfaces(heartbeat_id)`);

  // Create ping results table
  db.run(`
    CREATE TABLE IF NOT EXISTS ping_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_name TEXT NOT NULL,
      target_ip TEXT NOT NULL,
      target_name TEXT,
      status TEXT NOT NULL,
      response_time_ms REAL,
      timestamp INTEGER NOT NULL,
      received_at INTEGER NOT NULL
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_monitor_name ON ping_results(monitor_name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_target_ip ON ping_results(target_ip)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ping_received_at ON ping_results(received_at)`);

  console.log('✓ Database schema initialized');

  // Auto-save every 5 minutes
  setInterval(() => {
    saveDb();
  }, 5 * 60 * 1000);

  // Save on exit
  process.on('SIGINT', () => {
    console.log('\n⚠ Shutting down...');
    saveDb();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    saveDb();
    process.exit(0);
  });
}

// Save database to disk
export function saveDb() {
  if (!db) return;

  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(dbPath, buffer);
    console.log('✓ Database saved to disk');
  } catch (error) {
    console.error('⚠ Failed to save database:', error.message);
  }
}

// Insert heartbeat with optional network interfaces
export function insertHeartbeat(deviceName, deviceTimestamp, receivedAt, networkInterfaces = []) {
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Insert heartbeat
  db.run(
    'INSERT INTO heartbeats (device_name, device_timestamp, received_at) VALUES (?, ?, ?)',
    [deviceName, deviceTimestamp, receivedAt]
  );

  // Get the last inserted ID
  const result = db.exec('SELECT last_insert_rowid() as id');
  const heartbeatId = result[0].values[0][0];

  // Insert network interfaces
  if (networkInterfaces && networkInterfaces.length > 0) {
    for (const iface of networkInterfaces) {
      db.run(
        `INSERT INTO network_interfaces
         (heartbeat_id, interface_name, ip_address, rx_bytes, tx_bytes, max_speed_mbps)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          heartbeatId,
          iface.name || 'unknown',
          iface.ip || 'unknown',
          iface.rx_bytes || 0,
          iface.tx_bytes || 0,
          iface.max_speed_mbps || 0
        ]
      );
    }
  }

  // Save immediately after insert (for durability)
  // In production, you might batch these or use the interval timer only
  saveDb();
}

// Insert ping results
export function insertPingResults(monitorName, timestamp, results) {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const receivedAt = Math.floor(Date.now() / 1000);

  for (const result of results) {
    db.run(
      `INSERT INTO ping_results
       (monitor_name, target_ip, target_name, status, response_time_ms, timestamp, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        monitorName,
        result.ip,
        result.name || result.ip,
        result.status,
        result.response_time_ms,
        timestamp,
        receivedAt
      ]
    );
  }

  // Save immediately after insert
  saveDb();
}

export function getDb() {
  return db;
}
