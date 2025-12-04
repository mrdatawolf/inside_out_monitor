import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchPingTargetHistory } from '../api'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import './PingTargetDetail.css'

function PingTargetDetail() {
  const { ip } = useParams()
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [timeRange, setTimeRange] = useState(24) // hours

  useEffect(() => {
    loadData()

    // Refresh every 5 seconds
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [ip, timeRange])

  async function loadData() {
    try {
      const data = await fetchPingTargetHistory(ip, timeRange, 100)
      setHistory(data.history)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function formatTimestamp(timestamp) {
    return new Date(timestamp * 1000).toLocaleTimeString()
  }

  function formatTimeAgo(seconds) {
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  function prepareChartData() {
    if (history.length === 0) return []

    // Reverse history so oldest is first
    const reversed = [...history].reverse()

    return reversed.map(item => ({
      timestamp: item.received_at,
      time: formatTimestamp(item.received_at),
      latency: item.status === 'online' ? item.response_time_ms : null,
      offline: item.status === 'offline' ? 1 : 0
    }))
  }

  function calculateUptime() {
    if (history.length === 0) return 0
    const online = history.filter(h => h.status === 'online').length
    return ((online / history.length) * 100).toFixed(2)
  }

  function calculateAverageLatency() {
    const onlineHistory = history.filter(h => h.status === 'online' && h.response_time_ms !== null)
    if (onlineHistory.length === 0) return 0
    const sum = onlineHistory.reduce((acc, h) => acc + h.response_time_ms, 0)
    return (sum / onlineHistory.length).toFixed(2)
  }

  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="error">Error: {error}</div>
  if (history.length === 0) return <div className="no-data">No ping history available for {ip}</div>

  const latestPing = history[0]
  const chartData = prepareChartData()
  const uptime = calculateUptime()
  const avgLatency = calculateAverageLatency()

  return (
    <div className="ping-target-detail">
      {/* Back Button */}
      <Link to="/ping" className="back-button">← Back to Ping Monitoring</Link>

      {/* Target Header */}
      <div className="target-header">
        <div>
          <h1>{latestPing.target_name || ip}</h1>
          <p className="target-ip">{ip}</p>
        </div>
        <div className={`current-status ${latestPing.status}`}>
          <span className="status-dot"></span>
          {latestPing.status}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Monitor</div>
          <div className="stat-value">{latestPing.monitor_name}</div>
        </div>
        <div className={`stat-card ${latestPing.status}`}>
          <div className="stat-label">Status</div>
          <div className="stat-value">{latestPing.status}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Uptime ({timeRange}h)</div>
          <div className="stat-value">{uptime}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Latency</div>
          <div className="stat-value">{avgLatency}ms</div>
        </div>
        {latestPing.status === 'online' && (
          <div className="stat-card">
            <div className="stat-label">Current Latency</div>
            <div className="stat-value">{latestPing.response_time_ms}ms</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-label">Last Check</div>
          <div className="stat-value">{formatTimeAgo(Math.floor(Date.now() / 1000) - latestPing.received_at)}</div>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="time-range-selector">
        <button
          className={timeRange === 1 ? 'active' : ''}
          onClick={() => setTimeRange(1)}
        >
          1 Hour
        </button>
        <button
          className={timeRange === 6 ? 'active' : ''}
          onClick={() => setTimeRange(6)}
        >
          6 Hours
        </button>
        <button
          className={timeRange === 24 ? 'active' : ''}
          onClick={() => setTimeRange(24)}
        >
          24 Hours
        </button>
        <button
          className={timeRange === 168 ? 'active' : ''}
          onClick={() => setTimeRange(168)}
        >
          7 Days
        </button>
      </div>

      {/* Latency Chart */}
      <div className="chart-section">
        <h2>Response Time History</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="time"
              stroke="#888"
              tick={{ fill: '#888' }}
            />
            <YAxis
              stroke="#888"
              tick={{ fill: '#888' }}
              label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft', fill: '#888' }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
              labelStyle={{ color: '#fff' }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="latency"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              name="Response Time (ms)"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Recent History Table */}
      <div className="history-section">
        <h2>Recent Pings</h2>
        <div className="history-table">
          <div className="table-header">
            <div>Time</div>
            <div>Status</div>
            <div>Latency</div>
            <div>Monitor</div>
          </div>
          {history.slice(0, 20).map((ping, index) => (
            <div key={index} className="table-row">
              <div>{new Date(ping.received_at * 1000).toLocaleString()}</div>
              <div>
                <span className={`status-badge ${ping.status}`}>
                  {ping.status}
                </span>
              </div>
              <div>
                {ping.status === 'online' && ping.response_time_ms !== null
                  ? `${ping.response_time_ms}ms`
                  : '-'}
              </div>
              <div>{ping.monitor_name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div className="last-updated">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}

export default PingTargetDetail
