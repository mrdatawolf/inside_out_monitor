import { useState, useEffect } from 'react'
import { fetchMonitoringTargets, fetchMonitoringStats } from '../api'
import './Monitoring.css'
import './electric-glow.css'

function Monitoring() {
  const [targets, setTargets] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [filterText, setFilterText] = useState('')
  const [filterType, setFilterType] = useState('all') // all, web, ssl, file, folder
  const [filterStatus, setFilterStatus] = useState('all') // all, online/ok, offline/error, warning

  useEffect(() => {
    loadData()

    // Refresh every 10 seconds
    const interval = setInterval(loadData, 10000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const [targetsData, statsData] = await Promise.all([
        fetchMonitoringTargets(),
        fetchMonitoringStats()
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

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  function formatDate(timestamp) {
    if (!timestamp) return 'N/A'
    const date = new Date(timestamp * 1000)
    return date.toLocaleString()
  }

  function getStatusIcon(target) {
    const status = target.status.toLowerCase()
    if (status === 'online' || status === 'ok') return '✓'
    if (status === 'offline' || status === 'missing' || status === 'error' || status === 'expired') return '✗'
    if (status === 'warning' || status === 'changed') return '⚠'
    return '?'
  }

  function getStatusClass(target) {
    const status = target.status.toLowerCase()
    if (status === 'online' || status === 'ok') return 'status-ok'
    if (status === 'offline' || status === 'missing' || status === 'error' || status === 'expired') return 'status-error'
    if (status === 'warning' || status === 'changed') return 'status-warning'
    return 'status-unknown'
  }

  function getTypeIcon(type) {
    switch (type) {
      case 'web': return '🌐'
      case 'ssl': return '🔒'
      case 'file': return '📄'
      case 'folder': return '📁'
      default: return '❓'
    }
  }

  // Handle stat card clicks
  function handleStatCardClick(filterName) {
    switch (filterName) {
      case 'all':
        setFilterType('all')
        setFilterStatus('all')
        break
      case 'web':
        setFilterType(filterType === 'web' ? 'all' : 'web')
        break
      case 'ssl':
        setFilterType(filterType === 'ssl' ? 'all' : 'ssl')
        break
      case 'file':
        setFilterType(filterType === 'file' ? 'all' : 'file')
        break
      case 'folder':
        setFilterType(filterType === 'folder' ? 'all' : 'folder')
        break
      case 'ok':
        setFilterStatus(filterStatus === 'ok' ? 'all' : 'ok')
        break
      case 'error':
        setFilterStatus(filterStatus === 'error' ? 'all' : 'error')
        break
    }
  }

  // Filter targets
  const filteredTargets = targets.filter(target => {
    // Type filter
    if (filterType !== 'all' && target.target_type !== filterType) return false

    // Status filter
    if (filterStatus === 'ok') {
      if (target.status !== 'online' && target.status !== 'ok') return false
    } else if (filterStatus === 'error') {
      if (!['offline', 'missing', 'error', 'expired', 'warning', 'changed'].includes(target.status)) return false
    }

    // Text filter
    if (filterText) {
      const searchText = filterText.toLowerCase()
      return (
        target.target_name.toLowerCase().includes(searchText) ||
        target.target_identifier.toLowerCase().includes(searchText) ||
        target.monitor_name.toLowerCase().includes(searchText)
      )
    }

    return true
  })

  function renderTargetDetails(target) {
    switch (target.target_type) {
      case 'web':
        return (
          <>
            {target.response_time_ms && <span className="detail">⏱️ {target.response_time_ms}ms</span>}
            {target.status_code && <span className="detail">📊 HTTP {target.status_code}</span>}
          </>
        )

      case 'ssl':
        return (
          <>
            {target.ssl_valid !== null && (
              <span className={`detail ${target.ssl_valid ? 'ssl-valid' : 'ssl-invalid'}`}>
                {target.ssl_valid ? '✓ Valid' : '✗ Invalid'}
              </span>
            )}
            {target.ssl_days_until_expiry !== null && (
              <span className={`detail ${target.ssl_days_until_expiry < 7 ? 'ssl-expiring' : ''}`}>
                ⏳ {target.ssl_days_until_expiry > 0 ? `${target.ssl_days_until_expiry}d left` : 'Expired'}
              </span>
            )}
          </>
        )

      case 'file':
        return (
          <>
            {target.file_exists === 1 && target.file_size && (
              <span className="detail">📦 {formatBytes(target.file_size)}</span>
            )}
            {target.file_modified && (
              <span className="detail">📅 {formatDate(target.file_modified)}</span>
            )}
            {target.file_hash_match !== null && (
              <span className={`detail ${target.file_hash_match ? 'hash-ok' : 'hash-changed'}`}>
                {target.file_hash_match ? '✓ Hash OK' : '⚠ Hash Changed'}
              </span>
            )}
          </>
        )

      case 'folder':
        return (
          <>
            {target.folder_file_count !== null && (
              <span className="detail">📊 {target.folder_file_count} files</span>
            )}
            {target.folder_total_size !== null && (
              <span className="detail">📦 {formatBytes(target.folder_total_size)}</span>
            )}
          </>
        )

      default:
        return null
    }
  }

  if (loading && !lastUpdated) {
    return <div className="monitoring-container"><div className="loading">Loading monitoring data...</div></div>
  }

  if (error) {
    return <div className="monitoring-container"><div className="error">Error: {error}</div></div>
  }

  // Calculate stats for display
  const totalTargets = stats?.total_targets || 0
  const webCount = stats?.by_type?.web ? Object.values(stats.by_type.web).reduce((a, b) => a + b, 0) : 0
  const sslCount = stats?.by_type?.ssl ? Object.values(stats.by_type.ssl).reduce((a, b) => a + b, 0) : 0
  const fileCount = stats?.by_type?.file ? Object.values(stats.by_type.file).reduce((a, b) => a + b, 0) : 0
  const folderCount = stats?.by_type?.folder ? Object.values(stats.by_type.folder).reduce((a, b) => a + b, 0) : 0
  const okCount = (stats?.by_status?.online || 0) + (stats?.by_status?.ok || 0)
  const errorCount = (stats?.by_status?.offline || 0) + (stats?.by_status?.missing || 0) +
                      (stats?.by_status?.error || 0) + (stats?.by_status?.expired || 0) +
                      (stats?.by_status?.warning || 0) + (stats?.by_status?.changed || 0)

  return (
    <div className="monitoring-container">
      <div className="monitoring-header">
        <h2>Web & File Monitoring</h2>
        {lastUpdated && (
          <div className="last-updated">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>

      <div className="stats-grid">
        <div
          className={`stat-card ${filterType === 'all' && filterStatus === 'all' ? 'active' : ''}`}
          onClick={() => handleStatCardClick('all')}
        >
          <div className="stat-value">{totalTargets}</div>
          <div className="stat-label">Total Targets</div>
        </div>
        <div
          className={`stat-card ${filterType === 'web' ? 'active' : ''}`}
          onClick={() => handleStatCardClick('web')}
        >
          <div className="stat-value">{webCount}</div>
          <div className="stat-label">🌐 Web</div>
        </div>
        <div
          className={`stat-card ${filterType === 'ssl' ? 'active' : ''}`}
          onClick={() => handleStatCardClick('ssl')}
        >
          <div className="stat-value">{sslCount}</div>
          <div className="stat-label">🔒 SSL</div>
        </div>
        <div
          className={`stat-card ${filterType === 'file' ? 'active' : ''}`}
          onClick={() => handleStatCardClick('file')}
        >
          <div className="stat-value">{fileCount}</div>
          <div className="stat-label">📄 Files</div>
        </div>
        <div
          className={`stat-card ${filterType === 'folder' ? 'active' : ''}`}
          onClick={() => handleStatCardClick('folder')}
        >
          <div className="stat-value">{folderCount}</div>
          <div className="stat-label">📁 Folders</div>
        </div>
        <div
          className={`stat-card status-ok-card ${filterStatus === 'ok' ? 'active' : ''}`}
          onClick={() => handleStatCardClick('ok')}
        >
          <div className="stat-value">{okCount}</div>
          <div className="stat-label">✓ OK</div>
        </div>
        <div
          className={`stat-card status-error-card ${filterStatus === 'error' ? 'active' : ''}`}
          onClick={() => handleStatCardClick('error')}
        >
          <div className="stat-value">{errorCount}</div>
          <div className="stat-label">✗ Issues</div>
        </div>
      </div>

      <div className="filter-controls">
        <input
          type="text"
          placeholder="Search targets..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="search-input"
        />
        <div className="filter-info">
          Showing {filteredTargets.length} of {targets.length} targets
        </div>
      </div>

      {filteredTargets.length === 0 ? (
        <div className="no-data">No monitoring targets found</div>
      ) : (
        <div className="targets-table">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Type</th>
                <th>Name</th>
                <th>Target</th>
                <th>Details</th>
                <th>Monitor</th>
                <th>Last Check</th>
              </tr>
            </thead>
            <tbody>
              {filteredTargets.map((target, index) => (
                <tr key={index} className={getStatusClass(target)}>
                  <td className="status-cell">
                    <span className="status-icon">{getStatusIcon(target)}</span>
                    <span className="status-text">{target.status}</span>
                  </td>
                  <td className="type-cell">
                    <span className="type-icon">{getTypeIcon(target.target_type)}</span>
                    <span className="type-text">{target.target_type}</span>
                  </td>
                  <td className="name-cell">{target.target_name}</td>
                  <td className="identifier-cell" title={target.target_identifier}>
                    {target.target_identifier.length > 50
                      ? target.target_identifier.substring(0, 50) + '...'
                      : target.target_identifier}
                  </td>
                  <td className="details-cell">
                    {renderTargetDetails(target)}
                    {target.error_message && (
                      <span className="detail error-detail" title={target.error_message}>
                        ⚠ {target.error_message.substring(0, 30)}
                        {target.error_message.length > 30 ? '...' : ''}
                      </span>
                    )}
                  </td>
                  <td className="monitor-cell">{target.monitor_name}</td>
                  <td className="time-cell">{formatTimeAgo(target.last_check_ago)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Monitoring
