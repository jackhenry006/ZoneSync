import React from 'react';

export function Sidebar({
  graph,
  selfId,
  peerStates,
  linkMode,
  setLinkMode,
  cloudEnabled,
  toggleCloud,
  cloudUrl,
  setCloudUrl,
  cryptoStatus,
  identityCount,
  locationEnabled,
  toggleLocation,
  online,
  goOffline,
  goOnline,
  onLeaveMesh,
  onChangeName,
  onManualConnect,
  onClose,
}) {
  const connectedCount = peerStates.filter(p => p.state === "connected").length;
  const selfNode = graph.nodes.find(n => n.id === selfId);

  return (
    <div className="sidebar" style={{ padding: "16px", gap: "14px", display: "flex", flexDirection: "column" }}>
      
      {/* CARD 1: Device Header */}
      <div className="sidebar-card brand-card" style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--accent-primary)", letterSpacing: "0.08em", fontWeight: 700, textTransform: "uppercase" }}>
              DEVICE NODE
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
              {selfNode ? selfNode.name : "Device Node"}
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="sidebar-collapse-btn"
              title="Hide sidebar"
              aria-label="Hide sidebar"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* CARD 2: Known Mesh Nodes Manager */}
      <div className="sidebar-card">
        <div className="card-header-sm" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="card-title-sm" style={{ fontSize: 14 }}>🌐 Known Mesh Nodes ({graph.nodes.length})</span>
          {onManualConnect && (
            <button
              onClick={onManualConnect}
              style={{
                background: "rgba(56, 189, 248, 0.15)",
                border: "1px solid rgba(56, 189, 248, 0.35)",
                color: "var(--color-info)",
                borderRadius: "6px",
                padding: "4px 9px",
                fontSize: "12.5px",
                fontWeight: 700,
                cursor: "pointer"
              }}
              title="Connect directly to a peer by name or ID"
            >
              ➕ Connect
            </button>
          )}
        </div>

        <div className="node-list">
          {graph.nodes.map(n => {
            const peer = peerStates.find(p => p.id === n.id);
            const link = graph.links.find(l => (l.a === selfId && l.b === n.id) || (l.b === selfId && l.a === n.id));
            const congestion = link ? link.congestion : null;
            const cColor = congestion === "congested" ? "var(--color-critical)" : congestion === "watch" ? "var(--accent-primary)" : null;
            return (
              <div className="node-row" key={n.id} style={{ fontSize: 14.5, padding: "9px 12px" }}>
                <span className={`dot ${n.id === selfId || (peer && peer.state === "connected") || n.alive ? "alive" : "dead"}`}></span>
                <span className="name" style={{ fontWeight: 600 }}>{n.name}{n.id === selfId ? <span className="you" style={{ fontSize: 11, marginLeft: 6 }}>you</span> : null}</span>
                {cColor && <span className="rtt" style={{ color: cColor, borderColor: cColor, fontSize: 12 }}>{congestion}</span>}
                {peer && <span className="rtt" style={{ fontSize: 12 }}>{peer.state}</span>}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: 12 }}>
          <button className="tiny-btn" style={{ flex: 1, padding: "10px", fontSize: 13.5, fontWeight: 700 }}
            id="manage-links-btn"
            onClick={() => setLinkMode(m => !m)}>
            {linkMode ? "✓ Done Links" : "⚡ Manage Links"}
          </button>
          {onManualConnect && (
            <button className="tiny-btn" style={{ padding: "10px 14px", fontSize: 13.5, fontWeight: 700, color: "var(--color-info)" }}
              onClick={onManualConnect}>
              ➕ Connect Peer
            </button>
          )}
        </div>
      </div>

      {/* CARD 3: End-to-End Security */}
      <div className="sidebar-card">
        <div className="card-header-sm">
          <span className="card-title-sm" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <svg className="section-icon-svg crypto-icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            End-to-End Encryption
          </span>
        </div>
        <div className="cloud-status" style={{ fontSize: 13.5 }}>
          {cryptoStatus.ready
            ? <span className="synced">● Active — fingerprint {cryptoStatus.fingerprint}</span>
            : <span className="error">○ Unavailable — {cryptoStatus.secure ? "generating keys…" : "no secure context"}</span>}
          <div style={{ marginTop: 4, opacity: 0.85, fontSize: 13 }}>
            {identityCount} identit{identityCount === 1 ? "y" : "ies"} known
          </div>
        </div>
      </div>

      {/* CARD 4: Telemetry & Controls */}
      <div className="sidebar-card">
        <div className="card-header-sm" style={{ marginBottom: 10 }}>
          <span className="card-title-sm" style={{ fontSize: 14 }}>📡 Telemetry & Services</span>
        </div>

        {/* Cloud Sync Row */}
        <div className="control-row-card">
          <div className="cloud-header" style={{ margin: 0 }}>
            <span className="cloud-title" style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <svg className={`section-icon-svg cloud-icon-svg ${cloudEnabled ? "active-spin" : ""}`} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M17.5 19A4.5 4.5 0 0 0 19 10.05A7 7 0 0 0 5.2 11.5A4.5 4.5 0 0 0 6.5 19h11z"/>
                <polyline points="12 13 12 9 10 11"/>
              </svg>
              Cloud Sync
            </span>
            <button
              className={`normal-toggle-btn ${cloudEnabled ? "active" : ""}`}
              onClick={toggleCloud}
              id="cloud-toggle-btn"
              style={{ fontSize: 13, padding: "5px 12px" }}
            >
              {cloudEnabled ? "✓ ON" : "○ OFF"}
            </button>
          </div>
          {cloudEnabled && (
            <input className="cloud-url-input" value={cloudUrl} style={{ fontSize: 13.5, padding: "8px 10px", marginTop: 8 }}
              onChange={e => setCloudUrl(e.target.value)} id="cloud-url-input" />
          )}
        </div>

        {/* GPS Location Row */}
        <div className="control-row-card" style={{ marginTop: 8 }}>
          <div className="cloud-header" style={{ margin: 0 }}>
            <span className="cloud-title" style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <svg className="section-icon-svg location-icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="9"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Location Sharing
            </span>
            <button
              className={`normal-toggle-btn ${locationEnabled ? "active" : ""}`}
              onClick={toggleLocation}
              id="location-toggle-btn"
              style={{ fontSize: 13, padding: "5px 12px" }}
            >
              {locationEnabled ? "✓ ON" : "○ OFF"}
            </button>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {onLeaveMesh && (
          <button className="btn-offline" onClick={onLeaveMesh} style={{ fontSize: 14, padding: "10px", fontWeight: 700, background: "rgba(255,176,0,0.12)", color: "#FFB000", borderColor: "rgba(255,176,0,0.3)" }}>
            🚪 Leave Mesh (Re-enter Name)
          </button>
        )}
        {online
          ? <button className="btn-offline" id="go-offline-btn" onClick={goOffline} style={{ fontSize: 14, padding: "10px", fontWeight: 700 }}>⚠ Simulate Node Failure</button>
          : <button className="btn-online" id="go-online-btn" onClick={goOnline} style={{ fontSize: 14, padding: "10px", fontWeight: 700 }}>↻ Reconnect Node</button>}
      </div>

    </div>
  );
}
