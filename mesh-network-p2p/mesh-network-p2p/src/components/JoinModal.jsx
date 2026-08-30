import React from 'react';

export function JoinModal({ name, setName, onJoin }) {
  return (
    <div className="join-overlay">
      <div className="join-card" style={{ padding: "32px 28px" }}>
        <div className="join-mark" style={{ fontSize: 12, letterSpacing: "0.14em" }}>CRISISLINK // P2P-AI</div>
        <h2 style={{ fontSize: 22, margin: "8px 0" }}>Join the Mesh</h2>
        <p className="join-sub" style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>Enter your device display name to connect to peers</p>
        <input
          id="join-name-input"
          placeholder="e.g. Rescue-Van-2"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onJoin()}
          style={{ fontSize: 15, padding: "12px 14px", marginBottom: 14 }}
          autoFocus
        />
        <button id="join-btn" onClick={onJoin} disabled={!name.trim()} style={{ fontSize: 15, padding: "13px", fontWeight: 800 }}>
          Join Mesh Network →
        </button>
      </div>
    </div>
  );
}
