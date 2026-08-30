import React, { useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { MeshNode } from '../services/meshNode.js';
import { uid, classifyUrgency, URGENT_TERMS } from '../services/urgencyClassifier.js';
import { MeshCanvas } from '../components/MeshCanvas.jsx';
import { JoinModal } from '../components/JoinModal.jsx';
import { Sidebar } from '../components/Sidebar.jsx';
import { Composer } from '../components/Composer.jsx';
import { MessagePopups } from '../components/MessagePopups.jsx';

export function MeshConsole() {
  const [socket] = useState(() => io(import.meta.env.VITE_BACKEND_URL || undefined));
  const [joined, setJoined] = useState(false);
  const [online, setOnline] = useState(true);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("mesh_node_name") || "";
    } catch (e) {
      return "";
    }
  });
  const [selfId] = useState(() => uid());
  const meshRef = useRef(null);
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [peerStates, setPeerStates] = useState([]);
  const [log, setLog] = useState([]);
  const [popups, setPopups] = useState([]);
  const [target, setTarget] = useState("");
  const [text, setText] = useState("");
  const [activeHop, setActiveHop] = useState(null);
  const [linkMode, setLinkMode] = useState(false);
  const [cloudUrl, setCloudUrl] = useState(() => import.meta.env.VITE_CLOUD_URL || import.meta.env.VITE_BACKEND_URL || window.location.origin);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [cloudStatus, setCloudStatus] = useState({ synced: false, lastSync: null });
  const [aiVersion, setAiVersion] = useState(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationStatus, setLocationStatus] = useState({ status: "off" });
  const [cryptoStatus, setCryptoStatus] = useState({ secure: false, ready: false });
  const [identityCount, setIdentityCount] = useState(0);
  const [broadcastText, setBroadcastText] = useState("This is my current location");
  const [broadcasting, setBroadcasting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaProgress, setMediaProgress] = useState({});
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const fileInputRef = useRef(null);

  function join() {
    if (!name.trim()) return;
    try {
      localStorage.setItem("mesh_node_name", name.trim());
    } catch (e) {}
    const mesh = new MeshNode(selfId, name.trim(), socket, {
      onTopology: (g) => setGraph(g),
      onLog: (entry) => setLog(l => [{ ...entry, id: uid() }, ...l].slice(0, 60)),
      onHop: ({ from, to, urgency }) => {
        setActiveHop({ from, to, urgency, progress: 0 });
        let start = performance.now();
        function animate(now) {
          const p = Math.min(1, (now - start) / 400);
          setActiveHop(h => h ? { ...h, progress: p } : h);
          if (p < 1) requestAnimationFrame(animate); else setTimeout(() => setActiveHop(null), 150);
        }
        requestAnimationFrame(animate);
      },
      onDelivered: (envelope) => {
        const loc = envelope.location;
        const lockTag = envelope.encrypted
          ? (envelope.verified ? " · 🔒 encrypted, ✓ verified" : " · 🔒 encrypted, ⚠ signature NOT verified")
          : " · 🔓 unencrypted";
        const meta = `received from ${envelope.from}${lockTag}${loc ? ` · 📍 ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (±${loc.accuracy}m)` : ""}`;
        setLog(l => [{ id: uid(), tag: "delivered", text: `"${envelope.text}"`, meta, mapUrl: loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null }, ...l].slice(0, 60));

        const senderNode = meshRef.current?.linkState.get(envelope.from) || graph.nodes.find(n => n.id === envelope.from);
        const fromName = senderNode ? senderNode.name : envelope.from;

        setPopups(prev => [
          {
            id: uid(),
            from: envelope.from,
            fromName: fromName,
            urgency: envelope.urgency,
            text: envelope.text,
            location: loc,
            mapUrl: loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null,
            encrypted: envelope.encrypted,
            verified: envelope.verified,
            timestamp: Date.now(),
            path: envelope.path,
          },
          ...prev
        ].slice(0, 10));
      },
      onMediaProgress: ({ mediaId, kind, received, total }) => {
        setMediaProgress(p => ({ ...p, [mediaId]: { kind, received, total } }));
      },
      onMediaDelivered: (payload) => {
        setMediaProgress(p => { const n = { ...p }; delete n[payload.mediaId]; return n; });
        const loc = payload.location;
        const lockTag = payload.encrypted
          ? (payload.verified ? " · 🔒 encrypted, ✓ verified" : " · 🔒 encrypted, ⚠ signature NOT verified")
          : " · 🔓 unencrypted";
        const meta = `received from ${payload.from}${lockTag}${loc ? ` · 📍 ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (±${loc.accuracy}m)` : ""}`;
        setLog(l => [{
          id: uid(), tag: "delivered",
          text: payload.caption ? `${payload.kind === "image" ? "🖼️" : "🎤"} "${payload.caption}"` : (payload.kind === "image" ? "🖼️ Image" : "🎤 Voice note"),
          meta,
          mediaKind: payload.kind, mediaUrl: payload.dataUrl, mimeType: payload.mimeType,
          mapUrl: loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null,
        }, ...l].slice(0, 60));

        const senderNode = meshRef.current?.linkState.get(payload.from) || graph.nodes.find(n => n.id === payload.from);
        const fromName = senderNode ? senderNode.name : payload.from;

        setPopups(prev => [
          {
            id: uid(),
            from: payload.from,
            fromName: fromName,
            urgency: payload.urgency,
            text: payload.caption || (payload.kind === "image" ? "Sent an image" : "Sent a voice message"),
            mediaKind: payload.kind,
            mediaUrl: payload.dataUrl,
            mimeType: payload.mimeType,
            location: loc,
            mapUrl: loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null,
            encrypted: payload.encrypted,
            verified: payload.verified,
            timestamp: Date.now(),
            path: payload.path,
          },
          ...prev
        ].slice(0, 10));
      },
      onPeerState: () => {
        const mesh = meshRef.current;
        if (mesh) setPeerStates([...mesh.peers.entries()].map(([id, e]) => ({ id, name: e.name, state: e.state })));
      },
      onCloudStatus: (status) => setCloudStatus(status),
      onModel: (model) => setAiVersion(model.version),
      onLocationStatus: (status) => setLocationStatus(status),
      onCryptoStatus: (status) => setCryptoStatus(status),
      onIdentities: (identities) => setIdentityCount(identities.size),
    });
    meshRef.current = mesh;
    mesh.register();
    setJoined(true);
    setOnline(true);
  }

  function toggleCloud() {
    const next = !cloudEnabled;
    setCloudEnabled(next);
    if (meshRef.current) meshRef.current.setCloudSync(cloudUrl, next);
  }

  function toggleLocation() {
    const next = !locationEnabled;
    setLocationEnabled(next);
    if (meshRef.current) meshRef.current.setLocationSharing(next);
  }

  function handleSetManualLocation() {
    const defaultCoords = locationStatus.location
      ? `${locationStatus.location.lat.toFixed(4)}, ${locationStatus.location.lng.toFixed(4)}`
      : "37.7749, -122.4194";
    const input = window.prompt("Enter manual coordinates (lat, lng):", defaultCoords);
    if (!input) return;
    const parts = input.split(",").map(s => parseFloat(s.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      setLocationEnabled(true);
      if (meshRef.current) {
        meshRef.current.setManualLocation({ lat: parts[0], lng: parts[1] });
      }
    } else {
      alert("Invalid format. Please enter as: latitude, longitude (e.g. 37.7749, -122.4194)");
    }
  }

  async function shareLocationToAll() {
    if (!meshRef.current || broadcasting) return;
    setBroadcasting(true);
    try {
      await meshRef.current.broadcastLocationToAll(broadcastText.trim() || "This is my current location");
    } finally {
      setBroadcasting(false);
    }
  }

  function pickImage() {
    if (!target) {
      setLog(l => [{ id: uid(), tag: "failure", text: "Please select a destination node from the dropdown before picking an image." }, ...l].slice(0, 60));
      return;
    }
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  function handleImageFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!target || !meshRef.current) {
      setLog(l => [{ id: uid(), tag: "failure", text: "Please select a destination node from the dropdown before picking an image." }, ...l].slice(0, 60));
      e.target.value = "";
      return;
    }

    try {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 700;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.55);
          meshRef.current.sendMedia(target, "image", dataUrl, "image/jpeg", text.trim());
          setText("");
        } catch (err) {
          setLog(l => [{ id: uid(), tag: "failure", text: `Image processing failed: ${err.message}` }, ...l].slice(0, 60));
        } finally {
          URL.revokeObjectURL(objectUrl);
          e.target.value = "";
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        e.target.value = "";
        setLog(l => [{ id: uid(), tag: "failure", text: "Failed to load selected image file." }, ...l].slice(0, 60));
      };
      img.src = objectUrl;
    } catch (err) {
      e.target.value = "";
      setLog(l => [{ id: uid(), tag: "failure", text: `Image selection error: ${err.message}` }, ...l].slice(0, 60));
    }
  }

  async function getAudioStream() {
    // Modern browsers disable navigator.mediaDevices on unencrypted HTTP (except localhost)
    if (typeof window !== "undefined" && window.isSecureContext === false && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      throw new Error(
        "Microphone access requires HTTPS or localhost (Secure Context). Browsers disable media devices on HTTP over local IP. Use HTTPS or enable chrome://flags/#unsafely-treat-insecure-origin-as-secure."
      );
    }

    if (navigator?.mediaDevices?.getUserMedia) {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    const legacyGetUserMedia =
      navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia;

    if (legacyGetUserMedia) {
      return new Promise((resolve, reject) => {
        legacyGetUserMedia.call(navigator, { audio: true }, resolve, reject);
      });
    }

    throw new Error("Microphone API (getUserMedia) is not supported in this browser environment.");
  }

  async function toggleRecording() {
    if (!target) return;
    if (recording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setRecording(false);
      return;
    }
    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("Voice recording is not supported in this browser (MediaRecorder API missing).");
      }
      const stream = await getAudioStream();
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "audio/aac",
      ];
      const supportedMime = candidates.find(type => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) || "";
      const options = supportedMime ? { mimeType: supportedMime } : undefined;
      const recorder = new MediaRecorder(stream, options);

      const actualMime = recorder.mimeType || supportedMime || "audio/webm";
      // Extract base MIME type without parameters (e.g., 'audio/webm') for clean Data URIs compatible with <audio src="...">
      const cleanMimeType = actualMime.split(";")[0] || "audio/webm";

      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      const captionToSend = text.trim();
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (recordedChunksRef.current.length === 0) return;
        const blob = new Blob(recordedChunksRef.current, { type: cleanMimeType });
        const reader = new FileReader();
        reader.onload = () => {
          if (meshRef.current && target) {
            meshRef.current.sendMedia(target, "voice", reader.result, cleanMimeType, captionToSend);
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setRecording(true);
      if (captionToSend) setText("");
    } catch (e) {
      setRecording(false);
      setLog(l => [{ id: uid(), tag: "failure", text: `Microphone access failed: ${e.message}` }, ...l].slice(0, 60));
    }
  }

  function send() {
    if (!text.trim() || !target || !meshRef.current) return;
    meshRef.current.sendMessage(target, text.trim());
    setText("");
  }

  function goOffline() {
    if (meshRef.current) meshRef.current.goOffline();
    setOnline(false);
    setPeerStates([]);
  }
  function goOnline() {
    if (meshRef.current) meshRef.current.register();
    setOnline(true);
  }

  function handleNodeClick(id) {
    if (id === selfId) return;
    const mesh = meshRef.current;
    if (!mesh) return;
    if (mesh.peers.has(id)) {
      mesh.peers.get(id).conn.close();
    } else {
      const nodeInfo = graph.nodes.find(n => n.id === id);
      mesh.connectToPeer(id, nodeInfo ? nodeInfo.name : id, true);
    }
  }

  const otherKnownNodes = graph.nodes.filter(n => n.id !== selfId);
  const liveTerms = meshRef.current ? meshRef.current.aiTerms : URGENT_TERMS;
  const urgencyPreview = text.trim() ? classifyUrgency(text, liveTerms).level : null;

  function handleDismissPopup(id) {
    setPopups(prev => prev.filter(p => p.id !== id));
  }

  function handleClearAllPopups() {
    setPopups([]);
  }

  function handleReplyToSender(senderId) {
    if (senderId) {
      setTarget(senderId);
    }
  }

  function handleChangeName() {
    const input = window.prompt("Enter your new device display name:", name);
    if (!input || !input.trim() || input.trim() === name) return;
    const nextName = input.trim();
    setName(nextName);
    try {
      localStorage.setItem("mesh_node_name", nextName);
    } catch (e) {}
    if (meshRef.current) {
      meshRef.current.name = nextName;
      meshRef.current.register();
    }
  }

  function handleManualConnect() {
    const input = window.prompt("Enter Peer Node ID or Display Name to connect directly:");
    if (!input || !input.trim()) return;
    const targetIdOrName = input.trim();
    const existingNode = graph.nodes.find(
      n => n.id === targetIdOrName || n.name.toLowerCase() === targetIdOrName.toLowerCase()
    );
    const peerId = existingNode ? existingNode.id : targetIdOrName;
    const peerName = existingNode ? existingNode.name : targetIdOrName;
    if (meshRef.current) {
      meshRef.current.connectToPeer(peerId, peerName, true);
    }
  }

  return (
    <div className="app">
      <MessagePopups
        popups={popups}
        onDismiss={handleDismissPopup}
        onClearAll={handleClearAllPopups}
        onReply={handleReplyToSender}
      />
      <Sidebar
        graph={graph}
        selfId={selfId}
        peerStates={peerStates}
        linkMode={linkMode}
        setLinkMode={setLinkMode}
        cloudEnabled={cloudEnabled}
        toggleCloud={toggleCloud}
        cloudUrl={cloudUrl}
        setCloudUrl={setCloudUrl}
        cloudStatus={cloudStatus}
        aiVersion={aiVersion}
        cryptoStatus={cryptoStatus}
        identityCount={identityCount}
        locationEnabled={locationEnabled}
        toggleLocation={toggleLocation}
        locationStatus={locationStatus}
        setManualLocation={handleSetManualLocation}
        online={online}
        goOffline={goOffline}
        goOnline={goOnline}
        onChangeName={handleChangeName}
        onManualConnect={handleManualConnect}
      />
      <div className="stage">
        {/* Top Command Bar */}
        <div className="stage-header-bar">
          <div className="stage-status-pills">
            <div className="stage-pill">
              <span className="live-dot pulse"></span>
              <span><strong>{graph.nodes.length}</strong> Nodes Known</span>
            </div>
            <div className="stage-pill">
              <span className="live-dot pulse" style={{ background: "#4B9EFF", boxShadow: "0 0 8px #4B9EFF" }}></span>
              <span><strong>{peerStates.filter(p => p.state === "connected").length}</strong> P2P WebRTC Links</span>
            </div>
            <div className="stage-pill">
              <span style={{ fontSize: 12 }}>🔒</span>
              <span>E2E Crypto: <strong>{cryptoStatus.ready ? "Active" : "Offline"}</strong></span>
            </div>
          </div>

          <div className="stage-actions">
            <button className="stage-action-btn" onClick={() => setLinkMode(m => !m)}>
              {linkMode ? "✓ Done Links" : "⚡ Manage Direct Links"}
            </button>
            {online ? (
              <button className="stage-action-btn danger" onClick={goOffline}>⚠ Simulate Failure</button>
            ) : (
              <button className="stage-action-btn success" onClick={goOnline}>↻ Reconnect</button>
            )}
          </div>
        </div>

        <div className="hint" style={{ fontSize: 13.5, padding: "8px 14px" }}>
          {linkMode
            ? "🔗 Click a node to open/close a direct WebRTC link (only your own links)"
            : "Live topology — learned by gossip, every node computes its own routes locally"}
        </div>
        <MeshCanvas
          nodes={graph.nodes}
          links={graph.links}
          activeHop={activeHop}
          selfId={selfId}
          onNodeClick={handleNodeClick}
          linkMode={linkMode}
        />
        <div className="legend" style={{ fontSize: 12.5, gap: 14 }}>
          <span><i style={{ background: "#33D6A6", boxShadow: "0 0 6px rgba(51,214,166,0.5)" }}></i>normal</span>
          <span><i style={{ background: "#F0A63C", boxShadow: "0 0 6px rgba(240,166,60,0.5)" }}></i>elevated</span>
          <span><i style={{ background: "#FF4B5C", boxShadow: "0 0 6px rgba(255,75,92,0.5)" }}></i>critical</span>
        </div>
      </div>
      <Composer
        target={target}
        setTarget={setTarget}
        text={text}
        setText={setText}
        otherKnownNodes={otherKnownNodes}
        urgencyPreview={urgencyPreview}
        pickImage={pickImage}
        toggleRecording={toggleRecording}
        recording={recording}
        mediaProgress={mediaProgress}
        send={send}
        joined={joined}
        online={online}
        broadcastText={broadcastText}
        setBroadcastText={setBroadcastText}
        shareLocationToAll={shareLocationToAll}
        broadcasting={broadcasting}
        log={log}
        fileInputRef={fileInputRef}
        handleImageFile={handleImageFile}
      />
    </div>
  );
}
