import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchDevice, fetchDeviceInterfaces } from '../api'
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
import './DeviceDetail.css'

function DeviceDetail() {
  const { name } = useParams()
  const [device, setDevice] = useState(null)
  const [interfaces, setInterfaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    loadData()

    // Refresh every 5 seconds
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [name])

  async function loadData() {
    try {
      const [deviceData, interfacesData] = await Promise.all([
        fetchDevice(name),
        fetchDeviceInterfaces(name, 20)
      ])

      setDevice(deviceData.device)
      setInterfaces(interfacesData.interfaces)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function formatBytes(bytes) {
    if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`
    return `${bytes} B`
  }

  function formatTimeAgo(seconds) {
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
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

  if (loading) return <div className="loading">Loading device details...</div>
  if (error) return <div className="error">Error: {error}</div>
  if (!device) return <div className="error">Device not found</div>

  return (
    <div className="device-detail">
      <div className="detail-header">
        <Link to="/" className="back-link">← Back to Dashboard</Link>
        <h2>{device.name}</h2>
        <div className={`status-badge ${device.status}`}>
          <span className="status-dot"></span>
          {device.status}
        </div>
      </div>

      {/* Device Info */}
      <div className="info-card">
        <h3>Device Information</h3>
        <div className="info-grid">
          <div className="info-item">
            <div className="info-label">Last Seen</div>
            <div className="info-value">{formatTimeAgo(device.last_seen_ago)}</div>
          </div>
          <div className="info-item">
            <div className="info-label">Device Timestamp</div>
            <div className="info-value">
              {new Date(device.device_timestamp * 1000).toLocaleString()}
            </div>
          </div>
          <div className="info-item">
            <div className="info-label">Network Interfaces</div>
            <div className="info-value">{device.interfaces.length}</div>
          </div>
        </div>
      </div>

      {/* Current Network Interfaces */}
      <div className="interfaces-card">
        <h3>Current Network Interfaces</h3>
        <div className="interfaces-grid">
          {device.interfaces.map((iface, idx) => (
            <div key={idx} className="interface-item">
              <div className="interface-name">{iface.interface_name}</div>
              <div className="interface-details">
                <div className="detail-row">
                  <span className="label">IP:</span>
                  <span className="value">{iface.ip_address}</span>
                </div>
                <div className="detail-row">
                  <span className="label">RX:</span>
                  <span className="value">{formatBytes(iface.rx_bytes)}</span>
                </div>
                <div className="detail-row">
                  <span className="label">TX:</span>
                  <span className="value">{formatBytes(iface.tx_bytes)}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Max Speed:</span>
                  <span className="value">{iface.max_speed_mbps} Mbps</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interface Throughput Charts */}
      {interfaces.map((iface) => {
        const chartData = calculateThroughput(iface.history)

        if (chartData.length === 0) return null

        return (
          <div key={iface.name} className="chart-card">
            <h3>{iface.name} - Network Throughput</h3>
            <p className="chart-subtitle">
              {iface.ip} • Max Speed: {iface.max_speed_mbps} Mbps
            </p>
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
        )
      })}

      {/* Last Updated Timestamp */}
      {lastUpdated && (
        <div className="last-updated">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}

export default DeviceDetail
