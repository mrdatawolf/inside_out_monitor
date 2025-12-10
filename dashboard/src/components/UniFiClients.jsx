import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchUnifiClients, fetchUnifiStats } from '../api'
import './UniFiClients.css'
import './electric-glow.css'

function UniFiClients() {
  const [clients, setClients] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [filterText, setFilterText] = useState('')
  const [filterType, setFilterType] = useState('all') // all, wired, wireless
  const [filterConnection, setFilterConnection] = useState('all') // all, connected, disconnected

  useEffect(() => {
    loadData()

    // Refresh every 5 seconds
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const [clientsData, statsData] = await Promise.all([
        fetchUnifiClients(),
        fetchUnifiStats()
      ])

      setClients(clientsData.clients)
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

  // Handle stat card clicks
  function handleStatCardClick(filterName) {
    switch (filterName) {
      case 'all':
        setFilterType('all')
        setFilterConnection('all')
        break
      case 'connected':
        setFilterConnection(filterConnection === 'connected' ? 'all' : 'connected')
        break
      case 'disconnected':
        setFilterConnection(filterConnection === 'disconnected' ? 'all' : 'disconnected')
        break
      case 'wired':
        setFilterType(filterType === 'wired' ? 'all' : 'wired')
        setFilterConnection('connected') // Wired/Wireless stats only show connected
        break
      case 'wireless':
        setFilterType(filterType === 'wireless' ? 'all' : 'wireless')
        setFilterConnection('connected') // Wired/Wireless stats only show connected
        break
    }
  }

  // Filter clients
  const filteredClients = clients.filter(client => {
    // Connection filter
    if (filterConnection === 'connected' && !client.is_connected) return false
    if (filterConnection === 'disconnected' && client.is_connected) return false

    // Type filter
    if (filterType === 'wired' && !client.is_wired) return false
    if (filterType === 'wireless' && client.is_wired) return false

    // Text filter
    if (filterText) {
      const search = filterText.toLowerCase()
      const hostname = (client.hostname || '').toLowerCase()
      const name = (client.name || '').toLowerCase()
      const mac = (client.mac || '').toLowerCase()
      const ip = (client.ip || '').toLowerCase()
      const manufacturer = (client.manufacturer || '').toLowerCase()

      return hostname.includes(search) ||
             name.includes(search) ||
             mac.includes(search) ||
             ip.includes(search) ||
             manufacturer.includes(search)
    }

    return true
  })

  // Separate connected and disconnected
  const connectedClients = filteredClients.filter(c => c.is_connected)
  const disconnectedClients = filteredClients.filter(c => !c.is_connected)

  if (loading) return <div className="loading">Loading UniFi data...</div>
  if (error) return <div className="error">Error: {error}</div>

  return (
    <div className="unifi-clients">
      <div className="unifi-header">
        <h2>🔷 Dreaming: UniFi Network Clients</h2>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="stats-grid">
          <div
            className={`stat-card clickable ${filterType === 'all' && filterConnection === 'all' ? 'active' : ''}`}
            onClick={() => handleStatCardClick('all')}
            title="Click to show all clients"
          >
            <div className="stat-value">{stats.total_clients}</div>
            <div className="stat-label">Total Clients</div>
          </div>
          <div
            className={`stat-card online clickable ${filterConnection === 'connected' ? 'active' : ''}`}
            onClick={() => handleStatCardClick('connected')}
            title="Click to filter connected clients"
          >
            <div className="stat-value">{stats.connected_clients}</div>
            <div className="stat-label">Connected</div>
          </div>
          <div
            className={`stat-card offline clickable ${filterConnection === 'disconnected' ? 'active' : ''}`}
            onClick={() => handleStatCardClick('disconnected')}
            title="Click to filter disconnected clients"
          >
            <div className="stat-value">{stats.disconnected_clients}</div>
            <div className="stat-label">Disconnected</div>
          </div>
          <div
            className={`stat-card online clickable ${filterType === 'wired' && filterConnection === 'connected' ? 'active' : ''}`}
            onClick={() => handleStatCardClick('wired')}
            title="Click to filter wired clients"
          >
            <div className="stat-value">{stats.wired_clients}</div>
            <div className="stat-label">Wired</div>
          </div>
          <div
            className={`stat-card online clickable ${filterType === 'wireless' && filterConnection === 'connected' ? 'active' : ''}`}
            onClick={() => handleStatCardClick('wireless')}
            title="Click to filter wireless clients"
          >
            <div className="stat-value">{stats.wireless_clients}</div>
            <div className="stat-label">Wireless</div>
          </div>
        </div>
      )}

      {/* Filter Controls */}
      <div className="unifi-controls">
        <input
          type="text"
          placeholder="Filter by hostname, MAC, IP, or manufacturer..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="filter-input"
        />

        <div className="filter-buttons">
          <button
            className={filterType === 'all' ? 'active' : ''}
            onClick={() => setFilterType('all')}
          >
            All
          </button>
          <button
            className={filterType === 'wired' ? 'active' : ''}
            onClick={() => setFilterType('wired')}
          >
            Wired
          </button>
          <button
            className={filterType === 'wireless' ? 'active' : ''}
            onClick={() => setFilterType('wireless')}
          >
            Wireless
          </button>
        </div>
      </div>

      {/* Client Cards */}
      <div className="clients-section">
        <h2>Clients</h2>
        <div className="clients-list">
          {filteredClients.length === 0 ? (
            <div className="no-clients">
              <p>No clients found{filterText ? ' matching your filter' : ''}.</p>
              <p className="hint">Make sure the UniFi monitor is running and sending data to the server.</p>
            </div>
          ) : (
            filteredClients.map(client => (
              <Link
                key={client.mac}
                to={`/unifi/client/${encodeURIComponent(client.mac)}`}
                className="client-card"
              >
                <div className="client-header">
                  <div className="client-icon">{getDeviceIcon(client)}</div>
                  <div className="client-name-section">
                    <div className="client-name">
                      {client.hostname || client.name || 'Unknown Device'}
                    </div>
                    {client.manufacturer && (
                      <div className="client-manufacturer">{client.manufacturer}</div>
                    )}
                  </div>
                  <div className={`client-status ${client.is_connected ? 'connected' : 'disconnected'}`}>
                    <span className="status-dot"></span>
                    {client.is_connected ? 'Connected' : 'Disconnected'}
                  </div>
                </div>
                <div className="client-info">
                  <div className="info-row">
                    <span className="label">IP Address:</span>
                    <span className="value">{client.ip || '-'}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">MAC Address:</span>
                    <span className="value">{formatMacAddress(client.mac)}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Connection:</span>
                    <span className="value">
                      {client.is_wired ? '🖥️ Wired' : '📡 Wireless'}
                      {client.signal && !client.is_wired ? ` (${client.signal} dBm)` : ''}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="label">Traffic:</span>
                    <span className="value">
                      ↓ {formatBytes(client.rx_bytes)} / ↑ {formatBytes(client.tx_bytes)}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="label">Last Seen:</span>
                    <span className="value">{formatTimeAgo(client.last_seen_ago)}</span>
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

export default UniFiClients
