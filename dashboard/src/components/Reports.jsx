import { useState, useEffect } from 'react'
import {
  fetchNetworkHealthOverview,
  fetchFlappingDevices,
  fetchUptimeStats,
  fetchSignalDistribution,
  fetchPoorSignalDevices,
  fetchNewDevices,
  fetchInactiveDevices,
  fetchManufacturerBreakdown,
  fetchConnectionTimeline,
  fetchPeakHours,
  fetchEventTimeline,
  fetchMassEvents,
  fetchTopConsumers,
  fetchUnknownDevices
} from '../api'
import './Reports.css'

function Reports() {
  const [overview, setOverview] = useState(null)
  const [flappingDevices, setFlappingDevices] = useState(null)
  const [uptimeStats, setUptimeStats] = useState(null)
  const [signalDistribution, setSignalDistribution] = useState(null)
  const [poorSignalDevices, setPoorSignalDevices] = useState(null)
  const [newDevices, setNewDevices] = useState(null)
  const [inactiveDevices, setInactiveDevices] = useState(null)
  const [manufacturerBreakdown, setManufacturerBreakdown] = useState(null)
  const [connectionTimeline, setConnectionTimeline] = useState(null)
  const [peakHours, setPeakHours] = useState(null)
  const [eventTimeline, setEventTimeline] = useState(null)
  const [massEvents, setMassEvents] = useState(null)
  const [topConsumers, setTopConsumers] = useState(null)
  const [unknownDevices, setUnknownDevices] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('24h')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    stability: false,
    wireless: false,
    inventory: false,
    timeline: false,
    events: false,
    bandwidth: false,
    security: false
  })

  useEffect(() => {
    loadData()
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [period])

  async function loadData() {
    try {
      setLoading(true)

      // Load all reports in parallel
      const [
        overviewData,
        flappingData,
        uptimeData,
        signalDistData,
        poorSignalData,
        newDevData,
        inactiveDevData,
        manufacturerData,
        timelineData,
        peakData,
        eventsData,
        massEventsData,
        consumersData,
        unknownDevData
      ] = await Promise.all([
        fetchNetworkHealthOverview(period),
        fetchFlappingDevices(10, period),
        fetchUptimeStats('desc', 10, period),
        fetchSignalDistribution(-70),
        fetchPoorSignalDevices(-70, 10),
        fetchNewDevices(period),
        fetchInactiveDevices(30),
        fetchManufacturerBreakdown(),
        fetchConnectionTimeline(period, 'hourly'),
        fetchPeakHours(period),
        fetchEventTimeline(period, 'all'),
        fetchMassEvents(5, period),
        fetchTopConsumers(10, period, 'total'),
        fetchUnknownDevices()
      ])

      setOverview(overviewData)
      setFlappingDevices(flappingData)
      setUptimeStats(uptimeData)
      setSignalDistribution(signalDistData)
      setPoorSignalDevices(poorSignalData)
      setNewDevices(newDevData)
      setInactiveDevices(inactiveDevData)
      setManufacturerBreakdown(manufacturerData)
      setConnectionTimeline(timelineData)
      setPeakHours(peakData)
      setEventTimeline(eventsData)
      setMassEvents(massEventsData)
      setTopConsumers(consumersData)
      setUnknownDevices(unknownDevData)

      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleSection(section) {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  function formatNumber(num) {
    if (!num && num !== 0) return '-'
    return num.toLocaleString()
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  function formatSignal(signal) {
    if (!signal) return '-'
    if (signal >= -30) return `${signal} dBm (Excellent)`
    if (signal >= -50) return `${signal} dBm (Good)`
    if (signal >= -60) return `${signal} dBm (Fair)`
    if (signal >= -70) return `${signal} dBm (Weak)`
    return `${signal} dBm (Poor)`
  }

  function getSignalClass(signal) {
    if (!signal) return ''
    if (signal >= -50) return 'excellent'
    if (signal >= -60) return 'good'
    if (signal >= -70) return 'fair'
    return 'poor'
  }

  if (loading && !overview) {
    return <div className="loading">Loading network health data...</div>
  }

  if (error) {
    return <div className="error">Error: {error}</div>
  }

  if (!overview) {
    return <div className="no-data">No data available</div>
  }

  const { current, device_types, signal_stats, events, new_devices, peak_concurrent } = overview

  return (
    <div className="reports">
      <div className="reports-header">
        <h2>📊 Network Health Overview</h2>
        <div className="reports-controls">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="period-selector">
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="12h">Last 12 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <button onClick={loadData} className="refresh-button">Refresh</button>
        </div>
      </div>

      {/* Current Network Status */}
      <section className="report-section">
        <h3>Current Network Status</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{formatNumber(current.total_clients)}</div>
            <div className="stat-label">Total Clients</div>
          </div>
          <div className="stat-card online">
            <div className="stat-value">{formatNumber(current.connected_clients)}</div>
            <div className="stat-label">Connected</div>
          </div>
          <div className="stat-card offline">
            <div className="stat-value">{formatNumber(current.disconnected_clients)}</div>
            <div className="stat-label">Disconnected</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatNumber(current.wired_clients)}</div>
            <div className="stat-label">Wired</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatNumber(current.wireless_clients)}</div>
            <div className="stat-label">Wireless</div>
          </div>
        </div>
      </section>

      {/* Device Types */}
      {device_types && device_types.length > 0 && (
        <section className="report-section">
          <h3>Device Types (Connected)</h3>
          <div className="device-types-grid">
            {device_types.map((type, idx) => (
              <div key={idx} className="device-type-card">
                <div className="device-type-icon">
                  {type.device_type === 'wired' && '🖥️'}
                  {type.device_type === 'wireless' && '📡'}
                  {type.device_type === 'apple' && '🍎'}
                  {type.device_type === 'android' && '📱'}
                  {type.device_type === 'iot' && '💡'}
                  {!['wired', 'wireless', 'apple', 'android', 'iot'].includes(type.device_type) && '📱'}
                </div>
                <div className="device-type-label">{type.device_type || 'Unknown'}</div>
                <div className="device-type-count">{type.count}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Wireless Signal Quality */}
      {signal_stats && signal_stats.avg_signal && (
        <section className="report-section">
          <h3>Wireless Signal Quality</h3>
          <div className="stats-grid">
            <div className={`stat-card ${getSignalClass(signal_stats.avg_signal)}`}>
              <div className="stat-value">{formatSignal(signal_stats.avg_signal)}</div>
              <div className="stat-label">Average Signal</div>
            </div>
            <div className={`stat-card ${getSignalClass(signal_stats.min_signal)}`}>
              <div className="stat-value">{formatSignal(signal_stats.min_signal)}</div>
              <div className="stat-label">Weakest Signal</div>
            </div>
            <div className={`stat-card ${getSignalClass(signal_stats.max_signal)}`}>
              <div className="stat-value">{formatSignal(signal_stats.max_signal)}</div>
              <div className="stat-label">Strongest Signal</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{formatNumber(signal_stats.poor_signal_count)}</div>
              <div className="stat-label">Poor Signal (&lt; -70 dBm)</div>
            </div>
          </div>
        </section>
      )}

      {/* Connection Events */}
      <section className="report-section">
        <h3>Connection Events ({period})</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{formatNumber(events.total_events)}</div>
            <div className="stat-label">Total Events</div>
          </div>
          <div className="stat-card online">
            <div className="stat-value">{formatNumber(events.connects)}</div>
            <div className="stat-label">Connects</div>
          </div>
          <div className="stat-card offline">
            <div className="stat-value">{formatNumber(events.disconnects)}</div>
            <div className="stat-label">Disconnects</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatNumber(new_devices.new_device_count)}</div>
            <div className="stat-label">New Devices</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatNumber(peak_concurrent.peak_concurrent)}</div>
            <div className="stat-label">Peak Concurrent</div>
          </div>
        </div>
      </section>

      {/* Summary Insights */}
      <section className="report-section">
        <h3>Quick Insights</h3>
        <div className="insights-list">
          {current.connected_clients > 0 && (
            <div className="insight-item">
              <span className="insight-icon">✓</span>
              <span className="insight-text">
                {Math.round((current.connected_clients / current.total_clients) * 100)}% of devices are currently online
              </span>
            </div>
          )}
          {current.wireless_clients > 0 && (
            <div className="insight-item">
              <span className="insight-icon">📡</span>
              <span className="insight-text">
                {Math.round((current.wireless_clients / current.total_clients) * 100)}% of clients are wireless
              </span>
            </div>
          )}
          {signal_stats.poor_signal_count > 0 && (
            <div className="insight-item warning">
              <span className="insight-icon">⚠</span>
              <span className="insight-text">
                {signal_stats.poor_signal_count} device{signal_stats.poor_signal_count > 1 ? 's' : ''} with poor signal strength
              </span>
            </div>
          )}
          {events.disconnects > events.connects && (
            <div className="insight-item warning">
              <span className="insight-icon">⚠</span>
              <span className="insight-text">
                More disconnects than connects in the last {period} - possible network issues
              </span>
            </div>
          )}
          {new_devices.new_device_count > 0 && (
            <div className="insight-item">
              <span className="insight-icon">🆕</span>
              <span className="insight-text">
                {new_devices.new_device_count} new device{new_devices.new_device_count > 1 ? 's' : ''} detected
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Report 2: Connection Stability */}
      <section className="report-section">
        <h3 className="collapsible-header" onClick={() => toggleSection('stability')}>
          {expandedSections.stability ? '▼' : '▶'} Connection Stability
        </h3>
        {expandedSections.stability && flappingDevices && (
          <div>
            {flappingDevices.devices && flappingDevices.devices.length > 0 ? (
              <>
                <h4>Flapping Devices (Frequent Reconnects)</h4>
                <div className="device-list">
                  {flappingDevices.devices.map((device, idx) => (
                    <div key={idx} className="device-item warning">
                      <div className="device-info">
                        <strong>{device.hostname || device.mac}</strong>
                        <span className="device-detail">{device.mac}</span>
                      </div>
                      <div className="device-stats">
                        <span className="stat-badge">{device.event_count} reconnects</span>
                        <span className="stat-badge">Avg {Math.round(device.avg_duration_minutes)}m sessions</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="no-data">No flapping devices detected</div>
            )}

            {uptimeStats && uptimeStats.devices && uptimeStats.devices.length > 0 && (
              <>
                <h4>Top Devices by Uptime</h4>
                <div className="device-list">
                  {uptimeStats.devices.map((device, idx) => (
                    <div key={idx} className="device-item">
                      <div className="device-info">
                        <strong>{device.hostname || device.mac}</strong>
                        <span className="device-detail">{device.mac}</span>
                      </div>
                      <div className="device-stats">
                        <span className="stat-badge good">{Math.round(device.uptime_percentage)}% uptime</span>
                        <span className="stat-badge">{formatNumber(device.total_events)} events</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Report 3: Wireless Network Quality */}
      <section className="report-section">
        <h3 className="collapsible-header" onClick={() => toggleSection('wireless')}>
          {expandedSections.wireless ? '▼' : '▶'} Wireless Network Quality
        </h3>
        {expandedSections.wireless && (
          <div>
            {signalDistribution && signalDistribution.distribution && (
              <>
                <h4>Signal Strength Distribution</h4>
                <div className="stats-grid">
                  <div className="stat-card excellent">
                    <div className="stat-value">{formatNumber(signalDistribution.distribution.excellent)}</div>
                    <div className="stat-label">Excellent (&gt; -50 dBm)</div>
                  </div>
                  <div className="stat-card good">
                    <div className="stat-value">{formatNumber(signalDistribution.distribution.good)}</div>
                    <div className="stat-label">Good (-50 to -60 dBm)</div>
                  </div>
                  <div className="stat-card fair">
                    <div className="stat-value">{formatNumber(signalDistribution.distribution.fair)}</div>
                    <div className="stat-label">Fair (-60 to -70 dBm)</div>
                  </div>
                  <div className="stat-card poor">
                    <div className="stat-value">{formatNumber(signalDistribution.distribution.poor)}</div>
                    <div className="stat-label">Poor (&lt; -70 dBm)</div>
                  </div>
                </div>
              </>
            )}

            {poorSignalDevices && poorSignalDevices.devices && poorSignalDevices.devices.length > 0 && (
              <>
                <h4>Devices with Poor Signal</h4>
                <div className="device-list">
                  {poorSignalDevices.devices.map((device, idx) => (
                    <div key={idx} className="device-item warning">
                      <div className="device-info">
                        <strong>{device.hostname || device.mac}</strong>
                        <span className="device-detail">{device.mac} • {device.essid || 'Unknown SSID'}</span>
                      </div>
                      <div className="device-stats">
                        <span className={`stat-badge ${getSignalClass(device.signal)}`}>
                          {device.signal} dBm
                        </span>
                        <span className="stat-badge">Ch {device.channel}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Report 4: Device Inventory & Discovery */}
      <section className="report-section">
        <h3 className="collapsible-header" onClick={() => toggleSection('inventory')}>
          {expandedSections.inventory ? '▼' : '▶'} Device Inventory & Discovery
        </h3>
        {expandedSections.inventory && (
          <div>
            {newDevices && newDevices.devices && newDevices.devices.length > 0 && (
              <>
                <h4>New Devices ({period})</h4>
                <div className="device-list">
                  {newDevices.devices.map((device, idx) => (
                    <div key={idx} className="device-item">
                      <div className="device-info">
                        <strong>{device.hostname || device.mac}</strong>
                        <span className="device-detail">{device.mac} • {device.manufacturer || 'Unknown'}</span>
                      </div>
                      <div className="device-stats">
                        <span className="stat-badge">{device.device_type || 'Unknown'}</span>
                        <span className="stat-badge">
                          First seen: {new Date(device.first_seen * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {inactiveDevices && inactiveDevices.devices && inactiveDevices.devices.length > 0 && (
              <>
                <h4>Inactive Devices (30+ days)</h4>
                <div className="device-list">
                  {inactiveDevices.devices.slice(0, 10).map((device, idx) => (
                    <div key={idx} className="device-item">
                      <div className="device-info">
                        <strong>{device.hostname || device.mac}</strong>
                        <span className="device-detail">{device.mac}</span>
                      </div>
                      <div className="device-stats">
                        <span className="stat-badge">{device.days_inactive} days inactive</span>
                        <span className="stat-badge">
                          Last seen: {new Date(device.last_seen * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {manufacturerBreakdown && manufacturerBreakdown.manufacturers && manufacturerBreakdown.manufacturers.length > 0 && (
              <>
                <h4>Devices by Manufacturer</h4>
                <div className="manufacturer-grid">
                  {manufacturerBreakdown.manufacturers.slice(0, 12).map((mfr, idx) => (
                    <div key={idx} className="manufacturer-card">
                      <div className="manufacturer-name">{mfr.manufacturer || 'Unknown'}</div>
                      <div className="manufacturer-count">{mfr.device_count} devices</div>
                      <div className="manufacturer-connected">{mfr.connected_count} online</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Report 5: Time-Based Analytics */}
      <section className="report-section">
        <h3 className="collapsible-header" onClick={() => toggleSection('timeline')}>
          {expandedSections.timeline ? '▼' : '▶'} Time-Based Analytics
        </h3>
        {expandedSections.timeline && (
          <div>
            {peakHours && peakHours.peak_hours && peakHours.peak_hours.length > 0 && (
              <>
                <h4>Peak Usage Hours</h4>
                <div className="timeline-list">
                  {peakHours.peak_hours.slice(0, 10).map((hour, idx) => (
                    <div key={idx} className="timeline-item">
                      <div className="timeline-time">Hour {hour.hour}:00</div>
                      <div className="timeline-bar" style={{width: `${(hour.avg_clients / peakHours.peak_hours[0].avg_clients) * 100}%`}}>
                        <span>{Math.round(hour.avg_clients)} avg clients</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {connectionTimeline && connectionTimeline.timeline && connectionTimeline.timeline.length > 0 && (
              <>
                <h4>Connection Timeline ({period})</h4>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-value">{formatNumber(connectionTimeline.summary?.total_events)}</div>
                    <div className="stat-label">Total Events</div>
                  </div>
                  <div className="stat-card online">
                    <div className="stat-value">{formatNumber(connectionTimeline.summary?.connects)}</div>
                    <div className="stat-label">Connections</div>
                  </div>
                  <div className="stat-card offline">
                    <div className="stat-value">{formatNumber(connectionTimeline.summary?.disconnects)}</div>
                    <div className="stat-label">Disconnections</div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Report 6: Events & Incidents */}
      <section className="report-section">
        <h3 className="collapsible-header" onClick={() => toggleSection('events')}>
          {expandedSections.events ? '▼' : '▶'} Events & Incidents
        </h3>
        {expandedSections.events && (
          <div>
            {massEvents && massEvents.events && massEvents.events.length > 0 && (
              <>
                <h4>Mass Disconnect Events</h4>
                <div className="event-list">
                  {massEvents.events.map((event, idx) => (
                    <div key={idx} className="event-item warning">
                      <div className="event-time">
                        {new Date(event.event_time * 1000).toLocaleString()}
                      </div>
                      <div className="event-details">
                        <strong>{event.affected_count} devices disconnected</strong>
                        <span className="event-type">{event.event_type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {eventTimeline && eventTimeline.timeline && eventTimeline.timeline.length > 0 && (
              <>
                <h4>Recent Events ({period})</h4>
                <div className="event-list">
                  {eventTimeline.timeline.slice(0, 20).map((event, idx) => (
                    <div key={idx} className="event-item">
                      <div className="event-time">
                        {new Date(event.timestamp * 1000).toLocaleString()}
                      </div>
                      <div className="event-details">
                        <strong>{event.hostname || event.mac}</strong>
                        <span className={`event-type ${event.event_type}`}>{event.event_type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Report 7: Bandwidth Analysis */}
      <section className="report-section">
        <h3 className="collapsible-header" onClick={() => toggleSection('bandwidth')}>
          {expandedSections.bandwidth ? '▼' : '▶'} Bandwidth Analysis
        </h3>
        {expandedSections.bandwidth && topConsumers && topConsumers.consumers && topConsumers.consumers.length > 0 && (
          <div>
            <h4>Top Bandwidth Consumers</h4>
            <div className="consumer-list">
              {topConsumers.consumers.map((consumer, idx) => (
                <div key={idx} className="consumer-item">
                  <div className="consumer-info">
                    <strong>{consumer.hostname || consumer.mac}</strong>
                    <span className="consumer-detail">{consumer.mac}</span>
                  </div>
                  <div className="consumer-stats">
                    <span className="stat-badge">↓ {formatBytes(consumer.total_rx_bytes)}</span>
                    <span className="stat-badge">↑ {formatBytes(consumer.total_tx_bytes)}</span>
                    <span className="stat-badge">Total: {formatBytes(consumer.total_bytes)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Report 8: Security & Compliance */}
      <section className="report-section">
        <h3 className="collapsible-header" onClick={() => toggleSection('security')}>
          {expandedSections.security ? '▼' : '▶'} Security & Compliance
        </h3>
        {expandedSections.security && (
          <div>
            {unknownDevices && unknownDevices.devices && unknownDevices.devices.length > 0 ? (
              <>
                <h4>Unknown/Unnamed Devices</h4>
                <div className="device-list">
                  {unknownDevices.devices.map((device, idx) => (
                    <div key={idx} className="device-item warning">
                      <div className="device-info">
                        <strong>{device.mac}</strong>
                        <span className="device-detail">
                          {device.manufacturer || 'Unknown manufacturer'} • {device.ip || 'No IP'}
                        </span>
                      </div>
                      <div className="device-stats">
                        <span className="stat-badge">{device.is_connected ? 'Online' : 'Offline'}</span>
                        <span className="stat-badge">
                          Last seen: {new Date(device.last_seen * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="no-data">All devices have been identified</div>
            )}
          </div>
        )}
      </section>

      {/* Last Updated */}
      {lastUpdated && (
        <div className="last-updated">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}

export default Reports
