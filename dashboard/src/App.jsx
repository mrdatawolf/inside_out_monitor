import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Dashboard from './components/Dashboard'
import DeviceDetail from './components/DeviceDetail'
import PingMonitor from './components/PingMonitor'
import PingTargetDetail from './components/PingTargetDetail'
import { API_URL } from './api'
import './App.css'

function Navigation() {
  const location = useLocation()
  const isPingRoute = location.pathname.startsWith('/ping')

  return (
    <nav className="app-nav">
      <Link to="/" className={!isPingRoute ? 'active' : ''}>
        Heartbeats
      </Link>
      <Link to="/ping" className={isPingRoute ? 'active' : ''}>
        Ping Monitoring
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
          </Routes>
        </main>

        <footer className="app-footer">
          <p>Phase 3: Frontend Dashboard • Real-time monitoring</p>
        </footer>
      </div>
    </BrowserRouter>
  )
}

export default App
