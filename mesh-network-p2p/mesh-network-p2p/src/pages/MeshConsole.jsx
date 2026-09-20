import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import { MeshNode } from '../services/meshNode.js';
import { uid, classifyUrgency, URGENT_TERMS } from '../services/urgencyClassifier.js';
import { MeshCanvas } from '../components/MeshCanvas.jsx';
import { JoinModal } from '../components/JoinModal.jsx';
import { Sidebar } from '../components/Sidebar.jsx';
import { Composer } from '../components/Composer.jsx';
import { MessagePopups } from '../components/MessagePopups.jsx';
import {
  getSupportedAudioMimeType,
  getMicrophoneStream,
  blobToDataURL,
  generateSyntheticVoiceDispatch,
} from '../utils/audioUtils.js';

export function MeshConsole() {
  const [socket] = useState(() => io(import.meta.env.VITE_BACKEND_URL || undefined));
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("mesh_node_name") || sessionStorage.getItem("mesh_node_name") || "";
    } catch (e) {
      return "";
    }
  });
  const [joined, setJoined] = useState(() => {
    try {
      return Boolean(sessionStorage.getItem("mesh_joined") === "true" && (localStorage.getItem("mesh_node_name") || sessionStorage.getItem("mesh_node_name")));
    } catch (e) {
      return false;
    }
  });
  const [online, setOnline] = useState(true);
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
  const [recordSecs, setRecordSecs] = useState(0);
  const [mediaProgress, setMediaProgress] = useState({});
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordSecsRef = useRef(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let timer;
    if (recording) {
      setRecordSecs(0);
      recordSecsRef.current = 0;
      timer = setInterval(() => {
        setRecordSecs(s => {
          const next = s + 1;
          recordSecsRef.current = next;
          return next;
        });
      }, 1000);
    } else {
      setRecordSecs(0);
      recordSecsRef.current = 0;
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [recording]);

  function handleJoin(customName) {
    const finalName = (customName || name || "").trim();
    if (!finalName) return;
    setName(finalName);
    try {
      localStorage.setItem("mesh_node_name", finalName);
      sessionStorage.setItem("mesh_node_name", finalName);
      sessionStorage.setItem("mesh_joined", "true");
    } catch (e) {}
    setJoined(true);
  }

  React.useEffect(() => {
    if (!joined || !name.trim()) return;

    const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    setLog(l => [
      { id: uid(), tag: "system", text: `Node "${name.trim()}" online. P2P WebRTC mesh active.`, time: now() },
      ...l
    ].slice(0, 100));

    const mesh = new MeshNode(selfId, name.trim(), socket, {
      onTopology: (g) => setGraph(g),
      onLog: (entry) => setLog(l => [{ ...entry, id: uid(), time: now() }, ...l].slice(0, 100)),
      onHop: ({ from, to, urgency }) => {
        setActiveHop({ from, to, urgency, progress: 0 });
        let start = performance.now();
        function animate(t) {
          const p = Math.min(1, (t - start) / 400);
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
        setLog(l => [{ id: uid(), tag: "delivered", text: `"${envelope.text}"`, meta, mapUrl: loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null, time: now() }, ...l].slice(0, 100));

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
          time: now()
        }, ...l].slice(0, 100));

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
    setOnline(true);

    return () => {
      mesh.destroy();
      meshRef.current = null;
    };
  }, [joined, name, selfId, socket]);

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem("mesh_sidebar_open") !== "false";
    } catch (e) {
      return true;
    }
  });

  function toggleSidebar() {
    setSidebarOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem("mesh_sidebar_open", next ? "true" : "false");
      } catch (e) {}
      setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 50);
      return next;
    });
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

  async function shareLocationToAll() {
    if (!meshRef.current || broadcasting) return;
    setBroadcasting(true);
    try {
      await meshRef.current.broadcastLocationToAll(broadcastText.trim() || "This is my current location");
    } finally {
      setBroadcasting(false);
    }
  }

  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  function pickImage() {
    let destTarget = targetRef.current;
    if (!destTarget) {
      const otherNodes = graph.nodes.filter(n => n.id !== selfId);
      if (otherNodes.length > 0) {
        destTarget = otherNodes[0].id;
        setTarget(destTarget);
        targetRef.current = destTarget;
      } else {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLog(l => [{
          id: uid(),
          tag: "failure",
          text: "Please select a destination peer from the Connected Devices list before picking an image.",
          time: timeStr
        }, ...l].slice(0, 100));
        return;
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function handleImageFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    let destTarget = targetRef.current;
    if (!destTarget) {
      const otherNodes = graph.nodes.filter(n => n.id !== selfId);
      if (otherNodes.length > 0) {
        destTarget = otherNodes[0].id;
        setTarget(destTarget);
        targetRef.current = destTarget;
      } else {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLog(l => [{
          id: uid(),
          tag: "failure",
          text: "Please select a destination node before picking an image.",
          time: timeStr
        }, ...l].slice(0, 100));
        e.target.value = "";
        return;
      }
    }

    const captionToSend = textRef.current.trim();
    const reader = new FileReader();

    reader.onerror = () => {
      e.target.value = "";
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLog(l => [{ id: uid(), tag: "failure", text: "Failed to read selected image file.", time: timeStr }, ...l].slice(0, 100));
    };

    reader.onload = () => {
      const rawDataUrl = reader.result;
      const img = new Image();

      img.onload = () => {
        try {
          const maxDim = 800;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.6);

          if (meshRef.current && destTarget) {
            meshRef.current.sendMedia(destTarget, "image", compressedDataUrl, "image/jpeg", captionToSend);
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const targetNode = graph.nodes.find(n => n.id === destTarget);
            const targetName = targetNode ? targetNode.name : destTarget;
            setLog(l => [{
              id: uid(),
              tag: "system",
              text: `Dispatched encrypted image note to ${targetName}${captionToSend ? ` ("${captionToSend}")` : ""}`,
              time: timeStr
            }, ...l].slice(0, 100));
          }
          if (captionToSend) setText("");
        } catch (canvasErr) {
          if (meshRef.current && destTarget) {
            meshRef.current.sendMedia(destTarget, "image", rawDataUrl, file.type || "image/jpeg", captionToSend);
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const targetNode = graph.nodes.find(n => n.id === destTarget);
            const targetName = targetNode ? targetNode.name : destTarget;
            setLog(l => [{
              id: uid(),
              tag: "system",
              text: `Dispatched encrypted image note to ${targetName}${captionToSend ? ` ("${captionToSend}")` : ""}`,
              time: timeStr
            }, ...l].slice(0, 100));
          }
          if (captionToSend) setText("");
        } finally {
          e.target.value = "";
        }
      };

      img.onerror = () => {
        try {
          if (meshRef.current && destTarget) {
            meshRef.current.sendMedia(destTarget, "image", rawDataUrl, file.type || "image/jpeg", captionToSend);
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const targetNode = graph.nodes.find(n => n.id === destTarget);
            const targetName = targetNode ? targetNode.name : destTarget;
            setLog(l => [{
              id: uid(),
              tag: "system",
              text: `Dispatched encrypted image note to ${targetName}${captionToSend ? ` ("${captionToSend}")` : ""}`,
              time: timeStr
            }, ...l].slice(0, 100));
          }
          if (captionToSend) setText("");
        } catch (sendErr) {
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setLog(l => [{ id: uid(), tag: "failure", text: `Image send failed: ${sendErr.message}`, time: timeStr }, ...l].slice(0, 100));
        } finally {
          e.target.value = "";
        }
      };

      img.src = rawDataUrl;
    };

    reader.readAsDataURL(file);
  }

  function cancelRecording() {
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
        }
      } catch (e) {}
      try {
        mediaRecorderRef.current.onstop = null;
        if (mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      } catch (e) {}
    }
    setRecording(false);
    setRecordSecs(0);
    recordedChunksRef.current = [];
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLog(l => [{
      id: uid(),
      tag: "system",
      text: "Voice recording cancelled.",
      time: timeStr
    }, ...l].slice(0, 100));
  }

  async function toggleRecording() {
    let destTarget = targetRef.current;
    if (!destTarget) {
      const otherNodes = graph.nodes.filter(n => n.id !== selfId);
      if (otherNodes.length > 0) {
        destTarget = otherNodes[0].id;
        setTarget(destTarget);
        targetRef.current = destTarget;
      } else {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLog(l => [{
          id: uid(),
          tag: "failure",
          text: "No recipient selected. Please select a peer from Connected Devices before recording a voice note.",
          time: timeStr
        }, ...l].slice(0, 100));
        return;
      }
    }

    if (recording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        try {
          mediaRecorderRef.current.requestData();
        } catch (e) {}
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
      setRecording(false);
      return;
    }

    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder API is not supported in this browser.");
      }

      const stream = await getMicrophoneStream();
      const supportedMime = getSupportedAudioMimeType();
      let recorder;
      try {
        recorder = supportedMime ? new MediaRecorder(stream, { mimeType: supportedMime }) : new MediaRecorder(stream);
      } catch (mimeErr) {
        recorder = new MediaRecorder(stream);
      }

      const actualMime = recorder.mimeType || supportedMime || "audio/webm";
      const cleanMimeType = actualMime.split(";")[0] || "audio/webm";

      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onerror = (e) => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLog(l => [{
          id: uid(),
          tag: "failure",
          text: `Microphone recording error: ${e.error?.message || "Recording interrupted"}`,
          time: timeStr
        }, ...l].slice(0, 100));
      };

      recorder.onstop = async () => {
        try {
          stream.getTracks().forEach(t => t.stop());
          if (recordedChunksRef.current.length === 0) {
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setLog(l => [{
              id: uid(),
              tag: "failure",
              text: "Voice note was empty (0 audio bytes captured).",
              time: timeStr
            }, ...l].slice(0, 100));
            return;
          }
          const blob = new Blob(recordedChunksRef.current, { type: cleanMimeType });
          if (blob.size === 0) {
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setLog(l => [{
              id: uid(),
              tag: "failure",
              text: "Voice note recording was empty.",
              time: timeStr
            }, ...l].slice(0, 100));
            return;
          }
          const dataUrl = await blobToDataURL(blob);
          const duration = recordSecsRef.current || 1;
          const currentDest = targetRef.current || destTarget;
          const captionToSend = textRef.current.trim();

          if (meshRef.current && currentDest) {
            meshRef.current.sendMedia(currentDest, "voice", dataUrl, cleanMimeType, captionToSend);
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const targetNode = graph.nodes.find(n => n.id === currentDest);
            const targetName = targetNode ? targetNode.name : currentDest;
            setLog(l => [{
              id: uid(),
              tag: "system",
              text: `Dispatched encrypted voice note (${duration}s) to ${targetName}${captionToSend ? ` ("${captionToSend}")` : ""}`,
              time: timeStr
            }, ...l].slice(0, 100));
            if (captionToSend) setText("");
          }
        } catch (err) {
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setLog(l => [{
            id: uid(),
            tag: "failure",
            text: `Voice note encoding failed: ${err.message}`,
            time: timeStr
          }, ...l].slice(0, 100));
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setRecording(true);
    } catch (e) {
      setRecording(false);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLog(l => [{
        id: uid(),
        tag: "failure",
        text: `Voice recording unavailable: ${e.message}`,
        time: timeStr
      }, ...l].slice(0, 100));
    }
  }

  function send() {
    if (!text.trim() || !target || !meshRef.current) return;
    const msgText = text.trim();
    const targetNode = graph.nodes.find(n => n.id === target);
    const targetName = targetNode ? targetNode.name : target;
    meshRef.current.sendMessage(target, msgText);
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLog(l => [{
      id: uid(),
      tag: "system",
      text: `Dispatched encrypted packet to ${targetName}: "${msgText}"`,
      time: nowStr
    }, ...l].slice(0, 100));
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
  function leaveMesh() {
    if (meshRef.current) meshRef.current.goOffline();
    setJoined(false);
    setName("");
    setOnline(false);
    setPeerStates([]);
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

  if (!joined) {
    return <JoinModal name={name} setName={setName} onJoin={handleJoin} defaultMode="/" />;
  }

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
    <div className={`app ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <MessagePopups
        popups={popups}
        onDismiss={handleDismissPopup}
        onClearAll={handleClearAllPopups}
        onReply={handleReplyToSender}
      />
      {/* Mobile Backdrop overlay when sidebar is open on small screens */}
      {sidebarOpen && (
        <div
          className="mobile-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      {sidebarOpen && (
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
          cryptoStatus={cryptoStatus}
          identityCount={identityCount}
          locationEnabled={locationEnabled}
          toggleLocation={toggleLocation}
          online={online}
          goOffline={goOffline}
          goOnline={goOnline}
          onLeaveMesh={leaveMesh}
          onChangeName={handleChangeName}
          onManualConnect={handleManualConnect}
          onClose={() => setSidebarOpen(false)}
        />
      )}
      <div className="stage">
        {/* Top Command Bar */}
        <div className="stage-header-bar">
          <div className="stage-status-pills">
            {/* Left Sidebar Visibility Toggle */}
            <button
              id="sidebar-toggle-btn"
              className={`stage-action-btn sidebar-toggle-btn ${sidebarOpen ? "active" : ""}`}
              onClick={toggleSidebar}
              title={sidebarOpen ? "Hide left sidebar (moves messages to left)" : "Show left sidebar"}
              aria-label={sidebarOpen ? "Hide left sidebar" : "Show left sidebar"}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ verticalAlign: "middle", marginRight: 5 }}>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
              <span>{sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}</span>
            </button>

            <div className="stage-pill">
              <span className="live-dot pulse"></span>
              <span><strong>{graph.nodes.length}</strong> Nodes</span>
            </div>
            <div className="stage-pill">
              <span className="live-dot pulse" style={{ background: "#4B9EFF", boxShadow: "0 0 8px #4B9EFF" }}></span>
              <span><strong>{peerStates.filter(p => p.state === "connected").length}</strong> Links</span>
            </div>
            <div className="stage-pill">
              <span style={{ fontSize: 12 }}>🔒</span>
              <span>E2E: <strong>{cryptoStatus.ready ? "Active" : "Offline"}</strong></span>
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
        nodes={graph.nodes}
        selfId={selfId}
        peerStates={peerStates}
        urgencyPreview={urgencyPreview}
        pickImage={pickImage}
        toggleRecording={toggleRecording}
        cancelRecording={cancelRecording}
        recording={recording}
        recordSecs={recordSecs}
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
        onToggleSidebar={toggleSidebar}
      />
    </div>
  );
}
