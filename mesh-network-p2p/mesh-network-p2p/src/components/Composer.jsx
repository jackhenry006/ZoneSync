import React from 'react';

export function Composer({
  target,
  setTarget,
  text,
  setText,
  otherKnownNodes,
  urgencyPreview,
  pickImage,
  toggleRecording,
  recording,
  mediaProgress,
  send,
  joined,
  online,
  broadcastText,
  setBroadcastText,
  shareLocationToAll,
  broadcasting,
  log,
  fileInputRef,
  handleImageFile,
}) {
  function handleQuickPanic() {
    setText("CRITICAL EMERGENCY: Trapped under rubble, bleeding heavily, need immediate rescue");
    if (otherKnownNodes.length > 0 && !target) {
      setTarget(otherKnownNodes[0].id);
    }
  }

  return (
    <div className="side-right">
      <div className="composer">
        <div className="composer-header">
          <div className="section-label">📡 Send E2E Encrypted Message</div>
          <button className="panic-preset-btn" onClick={handleQuickPanic}>
            🚨 PANIC SOS PRESET
          </button>
        </div>

        <select id="target-select" value={target} onChange={e => setTarget(e.target.value)} style={{ fontSize: 14, padding: "10px 12px" }}>
          <option value="">Select destination peer…</option>
          {otherKnownNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>

        <textarea id="message-input" rows="3" placeholder='Try typing: "need medical help, trapped under rubble"' value={text}
          onChange={e => setText(e.target.value)} style={{ fontSize: 14, padding: "10px 12px" }} />

        <div className="urgency-preview">
          {urgencyPreview && (
            <span className={`urgency-badge ${urgencyPreview}`} style={{ fontSize: 13, padding: "6px 12px" }}>
              {urgencyPreview === "critical" ? "🔴" : urgencyPreview === "elevated" ? "🟡" : "🟢"}
              {" "}On-Device AI Classification: {urgencyPreview.toUpperCase()}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className="tiny-btn" style={{ flex: 1, padding: "10px", fontSize: 13, fontWeight: 700 }} onClick={pickImage} disabled={!joined || !online}>
            🖼️ Image Note
          </button>
          <button className="tiny-btn" style={{ flex: 1, padding: "10px", fontSize: 13, fontWeight: 700, borderColor: recording ? "var(--critical)" : undefined, color: recording ? "var(--critical)" : undefined }}
            onClick={toggleRecording} disabled={!joined || !online}>
            {recording ? "⏹ Stop Recording" : "🎤 Voice Note"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageFile} />
        </div>

        {Object.entries(mediaProgress).map(([id, p]) => (
          <div key={id} style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--signal)", marginBottom: 8 }}>
            Receiving {p.kind}… {p.received}/{p.total} chunks
          </div>
        ))}

        <button className="send-btn" id="send-btn" onClick={send} style={{ fontSize: 14, padding: "12px", fontWeight: 800 }}
          disabled={!joined || !online || !text.trim() || !target}>
          Route Encrypted Message →
        </button>
      </div>

      <div className="cloud-section" style={{ margin: "14px 16px" }}>
        <div className="cloud-header">
          <span className="cloud-title" style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <svg className="section-icon-svg location-icon-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <circle cx="12" cy="12" r="3"/>
              <line x1="12" y1="1" x2="12" y2="4"/>
              <line x1="12" y1="20" x2="12" y2="23"/>
              <line x1="1" y1="12" x2="4" y2="12"/>
              <line x1="20" y1="12" x2="23" y2="12"/>
            </svg>
            Share Location With Everyone
          </span>
        </div>
        <input className="cloud-url-input" value={broadcastText} onChange={e => setBroadcastText(e.target.value)}
          placeholder="Message to send with your location" style={{ marginBottom: 10, fontSize: 13.5, padding: "9px 12px" }} />
        <button className="gps-broadcast-btn" onClick={shareLocationToAll} disabled={!joined || !online || broadcasting}>
          <svg className={`btn-svg ${broadcasting ? "spinning" : ""}`} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="12" r="9"/>
            <circle cx="12" cy="12" r="3"/>
            <line x1="12" y1="1" x2="12" y2="4"/>
            <line x1="12" y1="20" x2="12" y2="23"/>
            <line x1="1" y1="12" x2="4" y2="12"/>
            <line x1="20" y1="12" x2="23" y2="12"/>
          </svg>
          {broadcasting ? "Broadcasting to all peers…" : `Broadcast Location to ${otherKnownNodes.length} Peer(s)`}
        </button>
        <div className="cloud-status" style={{ marginTop: 8, fontSize: 12.5 }}>
          One click — takes a fresh GPS fix and dispatches individually encrypted payloads to all reachable nodes in the mesh.
        </div>
      </div>

      <div className="section-label" style={{ padding: "10px 16px 4px" }}>Real-Time Network Log</div>
      <div className="log">
        {log.map(entry => (
          <div className={`log-entry ${entry.tag}`} key={entry.id}>
            <span className="tag">{entry.tag}</span>
            {entry.text}
            {entry.meta && <div className="path">{entry.meta}</div>}
            {entry.mediaKind === "image" && entry.mediaUrl && (
              <img src={entry.mediaUrl} alt="shared" style={{ maxWidth: "100%", borderRadius: 8, marginTop: 6, display: "block" }} />
            )}
            {entry.mediaKind === "voice" && entry.mediaUrl && (
              <audio controls preload="auto" src={entry.mediaUrl} style={{ width: "100%", marginTop: 6, height: 36, borderRadius: 6 }} />
            )}
            {entry.mapUrl && (
              <div className="path">
                <a href={entry.mapUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--signal)" }}>
                  Open location in Maps →
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
