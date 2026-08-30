import React from 'react';

export function JoinModal({ name, setName, onJoin }) {
  const canJoin = Boolean(name && name.trim());

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && canJoin) {
      e.preventDefault();
      onJoin();
    }
  };

  return (
    <div className="join-overlay">
      <div className="join-card" style={{ padding: "36px 30px", maxWidth: "440px", width: "90%" }}>
        <div className="join-mark" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--signal)" }}>
          CRISISLINK // P2P-AI MESH NETWORK
        </div>
        <h2 style={{ fontSize: 24, margin: "10px 0 6px", fontWeight: 800 }}>Join the Mesh Network</h2>
        <p className="join-sub" style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 20, lineHeight: 1.5 }}>
          Enter a device display name to identify your node when connecting to peers across the mesh:
        </p>
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6, color: "var(--text-secondary)" }}>
            YOUR DEVICE / NODE DISPLAY NAME
          </label>
          <input
            id="join-name-input"
            type="text"
            placeholder="e.g. Rescue-Van-2 or Node-Alpha"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              fontSize: 15,
              padding: "12px 14px",
              width: "100%",
              borderRadius: "8px",
              border: "1px solid var(--glass-border)",
              background: "rgba(8, 12, 20, 0.8)",
              color: "var(--text)",
              outline: "none"
            }}
            autoFocus
          />
        </div>
        <button
          id="join-btn"
          onClick={onJoin}
          disabled={!canJoin}
          style={{
            fontSize: 15,
            padding: "13px 18px",
            fontWeight: 800,
            width: "100%",
            borderRadius: "8px",
            background: canJoin ? "var(--signal)" : "rgba(60, 85, 115, 0.3)",
            color: canJoin ? "#06090D" : "var(--muted)",
            border: "none",
            cursor: canJoin ? "pointer" : "not-allowed",
            transition: "all 0.2s ease"
          }}
        >
          Connect to Peers →
        </button>
      </div>
    </div>
  );
}

