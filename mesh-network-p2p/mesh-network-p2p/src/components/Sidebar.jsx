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
  cloudStatus,
  aiVersion,
  cryptoStatus,
  identityCount,
  locationEnabled,
  toggleLocation,
  locationStatus,
  setManualLocation,
  online,
  goOffline,
  goOnline,
  onChangeName,
  onManualConnect,
}) {
  const connectedCount = peerStates.filter(p => p.state === "connected").length;
  const selfNode = graph.nodes.find(n => n.id === selfId);

  return (
    <div className="sidebar" style={{ padding: "14px", gap: "12px", display: "flex", flexDirection: "column" }}>
      
      {/* CARD 1: Brand & Network Header */}
      <div className="sidebar-card brand-card">
        <div className="mark">CRISISLINK // P2P-AI</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 0 6px" }}>
          <h1 style={{ fontSize: 19, margin: 0 }}>Mesh Console</h1>
          {onChangeName && (
            <button
              onClick={onChangeName}
              style={{
                background: "rgba(51, 214, 166, 0.12)",
                border: "1px solid rgba(51, 214, 166, 0.3)",
                color: "var(--signal)",
                borderRadius: "6px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer"
              }}
              title="Change your device display name"
            >
              ✏️ Rename
            </button>
          )}
        </div>
        <div className="sub" style={{ fontSize: 13, color: "var(--muted)" }}>
          <span style={{ color: "var(--signal)", fontWeight: 800 }}>{connectedCount}</span> WebRTC Links · <span style={{ fontWeight: 800, color: "var(--text)" }}>{graph.nodes.length}</span> Nodes Known
          {selfNode && <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>Device Name: <strong>{selfNode.name}</strong></div>}
        </div>
      </div>

      {/* CARD 2: Known Mesh Nodes Manager */}
      <div className="sidebar-card">
        <div className="card-header-sm" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="card-title-sm">🌐 Known Mesh Nodes ({graph.nodes.length})</span>
          {onManualConnect && (
            <button
              onClick={onManualConnect}
              style={{
                background: "rgba(75, 158, 255, 0.15)",
                border: "1px solid rgba(75, 158, 255, 0.35)",
                color: "var(--accent-blue)",
                borderRadius: "6px",
                padding: "2px 7px",
                fontSize: "11px",
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
            const cColor = congestion === "congested" ? "var(--critical)" : congestion === "watch" ? "var(--elevated)" : null;
            return (
              <div className="node-row" key={n.id} style={{ fontSize: 13, padding: "8px 10px" }}>
                <span className={`dot ${n.id === selfId || (peer && peer.state === "connected") || n.alive ? "alive" : "dead"}`}></span>
                <span className="name" style={{ fontWeight: 600 }}>{n.name}{n.id === selfId ? <span className="you" style={{ fontSize: 10, marginLeft: 4 }}>you</span> : null}</span>
                {cColor && <span className="rtt" style={{ color: cColor, borderColor: cColor, fontSize: 10.5 }}>{congestion}</span>}
                {peer && <span className="rtt" style={{ fontSize: 10.5 }}>{peer.state}</span>}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: "6px", marginTop: 10 }}>
          <button className="tiny-btn" style={{ flex: 1, padding: "9px", fontSize: 12, fontWeight: 700 }}
            id="manage-links-btn"
            onClick={() => setLinkMode(m => !m)}>
            {linkMode ? "✓ Done Links" : "⚡ Manage Links"}
          </button>
          {onManualConnect && (
            <button className="tiny-btn" style={{ padding: "9px 12px", fontSize: 12, fontWeight: 700, color: "var(--accent-blue)" }}
              onClick={onManualConnect}>
              ➕ Connect Peer
            </button>
          )}
        </div>
      </div>

      {/* CARD 3: End-to-End Security */}
      <div className="sidebar-card">
        <div className="card-header-sm">
          <span className="card-title-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg className="section-icon-svg crypto-icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            End-to-End Encryption
          </span>
        </div>
        <div className="cloud-status" style={{ fontSize: 12.5 }}>
          {cryptoStatus.ready
            ? <span className="synced">● Active — fingerprint {cryptoStatus.fingerprint}</span>
            : <span className="error">○ Unavailable — {cryptoStatus.secure ? "generating keys…" : "no secure context"}</span>}
          <div style={{ marginTop: 4, opacity: 0.8 }}>
            {identityCount} identit{identityCount === 1 ? "y" : "ies"} known
          </div>
        </div>
      </div>

      {/* CARD 4: Telemetry & Controls */}
      <div className="sidebar-card">
        <div className="card-header-sm" style={{ marginBottom: 10 }}>
          <span className="card-title-sm">📡 Telemetry & Services</span>
        </div>

        {/* Cloud Sync Row */}
        <div className="control-row-card">
          <div className="cloud-header" style={{ margin: 0 }}>
            <span className="cloud-title" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
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
            >
              {cloudEnabled ? "✓ ON" : "○ OFF"}
            </button>
          </div>
          {cloudEnabled && (
            <input className="cloud-url-input" value={cloudUrl} style={{ fontSize: 12, padding: "6px 8px", marginTop: 8 }}
              onChange={e => setCloudUrl(e.target.value)} id="cloud-url-input" />
          )}
        </div>

        {/* GPS Location Row */}
        <div className="control-row-card" style={{ marginTop: 8 }}>
          <div className="cloud-header" style={{ margin: 0 }}>
            <span className="cloud-title" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
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
            >
              {locationEnabled ? "✓ ON" : "○ OFF"}
            </button>
          </div>
          {setManualLocation && (
            <button className="location-btn-action" onClick={setManualLocation} style={{ marginTop: 8 }}>
              📍 {locationStatus.isManual ? "Change Manual Location" : "Set Demo/Manual Coordinates"}
            </button>
          )}
        </div>
      </div>

      {/* CARD 5: Rescue Module Launchpad */}
      <div className="sidebar-card">
        <div className="card-header-sm" style={{ marginBottom: 10 }}>
          <span className="card-title-sm">🚀 Rescue Module Launchpad</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <a href="/echolocate" className="tiny-btn" style={{ display: "block", textAlign: "center", textDecoration: "none", color: "#33D6A6", borderColor: "rgba(51,214,166,0.35)", padding: "8px", fontSize: 12.5, fontWeight: 700 }}>
            📡 EchoLocate 3D Map ↗
          </a>
          <a href="/pulseseeker" className="tiny-btn" style={{ display: "block", textAlign: "center", textDecoration: "none", color: "#FF4B5C", borderColor: "rgba(255,75,92,0.35)", padding: "8px", fontSize: 12.5, fontWeight: 700 }}>
            🆘 PulseSeeker Rescue AI ↗
          </a>
          <a href="/lifeboat" className="tiny-btn" style={{ display: "block", textAlign: "center", textDecoration: "none", color: "#F0A63C", borderColor: "rgba(240,166,60,0.35)", padding: "8px", fontSize: 12.5, fontWeight: 700 }}>
            🚤 Lifeboat Priority Queues ↗
          </a>
        </div>
      </div>

      {/* Action Footer */}
      <div style={{ marginTop: "auto", paddingTop: 6 }}>
        {online
          ? <button className="btn-offline" id="go-offline-btn" onClick={goOffline} style={{ fontSize: 13, padding: "10px", fontWeight: 700 }}>⚠ Simulate Node Failure</button>
          : <button className="btn-online" id="go-online-btn" onClick={goOnline} style={{ fontSize: 13, padding: "10px", fontWeight: 700 }}>↻ Reconnect Node</button>}
      </div>

    </div>
  );
}
