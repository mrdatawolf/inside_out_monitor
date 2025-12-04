const API_BASE = import.meta.env.PROD
  ? 'http://192.168.203.241:3000/api'  // Production - configured from root config.js
  : '/api';  // Development - uses Vite proxy

// Export API_BASE for use in window title
export const API_URL = API_BASE;

export async function fetchDevices() {
  const response = await fetch(`${API_BASE}/devices`);
  if (!response.ok) throw new Error('Failed to fetch devices');
  return response.json();
}

export async function fetchDevice(name) {
  const response = await fetch(`${API_BASE}/devices/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error('Failed to fetch device');
  return response.json();
}

export async function fetchDeviceHistory(name, hours = 24) {
  const response = await fetch(`${API_BASE}/devices/${encodeURIComponent(name)}/history?hours=${hours}`);
  if (!response.ok) throw new Error('Failed to fetch device history');
  return response.json();
}

export async function fetchDeviceInterfaces(name, limit = 50) {
  const response = await fetch(`${API_BASE}/devices/${encodeURIComponent(name)}/interfaces?limit=${limit}`);
  if (!response.ok) throw new Error('Failed to fetch device interfaces');
  return response.json();
}

export async function fetchStats() {
  const response = await fetch(`${API_BASE}/stats`);
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

export async function fetchHealth() {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) throw new Error('Failed to fetch health');
  return response.json();
}

// Ping monitoring endpoints
export async function fetchPingMonitors() {
  const response = await fetch(`${API_BASE}/ping-monitors`);
  if (!response.ok) throw new Error('Failed to fetch ping monitors');
  return response.json();
}

export async function fetchPingTargets() {
  const response = await fetch(`${API_BASE}/ping-targets`);
  if (!response.ok) throw new Error('Failed to fetch ping targets');
  return response.json();
}

export async function fetchPingTargetHistory(ip, hours = 24, limit = 100) {
  const response = await fetch(`${API_BASE}/ping-targets/${encodeURIComponent(ip)}/history?hours=${hours}&limit=${limit}`);
  if (!response.ok) throw new Error('Failed to fetch ping target history');
  return response.json();
}

export async function fetchPingStats() {
  const response = await fetch(`${API_BASE}/ping-stats`);
  if (!response.ok) throw new Error('Failed to fetch ping stats');
  return response.json();
}
