// ===== Signaling server for the P2P mesh =====
// IMPORTANT: this server does NOT route messages and does NOT compute
// topology or AI decisions. Its only job is to (a) introduce new peers to
// each other and (b) relay WebRTC offer/answer/ICE handshake packets so
// browsers can open a DIRECT connection. Once a connection is open, this
// server is completely out of the data path — kill it mid-demo and
// already-connected nodes keep routing messages to each other.

const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "dist")));
app.use(express.static(path.join(__dirname, "public")));

// In-memory store for InertiaSense survivor beacons
const survivorBeacons = [];

// ---- Cloud Telemetry & AI Model Ops Store ----
const nodeState = new Map(); // nodeId -> latest telemetry snapshot
const eventLog = [];         // rolling log, most recent first
const MAX_EVENTS = 200;

let aiModel = {
  version: 1,
  updatedAt: Date.now(),
  terms: {
    "high priority": 10,
    critical: 10,
    emergency: 10,
    sos: 10,
    catastrophic: 10,
    explosion: 10,
    "gas leak": 10,
    "can't breathe": 10,
    dying: 10,
    fire: 9,
    smoke: 9,
    hazard: 9,
    danger: 9,
    trapped: 9,
    bleeding: 9,
    lockdown: 9,
    unresponsive: 9,
    breach: 8,
    evacuate: 8,
    collapse: 8,
    injured: 8,
    medical: 8,
    severe: 8,
    immediate: 8,
    rescue: 8,
    "priority alert": 8,
    priority: 7,
    urgent: 7,
    alert: 6,
    attention: 6,
    anomaly: 6,
    warning: 6,
    failure: 6,
    incident: 6,
    overheat: 6,
    "power loss": 7,
    outage: 6,
    "sensor trip": 6,
    help: 6,
    offline: 5,
    fault: 5,
    unusual: 5,
    containment: 5,
    leak: 5,
    down: 4,
    rapid: 4,
    investigate: 4,
    flood: 5,
  },
};

function pushEvent(evt) {
  eventLog.unshift({ ...evt, ts: Date.now() });
  if (eventLog.length > MAX_EVENTS) eventLog.length = MAX_EVENTS;
}

function currentState() {
  return {
    nodes: [...nodeState.values()],
    events: eventLog.slice(0, 50),
    aiModel,
    summary: computeSummary(),
  };
}

function computeSummary() {
  const nodes = [...nodeState.values()];
  const totals = nodes.reduce((acc, n) => {
    acc.sent += n.stats?.sent || 0;
    acc.delivered += n.stats?.delivered || 0;
    acc.critical += n.stats?.critical || 0;
    acc.elevated += n.stats?.elevated || 0;
    acc.normal += n.stats?.normal || 0;
    if (typeof n.stats?.avgRttMs === "number") { acc.rttSum += n.stats.avgRttMs; acc.rttCount += 1; }
    return acc;
  }, { sent: 0, delivered: 0, critical: 0, elevated: 0, normal: 0, rttSum: 0, rttCount: 0 });
  return {
    reportingNodes: nodes.length,
    totalSent: totals.sent,
    totalDelivered: totals.delivered,
    criticalCount: totals.critical,
    elevatedCount: totals.elevated,
    normalCount: totals.normal,
    avgLatencyMs: totals.rttCount ? Math.round(totals.rttSum / totals.rttCount) : null,
  };
}

app.get("/api/auto-beacon", (req, res) => {
  res.json({ beacons: survivorBeacons });
});

app.post("/api/auto-beacon", (req, res) => {
  const beacon = req.body || {};
  const beaconEntry = {
    beaconId: beacon.id || beacon.beaconId || `beacon-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    receivedAt: Date.now(),
    location: beacon.location || (typeof beacon.lat === 'number' ? { lat: beacon.lat, lng: beacon.lng, accuracy: beacon.accuracy || 10 } : { lat: 37.7749, lng: -122.4194, accuracy: 8 }),
    ...beacon,
  };
  survivorBeacons.unshift(beaconEntry);
  if (survivorBeacons.length > 100) survivorBeacons.length = 100;

  console.log(`[InertiaSense] 🆘 Emergency Survivor Beacon Received: ${beacon.type || 'unknown'} (${beacon.confidence || 0}% confidence)`);

  pushEvent({
    nodeId: beaconEntry.beaconId,
    name: "InertiaSense AI",
    type: "critical",
    text: `🆘 Emergency Survivor Beacon: ${beacon.type || 'unknown'} (${beacon.confidence || 0}% confidence)`
  });
  io.emit("update", currentState());

  // Broadcast survivor alert to all connected sockets
  io.emit("inertiasense:beacon_received", beaconEntry);
  io.emit("pulseseeker:beacon_received", beaconEntry);
  res.json({ success: true, beaconId: beaconEntry.beaconId, timestamp: beaconEntry.receivedAt, location: beaconEntry.location });
});

const modelResponse = (req, res) => {
  res.json({
    version: "1.2.0-tinyml",
    modelUrl: "/api/inertiasense/model",
    inputFeatures: 25,
    outputClasses: ["tapping", "inertia", "normal", "noise"],
    quantized: true,
    sizeKb: 240
  });
};

app.get("/api/inertiasense/model", modelResponse);
app.get("/api/pulse-seeker/model", modelResponse);

// ===== Cloud Sync & AI Model Endpoints =====
app.post("/sync", (req, res) => {
  const { nodeId, name, topology, stats, recentEvents } = req.body || {};
  if (!nodeId) return res.status(400).json({ error: "nodeId required" });

  for (const [existingId, existingNode] of nodeState.entries()) {
    if (existingNode.name === name && existingId !== nodeId) {
      nodeState.delete(existingId);
    }
  }

  nodeState.set(nodeId, {
    nodeId, name, topology, stats,
    lastSync: Date.now(),
  });

  (recentEvents || []).forEach(e => pushEvent({ nodeId, name, ...e }));
  pushEvent({ nodeId, name, type: "sync", text: `${name} synced with cloud` });

  io.emit("update", currentState());
  res.json({ ok: true, aiModel });
});

app.get("/model", (req, res) => {
  res.json(aiModel);
});

app.post("/model", (req, res) => {
  const { terms } = req.body || {};
  if (!terms || typeof terms !== "object") return res.status(400).json({ error: "terms object required" });
  aiModel = { version: aiModel.version + 1, updatedAt: Date.now(), terms: { ...aiModel.terms, ...terms } };
  pushEvent({ nodeId: "cloud", name: "Cloud", type: "model", text: `AI model updated to v${aiModel.version}` });
  io.emit("model_updated", aiModel);
  io.emit("update", currentState());
  res.json(aiModel);
});

app.get("/state", (req, res) => {
  res.json(currentState());
});

app.use((req, res) => {
  const distIndex = path.join(__dirname, "dist", "index.html");
  const publicIndex = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }
  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }
  res.send("CrisisLink / MeshGrid Backend Server Running");
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Attach EvoSense acoustic positioning handlers to primary WebSocket server
try {
  const { setupEchoLocate } = require("./evosense-server.js");
  setupEchoLocate(io);
} catch (err) {
  console.warn("Could not mount EvoSense handlers:", err.message);
}

// registry: id -> { id, name, socketId }  (bootstrap directory only)
const registry = new Map();

io.on("connection", (socket) => {
  socket.emit("update", currentState());

  socket.on("register", ({ id, name }) => {
    // If a node with the same name or same id already existed, remove the stale registry entry
    for (const [regId, regNode] of registry.entries()) {
      if (regId === id || (regNode.name === name && regNode.socketId !== socket.id)) {
        registry.delete(regId);
        socket.broadcast.emit("peer_left_directory", { id: regId });
      }
    }

    registry.set(id, { id, name, socketId: socket.id });
    socket.data.nodeId = id;

    const others = [...registry.values()].filter((n) => n.id !== id);
    const shuffled = others.sort(() => Math.random() - 0.5);
    const suggestions = shuffled.slice(0, Math.min(2, shuffled.length));

    socket.emit("registered", { id, name, suggestions: suggestions.map(n => ({ id: n.id, name: n.name })) });
    socket.broadcast.emit("peer_available", { id, name });
  });

  socket.on("signal", ({ to, from, fromName, data }) => {
    const target = registry.get(to);
    if (target) {
      io.to(target.socketId).emit("signal", { from, fromName, data });
    }
  });

  socket.on("disconnect", () => {
    const id = socket.data.nodeId;
    if (id) {
      registry.delete(id);
      socket.broadcast.emit("peer_left_directory", { id });
    }
  });
});

const PORT = process.env.PORT || 4001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`CrisisLink Unified Server running on http://0.0.0.0:${PORT}`);
  try {
    const { printNetworkQr } = require("./show-qr.js");
    printNetworkQr({ port: PORT, protocol: "http", title: "CrisisLink Signaling & Backend Server" });
  } catch (err) {
    // Ignore if show-qr helper unavailable
  }
});

