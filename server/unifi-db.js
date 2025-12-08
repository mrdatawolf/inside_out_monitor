import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// In pkg executables, __dirname points to snapshot. Use process.cwd() or derive from execPath
const __dirname = process.pkg ? dirname(process.execPath) : dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'databases', 'unifi.sqlite3');

let unifiDb = null;
let SQL = null;

// Initialize UniFi database
export async function initUnifiDb() {
  // Load WASM file manually to work with pkg bundler
  const wasmPath = join(__dirname, 'sql-wasm.wasm');
  const wasmBinary = readFileSync(wasmPath);

  // Initialize SQL.js with the WASM binary
  SQL = await initSqlJs({
    wasmBinary: wasmBinary
  });

  // Ensure databases directory exists
  const dbDir = join(__dirname, 'databases');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Load existing database or create new one
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    unifiDb = new SQL.Database(buffer);
    console.log('✓ UniFi database loaded from disk');
  } else {
    unifiDb = new SQL.Database();
    console.log('✓ New UniFi database created');
  }

  // Create UniFi clients table
  unifiDb.run(`
    CREATE TABLE IF NOT EXISTS unifi_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mac TEXT NOT NULL,
      ip TEXT,
      hostname TEXT,
      name TEXT,
      manufacturer TEXT,
      device_type TEXT,
      is_wired INTEGER NOT NULL,
      rx_bytes INTEGER,
      tx_bytes INTEGER,
      rx_rate INTEGER,
      tx_rate INTEGER,
      signal INTEGER,
      channel INTEGER,
      essid TEXT,
      is_connected INTEGER NOT NULL,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      received_at INTEGER NOT NULL
    )
  `);

  unifiDb.run(`CREATE INDEX IF NOT EXISTS idx_unifi_mac ON unifi_clients(mac)`);
  unifiDb.run(`CREATE INDEX IF NOT EXISTS idx_unifi_connected ON unifi_clients(is_connected)`);
  unifiDb.run(`CREATE INDEX IF NOT EXISTS idx_unifi_received_at ON unifi_clients(received_at)`);

  // Create UniFi connection events table
  unifiDb.run(`
    CREATE TABLE IF NOT EXISTS unifi_connection_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mac TEXT NOT NULL,
      event_type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      hostname TEXT,
      ip TEXT
    )
  `);

  unifiDb.run(`CREATE INDEX IF NOT EXISTS idx_event_mac ON unifi_connection_events(mac)`);
  unifiDb.run(`CREATE INDEX IF NOT EXISTS idx_event_time ON unifi_connection_events(timestamp)`);

  // Create UniFi client states table for tracking connection status
  unifiDb.run(`
    CREATE TABLE IF NOT EXISTS unifi_client_states (
      mac TEXT PRIMARY KEY,
      hostname TEXT,
      ip TEXT,
      is_connected INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      last_state_change INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  unifiDb.run(`CREATE INDEX IF NOT EXISTS idx_client_state_connected ON unifi_client_states(is_connected)`);

  console.log('✓ UniFi database schema initialized');

  // Save database to disk to ensure file is created
  saveUnifiDb();

  // Auto-save every 5 minutes
  setInterval(() => {
    saveUnifiDb();
  }, 5 * 60 * 1000);
}

// Save UniFi database to disk
export function saveUnifiDb() {
  if (!unifiDb) return;

  try {
    const data = unifiDb.export();
    const buffer = Buffer.from(data);
    writeFileSync(dbPath, buffer);
    console.log('✓ UniFi database saved to disk');
  } catch (error) {
    console.error('⚠ Failed to save UniFi database:', error.message);
  }
}

// Insert UniFi client data
export function insertUnifiClients(clients, timestamp) {
  if (!unifiDb) {
    throw new Error('UniFi database not initialized');
  }

  const receivedAt = Math.floor(Date.now() / 1000);

  for (const client of clients) {
    // Insert client snapshot
    unifiDb.run(
      `INSERT INTO unifi_clients
       (mac, ip, hostname, name, manufacturer, device_type, is_wired,
        rx_bytes, tx_bytes, rx_rate, tx_rate, signal, channel, essid,
        is_connected, first_seen, last_seen, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        client.mac,
        client.ip || null,
        client.hostname || null,
        client.name || null,
        client.manufacturer || null,
        client.device_type || null,
        client.is_wired ? 1 : 0,
        client.rx_bytes || 0,
        client.tx_bytes || 0,
        client.rx_rate || 0,
        client.tx_rate || 0,
        client.signal || null,
        client.channel || null,
        client.essid || null,
        1, // is_connected
        client.first_seen || timestamp,
        client.last_seen || timestamp,
        receivedAt
      ]
    );

    // Update or insert client state
    updateUnifiClientState(client.mac, client.hostname, client.ip, true, timestamp, receivedAt);
  }

  // Save immediately after insert
  saveUnifiDb();
}

// Update UniFi client state and track connection/disconnection events
function updateUnifiClientState(mac, hostname, ip, isConnected, timestamp, now) {
  if (!unifiDb) return;

  try {
    // Get existing state
    const stateResult = unifiDb.exec(`
      SELECT * FROM unifi_client_states WHERE mac = ?
    `, [mac]);

    const existingState = stateResult && stateResult.length > 0 ? sqlToJson(stateResult)[0] : null;

    if (!existingState) {
      // New client - insert state and log connection event
      unifiDb.run(`
        INSERT INTO unifi_client_states
        (mac, hostname, ip, is_connected, last_seen, last_state_change, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [mac, hostname, ip, isConnected ? 1 : 0, timestamp, now, now]);

      // Log connection event
      logConnectionEvent(mac, 'connected', timestamp, hostname, ip);

    } else {
      const wasConnected = existingState.is_connected === 1;

      if (wasConnected !== isConnected) {
        // State changed
        unifiDb.run(`
          UPDATE unifi_client_states
          SET hostname = ?, ip = ?, is_connected = ?, last_seen = ?, last_state_change = ?, updated_at = ?
          WHERE mac = ?
        `, [hostname, ip, isConnected ? 1 : 0, timestamp, now, now, mac]);

        // Log event
        logConnectionEvent(mac, isConnected ? 'connected' : 'disconnected', timestamp, hostname, ip);

      } else {
        // No state change, just update last_seen
        unifiDb.run(`
          UPDATE unifi_client_states
          SET hostname = ?, ip = ?, last_seen = ?, updated_at = ?
          WHERE mac = ?
        `, [hostname, ip, timestamp, now, mac]);
      }
    }

  } catch (error) {
    console.error(`Error updating UniFi client state for ${mac}:`, error.message);
  }
}

// Log connection event
function logConnectionEvent(mac, eventType, timestamp, hostname, ip) {
  if (!unifiDb) return;

  try {
    unifiDb.run(`
      INSERT INTO unifi_connection_events (mac, event_type, timestamp, hostname, ip)
      VALUES (?, ?, ?, ?, ?)
    `, [mac, eventType, timestamp, hostname, ip]);
  } catch (error) {
    console.error(`Error logging connection event for ${mac}:`, error.message);
  }
}

// Mark clients as disconnected (called periodically to detect disconnections)
export function markDisconnectedClients(onlineThresholdSeconds = 600) {
  if (!unifiDb) return;

  const now = Math.floor(Date.now() / 1000);
  const threshold = now - onlineThresholdSeconds;

  try {
    // Get all currently "connected" clients that haven't been seen recently
    const result = unifiDb.exec(`
      SELECT mac, hostname, ip, last_seen
      FROM unifi_client_states
      WHERE is_connected = 1 AND last_seen < ?
    `, [threshold]);

    if (!result || result.length === 0) return;

    const staleClients = sqlToJson(result);

    for (const client of staleClients) {
      // Mark as disconnected
      unifiDb.run(`
        UPDATE unifi_client_states
        SET is_connected = 0, last_state_change = ?, updated_at = ?
        WHERE mac = ?
      `, [now, now, client.mac]);

      // Log disconnection event
      logConnectionEvent(client.mac, 'disconnected', now, client.hostname, client.ip);
    }

    if (staleClients.length > 0) {
      console.log(`📴 Marked ${staleClients.length} UniFi client(s) as disconnected`);
      saveUnifiDb();
    }

  } catch (error) {
    console.error('Error marking disconnected clients:', error.message);
  }
}

// Get UniFi database
export function getUnifiDb() {
  return unifiDb;
}

// Helper function to convert sql.js results to JSON
function sqlToJson(result) {
  if (!result || result.length === 0) return [];

  const columns = result[0].columns;
  const values = result[0].values;

  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}
