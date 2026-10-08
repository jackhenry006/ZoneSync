import React, { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import { classifyUrgency, URGENT_TERMS } from '../services/urgencyClassifier.js';

export function AiClassifierView() {
  const [socket] = useState(() => io(import.meta.env.VITE_BACKEND_URL || undefined));
  const [connected, setConnected] = useState(false);
  const [aiModel, setAiModel] = useState({
    version: 1,
    terms: { ...URGENT_TERMS },
  });

  // Interactive Live Tester state
  const [testText, setTestText] = useState("Severe gas leak and explosion detected, people are trapped and bleeding!");
  const [newWord, setNewWord] = useState("");
  const [newWeight, setNewWeight] = useState(9);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [weightFilter, setWeightFilter] = useState("all"); // 'all' | 'critical' | 'elevated'

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("update", (payload) => {
      if (payload && payload.aiModel && payload.aiModel.terms) {
        setAiModel(payload.aiModel);
      }
    });
    socket.on("model_updated", (model) => {
      if (model && model.terms) {
        setAiModel(model);
      }
    });
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("update");
      socket.off("model_updated");
    };
  }, [socket]);

  // Real-time classification calculation on live input
  const classification = useMemo(() => {
    return classifyUrgency(testText, aiModel.terms);
  }, [testText, aiModel.terms]);

  // Filtered keyword list
  const filteredTerms = useMemo(() => {
    const entries = Object.entries(aiModel.terms || {});
    return entries
      .filter(([term, weight]) => {
        const matchesQuery = term.toLowerCase().includes(filterQuery.toLowerCase());
        if (!matchesQuery) return false;
        if (weightFilter === "critical") return weight >= 8;
        if (weightFilter === "elevated") return weight >= 4 && weight < 8;
        return true;
      })
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [aiModel.terms, filterQuery, weightFilter]);

  async function handleAddTerm(e) {
    if (e) e.preventDefault();
    const word = newWord.trim().toLowerCase();
    if (!word || deploying) return;

    setDeploying(true);
    setDeployMsg("");

    try {
      const baseUrl = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
      const res = await fetch(baseUrl ? `${baseUrl}/model` : "/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms: { [word]: Number(newWeight) } }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updatedModel = await res.json();
      setAiModel(updatedModel);
      setDeployMsg(`✓ Model v${updatedModel.version} updated: "${word}" (Weight ${newWeight}) distributed to mesh.`);
      setNewWord("");
    } catch (err) {
      // Local fallback in offline / standalone mode
      const updatedTerms = { ...aiModel.terms, [word]: Number(newWeight) };
      const nextVersion = (aiModel.version || 1) + 1;
      const updatedModel = { version: nextVersion, terms: updatedTerms };
      setAiModel(updatedModel);
      setDeployMsg(`✓ Local update applied: "${word}" (Weight ${newWeight}) saved in active session.`);
      setNewWord("");
    } finally {
      setDeploying(false);
    }
  }

  const criticalCount = Object.values(aiModel.terms || {}).filter(w => w >= 8).length;
  const elevatedCount = Object.values(aiModel.terms || {}).filter(w => w >= 4 && w < 8).length;

  return (
    <div className="classifier-container" style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto", boxSizing: "border-box" }}>
      {/* Top Header Banner */}
      <div className="classifier-header" style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius)",
        padding: "22px 28px",
        marginBottom: "20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "14px",
        boxShadow: "var(--card-shadow)"
      }}>
        <div>
          <div style={{ fontSize: "12px", fontFamily: "var(--mono)", letterSpacing: "0.12em", color: "var(--accent-primary)", marginBottom: "4px", fontWeight: 800 }}>
            NATURAL LANGUAGE PROCESSING // DISASTER INTELLIGENCE
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, margin: "0 0 6px", color: "var(--text-primary)" }}>
            🧠 AI Urgency Classifier
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: 0 }}>
            On-device real-time emergency text classification & dynamic keyword weighting model
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div className="status-tag status-done" style={{ fontSize: "13px", padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span>●</span> Model v{aiModel.version || 1} ({Object.keys(aiModel.terms || {}).length} Keywords)
          </div>
          <div className={`status-tag ${connected ? "status-progress" : "status-idle"}`} style={{ fontSize: "13px", padding: "6px 14px" }}>
            {connected ? "● Live Sync Online" : "○ Local On-Device Mode"}
          </div>
        </div>
      </div>

      {/* Main Grid: Interactive Live Playground + Model Manager */}
      <div className="classifier-grid" style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
        gap: "20px",
        alignItems: "start"
      }}>
        {/* ================= COLUMN 1: LIVE INTERACTIVE TESTER ================= */}
        <div className="classifier-card" style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--radius)",
          padding: "24px",
          boxShadow: "var(--card-shadow)"
        }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 16px", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
            <span>⚡</span> Real-Time Classifier Playground
          </h2>
          <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginBottom: "14px", lineHeight: "1.5" }}>
            Type any emergency transmission below to test how the on-device AI scores urgency and routes messages across the mesh.
          </p>

          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="Type or paste emergency dispatch message..."
            rows={4}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "8px",
              background: "var(--surface-elevated)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              fontFamily: "var(--sans)",
              fontSize: "14.5px",
              lineHeight: "1.5",
              resize: "vertical",
              boxSizing: "border-box",
              marginBottom: "14px"
            }}
          />

          {/* Quick Presets */}
          <div style={{ marginBottom: "20px" }}>
            <span style={{ fontSize: "12px", fontFamily: "var(--mono)", color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
              Quick Test Scenarios:
            </span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="secondary-btn"
                style={{ fontSize: "12px", padding: "6px 12px", borderColor: "rgba(255, 77, 77, 0.4)", color: "#FF4D4D" }}
                onClick={() => setTestText("Catastrophic gas leak and building collapse with trapped survivors and smoke!")}
              >
                🚨 Critical Scenario
              </button>
              <button
                type="button"
                className="secondary-btn"
                style={{ fontSize: "12px", padding: "6px 12px", borderColor: "rgba(255, 176, 0, 0.4)", color: "#FFB000" }}
                onClick={() => setTestText("Attention: anomaly detected in sector 4 with power loss warning.")}
              >
                ⚠️ Elevated Scenario
              </button>
              <button
                type="button"
                className="secondary-btn"
                style={{ fontSize: "12px", padding: "6px 12px" }}
                onClick={() => setTestText("Routine patrol check completed. All nodes operating normally.")}
              >
                🟢 Normal Scenario
              </button>
            </div>
          </div>

          {/* Classification Result Card */}
          <div style={{
            background: classification.level === "critical"
              ? "rgba(255, 77, 77, 0.12)"
              : classification.level === "elevated"
              ? "rgba(255, 176, 0, 0.12)"
              : "rgba(34, 197, 94, 0.12)",
            border: `1px solid ${
              classification.level === "critical"
                ? "rgba(255, 77, 77, 0.4)"
                : classification.level === "elevated"
                ? "rgba(255, 176, 0, 0.4)"
                : "rgba(34, 197, 94, 0.4)"
            }`,
            borderRadius: "10px",
            padding: "18px",
            boxSizing: "border-box"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
              <span style={{ fontSize: "12.5px", fontFamily: "var(--mono)", fontWeight: 800, textTransform: "uppercase", color: "var(--text-secondary)" }}>
                Classification Output
              </span>
              <span style={{
                fontSize: "13px",
                fontWeight: 800,
                fontFamily: "var(--mono)",
                padding: "4px 10px",
                borderRadius: "6px",
                background: classification.level === "critical" ? "#FF4D4D" : classification.level === "elevated" ? "#FFB000" : "#22C55E",
                color: "#111315"
              }}>
                {classification.level.toUpperCase()} (Score: {classification.score}/10)
              </span>
            </div>

            <div style={{ fontSize: "13px", color: "var(--text-primary)", marginBottom: "12px", lineHeight: "1.5" }}>
              {classification.level === "critical" && (
                <span>🚨 <strong>Critical Emergency:</strong> Instant fast-track routing with highest bandwidth priority across all P2P hops.</span>
              )}
              {classification.level === "elevated" && (
                <span>⚠️ <strong>Elevated Priority:</strong> Prioritized over standard telemetry queue and highlighted in network log.</span>
              )}
              {classification.level === "normal" && (
                <span>🟢 <strong>Normal Transmission:</strong> Standard FIFO message delivery over mesh routes.</span>
              )}
            </div>

            {/* Matched Keywords */}
            <div>
              <span style={{ fontSize: "12px", fontFamily: "var(--mono)", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                Triggered Keywords ({classification.matched.length}):
              </span>
              {classification.matched.length === 0 ? (
                <span style={{ fontSize: "12.5px", color: "var(--text-muted)", fontStyle: "italic" }}>
                  No emergency keywords detected in this text.
                </span>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {classification.matched.map((m, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: "12px",
                        fontFamily: "var(--mono)",
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: m.weight >= 8 ? "rgba(255, 77, 77, 0.25)" : "rgba(255, 176, 0, 0.25)",
                        color: m.weight >= 8 ? "#FF4D4D" : "#FFB000",
                        border: `1px solid ${m.weight >= 8 ? "rgba(255, 77, 77, 0.5)" : "rgba(255, 176, 0, 0.5)"}`
                      }}
                    >
                      {m.term} (Weight: {m.weight})
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================= COLUMN 2: KEYWORD & WEIGHTS MANAGER ================= */}
        <div className="classifier-card" style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--radius)",
          padding: "24px",
          boxShadow: "var(--card-shadow)"
        }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 16px", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
            <span>📖</span> Keyword Model Dictionary
          </h2>

          {/* Add Keyword Form */}
          <form onSubmit={handleAddTerm} style={{ marginBottom: "20px", background: "var(--surface-elevated)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", display: "block", marginBottom: "10px" }}>
              Add / Update Emergency Keyword
            </span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
              <input
                type="text"
                placeholder="e.g. avalanche, landslide"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                style={{
                  flex: "1 1 180px",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  background: "var(--surface-card)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--mono)",
                  fontSize: "13.5px"
                }}
              />
              <select
                value={newWeight}
                onChange={(e) => setNewWeight(Number(e.target.value))}
                style={{
                  padding: "9px 12px",
                  borderRadius: "6px",
                  background: "var(--surface-card)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--mono)",
                  fontSize: "13.5px",
                  fontWeight: 700
                }}
              >
                <option value={10}>Weight 10 (Critical)</option>
                <option value={9}>Weight 9 (Critical)</option>
                <option value={8}>Weight 8 (Critical)</option>
                <option value={7}>Weight 7 (Elevated)</option>
                <option value={6}>Weight 6 (Elevated)</option>
                <option value={5}>Weight 5 (Elevated)</option>
                <option value={4}>Weight 4 (Elevated)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={!newWord.trim() || deploying}
              className="primary-btn"
              style={{ width: "100%", padding: "10px", fontSize: "13.5px", fontWeight: 800 }}
            >
              {deploying ? "Deploying Update..." : "⚡ Add / Deploy Keyword"}
            </button>

            {deployMsg && (
              <div style={{ marginTop: "10px", fontSize: "12.5px", fontFamily: "var(--mono)", color: "var(--accent-primary)" }}>
                {deployMsg}
              </div>
            )}
          </form>

          {/* Filter Bar & Chips */}
          <div style={{ marginBottom: "14px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Search keywords..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              style={{
                flex: "1 1 140px",
                padding: "7px 10px",
                borderRadius: "6px",
                background: "var(--surface-elevated)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                fontFamily: "var(--mono)",
                fontSize: "12.5px"
              }}
            />
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                type="button"
                className={`secondary-btn ${weightFilter === "all" ? "active" : ""}`}
                style={{ fontSize: "11.5px", padding: "6px 10px" }}
                onClick={() => setWeightFilter("all")}
              >
                All ({Object.keys(aiModel.terms || {}).length})
              </button>
              <button
                type="button"
                className={`secondary-btn ${weightFilter === "critical" ? "active" : ""}`}
                style={{ fontSize: "11.5px", padding: "6px 10px", color: "#FF4D4D" }}
                onClick={() => setWeightFilter("critical")}
              >
                Critical ({criticalCount})
              </button>
              <button
                type="button"
                className={`secondary-btn ${weightFilter === "elevated" ? "active" : ""}`}
                style={{ fontSize: "11.5px", padding: "6px 10px", color: "#FFB000" }}
                onClick={() => setWeightFilter("elevated")}
              >
                Elevated ({elevatedCount})
              </button>
            </div>
          </div>

          {/* Keyword Tags Cloud */}
          <div style={{
            maxHeight: "360px",
            overflowY: "auto",
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            padding: "12px",
            background: "var(--surface-elevated)",
            borderRadius: "8px",
            border: "1px solid var(--border-color)"
          }}>
            {filteredTerms.length === 0 ? (
              <span style={{ fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic", padding: "10px" }}>
                No matching keywords found.
              </span>
            ) : (
              filteredTerms.map(([term, weight]) => (
                <span
                  key={term}
                  style={{
                    fontSize: "12px",
                    fontFamily: "var(--mono)",
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: weight >= 8 ? "rgba(255, 77, 77, 0.15)" : "rgba(255, 176, 0, 0.15)",
                    color: weight >= 8 ? "#FF4D4D" : "#FFB000",
                    border: `1px solid ${weight >= 8 ? "rgba(255, 77, 77, 0.35)" : "rgba(255, 176, 0, 0.35)"}`
                  }}
                >
                  {term} <span style={{ opacity: 0.7, fontSize: "10.5px" }}>({weight})</span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { AiClassifierView as CloudDashboard };
