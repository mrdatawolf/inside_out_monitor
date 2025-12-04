import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchDevices, fetchStats } from '../api'
import './Dashboard.css'

function Dashboard() {
  const [devices, setDevices] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    loadData()

    // Refresh every 5 seconds
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const [devicesData, statsData] = await Promise.all([
        fetchDevices(),
        fetchStats()
      ])

      setDevices(devicesData.devices)
      setStats(statsData.stats)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function formatTimeAgo(seconds) {
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="error">Error: {error}</div>

  return (
    <div className="dashboard">
      {/* Stats Overview */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.total_devices}</div>
            <div className="stat-label">Total Devices</div>
          </div>
          <div className="stat-card online">
            <div className="stat-value">{stats.online_devices}</div>
            <div className="stat-label">Online</div>
          </div>
          <div className="stat-card offline">
            <div className="stat-value">{stats.offline_devices}</div>
            <div className="stat-label">Offline</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.total_heartbeats.toLocaleString()}</div>
            <div className="stat-label">Total Heartbeats</div>
          </div>
        </div>
      )}

      {/* Device List */}
      <div className="devices-section">
        <h2>Devices</h2>
        <div className="devices-list">
          {devices.length === 0 ? (
            <div className="no-devices">No devices reporting yet</div>
          ) : (
            devices.map(device => (
              <Link
                key={device.device_name}
                to={`/device/${encodeURIComponent(device.device_name)}`}
                className="device-card"
              >
                <div className="device-header">
                  <div className="device-name">{device.device_name}</div>
                  <div className={`device-status ${device.status}`}>
                    <span className="status-dot"></span>
                    {device.status}
                  </div>
                </div>
                <div className="device-info">
                  <div className="info-row">
                    <span className="label">Last Seen:</span>
                    <span className="value">{formatTimeAgo(device.last_seen_ago)}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Heartbeats:</span>
                    <span className="value">{device.heartbeat_count}</span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Last Updated Timestamp */}
      {lastUpdated && (
        <div className="last-updated">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}

export default Dashboard
