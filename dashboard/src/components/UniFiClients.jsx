import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchUnifiClients, fetchUnifiStats } from '../api'
import './UniFiClients.css'

function UniFiClients() {
  const [clients, setClients] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [filterText, setFilterText] = useState('')
  const [filterType, setFilterType] = useState('all') // all, wired, wireless

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

  // Filter clients
  const filteredClients = clients.filter(client => {
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
        {lastUpdated && (
          <p className="last-updated">Last updated: {lastUpdated.toLocaleTimeString()}</p>
        )}
      </div>

      {stats && (
        <div className="unifi-stats">
          <div className="stat-card">
            <div className="stat-value">{stats.total_clients}</div>
            <div className="stat-label">Total Clients</div>
          </div>
          <div className="stat-card stat-online">
            <div className="stat-value">{stats.connected_clients}</div>
            <div className="stat-label">Connected</div>
          </div>
          <div className="stat-card stat-offline">
            <div className="stat-value">{stats.disconnected_clients}</div>
            <div className="stat-label">Disconnected</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.wired_clients}</div>
            <div className="stat-label">Wired</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.wireless_clients}</div>
            <div className="stat-label">Wireless</div>
          </div>
        </div>
      )}

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

      {/* Currently Connected Clients */}
      {connectedClients.length > 0 && (
        <div className="clients-section">
          <h3 className="section-title">🟢 Currently Connected ({connectedClients.length})</h3>
          <div className="clients-table">
            <table>
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Hostname</th>
                  <th>MAC Address</th>
                  <th>IP Address</th>
                  <th>Type</th>
                  <th>Manufacturer</th>
                  <th>Signal</th>
                  <th>Traffic</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {connectedClients.map((client) => (
                  <tr key={client.mac} className="client-row connected">
                    <td className="device-icon">{getDeviceIcon(client)}</td>
                    <td className="hostname">
                      {client.hostname || client.name || 'Unknown'}
                    </td>
                    <td className="mac">{formatMacAddress(client.mac)}</td>
                    <td className="ip">{client.ip || '-'}</td>
                    <td className="type">
                      {client.is_wired ? (
                        <span className="badge wired">Wired</span>
                      ) : (
                        <span className="badge wireless">Wireless</span>
                      )}
                    </td>
                    <td className="manufacturer">{client.manufacturer || '-'}</td>
                    <td className="signal">
                      {client.signal && !client.is_wired ? `${client.signal} dBm` : '-'}
                    </td>
                    <td className="traffic">
                      <div className="traffic-stats">
                        <span title="Downloaded">↓ {formatBytes(client.rx_bytes)}</span>
                        <span title="Uploaded">↑ {formatBytes(client.tx_bytes)}</span>
                      </div>
                    </td>
                    <td className="last-seen">
                      {formatTimeAgo(client.last_seen_ago)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Previously Connected Clients */}
      {disconnectedClients.length > 0 && (
        <div className="clients-section">
          <h3 className="section-title">⚫ Previously Connected ({disconnectedClients.length})</h3>
          <div className="clients-table">
            <table>
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Hostname</th>
                  <th>MAC Address</th>
                  <th>IP Address</th>
                  <th>Type</th>
                  <th>Manufacturer</th>
                  <th>Signal</th>
                  <th>Traffic</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {disconnectedClients.map((client) => (
                  <tr key={client.mac} className="client-row disconnected">
                    <td className="device-icon">{getDeviceIcon(client)}</td>
                    <td className="hostname">
                      {client.hostname || client.name || 'Unknown'}
                    </td>
                    <td className="mac">{formatMacAddress(client.mac)}</td>
                    <td className="ip">{client.ip || '-'}</td>
                    <td className="type">
                      {client.is_wired ? (
                        <span className="badge wired">Wired</span>
                      ) : (
                        <span className="badge wireless">Wireless</span>
                      )}
                    </td>
                    <td className="manufacturer">{client.manufacturer || '-'}</td>
                    <td className="signal">
                      {client.signal && !client.is_wired ? `${client.signal} dBm` : '-'}
                    </td>
                    <td className="traffic">
                      <div className="traffic-stats">
                        <span title="Downloaded">↓ {formatBytes(client.rx_bytes)}</span>
                        <span title="Uploaded">↑ {formatBytes(client.tx_bytes)}</span>
                      </div>
                    </td>
                    <td className="last-seen">
                      {formatTimeAgo(client.last_seen_ago)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredClients.length === 0 && (
        <div className="no-clients">
          <p>No clients found{filterText ? ' matching your filter' : ''}.</p>
          <p className="hint">Make sure the UniFi monitor is running and sending data to the server.</p>
        </div>
      )}
    </div>
  )
}

export default UniFiClients
