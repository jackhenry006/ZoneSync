import { classifyUrgency, URGENT_TERMS, uid, edgeKey } from './urgencyClassifier.js';
import {
  cryptoIsAvailable,
  generateIdentityKeys,
  exportRawB64,
  importEcdhPub,
  importSignPub,
  fingerprintOf,
  deriveSharedKey,
  encryptPayload,
  decryptPayload,
  signEnvelope,
  verifyEnvelope,
} from './crypto.js';

export class MeshNode {
  constructor(id, name, signalSocket, callbacks) {
    this.id = id;
    this.name = name;
    this.socket = signalSocket;
    this.cb = callbacks; // { onTopology, onLog, onHop, onDelivered, onPeerState, onCloudStatus, onModel, onLocationStatus, onCryptoStatus, onIdentities, onMediaProgress, onMediaDelivered }
    this.peers = new Map();     // peerId -> { conn, channel, name, state }
    this.linkState = new Map(); // nodeId -> { name, neighbors: [{id, rtt}], seq }
    this.mySeq = 0;
    this.linkState.set(this.id, { name: this.name, neighbors: [], seq: 0 });

    this.aiTerms = { ...URGENT_TERMS };
    this.stats = { sent: 0, delivered: 0, critical: 0, elevated: 0, normal: 0 };
    this.pendingCloudEvents = [];
    this.cloudUrl = null;
    this.cloudTimer = null;

    // ---- Congestion prediction state ----
    this.rttHistory = new Map();   // peerId -> [{t, rtt}, ...] capped window
    this.linkCongestion = new Map(); // peerId -> { level, trendMsPerSec, rtt }
    this.qosStats = { throttled: 0, dropped: 0, rerouted: 0 };

    // ---- Adaptive QoS: per-peer priority send queues ----
    this.sendQueues = new Map(); // peerId -> { critical: [], elevated: [], normal: [] }
    this.queueInterval = setInterval(() => this._drainQueues(), 60);

    // ---- Location sharing (opt-in) ----
    this.locationEnabled = false;
    this.location = null; // { lat, lng, accuracy, ts }
    this.locationWatchId = null;

    // ---- End-to-end encryption + authentication ----
    this.secureContext = cryptoIsAvailable();
    this.cryptoReady = false;
    this.identities = new Map(); // nodeId -> { name, ecdhPub, signPub, fingerprint }
    this.incomingMedia = new Map(); // mediaId -> { chunks: [], received, envelope }
    this.keys = null; // { ecdh: CryptoKeyPair, sign: CryptoKeyPair }
    this.fingerprint = null;
    this._initCrypto();

    this._onSignalHandler = ({ from, fromName, data }) => this._onSignal(from, fromName, data);
    this._onRegisteredHandler = ({ suggestions }) => {
      suggestions.forEach(p => this.connectToPeer(p.id, p.name, true));
    };

    this.socket.on("signal", this._onSignalHandler);
    this.socket.on("registered", this._onRegisteredHandler);

    // Periodically re-measure link RTT to direct peers and re-flood
    this.pingInterval = setInterval(() => this._pingAll(), 3000);
  }

  destroy() {
    if (this.queueInterval) clearInterval(this.queueInterval);
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.cloudTimer) clearInterval(this.cloudTimer);
    if (this.locationWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.locationWatchId);
    }
    this.socket.off("signal", this._onSignalHandler);
    this.socket.off("registered", this._onRegisteredHandler);
    this.goOffline();
  }

  async _initCrypto() {
    if (!this.secureContext) {
      this.cb.onLog({ tag: "failure", text: `No secure context (need HTTPS or localhost) — running WITHOUT encryption. Messages will be sent in cleartext.` });
      this.cb.onCryptoStatus({ secure: false, ready: false });
      return;
    }
    try {
      this.keys = await generateIdentityKeys();
      const ecdhPubB64 = await exportRawB64(this.keys.ecdh.publicKey);
      const signPubB64 = await exportRawB64(this.keys.sign.publicKey);
      this.fingerprint = await fingerprintOf(ecdhPubB64);
      this._myIdentity = { id: this.id, name: this.name, ecdhPub: ecdhPubB64, signPub: signPubB64 };
      this.cryptoReady = true;
      this.cb.onCryptoStatus({ secure: true, ready: true, fingerprint: this.fingerprint });
      this.cb.onLog({ tag: "system", text: `Secure identity ready — fingerprint ${this.fingerprint}` });
    } catch (e) {
      this.cb.onCryptoStatus({ secure: true, ready: false, error: e.message });
      this.cb.onLog({ tag: "failure", text: `Failed to initialize WebCrypto: ${e.message}` });
    }
  }

  _floodIdentity(toPeerId) {
    if (!this.cryptoReady) return;
    const msg = { type: "identity", ...this._myIdentity };
    if (toPeerId) this._broadcastTo(toPeerId, msg);
    else this._broadcastToAll(msg);
  }

  async _handleIdentityMessage(msg, fromPeerId) {
    if (this.identities.has(msg.id)) return;
    try {
      const ecdhPub = await importEcdhPub(msg.ecdhPub);
      const signPub = await importSignPub(msg.signPub);
      const fingerprint = await fingerprintOf(msg.ecdhPub);
      this.identities.set(msg.id, { name: msg.name, ecdhPub, signPub, fingerprint });
      this.cb.onIdentities(this.identities);
      this._broadcastToAll({ type: "identity", id: msg.id, name: msg.name, ecdhPub: msg.ecdhPub, signPub: msg.signPub }, fromPeerId);
    } catch (e) {
      this.cb.onLog({ tag: "failure", text: `Failed to import identity for ${msg.name}: ${e.message}` });
    }
  }

  setLocationSharing(enabled, manualCoords = null) {
    this.locationEnabled = enabled;
    if (this.locationWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.locationWatchId);
      this.locationWatchId = null;
    }
    if (!enabled) {
      this.location = null;
      this.manualLocation = null;
      this.cb.onLocationStatus({ status: "off" });
      return;
    }
    if (manualCoords && typeof manualCoords.lat === "number" && typeof manualCoords.lng === "number") {
      this.manualLocation = {
        lat: manualCoords.lat,
        lng: manualCoords.lng,
        accuracy: manualCoords.accuracy || 10,
        ts: Date.now(),
        isManual: true,
      };
      this.location = this.manualLocation;
      this.cb.onLocationStatus({ status: "active", location: this.location, isManual: true });
      return;
    }
    if (this.manualLocation) {
      this.location = this.manualLocation;
      this.cb.onLocationStatus({ status: "active", location: this.location, isManual: true });
      return;
    }
    if (!("geolocation" in navigator)) {
      this.cb.onLocationStatus({ status: "unsupported" });
      return;
    }
    this.cb.onLocationStatus({ status: "acquiring" });
    this.locationWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          ts: Date.now(),
        };
        this.cb.onLocationStatus({ status: "active", location: this.location });
      },
      (err) => {
        if (this.manualLocation) {
          this.location = this.manualLocation;
          this.cb.onLocationStatus({ status: "active", location: this.location, isManual: true });
        } else {
          const status = window.isSecureContext === false
            ? "insecure-context"
            : err.code === err.PERMISSION_DENIED
            ? "denied"
            : "error";
          this.cb.onLocationStatus({ status, message: err.message });
        }
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
  }

  setManualLocation(coords) {
    if (coords && typeof coords.lat === "number" && typeof coords.lng === "number") {
      this.manualLocation = {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy || 10,
        ts: Date.now(),
        isManual: true,
      };
      this.location = this.manualLocation;
      this.locationEnabled = true;
      this.cb.onLocationStatus({ status: "active", location: this.location, isManual: true });
    }
  }

  setCloudSync(url, enabled) {
    this.cloudUrl = url;
    if (this.cloudTimer) { clearInterval(this.cloudTimer); this.cloudTimer = null; }
    if (enabled && url) {
      this._syncToCloud();
      this.cloudTimer = setInterval(() => this._syncToCloud(), 5000);
    }
  }

  async _syncToCloud() {
    if (!this.cloudUrl) return;
    const graph = this._deriveGraph();
    const rtts = this._rtt ? [...this._rtt.values()] : [];
    const avgRttMs = rtts.length ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : null;
    const congestedLinks = [...this.linkCongestion.values()].filter(c => c.level === "congested").length;
    const watchLinks = [...this.linkCongestion.values()].filter(c => c.level === "watch").length;
    const payload = {
      nodeId: this.id,
      name: this.name,
      topology: { nodeCount: graph.nodes.length, linkCount: graph.links.length },
      stats: { ...this.stats, avgRttMs, ...this.qosStats, congestedLinks, watchLinks },
      recentEvents: this.pendingCloudEvents.splice(0, 20),
    };
    try {
      const res = await fetch(this.cloudUrl.replace(/\/$/, "") + "/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      this.cb.onCloudStatus({ synced: true, lastSync: Date.now() });
      if (data.aiModel && data.aiModel.terms) this._applyModel(data.aiModel);
    } catch (e) {
      this.cb.onCloudStatus({ synced: false, error: true });
    }
  }

  _applyModel(model) {
    if (this._modelVersion === model.version) return;
    this._modelVersion = model.version;
    this.aiTerms = { ...model.terms };
    this.cb.onLog({ tag: "system", text: `Pulled AI model update v${model.version} from cloud (${Object.keys(model.terms).length} terms)` });
    this.cb.onModel(model);
  }

  register() {
    this.socket.emit("register", { id: this.id, name: this.name });
  }

  connectToPeer(peerId, peerName, isInitiator) {
    if (this.peers.has(peerId)) return;
    const conn = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" }
      ]
    });
    const entry = { conn, channel: null, name: peerName, state: "connecting" };
    this.peers.set(peerId, entry);
    this.cb.onPeerState();

    conn.onicecandidate = (e) => {
      if (e.candidate) {
        this.socket.emit("signal", { to: peerId, from: this.id, fromName: this.name, data: { type: "candidate", candidate: e.candidate } });
      }
    };
    conn.onconnectionstatechange = () => {
      entry.state = conn.connectionState;
      this.cb.onPeerState();
      if (["disconnected", "failed", "closed"].includes(conn.connectionState)) {
        this._handlePeerLost(peerId);
      }
    };

    if (isInitiator) {
      const channel = conn.createDataChannel("mesh");
      this._wireChannel(channel, peerId);
      entry.channel = channel;
      conn.createOffer().then(offer => {
        conn.setLocalDescription(offer);
        this.socket.emit("signal", { to: peerId, from: this.id, fromName: this.name, data: { type: "offer", sdp: offer } });
      });
    } else {
      conn.ondatachannel = (e) => {
        entry.channel = e.channel;
        this._wireChannel(e.channel, peerId);
      };
    }
  }

  async _onSignal(from, fromName, data) {
    let entry = this.peers.get(from);
    if (data.type === "offer") {
      if (!entry) { this.connectToPeer(from, fromName, false); entry = this.peers.get(from); }
      await entry.conn.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await entry.conn.createAnswer();
      await entry.conn.setLocalDescription(answer);
      this.socket.emit("signal", { to: from, from: this.id, fromName: this.name, data: { type: "answer", sdp: answer } });
    } else if (data.type === "answer") {
      if (entry) await entry.conn.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.type === "candidate") {
      if (entry) { try { await entry.conn.addIceCandidate(data.candidate); } catch (e) {} }
    }
  }

  _wireChannel(channel, peerId) {
    channel.onopen = () => {
      const entry = this.peers.get(peerId);
      if (entry) entry.state = "connected";
      this.cb.onPeerState();
      this.cb.onLog({ tag: "system", text: `Direct link established with ${entry ? entry.name : peerId} (WebRTC)` });
      this._floodMyTopology();
      this._floodIdentity(peerId);
    };
    channel.onclose = () => this._handlePeerLost(peerId);
    channel.onmessage = (e) => this._onData(peerId, JSON.parse(e.data));
  }

  _handlePeerLost(peerId) {
    if (!this.peers.has(peerId)) return;
    const entry = this.peers.get(peerId);
    this.peers.delete(peerId);
    this.cb.onPeerState();
    this.cb.onLog({ tag: "failure", text: `Lost direct link to ${entry.name} — updating routes` });
    this._floodMyTopology();
  }

  _floodMyTopology() {
    this.mySeq += 1;
    const neighbors = [...this.peers.entries()]
      .filter(([, e]) => e.state === "connected")
      .map(([id]) => ({ id, rtt: this._rttOf(id), congestion: this._congestionOf(id) }));
    this.linkState.set(this.id, { name: this.name, neighbors, seq: this.mySeq });
    const advert = { type: "topo", id: this.id, name: this.name, neighbors, seq: this.mySeq };
    this._broadcastToAll(advert);
    this.cb.onTopology(this._deriveGraph());
  }

  _broadcastToAll(msg, exceptPeerId) {
    const payload = JSON.stringify(msg);
    for (const [pid, entry] of this.peers.entries()) {
      if (pid === exceptPeerId) continue;
      if (entry.channel && entry.channel.readyState === "open") entry.channel.send(payload);
    }
  }

  _onData(fromPeerId, msg) {
    if (msg.type === "topo") {
      const known = this.linkState.get(msg.id);
      if (!known || msg.seq > known.seq) {
        this.linkState.set(msg.id, { name: msg.name, neighbors: msg.neighbors, seq: msg.seq });
        this._broadcastToAll(msg, fromPeerId);
        this.cb.onTopology(this._deriveGraph());
      }
    } else if (msg.type === "identity") {
      this._handleIdentityMessage(msg, fromPeerId);
    } else if (msg.type === "ping") {
      this._broadcastTo(fromPeerId, { type: "pong", ts: msg.ts });
    } else if (msg.type === "pong") {
      const rtt = Date.now() - msg.ts;
      this._rtt = this._rtt || new Map();
      this._rtt.set(fromPeerId, rtt);
      this._recordRttSample(fromPeerId, rtt);
    } else if (msg.type === "msg") {
      this._handleMessageEnvelope(msg);
    }
  }

  _broadcastTo(peerId, msg) {
    const entry = this.peers.get(peerId);
    if (entry && entry.channel && entry.channel.readyState === "open") entry.channel.send(JSON.stringify(msg));
  }

  _rttOf(peerId) {
    if (!this._rtt) return 80;
    return this._rtt.get(peerId) || 80;
  }

  _recordRttSample(peerId, rtt) {
    const history = this.rttHistory.get(peerId) || [];
    history.push({ t: Date.now(), rtt });
    while (history.length > 8) history.shift();
    this.rttHistory.set(peerId, history);
    this._updateCongestion(peerId, history);
  }

  _updateCongestion(peerId, history) {
    const rtt = history[history.length - 1].rtt;
    let trendMsPerSec = 0;
    if (history.length >= 3) {
      const first = history[0], last = history[history.length - 1];
      const dtSec = Math.max(0.5, (last.t - first.t) / 1000);
      trendMsPerSec = (last.rtt - first.rtt) / dtSec;
    }
    let level = rtt < 60 ? "normal" : rtt < 160 ? "watch" : "congested";
    if (trendMsPerSec > 40 && level === "normal") level = "watch";
    if (trendMsPerSec > 80 && level === "watch") level = "congested";

    const prev = this.linkCongestion.get(peerId);
    this.linkCongestion.set(peerId, { level, trendMsPerSec: Math.round(trendMsPerSec), rtt });

    if (prev && prev.level !== level && (level === "congested" || level === "watch")) {
      const entry = this.peers.get(peerId);
      this.cb.onLog({
        tag: level === "congested" ? "failure" : "system",
        text: `Congestion ${level === "congested" ? "confirmed" : "predicted"} on link to ${entry ? entry.name : peerId} (${rtt}ms, trending ${trendMsPerSec >= 0 ? "+" : ""}${Math.round(trendMsPerSec)}ms/s)`,
      });
    }
  }

  _congestionOf(peerId) {
    const c = this.linkCongestion.get(peerId);
    return c ? c.level : "normal";
  }

  _congestionPenalty(level) {
    if (level === "congested") return 3.5;
    if (level === "watch") return 1.6;
    return 1;
  }

  _pingAll() {
    let changed = false;
    for (const [pid, entry] of this.peers.entries()) {
      if (entry.channel && entry.channel.readyState === "open") {
        entry.channel.send(JSON.stringify({ type: "ping", ts: Date.now() }));
        changed = true;
      }
    }
    if (changed) this._floodMyTopology();
  }

  _deriveGraph() {
    const nodes = [];
    const linkMap = new Map();
    for (const [id, info] of this.linkState.entries()) {
      const hasEdges = info.neighbors.length > 0 || [...this.linkState.values()].some(o => o.neighbors.some(n => n.id === id));
      nodes.push({ id, name: info.name, alive: hasEdges || (id === this.id && this.peers.size >= 0) });
      for (const n of info.neighbors) {
        const key = edgeKey(id, n.id);
        const prev = linkMap.get(key);
        const congestion = n.congestion || "normal";
        if (!prev || n.rtt < prev.weight) linkMap.set(key, { a: id, b: n.id, weight: n.rtt, congestion });
      }
    }
    return { nodes, links: [...linkMap.values()] };
  }

  computeRoute(fromId, toId) {
    const adjacency = new Map();
    for (const [id, info] of this.linkState.entries()) {
      adjacency.set(id, info.neighbors);
    }
    const dist = new Map(), prev = new Map(), visited = new Set();
    for (const id of this.linkState.keys()) dist.set(id, Infinity);
    dist.set(fromId, 0);
    while (true) {
      let u = null, best = Infinity;
      for (const id of this.linkState.keys()) {
        if (!visited.has(id) && dist.get(id) < best) { best = dist.get(id); u = id; }
      }
      if (u === null) break;
      visited.add(u);
      if (u === toId) break;
      for (const n of (adjacency.get(u) || [])) {
        if (visited.has(n.id)) continue;
        const penalty = this._congestionPenalty(n.congestion || "normal");
        const alt = dist.get(u) + n.rtt * penalty;
        if (alt < (dist.get(n.id) ?? Infinity)) { dist.set(n.id, alt); prev.set(n.id, u); }
      }
    }
    if (dist.get(toId) === undefined || dist.get(toId) === Infinity) return null;
    const path = [toId];
    let cur = toId;
    while (cur !== fromId) { cur = prev.get(cur); if (cur === undefined) return null; path.unshift(cur); }
    return path;
  }

  async sendMessage(toId, text, forcedLocation) {
    const urgency = classifyUrgency(text, this.aiTerms);
    const path = this.computeRoute(this.id, toId);
    if (!path) {
      this.cb.onLog({ tag: "failure", text: `No known route to destination — network partitioned from here` });
      return;
    }
    const msgId = uid();
    const location = forcedLocation || (this.locationEnabled && this.location ? { ...this.location } : null);

    let envelope;
    const recipient = this.identities.get(toId);
    if (this.secureContext && this.cryptoReady && recipient) {
      try {
        const sharedKey = await deriveSharedKey(this.keys.ecdh.privateKey, recipient.ecdhPub);
        const { iv, ciphertext } = await encryptPayload(sharedKey, { text, location });
        const signature = await signEnvelope(this.keys.sign.privateKey, msgId, this.id, toId, iv, ciphertext);
        envelope = { type: "msg", msgId, from: this.id, to: toId, urgency, path, hopIndex: 0, encrypted: true, iv, ciphertext, signature };
      } catch (e) {
        this.cb.onLog({ tag: "failure", text: `Encryption failed (${e.message}) — message not sent` });
        return;
      }
    } else {
      const reason = !this.secureContext ? "no secure context" : !recipient ? "recipient's secure identity not yet known" : "keys not ready";
      envelope = { type: "msg", msgId, from: this.id, to: toId, urgency, path, hopIndex: 0, encrypted: false, text, location };
      this.cb.onLog({ tag: "system", text: `⚠ Sending UNENCRYPTED (${reason})` });
    }

    this.stats.sent += 1;
    this.stats[urgency.level] += 1;
    this.pendingCloudEvents.push({ type: urgency.level, text: `sent a ${urgency.level} message` });
    this.cb.onLog({
      tag: urgency.level,
      text: `"${text}"`,
      meta: `→ routed via ${path.length - 1} hop(s): ${path.map(id => (this.linkState.get(id)||{}).name || id).join(" → ")}${location ? " · 📍 location attached" : ""}${envelope.encrypted ? " · 🔒 encrypted" : " · 🔓 unencrypted"}`,
    });

    // Opportunistically post heartbeat to Lifeboat Priority Queue & Lethality Calculator
    const baseUrl = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
    fetch(baseUrl ? `${baseUrl}/api/heartbeat` : "/api/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: this.name || this.id,
        sensors: {
          ambientLight: 5,
          battery: 85
        },
        location: location || { lat: 37.7749, lng: -122.4194, nearWater: false },
        message: { text, timestamp: Date.now() }
      })
    }).catch(() => {});

    this._forwardEnvelope(envelope);
  }

  async broadcastLocationToAll(text, customLocation = null) {
    let location = customLocation || this.location || this.manualLocation;

    if (!location && ("geolocation" in navigator)) {
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 })
        );
        location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy), ts: Date.now() };
      } catch (e) {
        // GPS fix unavailable or blocked by insecure context
      }
    }

    if (!location) {
      location = { lat: 37.7749, lng: -122.4194, accuracy: 15, ts: Date.now(), isSimulated: true };
      this.cb.onLog({ tag: "system", text: `📍 Live GPS fix unavailable (HTTP/insecure context) — broadcasting with demo location (37.7749, -122.4194). You can set custom coordinates in the Sidebar.` });
    }

    const graph = this._deriveGraph();
    const recipients = graph.nodes.filter(n => n.id !== this.id && n.alive);
    if (recipients.length === 0) {
      this.cb.onLog({ tag: "failure", text: `Location broadcast — no other connected devices to send to` });
      return;
    }
    this.cb.onLog({ tag: "system", text: `📍 Broadcasting location to ${recipients.length} connected device(s)…` });
    for (const r of recipients) {
      await this.sendMessage(r.id, text, location);
    }
  }

  async sendMedia(toId, kind, dataUrl, mimeType, caption) {
    let urgency = classifyUrgency(caption || "", this.aiTerms);
    if (urgency.level === "normal") {
      urgency = { level: "elevated", score: 5 };
    }
    const path = this.computeRoute(this.id, toId);
    if (!path) {
      this.cb.onLog({ tag: "failure", text: `No known route to destination — network partitioned from here` });
      return;
    }
    const mediaId = uid() + uid();
    const location = this.locationEnabled && this.location ? { ...this.location } : null;
    const payload = { kind, mimeType, dataUrl, caption: caption || "", location };
    const payloadStr = JSON.stringify(payload);

    let encrypted = false, iv = null, signature = null, transmitStr = payloadStr;
    const recipient = this.identities.get(toId);
    if (this.secureContext && this.cryptoReady && recipient) {
      try {
        const sharedKey = await deriveSharedKey(this.keys.ecdh.privateKey, recipient.ecdhPub);
        const enc = await encryptPayload(sharedKey, payload);
        iv = enc.iv; transmitStr = enc.ciphertext; encrypted = true;
        signature = await signEnvelope(this.keys.sign.privateKey, mediaId, this.id, toId, iv, transmitStr);
      } catch (e) {
        this.cb.onLog({ tag: "failure", text: `Media encryption failed (${e.message}) — not sent` });
        return;
      }
    } else {
      this.cb.onLog({ tag: "system", text: `⚠ Sending media UNENCRYPTED (identity not yet known or no secure context)` });
    }

    const CHUNK = 12000;
    const totalChunks = Math.max(1, Math.ceil(transmitStr.length / CHUNK));
    this.stats.sent += 1;
    this.stats[urgency.level] += 1;
    this.pendingCloudEvents.push({ type: urgency.level, text: `sent a ${kind} message (${totalChunks} chunks)` });
    this.cb.onLog({
      tag: urgency.level,
      text: `${kind === "image" ? "🖼️ Image" : "🎤 Voice note"}${caption ? `: "${caption}"` : ""}`,
      meta: `→ routed via ${path.length - 1} hop(s), ${totalChunks} chunk(s)${location ? " · 📍 location attached" : ""}${encrypted ? " · 🔒 encrypted" : " · 🔓 unencrypted"}`,
      mediaKind: kind,
      mediaUrl: dataUrl,
      mimeType,
    });

    for (let i = 0; i < totalChunks; i++) {
      const chunk = transmitStr.slice(i * CHUNK, (i + 1) * CHUNK);
      const envelope = {
        type: "msg", mediaChunk: true, mediaId, kind, msgId: mediaId,
        from: this.id, to: toId, urgency, path, hopIndex: 0,
        encrypted, iv, signature, chunkIndex: i, totalChunks, chunk,
      };
      this._forwardEnvelope(envelope);
    }
  }

  _handleMediaChunk(envelope) {
    let buf = this.incomingMedia.get(envelope.mediaId);
    if (!buf) {
      buf = { chunks: new Array(envelope.totalChunks).fill(""), received: 0, envelope };
      this.incomingMedia.set(envelope.mediaId, buf);
    }
    if (buf.chunks[envelope.chunkIndex] === "") buf.received += 1;
    buf.chunks[envelope.chunkIndex] = envelope.chunk;
    this.cb.onMediaProgress({ mediaId: envelope.mediaId, kind: envelope.kind, received: buf.received, total: envelope.totalChunks });
    if (buf.received === envelope.totalChunks) {
      this.incomingMedia.delete(envelope.mediaId);
      this._finalizeMedia(buf.envelope, buf.chunks.join(""));
    }
  }

  async _finalizeMedia(envelope, combined) {
    this.stats.delivered += 1;
    this.pendingCloudEvents.push({ type: "delivered", text: `received a ${envelope.kind} message` });
    let payload, verified = null;
    if (envelope.encrypted) {
      const sender = this.identities.get(envelope.from);
      if (!sender || !this.cryptoReady) {
        this.cb.onLog({ tag: "failure", text: `Received encrypted ${envelope.kind} from unknown identity ${envelope.from} — cannot decrypt` });
        return;
      }
      try {
        verified = await verifyEnvelope(sender.signPub, envelope.msgId, envelope.from, envelope.to, envelope.iv, combined, envelope.signature);
        const sharedKey = await deriveSharedKey(this.keys.ecdh.privateKey, sender.ecdhPub);
        payload = await decryptPayload(sharedKey, envelope.iv, combined);
      } catch (e) {
        this.cb.onLog({ tag: "failure", text: `Failed to decrypt ${envelope.kind} from ${envelope.from}: ${e.message}` });
        return;
      }
    } else {
      try { payload = JSON.parse(combined); verified = false; } catch (e) {
        this.cb.onLog({ tag: "failure", text: `Corrupt media received from ${envelope.from}` });
        return;
      }
    }
    this.cb.onMediaDelivered({ ...envelope, ...payload, verified });
    this.cb.onHop({ from: envelope.path[envelope.hopIndex], to: this.id, urgency: envelope.urgency.level });
  }

  async _handleMessageEnvelope(envelope) {
    if (envelope.to === this.id) {
      if (envelope.mediaChunk) { this._handleMediaChunk(envelope); return; }
      this.stats.delivered += 1;
      this.pendingCloudEvents.push({ type: "delivered", text: `received a ${envelope.urgency.level} message` });

      let text, location, verified = null;
      if (envelope.encrypted) {
        const sender = this.identities.get(envelope.from);
        if (!sender || !this.cryptoReady) {
          this.cb.onLog({ tag: "failure", text: `Received encrypted message from unknown identity ${envelope.from} — cannot decrypt` });
          return;
        }
        try {
          verified = await verifyEnvelope(sender.signPub, envelope.msgId, envelope.from, envelope.to, envelope.iv, envelope.ciphertext, envelope.signature);
          const sharedKey = await deriveSharedKey(this.keys.ecdh.privateKey, sender.ecdhPub);
          const payload = await decryptPayload(sharedKey, envelope.iv, envelope.ciphertext);
          text = payload.text; location = payload.location;
        } catch (e) {
          this.cb.onLog({ tag: "failure", text: `Failed to decrypt message from ${envelope.from}: ${e.message}` });
          return;
        }
      } else {
        text = envelope.text; location = envelope.location; verified = false;
      }

      this.cb.onDelivered({ ...envelope, text, location, verified });
      this.cb.onHop({ from: envelope.path[envelope.hopIndex], to: this.id, urgency: envelope.urgency.level });
      return;
    }
    this._forwardEnvelope(envelope);
  }

  _forwardEnvelope(envelope) {
    let nextHop = envelope.path[envelope.hopIndex + 1];
    if (!nextHop || !this.peers.has(nextHop) || this.peers.get(nextHop).state !== "connected") {
      const rerouted = this.computeRoute(this.id, envelope.to);
      if (!rerouted) {
        this.cb.onLog({ tag: "failure", text: `Message stalled at ${this.name} — no route onward, holding/dropping` });
        return;
      }
      envelope = { ...envelope, path: rerouted, hopIndex: 0 };
      nextHop = rerouted[1];
      this.qosStats.rerouted += 1;
      this.cb.onLog({ tag: "system", text: `Rerouted a ${envelope.urgency.level} message locally at ${this.name}` });
    }
    this._enqueue(nextHop, envelope);
  }

  _enqueue(peerId, envelope) {
    if (!this.sendQueues.has(peerId)) this.sendQueues.set(peerId, { critical: [], elevated: [], normal: [] });
    const q = this.sendQueues.get(peerId);
    q[envelope.urgency.level].push(envelope);

    const congestion = this._congestionOf(peerId);
    const cap = congestion === "congested" ? 15 : congestion === "watch" ? 40 : 120;
    while (q.normal.length > cap) {
      q.normal.shift();
      this.qosStats.dropped += 1;
      this.pendingCloudEvents.push({ type: "failure", text: `QoS dropped low-priority message under congestion` });
      this.cb.onLog({ tag: "failure", text: `QoS: shed a low-priority message on congested link` });
    }
  }

  _drainQueues() {
    for (const [peerId, q] of this.sendQueues.entries()) {
      const entry = this.peers.get(peerId);
      if (!entry || !entry.channel || entry.channel.readyState !== "open") continue;
      const congestion = this._congestionOf(peerId);
      let envelope = null;

      if (q.critical.length) {
        envelope = q.critical.shift();
      } else if (q.elevated.length) {
        const throttle = congestion === "congested" ? 0.6 : congestion === "watch" ? 0.15 : 0;
        if (Math.random() >= throttle) envelope = q.elevated.shift();
        else this.qosStats.throttled += 1;
      } else if (q.normal.length) {
        const throttle = congestion === "congested" ? 0.9 : congestion === "watch" ? 0.4 : 0;
        if (Math.random() >= throttle) envelope = q.normal.shift();
        else this.qosStats.throttled += 1;
      }

      if (envelope) {
        this.cb.onHop({ from: this.id, to: peerId, urgency: envelope.urgency.level });
        this._broadcastTo(peerId, { ...envelope, hopIndex: envelope.hopIndex + 1 });
      }
    }
  }

  goOffline() {
    this.mySeq += 1;
    this.linkState.set(this.id, { name: this.name, neighbors: [], seq: this.mySeq });
    this._broadcastToAll({ type: "topo", id: this.id, name: this.name, neighbors: [], seq: this.mySeq });
    for (const entry of this.peers.values()) entry.conn.close();
    this.peers.clear();
    this.cb.onPeerState();
    this.cb.onTopology(this._deriveGraph());
  }
}
