import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const OPERATIONAL_MODES = [
  {
    id: "mesh",
    path: "/",
    name: "ConnectX",
    icon: "🌐",
    color: "#FFB000",
  },
  {
    id: "echolocate",
    path: "/echolocate",
    name: "EvoSense",
    icon: "📡",
    color: "#38BDF8",
  },
  {
    id: "pulseseeker",
    path: "/pulseseeker",
    name: "InertiaSense",
    icon: "⚡",
    color: "#FF8A00",
  },
];

export function JoinModal({ name, setName, onJoin, defaultMode }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Find initial mode matching current path or default
  const initialMode = OPERATIONAL_MODES.find(m => m.path === (defaultMode || location.pathname)) || OPERATIONAL_MODES[0];

  const [step, setStep] = useState("select-mode"); // "select-mode" | "join-mesh"
  const [selectedMode, setSelectedMode] = useState(initialMode);
  const [localName, setLocalName] = useState(() => name || localStorage.getItem("mesh_node_name") || "");

  useEffect(() => {
    if (name) {
      setLocalName(name);
    }
  }, [name]);

  function handleSelectMode(mode) {
    setSelectedMode(mode);
    setStep("join-mesh");
  }

  function handleFormSubmit(e) {
    if (e) e.preventDefault();
    const finalName = localName.trim();
    if (!finalName) return;

    if (setName) setName(finalName);
    localStorage.setItem("mesh_node_name", finalName);
    sessionStorage.setItem("mesh_node_name", finalName);
    sessionStorage.setItem("mesh_joined", "true");
    window.dispatchEvent(new Event("mesh_joined"));

    if (onJoin) {
      onJoin(finalName);
    }

    if (location.pathname !== selectedMode.path) {
      navigate(selectedMode.path);
    }
  }

  const canJoin = Boolean(localName && localName.trim());

  return (
    <div className="mode-join-overlay">
      <div className="mode-join-modal-container">
        {step === "select-mode" ? (
          /* ================= STEP 1: SELECT OPERATIONAL MODE ================= */
          <div className="mode-selector-step">
            <h2 className="mode-selector-title">
              <span>⚡</span> Select Mode
            </h2>

            <div className="modes-grid">
              {OPERATIONAL_MODES.map((mode) => {
                const isCurrent = selectedMode.id === mode.id;
                return (
                  <div
                    key={mode.id}
                    className={`mode-card ${isCurrent ? 'selected' : ''}`}
                    onClick={() => handleSelectMode(mode)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectMode(mode);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div
                      className="mode-icon-box"
                      style={{
                        background: `${mode.color}15`,
                        borderColor: `${mode.color}40`,
                      }}
                    >
                      <span style={{ fontSize: '28px' }}>{mode.icon}</span>
                    </div>
                    <div className="mode-card-name" style={{ color: mode.color }}>
                      {mode.name}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ================= STEP 2: ENTER NAME ================= */
          <div className="join-step-wrapper">
            <div className="selected-mode-summary-card" style={{ marginBottom: 20 }}>
              <div className="summary-left" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  className="mode-icon-box"
                  style={{
                    width: 46,
                    height: 46,
                    fontSize: 24,
                    background: `${selectedMode.color}18`,
                    borderColor: `${selectedMode.color}40`,
                  }}
                >
                  {selectedMode.icon}
                </div>
                <div>
                  <div className="summary-title" style={{ color: selectedMode.color, fontSize: 18, fontWeight: 700 }}>
                    {selectedMode.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Active Platform Mode
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-change-mode"
                onClick={() => setStep("select-mode")}
              >
                Change Mode
              </button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="join-form-group" style={{ marginBottom: 20 }}>
                <input
                  id="node-name-input"
                  className="join-input-box"
                  type="text"
                  placeholder="Enter your name..."
                  value={localName}
                  onChange={(e) => {
                    setLocalName(e.target.value);
                    if (setName) setName(e.target.value);
                  }}
                  autoFocus
                />
              </div>

              <div className="join-actions-row">
                <button
                  type="button"
                  className="btn-change-mode"
                  style={{ padding: "14px 20px", fontSize: 14 }}
                  onClick={() => setStep("select-mode")}
                >
                  ← Back to Mode
                </button>
                <button
                  id="submit-join-mesh-btn"
                  type="submit"
                  disabled={!canJoin}
                  className={`btn-launch-mode-primary ${canJoin ? 'enabled' : 'disabled'}`}
                  style={{
                    background: canJoin ? selectedMode.color : undefined,
                    color: canJoin ? "#111315" : undefined,
                    fontWeight: 700,
                    padding: "14px 22px",
                    fontSize: 15,
                  }}
                >
                  <span>Join {selectedMode.name}</span>
                  <span>→</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
