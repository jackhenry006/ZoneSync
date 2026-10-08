import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { JoinModal } from './JoinModal.jsx';

export function Navbar() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString());
  const [showModal, setShowModal] = useState(false);
  const location = useLocation();
  const [isJoined, setIsJoined] = useState(() => {
    try {
      return sessionStorage.getItem("mesh_joined") === "true";
    } catch (e) {
      return false;
    }
  });
  const [nodeName, setNodeName] = useState(() => {
    try {
      return localStorage.getItem("mesh_node_name") || "";
    } catch (e) {
      return "";
    }
  });

  useEffect(() => {
    const handleJoined = () => setIsJoined(true);
    window.addEventListener("mesh_joined", handleJoined);
    const interval = setInterval(() => {
      try {
        const j = sessionStorage.getItem("mesh_joined") === "true";
        if (j !== isJoined) setIsJoined(j);
      } catch (e) {}
    }, 400);
    return () => {
      window.removeEventListener("mesh_joined", handleJoined);
      clearInterval(interval);
    };
  }, [isJoined]);

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

  // Hide the navbar on "Select Mode" and "Enter Name" sections before joining
  if (!isJoined) {
    return null;
  }

  // When modal is explicitly open, hide navbar as well
  if (showModal) {
    return (
      <JoinModal
        name={nodeName}
        setName={setNodeName}
        onJoin={handleModalJoin}
        defaultMode={location.pathname}
      />
    );
  }

  return (
    <header className="nav-header">
      <div className="nav-brand-container">
        <div className="nav-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-text">ZoneSync</span>
        </div>
        <div className="system-live-badge">
          <span className="live-dot pulse"></span>
          <span className="live-text">OPERATIONAL · {time}</span>
        </div>
      </div>

      <div className="nav-right-controls" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <nav className="nav-links">
          <NavLink to="/" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`} end>
            <span>🌐</span> ConnectX
          </NavLink>
          <NavLink to="/echolocate" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
            <span>📡</span> EvoSense
          </NavLink>
          <NavLink to="/pulseseeker" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
            <span>⚡</span> InertiaSense
          </NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => `nav-tab hide-on-mobile ${isActive ? 'active' : ''}`}>
            <span>☁️</span> Cloud Dashboard
          </NavLink>

          <button
            type="button"
            className="nav-tab hide-on-mobile role-mode-btn"
            onClick={() => setShowModal(true)}
            title="Switch Operational Mode or Change Node Identity"
          >
            <span>⚡</span> {nodeName ? `Node: ${nodeName}` : "Select Mode"}
          </button>
        </nav>
      </div>
    </header>
  );
}

