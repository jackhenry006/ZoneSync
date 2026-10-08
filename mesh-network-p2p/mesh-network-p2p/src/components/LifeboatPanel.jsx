import React, { useState, useEffect } from "react";
import { LethalityCalculator } from "../services/lethalityCalculator.js";

const BACKEND_BASE = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
function apiUrl(path) {
  return BACKEND_BASE ? `${BACKEND_BASE}${path}` : path;
}

export function LifeboatPanel() {
  const [clientCalculator] = useState(() => new LethalityCalculator());
  const [deviceId, setDeviceId] = useState("device-rescue-01");
  const [messageText, setMessageText] = useState("I am trapped under rubble and bleeding heavily");
  const [baroDropRate, setBaroDropRate] = useState(7.5);
  const [queueStats, setQueueStats] = useState({ critical: 0, elevated: 0, normal: 0, low: 0, totalQueued: 0 });
  const [criticalMessages, setCriticalMessages] = useState([]);
  const [calcResult, setCalcResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("simulator");

  // Custom sensor state
  const [stillnessMins, setStillnessMins] = useState(10);
  const [ambientLight, setAmbientLight] = useState(0);
  const [battery, setBattery] = useState(15);
  const [nearWater, setNearWater] = useState(false);
  const [dispatchedAlerts, setDispatchedAlerts] = useState([]);

  // Calculate default state on mount
  useEffect(() => {
    runCalculation();
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch(apiUrl("/api/priority/queue"));
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setQueueStats(data.stats);
        if (data.nextCritical) setCriticalMessages(data.nextCritical);
      }
    } catch (err) {
      console.warn("[Lifeboat UI] API polling warning (using local mode):", err.message);
    }
  }

  function buildPayload(overrideParams = {}) {
    const dId = overrideParams.deviceId !== undefined ? overrideParams.deviceId : deviceId;
    const msg = overrideParams.messageText !== undefined ? overrideParams.messageText : messageText;
    const bDrop = overrideParams.baroDropRate !== undefined ? overrideParams.baroDropRate : baroDropRate;
    const sMins = overrideParams.stillnessMins !== undefined ? overrideParams.stillnessMins : stillnessMins;
    const aLight = overrideParams.ambientLight !== undefined ? overrideParams.ambientLight : ambientLight;
    const batt = overrideParams.battery !== undefined ? overrideParams.battery : battery;
    const nWater = overrideParams.nearWater !== undefined ? overrideParams.nearWater : nearWater;

    return {
      deviceId: dId,
      sensors: {
        barometer: {
          readings: [
            { value: 1015, timestamp: Date.now() - 60000 },
            { value: 1015 - bDrop, timestamp: Date.now() }
          ]
        },
        accelerometer: {
          readings: [
            { x: 0.1, y: 0.2, z: 9.8, timestamp: Date.now() - sMins * 60 * 1000 },
            { x: 0.1, y: 0.2, z: 9.8, timestamp: Date.now() }
          ]
        },
        ambientLight: Number(aLight),
        battery: Number(batt)
      },
      location: {
        lat: 28.6139,
        lng: 77.2090,
        accuracy: 10,
        nearWater: nWater
      },
      message: {
        text: msg,
        timestamp: Date.now()
      }
    };
  }

  async function runCalculation(overrideParams) {
    setLoading(true);
    const payload = buildPayload(overrideParams);

    try {
      // Try posting to backend API first
      const res = await fetch(apiUrl("/api/heartbeat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setCalcResult(data);
        fetchStats();
        setLoading(false);
        return;
      }
    } catch (err) {
      console.warn("[Lifeboat UI] Server API offline, running on-device calculation fallback...");
    }

    // On-device calculation fallback
    try {
      const localResult = clientCalculator.calculate(payload);
      setCalcResult({
        ...localResult,
        deviceId: payload.deviceId,
        queuePosition: 1,
        estimatedDelivery: localResult.priority === "critical" ? "Immediate rescue dispatch (< 1 min)" : "Dispatch within 5 minutes",
        queueId: `msg-${Date.now()}`,
        timestamp: Date.now()
      });

      // Update local queue stats mock
      setQueueStats(prev => {
        const p = localResult.priority;
        return {
          ...prev,
          [p]: ((prev && prev[p]) || 0) + 1,
          totalQueued: ((prev && prev.totalQueued) || 0) + 1
        };
      });
    } catch (e) {
      console.error("[Lifeboat UI] Local calc error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDispatchAlerts() {
    try {
      const res = await fetch(apiUrl("/api/alert/send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5 })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.dispatchedAlerts) {
          setDispatchedAlerts(prev => [...data.dispatchedAlerts, ...prev].slice(0, 20));
        }
        fetchStats();
        return;
      }
    } catch (err) {
      console.warn("[Lifeboat UI] Backend dispatch offline, simulating alert dispatch...");
    }

    // Local dispatch fallback
    if (calcResult) {
      const newAlert = {
        alertId: `alert-${Date.now()}`,
        id: calcResult.queueId || `msg-${Date.now()}`,
        deviceId: calcResult.deviceId,
        score: calcResult.score,
        priority: calcResult.priority,
        location: { lat: 28.6139, lng: 77.2090 },
        messageText: messageText,
        dispatchedAt: Date.now()
      };
      setDispatchedAlerts(prev => [newAlert, ...prev].slice(0, 20));
      setQueueStats(prev => ({
        ...prev,
        critical: Math.max(0, ((prev && prev.critical) || 0) - 1),
        totalProcessed: ((prev && prev.totalProcessed) || 0) + 1
      }));
    }
  }

  // Presets handlers (updates inputs & triggers instant calculation)
  function applyPresetFlood() {
    const p = {
      deviceId: "dev-flood-88",
      messageText: "Water level rising rapidly, trapped in basement drowning",
      baroDropRate: 9.0,
      stillnessMins: 1,
      ambientLight: 1,
      battery: 45,
      nearWater: true
    };
    setDeviceId(p.deviceId);
    setMessageText(p.messageText);
    setBaroDropRate(p.baroDropRate);
    setStillnessMins(p.stillnessMins);
    setAmbientLight(p.ambientLight);
    setBattery(p.battery);
    setNearWater(p.nearWater);
    runCalculation(p);
  }

  function applyPresetInjury() {
    const p = {
      deviceId: "dev-injured-12",
      messageText: "Crushed under heavy wall, severe bleeding and broken bone",
      baroDropRate: 0.5,
      stillnessMins: 10,
      ambientLight: 0,
      battery: 12,
      nearWater: false
    };
    setDeviceId(p.deviceId);
    setMessageText(p.messageText);
    setBaroDropRate(p.baroDropRate);
    setStillnessMins(p.stillnessMins);
    setAmbientLight(p.ambientLight);
    setBattery(p.battery);
    setNearWater(p.nearWater);
    runCalculation(p);
  }

  function applyPresetInertia() {
    const p = {
      deviceId: "dev-unconscious-03",
      messageText: "No response, prolonged stillness detected",
      baroDropRate: 0,
      stillnessMins: 15,
      ambientLight: 2,
      battery: 25,
      nearWater: false
    };
    setDeviceId(p.deviceId);
    setMessageText(p.messageText);
    setBaroDropRate(p.baroDropRate);
    setStillnessMins(p.stillnessMins);
    setAmbientLight(p.ambientLight);
    setBattery(p.battery);
    setNearWater(p.nearWater);
    runCalculation(p);
  }

  function applyPresetSafe() {
    const p = {
      deviceId: "dev-safe-99",
      messageText: "I am safe, checking in with emergency team",
      baroDropRate: 0,
      stillnessMins: 0,
      ambientLight: 400,
      battery: 90,
      nearWater: false
    };
    setDeviceId(p.deviceId);
    setMessageText(p.messageText);
    setBaroDropRate(p.baroDropRate);
    setStillnessMins(p.stillnessMins);
    setAmbientLight(p.ambientLight);
    setBattery(p.battery);
    setNearWater(p.nearWater);
    runCalculation(p);
  }

  const getPriorityColor = (p) => {
    switch (p) {
      case "critical": return "#FF4D4D";
      case "elevated": return "#FFB000";
      case "normal": return "#38BDF8";
      case "low": default: return "#22C55E";
    }
  };

  return (
    <div className="lifeboat-container">
      {/* Header */}
      <div className="lifeboat-header">
        <div>
          <h2>🚤 Lifeboat Routing System</h2>
          <div className="lifeboat-subtitle">
            Multi-Sensor Lethality Calculator & 4-Tier Priority Queue Engine
          </div>
        </div>

        <div className="lifeboat-actions-top">
          <button className="danger-btn" onClick={handleDispatchAlerts}>
            🚨 Dispatch Rescuer Alerts (Dequeue Batch)
          </button>
        </div>
      </div>

      {/* Overview Notice */}
      <div className="lifeboat-notice">
        ⚡ <strong>Multi-Sensor Lethality Scoring:</strong> Calculates risk scores (0–100) from barometer pressure drops, accelerometer stillness, ambient light entrapment, battery levels, water proximity, and emergency keywords (*bleeding, trapped, crush, water*). Pushes messages to <code>critical</code> (score &ge; 80), <code>elevated</code> (50–79), <code>normal</code> (20–49), and <code>low</code> (&lt; 20) queues with 10,000 max capacity protection.
      </div>

      {/* Preset Simulation Bar */}
      <div className="presets-bar">
        <span className="presets-label">⚡ Quick Disaster Presets:</span>
        <button className="preset-btn" onClick={applyPresetFlood}>🌊 Severe Flood & Water Rise</button>
        <button className="preset-btn" onClick={applyPresetInjury}>🩸 Trapped Injured Victim</button>
        <button className="preset-btn" onClick={applyPresetInertia}>🛌 Unconscious Stillness (&gt;10m)</button>
        <button className="preset-btn" onClick={applyPresetSafe}>🟢 Routine Safe Check-in</button>
      </div>

      {/* Main 2-Column Grid */}
      <div className="lifeboat-grid">
        {/* Column 1: Input Controls */}
        <div className="form-card">
          <div className="card-title">📡 Simulated Sensor Telemetry & Message Ingestion</div>

          <div className="form-group">
            <label>Device ID:</label>
            <input type="text" className="input-field" value={deviceId} onChange={e => setDeviceId(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Emergency Message Text:</label>
            <textarea className="input-field" rows={2} value={messageText} onChange={e => setMessageText(e.target.value)} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Barometer Drop (hPa/min):</label>
              <input type="number" step="0.5" className="input-field" value={baroDropRate} onChange={e => setBaroDropRate(Number(e.target.value))} />
            </div>

            <div className="form-group">
              <label>Stillness Duration (Minutes):</label>
              <input type="number" className="input-field" value={stillnessMins} onChange={e => setStillnessMins(Number(e.target.value))} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Ambient Light (lux):</label>
              <input type="number" min="0" max="1000" className="input-field" value={ambientLight} onChange={e => setAmbientLight(Number(e.target.value))} />
            </div>

            <div className="form-group">
              <label>Battery Remaining (%):</label>
              <input type="number" min="1" max="100" className="input-field" value={battery} onChange={e => setBattery(Number(e.target.value))} />
            </div>
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input type="checkbox" checked={nearWater} onChange={e => setNearWater(e.target.checked)} />
              Proximity to Flood / Water Hazard (nearWater: true)
            </label>
          </div>

          <button className="primary-btn pulse" style={{ width: "100%", marginTop: 10 }} onClick={() => runCalculation()} disabled={loading}>
            {loading ? "Processing Calculation..." : "⚡ Calculate Lethality Score & Enqueue Message"}
          </button>
        </div>

        {/* Column 2: Calculation Output */}
        <div className="output-card">
          <div className="card-title">📊 Calculated Risk Score & Rescue Recommendations</div>

          {calcResult ? (
            <div className="calc-result-body">
              <div className="score-header">
                <div className="score-gauge" style={{ borderColor: getPriorityColor(calcResult.priority), color: getPriorityColor(calcResult.priority) }}>
                  {calcResult.score}
                  <span className="score-max">/100</span>
                </div>

                <div className="score-meta">
                  <div className="priority-badge" style={{ background: getPriorityColor(calcResult.priority) + "33", color: getPriorityColor(calcResult.priority), borderColor: getPriorityColor(calcResult.priority) }}>
                    PRIORITY: {calcResult.priority.toUpperCase()}
                  </div>
                  <div className="delivery-est">⏱ {calcResult.estimatedDelivery}</div>
                  <div className="queue-pos">📍 Position in Priority Queue: <strong>#{calcResult.queuePosition}</strong></div>
                </div>
              </div>

              {/* Lethality Score Progress Indicator Bar */}
              <div className="score-progress-container">
                <div className="score-progress-label">
                  <span>Lethality Score Index</span>
                  <span>{calcResult.score}%</span>
                </div>
                <div className="score-progress-track">
                  <div className="score-progress-fill" style={{ width: `${calcResult.score}%`, background: getPriorityColor(calcResult.priority) }} />
                </div>
              </div>

              <div className="result-section">
                <div className="section-label">Contributed Risk Factors ({calcResult.factors.length}):</div>
                <div className="factors-list">
                  {calcResult.factors.map((f, i) => (
                    <div key={i} className="factor-item">
                      <span className="factor-name">• {f.factor}</span>
                      <span className="factor-weight">+{f.weight} pts</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="result-section">
                <div className="section-label">Generated Rescue Recommendations:</div>
                <div className="recs-list">
                  {calcResult.recommendations.map((r, i) => (
                    <div key={i} className="rec-item">✓ {r}</div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-result">
              Calculating initial risk score...
            </div>
          )}
        </div>
      </div>

      {/* Dispatched Rescue Alerts Feed */}
      {dispatchedAlerts.length > 0 && (
        <div className="queue-stats-section">
          <h3>🚨 Active Rescuer Dispatched Alerts ({dispatchedAlerts.length})</h3>
          <div className="beacons-list">
            {dispatchedAlerts.map(alert => (
              <div key={alert.alertId} className="beacon-card" style={{ borderColor: getPriorityColor(alert.priority) }}>
                <div className="beacon-header">
                  <span className="beacon-type" style={{ color: getPriorityColor(alert.priority) }}>
                    🚨 Emergency Dispatch Alert (#{alert.id})
                  </span>
                  <span className="beacon-conf" style={{ background: getPriorityColor(alert.priority) + "33", color: getPriorityColor(alert.priority) }}>
                    Score {alert.score} / 100 ({alert.priority.toUpperCase()})
                  </span>
                </div>
                <div className="beacon-body">
                  <div>📱 <strong>Device:</strong> {alert.deviceId}</div>
                  <div>💬 <strong>Message:</strong> "{alert.messageText}"</div>
                  <div>⏱ <strong>Dispatched At:</strong> {new Date(alert.dispatchedAt).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Priority Queue Live Status Bar */}
      {queueStats && (
        <div className="queue-stats-section">
          <h3>📊 Live Priority Queues Status</h3>
          <div className="queue-grid">
            <div className="queue-card" style={{ borderLeftColor: "#FF4B5C" }}>
              <div className="q-label">Critical Queue (Immediate)</div>
              <div className="q-val" style={{ color: "#FF4B5C" }}>{queueStats.critical}</div>
              <div className="q-sub">Score &ge; 80</div>
            </div>

            <div className="queue-card" style={{ borderLeftColor: "#F0A63C" }}>
              <div className="q-label">Elevated Queue (&lt; 5m)</div>
              <div className="q-val" style={{ color: "#F0A63C" }}>{queueStats.elevated}</div>
              <div className="q-sub">Score 50-79</div>
            </div>

            <div className="queue-card" style={{ borderLeftColor: "#38BDF8" }}>
              <div className="q-label">Normal Queue (&lt; 30m)</div>
              <div className="q-val" style={{ color: "#38BDF8" }}>{queueStats.normal}</div>
              <div className="q-sub">Score 20-49</div>
            </div>

            <div className="queue-card" style={{ borderLeftColor: "#22C55E" }}>
              <div className="q-label">Low Priority (Audit Only)</div>
              <div className="q-val" style={{ color: "#22C55E" }}>{queueStats.low}</div>
              <div className="q-sub">Score &lt; 20</div>
            </div>

            <div className="queue-card" style={{ borderLeftColor: "#AAAAAA" }}>
              <div className="q-label">Total System Metrics</div>
              <div className="q-sub">Total Queued: <strong>{queueStats.totalQueued}</strong> / {queueStats.maxSize}</div>
              <div className="q-sub">Processed: <strong>{queueStats.totalProcessed}</strong></div>
              <div className="q-sub">Dropped / Evicted: <strong>{queueStats.totalDropped}</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
