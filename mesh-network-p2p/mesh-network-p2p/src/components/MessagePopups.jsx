import React, { useState, useEffect, useRef } from "react";

// Web Audio API notification chime generator
function playNotificationChime(urgency = "normal", isMuted = false) {
  if (isMuted) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    if (urgency === "critical") {
      // Alarm double pulse high frequency
      osc1.type = "sawtooth";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.setValueAtTime(1174, now + 0.12);
      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(587, now + 0.12);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);
    } else if (urgency === "elevated") {
      // Dual warning chime
      osc1.type = "sine";
      osc2.type = "triangle";
      osc1.frequency.setValueAtTime(659.25, now); // E5
      osc1.frequency.setValueAtTime(880, now + 0.1); // A5
      osc2.frequency.setValueAtTime(329.63, now); // E4

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.3);
      osc2.stop(now + 0.3);
    } else {
      // Pleasant soft chime C5 -> E5 -> G5
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc1.frequency.setValueAtTime(783.99, now + 0.16); // G5

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc1.start(now);
      osc1.stop(now + 0.4);
    }
  } catch (e) {
    // AudioContext permission or browser policy fallback
  }
}

export function MessagePopups({ popups = [], onDismiss, onClearAll, onReply }) {
  const [muted, setMuted] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const playedRef = useRef(new Set());

  // Play audio chime for newly arrived popups
  useEffect(() => {
    popups.forEach((popup) => {
      if (!playedRef.current.has(popup.id)) {
        playedRef.current.add(popup.id);
        playNotificationChime(popup.urgency?.level || popup.urgency || "normal", muted);
      }
    });
  }, [popups, muted]);

  if (!popups || popups.length === 0) return null;

  return (
    <div className="msg-popup-container">
      {/* Top Controller Bar */}
      <div className="msg-popup-header-controls">
        <div className="msg-popup-count-badge">
          <span className="live-dot pulse"></span>
          <span>{popups.length} Message{popups.length > 1 ? "s" : ""} Delivered</span>
        </div>

        <div className="msg-popup-right-actions">
          <button
            className={`msg-popup-control-btn ${muted ? "muted" : ""}`}
            onClick={() => setMuted((m) => !m)}
            title={muted ? "Unmute notification sounds" : "Mute notification sounds"}
          >
            {muted ? "🔇 Muted" : "🔔 Sound On"}
          </button>
          {popups.length > 1 && (
            <button className="msg-popup-control-btn clear-all" onClick={onClearAll}>
              Dismiss All ({popups.length})
            </button>
          )}
        </div>
      </div>

      {/* Pop-up Stack */}
      <div className="msg-popup-stack">
        {popups.map((item) => (
          <PopupCard
            key={item.id}
            item={item}
            onDismiss={() => onDismiss(item.id)}
            onReply={() => onReply && onReply(item.from)}
            onExpandImage={(url) => setPreviewImage(url)}
          />
        ))}
      </div>

      {/* Image Expansion Lightbox Modal */}
      {previewImage && (
        <div className="msg-popup-lightbox" onClick={() => setPreviewImage(null)}>
          <div className="msg-popup-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="msg-popup-lightbox-close" onClick={() => setPreviewImage(null)}>
              ✕
            </button>
            <img src={previewImage} alt="Expanded preview" />
          </div>
        </div>
      )}
    </div>
  );
}

function PopupCard({ item, onDismiss, onReply, onExpandImage }) {
  const level = item.urgency?.level || item.urgency || "normal";
  const [progress, setProgress] = useState(100);
  const durationMs = level === "critical" ? null : level === "elevated" ? 14000 : 10000;

  useEffect(() => {
    if (!durationMs) return;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / durationMs) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [durationMs, onDismiss]);

  const lockTag = item.encrypted
    ? item.verified
      ? { icon: "🔒", label: "E2E Encrypted & Verified", cls: "verified" }
      : { icon: "🔒", label: "Encrypted (Unverified)", cls: "unverified" }
    : { icon: "🔓", label: "Unencrypted", cls: "plain" };

  const senderDisplay = item.fromName ? `${item.fromName} (${item.from})` : item.from;

  return (
    <div className={`msg-popup-card urgency-${level}`}>
      {/* Timer Bar */}
      {durationMs && (
        <div className="msg-popup-timer-bar">
          <div
            className={`msg-popup-timer-progress level-${level}`}
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      )}

      {/* Header */}
      <div className="msg-popup-card-header">
        <div className="msg-popup-badge-group">
          <span className={`msg-popup-urgency-badge level-${level}`}>
            {level === "critical" ? "🚨 CRITICAL" : level === "elevated" ? "⚠️ ELEVATED" : "📩 DELIVERED"}
          </span>
          <span className={`msg-popup-crypto-badge ${lockTag.cls}`} title={lockTag.label}>
            {lockTag.icon} {lockTag.label}
          </span>
        </div>

        <button className="msg-popup-close-btn" onClick={onDismiss} title="Dismiss message pop-up">
          ✕
        </button>
      </div>

      {/* Sender Info */}
      <div className="msg-popup-sender-row">
        <span className="msg-popup-sender-label">From:</span>
        <strong className="msg-popup-sender-name">{senderDisplay}</strong>
        {item.timestamp && (
          <span className="msg-popup-timestamp">
            {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </div>

      {/* Content Body */}
      <div className="msg-popup-body">
        {/* Media Preview (Image or Voice Note) */}
        {item.mediaKind === "image" && item.mediaUrl && (
          <div className="msg-popup-media-container image-container">
            <img
              src={item.mediaUrl}
              alt="Delivered Attachment"
              className="msg-popup-img-thumb"
              onClick={() => onExpandImage(item.mediaUrl)}
            />
            <div className="msg-popup-img-overlay-hint" onClick={() => onExpandImage(item.mediaUrl)}>
              🔍 Click to Enlarge
            </div>
          </div>
        )}

        {item.mediaKind === "voice" && item.mediaUrl && (
          <div className="msg-popup-media-container voice-container">
            <div className="msg-popup-voice-header">🎤 Voice Message</div>
            <audio controls src={item.mediaUrl} className="msg-popup-audio-player" />
          </div>
        )}

        {/* Text Content */}
        {item.text && (
          <div className="msg-popup-text-content">
            {item.text}
          </div>
        )}

        {/* Attached Location */}
        {item.location && (
          <div className="msg-popup-location-box">
            <span className="msg-popup-loc-icon">📍</span>
            <div className="msg-popup-loc-details">
              <span>Location Attached: <strong>{item.location.lat.toFixed(5)}, {item.location.lng.toFixed(5)}</strong></span>
              {item.location.accuracy && <small> (±{item.location.accuracy}m)</small>}
            </div>
            {item.mapUrl && (
              <a
                href={item.mapUrl}
                target="_blank"
                rel="noreferrer"
                className="msg-popup-map-link"
              >
                Open Map ↗
              </a>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="msg-popup-footer">
        {item.path && item.path.length > 1 && (
          <span className="msg-popup-hops-info">
            ⚡ {item.path.length - 1} Hop{item.path.length - 1 > 1 ? "s" : ""}
          </span>
        )}
        <div className="msg-popup-action-buttons">
          <button className="msg-popup-action-btn reply" onClick={onReply}>
            ↩ Reply to {item.fromName || item.from}
          </button>
          <button className="msg-popup-action-btn dismiss" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
