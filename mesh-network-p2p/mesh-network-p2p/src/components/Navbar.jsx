import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';

export function Navbar() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="nav-header">
      <div className="nav-brand-container">
        <div className="nav-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-text">CrisisLink</span>
        </div>
        <div className="system-live-badge">
          <span className="live-dot pulse"></span>
          <span className="live-text">OPERATIONAL · {time}</span>
        </div>
      </div>

      <nav className="nav-links">
        <NavLink to="/" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`} end>
          <span>🌐</span> Mesh Console
        </NavLink>
        <NavLink to="/echolocate" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
          <span>📡</span> EchoLocate
        </NavLink>
        <NavLink to="/pulseseeker" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
          <span>🆘</span> PulseSeeker
        </NavLink>
        <NavLink to="/lifeboat" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
          <span>🚤</span> Lifeboat Routing
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
          <span>☁️</span> Cloud Dashboard
        </NavLink>
      </nav>
    </header>
  );
}
