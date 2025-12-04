import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchPingTargets, fetchPingStats } from '../api'
import './PingMonitor.css'

function PingMonitor() {
  const [targets, setTargets] = useState([])
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
      const [targetsData, statsData] = await Promise.all([
        fetchPingTargets(),
        fetchPingStats()
      ])

      setTargets(targetsData.targets)
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
    <div className="ping-monitor">
      {/* Stats Overview */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.total_targets}</div>
            <div className="stat-label">Total Targets</div>
          </div>
          <div className="stat-card online">
            <div className="stat-value">{stats.online_targets}</div>
            <div className="stat-label">Online</div>
          </div>
          <div className="stat-card offline">
            <div className="stat-value">{stats.offline_targets}</div>
            <div className="stat-label">Offline</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.total_pings.toLocaleString()}</div>
            <div className="stat-label">Total Pings</div>
          </div>
        </div>
      )}

      {/* Ping Targets List */}
      <div className="targets-section">
        <h2>Ping Targets</h2>
        <div className="targets-list">
          {targets.length === 0 ? (
            <div className="no-targets">No ping targets reporting yet</div>
          ) : (
            targets.map(target => (
              <Link
                key={target.target_ip}
                to={`/ping/${encodeURIComponent(target.target_ip)}`}
                className="target-card"
              >
                <div className="target-header">
                  <div className="target-name">{target.target_name || target.target_ip}</div>
                  <div className={`target-status ${target.status}`}>
                    <span className="status-dot"></span>
                    {target.status}
                  </div>
                </div>
                <div className="target-info">
                  <div className="info-row">
                    <span className="label">IP:</span>
                    <span className="value">{target.target_ip}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Monitor:</span>
                    <span className="value">{target.monitor_name}</span>
                  </div>
                  {target.status === 'online' && target.response_time_ms !== null && (
                    <div className="info-row">
                      <span className="label">Latency:</span>
                      <span className="value">{target.response_time_ms}ms</span>
                    </div>
                  )}
                  <div className="info-row">
                    <span className="label">Last Check:</span>
                    <span className="value">{formatTimeAgo(target.last_check_ago)}</span>
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

export default PingMonitor
