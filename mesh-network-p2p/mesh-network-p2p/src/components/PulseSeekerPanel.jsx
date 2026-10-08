import React, { useEffect, useRef, useState } from "react";
import { PulseSeeker } from "../services/pulseSeeker.js";

export function PulseSeekerPanel({ meshNode }) {
  const seekerRef = useRef(null);

  const [status, setStatus] = useState({
    active: false,
    micOk: false,
    motionOk: false,
    errorMsg: null,
  });

  const [telemetry, setTelemetry] = useState({
    stillnessSec: 0,
    prediction: { tapping: 0.05, inertia: 0.02, normal: 0.9, noise: 0.03, topClass: "normal" },
    features: new Array(25).fill(0),
    environment: "unknown",
  });

  const [beacons, setBeacons] = useState([]);
  const [activeTab, setActiveTab] = useState("telemetry"); // 'telemetry' | 'beacons' | 'sim'

  const isLocalIpInsecure =
    typeof window !== "undefined" &&
    window.isSecureContext === false &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  // Initialize PulseSeeker on mount
  useEffect(() => {
    const seeker = new PulseSeeker({
      meshNode,
      inertiaTimeoutMs: 15000, // 15 seconds for quick testing, 5 minutes in production
    });
    seekerRef.current = seeker;

    seeker.init({
      onStatus: (st) => setStatus((prev) => ({ ...prev, ...st })),
      onTelemetry: (data) => setTelemetry(data),
      onDetection: (detection) => {
        setBeacons((prev) => [detection, ...prev].slice(0, 30));
      },
      onError: (err) => console.warn("[PulseSeeker]", err),
    });

    return () => {
      seeker.stop();
    };
  }, [meshNode]);

  function handleActivateSensors() {
    if (seekerRef.current) {
      seekerRef.current.init({
        onStatus: (st) => setStatus((prev) => ({ ...prev, ...st })),
        onTelemetry: (data) => setTelemetry(data),
        onDetection: (detection) => {
          setBeacons((prev) => [detection, ...prev].slice(0, 30));
        },
      });
    }
  }

  function handleSimulateTapping() {
    if (seekerRef.current) {
      seekerRef.current.simulateTapping();
    }
  }

  function handleSimulateInertia() {
    if (seekerRef.current) {
      seekerRef.current.simulateInertia();
    }
  }

  function handleTriggerAutoBeacon() {
    if (seekerRef.current) {
      seekerRef.current.triggerDetection("unconscious", 0.95, telemetry.features);
    }
  }

  const tappingPct = Math.round((telemetry.prediction?.tapping || 0) * 100);
  const inertiaPct = Math.round((telemetry.prediction?.inertia || 0) * 100);

  return (
    <div className="pulseseeker-container">
      {/* PulseSeeker Header */}
      <div className="pulseseeker-header">
        <div className="pulseseeker-title">
          <h2>🆘 InertiaSense — AI Passive Victim Detection</h2>
          <div className="pulseseeker-subtitle">
            Acoustic Tapping & Inertia Monitoring
          </div>
        </div>

        <div className="pulseseeker-badges">
          {status.active ? (
            <span className="status-tag status-active">● Detection Active</span>
          ) : (
            <span className="status-tag status-off">○ Standby / Requires Activation</span>
          )}
          <span className="status-tag status-env">📍 Env: {telemetry.environment}</span>
        </div>
      </div>

      {/* Core Design & Passive Rescue Note */}
      <div className="pulseseeker-notice">
        ℹ️ <strong>Passive Detection System:</strong> Designed for unconscious or trapped survivors who cannot press SOS buttons or call for help. Uses browser sensors (Web Audio MFCC/rhythm analysis + DeviceMotion accelerometer) to continuously listen for 2–4 Hz tapping on walls/debris and detect prolonged stillness.
      </div>

      {/* Insecure Context Warning for HTTP over Local IP */}
      {isLocalIpInsecure && (
        <div className="pulseseeker-warning">
          🔒 <strong>Browser Security Constraint (Local IP Access):</strong><br />
          You are opening over HTTP local IP (<code>{window.location.host}</code>). Browsers disable microphone access on HTTP over local IP.<br />
          <em>Use the <strong>"⚡ Simulation Suite"</strong> buttons below to test tapping detection, inertia alerts, and P2P mesh auto-beacons!</em>
        </div>
      )}

      {/* Primary Action & Navigation Controls */}
      <div className="pulseseeker-actions">
        <div className="action-buttons">
          {!status.active && (
            <button className="primary-btn pulse" onClick={handleActivateSensors}>
              🛡️ Activate Passive Detection Sensors
            </button>
          )}

          <button className="secondary-btn" onClick={handleSimulateTapping}>
            🔨 Simulate Tapping (3.2 Hz)
          </button>

          <button className="secondary-btn" onClick={handleSimulateInertia}>
            🛌 Simulate Inertia (&gt;5m Stillness)
          </button>

          <button className="danger-btn" onClick={handleTriggerAutoBeacon}>
            🚨 Trigger Auto-Beacon Broadcast
          </button>
        </div>

        <div className="view-tabs">
          <button className={`tab-btn ${activeTab === "telemetry" ? "active" : ""}`} onClick={() => setActiveTab("telemetry")}>
            📊 Sensor Telemetry
          </button>

          <button className={`tab-btn ${activeTab === "beacons" ? "active" : ""}`} onClick={() => setActiveTab("beacons")}>
            🆘 Survivor Beacons ({beacons.length})
          </button>
        </div>
      </div>

      {/* Tab 1: Sensor Telemetry & AI Inference */}
      {activeTab === "telemetry" && (
        <div className="telemetry-grid">
          {/* Tapping Confidence Card */}
          <div className="metric-card">
            <div className="metric-label">Acoustic Vibration & Tapping Pattern</div>
            <div
              className="metric-value"
              style={{
                color: tappingPct > 70 ? "#FF4D4D" : tappingPct > 30 ? "#FFB000" : "#22C55E"
              }}
            >
              {tappingPct}%
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${tappingPct}%`,
                  background: tappingPct > 70 ? "#FF4D4D" : tappingPct > 30 ? "#FFB000" : "#22C55E"
                }}
              />
            </div>
            <div className="metric-sub">
              {tappingPct > 70 ? "[!] HIGH-PRIORITY ANOMALY" : tappingPct > 30 ? "[!] UNUSUAL ACTIVITY" : "[✓] NORMAL ACTIVITY"} · 2–4 Hz periodic cadence
            </div>
          </div>

          {/* Inertia / Motionlessness Card */}
          <div className="metric-card">
            <div className="metric-label">Inertia & Immobility Timer</div>
            <div
              className="metric-value"
              style={{
                color: telemetry.stillnessSec > 300 ? "#FF4D4D" : telemetry.stillnessSec > 120 ? "#FFB000" : "#22C55E"
              }}
            >
              {telemetry.stillnessSec}s
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(100, (telemetry.stillnessSec / 300) * 100)}%`,
                  background: telemetry.stillnessSec > 300 ? "#FF4D4D" : telemetry.stillnessSec > 120 ? "#FFB000" : "#22C55E"
                }}
              />
            </div>
            <div className="metric-sub">
              {telemetry.stillnessSec > 300 ? "[!] HIGH-PRIORITY IMMOBILITY" : telemetry.stillnessSec > 120 ? "[!] UNUSUAL PROLONGED STILLNESS" : "[✓] NORMAL MOTION DETECTED"}
            </div>
          </div>

          {/* Environmental Classification Card */}
          <div className="metric-card">
            <div className="metric-label">Spatial Enclosure Classifier</div>
            <div className="metric-value" style={{ fontSize: "20px", color: "#FFB000" }}>
              {telemetry.environment.toUpperCase()}
            </div>
            <div className="metric-sub">Classified via acoustic damping profile & browser sensor proxies</div>
          </div>

          {/* Spectral Sub-band Energies Visualizer */}
          <div className="spectrum-card">
            <div className="card-title">Acoustic Spectrum & MFCC Features (25 Dimensions)</div>
            <div className="bars-container">
              {telemetry.features.slice(0, 15).map((val, idx) => (
                <div key={idx} className="bar-wrapper">
                  <div
                    className="bar-fill"
                    style={{
                      height: `${Math.min(100, val * 100)}%`,
                      background: "linear-gradient(to top, #FF8A00, #FFB000)"
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Beacons Feed */}
      {activeTab === "beacons" && (
        <div className="beacons-feed">
          <h3>⚡ Priority Signal Beacons Received ({beacons.length})</h3>

          {beacons.length === 0 ? (
            <div className="empty-beacons">
              No survivor emergency beacons triggered yet.<br />
              Click <strong>"🔨 Simulate Tapping"</strong> or <strong>"🚨 Trigger Auto-Beacon Broadcast"</strong> to test live beacon generation!
            </div>
          ) : (
            <div className="beacons-list">
              {beacons.map((b) => (
                <div key={b.id} className="beacon-card">
                  <div className="beacon-header">
                    <span className="beacon-type">
                      {b.type === "tapping" ? "🔨 Rhythmic Tapping Detected" : "🛌 Unconscious Survivor Alert"}
                    </span>
                    <span className="beacon-conf">{b.confidence}% Confidence</span>
                  </div>

                  <div className="beacon-body">
                    <div>📍 <strong>Location:</strong> {b.location.lat}, {b.location.lng} (±{b.location.accuracy}m)</div>
                    <div>🏢 <strong>Environment:</strong> {b.environment}</div>
                    <div>⏱ <strong>Timestamp:</strong> {new Date(b.timestamp).toLocaleTimeString()}</div>
                  </div>

                  <div className="beacon-footer">
                    <span className="beacon-tag">✓ Auto-Sent via P2P Mesh Network & REST API</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
