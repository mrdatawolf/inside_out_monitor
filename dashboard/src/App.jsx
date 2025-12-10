import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Dashboard from './components/Dashboard'
import DeviceDetail from './components/DeviceDetail'
import PingMonitor from './components/PingMonitor'
import PingTargetDetail from './components/PingTargetDetail'
import UniFiClients from './components/UniFiClients'
import UniFiClientDetail from './components/UniFiClientDetail'
import Monitoring from './components/Monitoring'
import Reports from './components/Reports'
import { API_URL } from './api'
import './App.css'

function Navigation() {
  const location = useLocation()
  const isHeartbeatRoute = location.pathname === '/' || location.pathname.startsWith('/device/')
  const isPingRoute = location.pathname.startsWith('/ping')
  const isUnifiRoute = location.pathname.startsWith('/unifi')
  const isMonitoringRoute = location.pathname.startsWith('/monitoring')
  const isReportsRoute = location.pathname.startsWith('/reports')

  return (
    <nav className="app-nav">
      <Link to="/" className={isHeartbeatRoute ? 'active' : ''}>
        Heartbeats
      </Link>
      <Link to="/ping" className={isPingRoute ? 'active' : ''}>
        Ping Monitoring
      </Link>
      <Link to="/unifi" className={isUnifiRoute ? 'active' : ''}>
        Dreaming
      </Link>
      <Link to="/monitoring" className={isMonitoringRoute ? 'active' : ''}>
        Web & Files
      </Link>
      <Link to="/reports" className={isReportsRoute ? 'active' : ''}>
        Reports
      </Link>
    </nav>
  )
}

function App() {
  // Set window title with API server
  useEffect(() => {
    const serverDisplay = API_URL.replace('/api', '').replace('http://', '').replace('https://', '');
    document.title = `Inside-Out Monitor → ${serverDisplay}`;
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        {/* SVG Filters for Electric Effect */}
        <svg className="svg-filters" style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <filter id="filter-green" colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="7" seed="10" />
              <feColorMatrix type="hueRotate" result="pt1">
                <animate attributeName="values" values="0;360" dur="0.7s" repeatCount="indefinite" />
              </feColorMatrix>
              <feTurbulence type="turbulence" baseFrequency="0.03" numOctaves="7" seed="15" />
              <feColorMatrix type="hueRotate" result="pt2">
                <animate attributeName="values" values="0;270;180;90;360" dur="4.5s" repeatCount="indefinite" />
              </feColorMatrix>
              <feBlend in="pt1" in2="pt2" mode="normal" result="combinedNoise" />
              <feDisplacementMap in="SourceGraphic" scale="30" xChannelSelector="R" yChannelSelector="B" />
            </filter>

            <filter id="filter-blue" colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="7" />
              <feColorMatrix type="hueRotate" result="pt1">
                <animate attributeName="values" values="0;360" dur=".6s" repeatCount="indefinite" />
              </feColorMatrix>
              <feTurbulence type="turbulence" baseFrequency="0.03" numOctaves="7" seed="5" />
              <feColorMatrix type="hueRotate" result="pt2">
                <animate attributeName="values" values="0;333;199;286;64;168;256;157;360" dur="5s" repeatCount="indefinite" />
              </feColorMatrix>
              <feBlend in="pt1" in2="pt2" mode="normal" result="combinedNoise" />
              <feDisplacementMap in="SourceGraphic" scale="30" xChannelSelector="R" yChannelSelector="B" />
            </filter>

            <filter id="filter-red" colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="7" seed="20" />
              <feColorMatrix type="hueRotate" result="pt1">
                <animate attributeName="values" values="0;360" dur="0.5s" repeatCount="indefinite" />
              </feColorMatrix>
              <feTurbulence type="turbulence" baseFrequency="0.03" numOctaves="7" seed="25" />
              <feColorMatrix type="hueRotate" result="pt2">
                <animate attributeName="values" values="0;180;90;270;360" dur="4s" repeatCount="indefinite" />
              </feColorMatrix>
              <feBlend in="pt1" in2="pt2" mode="normal" result="combinedNoise" />
              <feDisplacementMap in="SourceGraphic" scale="30" xChannelSelector="R" yChannelSelector="B" />
            </filter>
          </defs>
        </svg>

        <header className="app-header">
          <h1>
            <Link to="/" className="logo-link">Inside-Out Monitor</Link>
          </h1>
          <p className="subtitle">Device Monitoring Dashboard</p>
          <Navigation />
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/device/:name" element={<DeviceDetail />} />
            <Route path="/ping" element={<PingMonitor />} />
            <Route path="/ping/:ip" element={<PingTargetDetail />} />
            <Route path="/unifi" element={<UniFiClients />} />
            <Route path="/unifi/client/:mac" element={<UniFiClientDetail />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/reports" element={<Reports />} />
          </Routes>
        </main>

        <footer className="app-footer">
          <p>Phase 7: Extended Reporting • Network analytics and insights</p>
        </footer>
      </div>
    </BrowserRouter>
  )
}

export default App
