import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { JoinModal } from './JoinModal.jsx';

export function Navbar() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString());
  const [showModal, setShowModal] = useState(false);
  const location = useLocation();
  const [nodeName, setNodeName] = useState(() => {
    try {
      return localStorage.getItem("mesh_node_name") || "";
    } catch (e) {
      return "";
    }
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
      try {
        const stored = localStorage.getItem("mesh_node_name") || "";
        if (stored !== nodeName) setNodeName(stored);
      } catch (e) {}
    }, 1000);
    return () => clearInterval(timer);
  }, [nodeName]);

  function handleModalJoin(newName) {
    if (newName) setNodeName(newName);
    setShowModal(false);
  }

  return (
    <>
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

          <button
            type="button"
            className="nav-tab"
            style={{
              background: "rgba(51, 214, 166, 0.12)",
              border: "1px solid rgba(51, 214, 166, 0.35)",
              color: "var(--signal)",
              cursor: "pointer",
              marginLeft: "6px",
              fontWeight: 700,
            }}
            onClick={() => setShowModal(true)}
            title="Switch Operational Mode or Change Node Identity"
          >
            <span>⚡</span> {nodeName ? `Role: ${nodeName}` : "Select Mode"}
          </button>
        </nav>
      </header>

      {showModal && (
        <JoinModal
          name={nodeName}
          setName={setNodeName}
          onJoin={handleModalJoin}
          defaultMode={location.pathname}
        />
      )}
    </>
  );
}

