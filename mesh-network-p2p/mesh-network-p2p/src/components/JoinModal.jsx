import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const OPERATIONAL_MODES = [
  {
    id: "mesh",
    path: "/",
    name: "P2P Mesh Network Console",
    icon: "🌐",
    tag: "WEBRTC · SOS ROUTING",
    desc: "Hop-by-hop serverless WebRTC data channels, Dijkstra congestion rerouting, on-device AI triage, and encrypted text/voice/media dispatch.",
    pill: "Hop-by-Hop · E2EE · Zero-Cloud",
    color: "#33D6A6",
    bgGradient: "linear-gradient(135deg, rgba(51, 214, 166, 0.2), rgba(20, 80, 60, 0.4))",
  },
  {
    id: "echolocate",
    path: "/echolocate",
    name: "EchoLocate Indoor Radar",
    icon: "📡",
    tag: "ACOUSTIC RTT · 2D RADAR",
    desc: "Non-GPS acoustic Time-of-Flight ranging and 2D least-squares multilateration to pinpoint trapped survivors indoors.",
    pill: "LFM Chirps · 2D Multilateration · Non-GPS",
    color: "#4B9EFF",
    bgGradient: "linear-gradient(135deg, rgba(75, 158, 255, 0.2), rgba(20, 50, 90, 0.4))",
  },
  {
    id: "pulseseeker",
    path: "/pulseseeker",
    name: "PulseSeeker Victim Detection",
    icon: "🆘",
    tag: "TINYML · RUBBLE TAPPING",
    desc: "100% offline acoustic rhythm & accelerometer sensor analysis to detect rubble tapping (3.2 Hz) and auto-dispatch emergency survivor beacons.",
    pill: "TinyML MFCC · Accelerometer · Auto-SOS",
    color: "#FF4B5C",
    bgGradient: "linear-gradient(135deg, rgba(255, 75, 92, 0.2), rgba(90, 20, 30, 0.4))",
  },
];

const PRESETS = [
  { label: "🚑 Rescue-Alpha", value: "Rescue-Alpha" },
  { label: "📱 Mobile-Beta", value: "Mobile-Beta" },
  { label: "🩺 Field-Medic-1", value: "Field-Medic-1" },
  { label: "📍 Victim-Node", value: "Victim-Node" },
  { label: "🏢 Base-Station", value: "Base-Station" },
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

  function handlePresetClick(val) {
    setLocalName(val);
    if (setName) setName(val);
  }

  function handleFormSubmit(e) {
    if (e) e.preventDefault();
    const finalName = localName.trim();
    if (!finalName) return;

    if (setName) setName(finalName);
    localStorage.setItem("mesh_node_name", finalName);
    sessionStorage.setItem("mesh_node_name", finalName);
    sessionStorage.setItem("mesh_joined", "true");

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
        {/* Header Bar */}
        <div className="mode-header-badge-row">
          <div className="mode-system-badge">
            <span className="live-dot pulse"></span>
            CRISISLINK // RAPID DISASTER DEPLOYMENT v3.0
          </div>
          <div className="mode-step-indicator">
            {step === "select-mode" ? "STEP 1 OF 2 : SELECT MODE" : "STEP 2 OF 2 : JOIN MESH"}
          </div>
        </div>

        {step === "select-mode" ? (
          /* ================= STEP 1: SELECT OPERATIONAL MODE ================= */
          <div className="mode-selector-step">
            <h2 className="mode-selector-title">
              <span>⚡</span> Select Operational Mode
            </h2>
            <p className="mode-selector-subtitle">
              Choose your role and operational subsystem to initialize peer-to-peer protocols and on-device AI:
            </p>

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
                  >
                    <div className="mode-card-top">
                      <div
                        className="mode-icon-box"
                        style={{
                          background: mode.bgGradient,
                          border: `1px solid ${mode.color}55`,
                        }}
                      >
                        {mode.icon}
                      </div>
                      <div className="mode-card-info">
                        <span className="mode-card-tag" style={{ color: mode.color }}>
                          {mode.tag}
                        </span>
                        <div className="mode-card-name">
                          {mode.name}
                        </div>
                      </div>
                    </div>

                    <p className="mode-card-desc">
                      {mode.desc}
                    </p>

                    <div className="mode-card-footer">
                      <span className="mode-card-pill">
                        {mode.pill}
                      </span>
                      <span className="mode-card-arrow" style={{ color: mode.color }}>
                        Select Mode →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="join-modal-footer-features">
              <span>🔒 100% Serverless WebRTC</span>
              <span>⚡ On-Device AI Triage</span>
              <span>📍 Non-GPS Acoustic RTT</span>
              <span>🛡️ Zero Cloud Dependency</span>
            </div>
          </div>
        ) : (
          /* ================= STEP 2: JOIN MESH & IDENTITY ================= */
          <div className="join-step-wrapper">
            {/* Selected Mode Summary Header */}
            <div className="selected-mode-summary-card">
              <div className="summary-left">
                <div className="summary-icon">{selectedMode.icon}</div>
                <div>
                  <div className="summary-title">{selectedMode.name}</div>
                  <span className="summary-badge" style={{ color: selectedMode.color }}>
                    Target Mode: {selectedMode.tag}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn-change-mode"
                onClick={() => setStep("select-mode")}
              >
                ← Change Mode
              </button>
            </div>

            <h2 className="mode-selector-title" style={{ fontSize: 22 }}>
              <span>📡</span> Identify Your Device & Join Mesh
            </h2>
            <p className="mode-selector-subtitle" style={{ marginBottom: 18 }}>
              Enter a display name so nearby peers, rescue vans, and base stations can recognize and route packets to you:
            </p>

            <form onSubmit={handleFormSubmit}>
              <div className="join-form-group">
                <label className="join-form-label" htmlFor="node-name-input">
                  <span>YOUR NODE DISPLAY NAME</span>
                  <span style={{ color: "var(--signal)", fontFamily: "var(--mono)", fontSize: 11 }}>
                    {localName.trim() ? `ID: ${localName.trim()}` : "REQUIRED"}
                  </span>
                </label>
                <input
                  id="node-name-input"
                  className="join-input-box"
                  type="text"
                  placeholder="e.g. Rescue-Alpha, Phone-Beta, Field-Medic-1..."
                  value={localName}
                  onChange={(e) => {
                    setLocalName(e.target.value);
                    if (setName) setName(e.target.value);
                  }}
                  autoFocus
                />
              </div>

              {/* Quick Presets */}
              <div className="presets-section">
                <div className="presets-label">⚡ Quick Identity Presets:</div>
                <div className="presets-row">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className="preset-pill-btn"
                      onClick={() => handlePresetClick(preset.value)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="join-actions-row">
                <button
                  type="button"
                  className="btn-change-mode"
                  style={{ padding: "14px 20px", fontSize: 13 }}
                  onClick={() => setStep("select-mode")}
                >
                  ← Back to Modes
                </button>
                <button
                  id="submit-join-mesh-btn"
                  type="submit"
                  disabled={!canJoin}
                  className={`btn-launch-mode-primary ${canJoin ? 'enabled' : 'disabled'}`}
                  style={{
                    background: canJoin ? selectedMode.color : undefined,
                  }}
                >
                  <span>🚀 Join Mesh & Launch {selectedMode.name}</span>
                  <span>→</span>
                </button>
              </div>
            </form>

            <div className="join-modal-footer-features" style={{ marginTop: 22 }}>
              <span>✓ Auto-Discovers Local Peers</span>
              <span>✓ Encrypted WebRTC Channels</span>
              <span>✓ Offline On-Device AI</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
