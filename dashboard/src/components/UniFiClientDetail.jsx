import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchUnifiClient, fetchUnifiClientHistory } from '../api'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import './UniFiClientDetail.css'

function UniFiClientDetail() {
  const { mac } = useParams()
  const [client, setClient] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [historyHours, setHistoryHours] = useState(24)

  useEffect(() => {
    loadData()

    // Refresh every 5 seconds
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [mac, historyHours])

  async function loadData() {
    try {
      const [clientData, historyData] = await Promise.all([
        fetchUnifiClient(mac),
        fetchUnifiClientHistory(mac, historyHours)
      ])

      setClient(clientData.client)
      setHistory(historyData.history)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  function formatTimeAgo(seconds) {
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  function formatMacAddress(mac) {
    if (!mac) return 'Unknown'
    return mac.toUpperCase()
  }

  function getDeviceIcon(client) {
    if (client.is_wired) return '🖥️'

    const type = (client.device_type || '').toLowerCase()
    if (type.includes('apple')) return '🍎'
    if (type.includes('android')) return '📱'
    if (type.includes('iot')) return '💡'

    return '📡' // wireless default
  }

  function calculateThroughput(history) {
    if (history.length < 2) return []

    const data = []
    for (let i = 1; i < history.length; i++) {
      const current = history[i - 1]
      const previous = history[i]

      const timeDelta = current.timestamp - previous.timestamp
      if (timeDelta === 0) continue

      const rxDelta = current.rx_bytes - previous.rx_bytes
      const txDelta = current.tx_bytes - previous.tx_bytes

      // Convert to Mbps (bytes to bits = *8, seconds to Mbps = /1,000,000)
      const rxMbps = (rxDelta * 8) / (timeDelta * 1_000_000)
      const txMbps = (txDelta * 8) / (timeDelta * 1_000_000)

      data.push({
        time: new Date(current.timestamp * 1000).toLocaleTimeString(),
        rx_mbps: Math.max(0, rxMbps).toFixed(2),
        tx_mbps: Math.max(0, txMbps).toFixed(2)
      })
    }

    return data.reverse()
  }

  if (loading) return <div className="loading">Loading client details...</div>
  if (error) return <div className="error">Error: {error}</div>
  if (!client) return <div className="error">Client not found</div>

  const chartData = calculateThroughput(history)

  return (
    <div className="unifi-client-detail">
      <div className="detail-header">
        <Link to="/unifi" className="back-link">← Back to UniFi Clients</Link>
        <div className="header-content">
          <div className="client-icon-large">{getDeviceIcon(client)}</div>
          <div className="client-title">
            <h2>{client.hostname || client.name || 'Unknown Device'}</h2>
            {client.manufacturer && (
              <div className="client-manufacturer">{client.manufacturer}</div>
            )}
          </div>
          <div className={`status-badge ${client.is_connected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            {client.is_connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>

      {/* Client Information */}
      <div className="info-card">
        <h3>Client Information</h3>
        <div className="info-grid">
          <div className="info-item">
            <div className="info-label">MAC Address</div>
            <div className="info-value">{formatMacAddress(client.mac)}</div>
          </div>
          <div className="info-item">
            <div className="info-label">IP Address</div>
            <div className="info-value">{client.ip || '-'}</div>
          </div>
          <div className="info-item">
            <div className="info-label">Connection Type</div>
            <div className="info-value">
              {client.is_wired ? '🖥️ Wired' : '📡 Wireless'}
            </div>
          </div>
          <div className="info-item">
            <div className="info-label">Last Seen</div>
            <div className="info-value">{formatTimeAgo(client.last_seen_ago)}</div>
          </div>
          {!client.is_wired && client.signal && (
            <div className="info-item">
              <div className="info-label">Signal Strength</div>
              <div className="info-value">{client.signal} dBm</div>
            </div>
          )}
          {client.device_type && (
            <div className="info-item">
              <div className="info-label">Device Type</div>
              <div className="info-value">{client.device_type}</div>
            </div>
          )}
        </div>
      </div>

      {/* Traffic Statistics */}
      <div className="info-card">
        <h3>Traffic Statistics</h3>
        <div className="info-grid">
          <div className="info-item">
            <div className="info-label">Total Downloaded</div>
            <div className="info-value">{formatBytes(client.rx_bytes)}</div>
          </div>
          <div className="info-item">
            <div className="info-label">Total Uploaded</div>
            <div className="info-value">{formatBytes(client.tx_bytes)}</div>
          </div>
          <div className="info-item">
            <div className="info-label">Total Traffic</div>
            <div className="info-value">
              {formatBytes((client.rx_bytes || 0) + (client.tx_bytes || 0))}
            </div>
          </div>
        </div>
      </div>

      {/* Throughput History Chart */}
      {chartData.length > 0 && (
        <div className="chart-card">
          <div className="chart-header">
            <h3>Network Throughput History</h3>
            <div className="history-controls">
              <button
                className={historyHours === 1 ? 'active' : ''}
                onClick={() => setHistoryHours(1)}
              >
                1h
              </button>
              <button
                className={historyHours === 6 ? 'active' : ''}
                onClick={() => setHistoryHours(6)}
              >
                6h
              </button>
              <button
                className={historyHours === 24 ? 'active' : ''}
                onClick={() => setHistoryHours(24)}
              >
                24h
              </button>
              <button
                className={historyHours === 168 ? 'active' : ''}
                onClick={() => setHistoryHours(168)}
              >
                7d
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="time"
                stroke="#888"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                stroke="#888"
                label={{ value: 'Mbps', angle: -90, position: 'insideLeft' }}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #333'
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="rx_mbps"
                stroke="#4ade80"
                name="Download (Mbps)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="tx_mbps"
                stroke="#60a5fa"
                name="Upload (Mbps)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Last Updated Timestamp */}
      {lastUpdated && (
        <div className="last-updated">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}

export default UniFiClientDetail
