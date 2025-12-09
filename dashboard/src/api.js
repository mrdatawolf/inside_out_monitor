// Embedded API read key for authentication (Phase 7: Multi-Site Support)
// This is injected during build from api_read.key file
let embeddedApiReadKey = 'PLACEHOLDER_API_READ_KEY';

const API_BASE = import.meta.env.PROD
  ? 'http://192.168.203.241:3000/api'  // Production - configured from root config.js
  : '/api';  // Development - uses Vite proxy

// Export API_BASE for use in window title
export const API_URL = API_BASE;

// Helper function to add API key header to fetch requests
function fetchWithAuth(url, options = {}) {
  const headers = {
    ...options.headers,
    'X-API-Key': embeddedApiReadKey
  };
  return fetch(url, { ...options, headers });
}

export async function fetchDevices() {
  const response = await fetchWithAuth(`${API_BASE}/devices`);
  if (!response.ok) throw new Error('Failed to fetch devices');
  return response.json();
}

export async function fetchDevice(name) {
  const response = await fetchWithAuth(`${API_BASE}/devices/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error('Failed to fetch device');
  return response.json();
}

export async function fetchDeviceHistory(name, hours = 24) {
  const response = await fetchWithAuth(`${API_BASE}/devices/${encodeURIComponent(name)}/history?hours=${hours}`);
  if (!response.ok) throw new Error('Failed to fetch device history');
  return response.json();
}

export async function fetchDeviceInterfaces(name, limit = 50) {
  const response = await fetchWithAuth(`${API_BASE}/devices/${encodeURIComponent(name)}/interfaces?limit=${limit}`);
  if (!response.ok) throw new Error('Failed to fetch device interfaces');
  return response.json();
}

export async function fetchStats() {
  const response = await fetchWithAuth(`${API_BASE}/stats`);
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

export async function fetchHealth() {
  const response = await fetchWithAuth(`${API_BASE}/health`);
  if (!response.ok) throw new Error('Failed to fetch health');
  return response.json();
}

// Ping monitoring endpoints
export async function fetchPingMonitors() {
  const response = await fetchWithAuth(`${API_BASE}/ping-monitors`);
  if (!response.ok) throw new Error('Failed to fetch ping monitors');
  return response.json();
}

export async function fetchPingTargets() {
  const response = await fetchWithAuth(`${API_BASE}/ping-targets`);
  if (!response.ok) throw new Error('Failed to fetch ping targets');
  return response.json();
}

export async function fetchPingTargetHistory(ip, hours = 24, limit = 100) {
  const response = await fetchWithAuth(`${API_BASE}/ping-targets/${encodeURIComponent(ip)}/history?hours=${hours}&limit=${limit}`);
  if (!response.ok) throw new Error('Failed to fetch ping target history');
  return response.json();
}

export async function fetchPingStats() {
  const response = await fetchWithAuth(`${API_BASE}/ping-stats`);
  if (!response.ok) throw new Error('Failed to fetch ping stats');
  return response.json();
}

// UniFi monitoring endpoints
export async function fetchUnifiClients() {
  const response = await fetchWithAuth(`${API_BASE}/unifi/clients`);
  if (!response.ok) throw new Error('Failed to fetch UniFi clients');
  return response.json();
}

export async function fetchUnifiClient(mac) {
  const response = await fetchWithAuth(`${API_BASE}/unifi/clients/${encodeURIComponent(mac)}`);
  if (!response.ok) throw new Error('Failed to fetch UniFi client');
  return response.json();
}

export async function fetchUnifiClientHistory(mac, hours = 24) {
  const response = await fetchWithAuth(`${API_BASE}/unifi/clients/${encodeURIComponent(mac)}/history?hours=${hours}`);
  if (!response.ok) throw new Error('Failed to fetch UniFi client history');
  return response.json();
}

export async function fetchUnifiStats() {
  const response = await fetchWithAuth(`${API_BASE}/unifi/stats`);
  if (!response.ok) throw new Error('Failed to fetch UniFi stats');
  return response.json();
}

// ============================================================================
// UNIFI REPORTING ENDPOINTS
// ============================================================================

// REPORT 1: Network Health Overview
export async function fetchNetworkHealthOverview(period = '24h') {
  const url = `${API_BASE}/reports/unifi/overview?period=${period}`;
  try {
    const response = await fetchWithAuth(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch network health overview from ${url} - Status: ${response.status} ${response.statusText} - ${errorText}`);
    }
    return response.json();
  } catch (error) {
    if (error.message.includes('fetch')) {
      throw new Error(`Network error fetching ${url}: ${error.message}`);
    }
    throw error;
  }
}

// REPORT 2: Connection Stability Reports
export async function fetchFlappingDevices(threshold = 10, period = '24h') {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/flapping-devices?threshold=${threshold}&period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch flapping devices');
  return response.json();
}

export async function fetchUptimeStats(sort = 'desc', limit = 50, period = '7d') {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/uptime-stats?sort=${sort}&limit=${limit}&period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch uptime stats');
  return response.json();
}

export async function fetchConnectionQuality(period = '7d') {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/connection-quality?period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch connection quality');
  return response.json();
}

// REPORT 3: Wireless Network Quality
export async function fetchSignalDistribution(threshold = -70) {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/signal-distribution?threshold=${threshold}`);
  if (!response.ok) throw new Error('Failed to fetch signal distribution');
  return response.json();
}

export async function fetchPoorSignalDevices(threshold = -70, limit = 50) {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/poor-signal-devices?threshold=${threshold}&limit=${limit}`);
  if (!response.ok) throw new Error('Failed to fetch poor signal devices');
  return response.json();
}

export async function fetchChannelUtilization() {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/channel-utilization`);
  if (!response.ok) throw new Error('Failed to fetch channel utilization');
  return response.json();
}

// REPORT 4: Device Inventory & Discovery
export async function fetchDeviceInventory(status = 'all', period = '30d') {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/inventory?status=${status}&period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch device inventory');
  return response.json();
}

export async function fetchNewDevices(period = '7d') {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/new-devices?period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch new devices');
  return response.json();
}

export async function fetchInactiveDevices(threshold = 30) {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/inactive-devices?threshold=${threshold}`);
  if (!response.ok) throw new Error('Failed to fetch inactive devices');
  return response.json();
}

export async function fetchManufacturerBreakdown() {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/manufacturer-breakdown`);
  if (!response.ok) throw new Error('Failed to fetch manufacturer breakdown');
  return response.json();
}

// REPORT 5: Time-Based Analytics
export async function fetchConnectionTimeline(period = '7d', interval = 'hourly') {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/connection-timeline?period=${period}&interval=${interval}`);
  if (!response.ok) throw new Error('Failed to fetch connection timeline');
  return response.json();
}

export async function fetchPeakHours(period = '30d') {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/peak-hours?period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch peak hours');
  return response.json();
}

export async function fetchSessionDuration(groupBy = 'device_type') {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/session-duration?groupBy=${groupBy}`);
  if (!response.ok) throw new Error('Failed to fetch session duration');
  return response.json();
}

// REPORT 6: Alerting & Incident Reports
export async function fetchEventTimeline(period = '24h', type = 'all') {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/event-timeline?period=${period}&type=${type}`);
  if (!response.ok) throw new Error('Failed to fetch event timeline');
  return response.json();
}

export async function fetchMassEvents(threshold = 5, period = '7d') {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/mass-events?threshold=${threshold}&period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch mass events');
  return response.json();
}

// REPORT 7: Bandwidth & Traffic Analysis
export async function fetchTopConsumers(limit = 20, period = '7d', metric = 'total') {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/top-consumers?limit=${limit}&period=${period}&metric=${metric}`);
  if (!response.ok) throw new Error('Failed to fetch top consumers');
  return response.json();
}

export async function fetchTrafficPatterns(period = '7d') {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/traffic-patterns?period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch traffic patterns');
  return response.json();
}

export async function fetchBandwidthHeatmap(period = '7d') {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/bandwidth-heatmap?period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch bandwidth heatmap');
  return response.json();
}

// REPORT 8: Security & Compliance
export async function fetchUnknownDevices() {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/unknown-devices`);
  if (!response.ok) throw new Error('Failed to fetch unknown devices');
  return response.json();
}

export async function fetchSuspiciousPatterns(threshold = 20) {
  const response = await fetchWithAuth(`${API_BASE}/reports/unifi/suspicious-patterns?threshold=${threshold}`);
  if (!response.ok) throw new Error('Failed to fetch suspicious patterns');
  return response.json();
}
