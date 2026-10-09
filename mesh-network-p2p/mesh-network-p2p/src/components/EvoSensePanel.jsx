import React, { useEffect, useRef, useState } from "react";
import { EvoSenseEngine } from "../services/evoSense.js";

export function EvoSensePanel({ socket, selfId, selfName, meshNode }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  const [engineStatus, setEngineStatus] = useState({
    audioReady: false,
    micActive: false,
    registered: false,
    status: "idle",
    errorMsg: null,
    micError: null,
  });

  const [roundState, setRoundState] = useState({
    status: "idle",
    roundId: null,
    pingerName: null,
    lastUpdated: null,
  });

  const [positionsData, setPositionsData] = useState({
    positions: {},
    distances: [],
    speedOfSound: 343.0,
    timestamp: null,
  });

  const [sweepRange, setSweepRange] = useState("17-19");
  const [secondsAgo, setSecondsAgo] = useState(null);
  const [selectedTargetPeer, setSelectedTargetPeer] = useState("");
  const [calibratedDistance, setCalibratedDistance] = useState(3.0);

  // 3D Projection Camera State & Live Refs (Stable Fixed Orbit View)
  const [autoRotate, setAutoRotate] = useState(true);

  const yawRef = useRef(45);
  const pitchRef = useRef(35);
  const zoomScaleRef = useRef(typeof window !== "undefined" && window.innerWidth < 640 ? 50 : 65);
  const autoRotateRef = useRef(true);
  const positionsDataRef = useRef(positionsData);

  // Keep refs synced with props / state
  useEffect(() => {
    positionsDataRef.current = positionsData;
  }, [positionsData]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  const isLocalIpInsecure =
    typeof window !== "undefined" &&
    window.isSecureContext === false &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  // Initialize EchoLocate engine on mount
  useEffect(() => {
    if (!socket || !selfId) return;

    const engine = new EvoSenseEngine(socket, selfId, selfName || "Device", {
      onStatusChange: (st) => setEngineStatus((prev) => ({ ...prev, ...st })),
      onRoundState: (rst) => setRoundState((prev) => ({ ...prev, ...rst })),
      onPositions: (pos) => {
        setPositionsData((prev) => {
          if (!prev || !prev.positions) return pos;
          const mergedPositions = { ...pos.positions };
          Object.keys(mergedPositions).forEach((id) => {
            const oldP = prev.positions[id];
            const newP = mergedPositions[id];
            if (oldP && newP) {
              const dx = Math.abs(oldP.x - newP.x);
              const dy = Math.abs(oldP.y - newP.y);
              // Ignore micro jitter under 5cm to keep coordinates steady
              if (dx < 0.05 && dy < 0.05) {
                mergedPositions[id] = { ...newP, x: oldP.x, y: oldP.y };
              }
            }
          });
          return { ...pos, positions: mergedPositions };
        });
      },
      onError: (err) => console.warn("[EchoLocate]", err),
    });

    engineRef.current = engine;
    if (meshNode) {
      engine.setMeshNode(meshNode);
    }
    engine.connectServer();

    return () => {
      engine.destroy();
    };
  }, [socket, selfId, selfName]);

  // Keep meshNode synced with engine
  useEffect(() => {
    if (engineRef.current && meshNode) {
      engineRef.current.setMeshNode(meshNode);
    }
  }, [meshNode]);

  // Update "last updated Xs ago" timer
  useEffect(() => {
    if (!positionsData.timestamp) return;

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - positionsData.timestamp) / 1000);
      setSecondsAgo(elapsed);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [positionsData.timestamp]);

  // 3D Spatial Canvas Renderer (Single stable animation frame loop)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let animId;
    let sweepAngle = 0;

    const project3D = (x, y, z, centerX, centerY, currentYaw, currentPitch, currentZoom) => {
      const yawRad = (currentYaw * Math.PI) / 180;
      const pitchRad = (currentPitch * Math.PI) / 180;

      // Rotate around Z axis (Yaw)
      const xRot = x * Math.cos(yawRad) - y * Math.sin(yawRad);
      const yRot = x * Math.sin(yawRad) + y * Math.cos(yawRad);

      // Tilt around X axis (Pitch) & Elevation (Z)
      const px = centerX + xRot * currentZoom;
      const py = centerY - (yRot * Math.sin(pitchRad) + z * Math.cos(pitchRad)) * currentZoom;

      // Perspective Scale Factor
      const depth = yRot * Math.cos(pitchRad);
      const scale = Math.max(0.6, 1 + depth * 0.08);

      return { px, py, scale, depth };
    };

    const render = () => {
      // Auto-orbit rotation increment inside the 60fps loop
      if (autoRotateRef.current) {
        yawRef.current = (yawRef.current + 0.35) % 360;
      }

      const currentYaw = yawRef.current;
      const currentPitch = pitchRef.current;
      const currentZoom = zoomScaleRef.current;
      const currentPositions = positionsDataRef.current || { positions: {}, distances: [] };

      const rect = canvas.getBoundingClientRect();
      const width = rect.width || canvas.clientWidth || 400;
      const height = rect.height || canvas.clientHeight || 360;
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background Gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, "#111315");
      bgGrad.addColorStop(1, "#15191B");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2 + 15;

      sweepAngle = (sweepAngle + 0.02) % (Math.PI * 2);

      // 1. Draw 3D Ground Plane Subtle Concentric Rings & Grid
      const rings = [1, 2, 3, 5, 8, 12, 18];
      rings.forEach((rMeters) => {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 176, 0, 0.12)";
        ctx.lineWidth = 1;

        const points = 64;
        for (let i = 0; i <= points; i++) {
          const theta = (i / points) * Math.PI * 2;
          const rx = Math.cos(theta) * rMeters;
          const ry = Math.sin(theta) * rMeters;
          const p = project3D(rx, ry, 0, centerX, centerY, currentYaw, currentPitch, currentZoom);
          if (i === 0) ctx.moveTo(p.px, p.py);
          else ctx.lineTo(p.px, p.py);
        }
        ctx.stroke();

        // Ring Meter Label
        const labelP = project3D(rMeters, 0, 0, centerX, centerY, currentYaw, currentPitch, currentZoom);
        ctx.fillStyle = "rgba(255, 176, 0, 0.65)";
        ctx.font = "10.5px 'IBM Plex Mono', monospace";
        ctx.fillText(`${rMeters}m`, labelP.px + 4, labelP.py - 4);
      });

      // 2. Draw 3D Ground Axes (X: Red, Y: Green, Z: Info Blue)
      const originP = project3D(0, 0, 0, centerX, centerY, currentYaw, currentPitch, currentZoom);
      const xAxisP = project3D(4, 0, 0, centerX, centerY, currentYaw, currentPitch, currentZoom);
      const yAxisP = project3D(0, 4, 0, centerX, centerY, currentYaw, currentPitch, currentZoom);
      const zAxisP = project3D(0, 0, 3, centerX, centerY, currentYaw, currentPitch, currentZoom);

      // X Axis (Ground East)
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 77, 77, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.moveTo(originP.px, originP.py);
      ctx.lineTo(xAxisP.px, xAxisP.py);
      ctx.stroke();
      ctx.fillStyle = "#FF4D4D";
      ctx.font = "bold 10.5px 'IBM Plex Mono', monospace";
      ctx.fillText("+X (East)", xAxisP.px + 6, xAxisP.py + 4);

      // Y Axis (Ground North)
      ctx.beginPath();
      ctx.strokeStyle = "rgba(34, 197, 94, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.moveTo(originP.px, originP.py);
      ctx.lineTo(yAxisP.px, yAxisP.py);
      ctx.stroke();
      ctx.fillStyle = "#22C55E";
      ctx.fillText("+Y (North)", yAxisP.px + 6, yAxisP.py + 4);

      // Z Axis (Altitude)
      ctx.beginPath();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.moveTo(originP.px, originP.py);
      ctx.lineTo(zAxisP.px, zAxisP.py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#38BDF8";
      ctx.fillText("+Z (Elevation)", zAxisP.px + 6, zAxisP.py - 4);

      // 3. Draw 3D Amber Radar Spatial Sweep
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(originP.px, originP.py);
      const sweepP1 = project3D(Math.cos(sweepAngle) * 6, Math.sin(sweepAngle) * 6, 0, centerX, centerY, currentYaw, currentPitch, currentZoom);
      const sweepP2 = project3D(Math.cos(sweepAngle + 0.3) * 6, Math.sin(sweepAngle + 0.3) * 6, 0, centerX, centerY, currentYaw, currentPitch, currentZoom);
      ctx.lineTo(sweepP1.px, sweepP1.py);
      ctx.lineTo(sweepP2.px, sweepP2.py);
      ctx.closePath();
      const sweepGrad = ctx.createRadialGradient(originP.px, originP.py, 0, originP.px, originP.py, 200);
      sweepGrad.addColorStop(0, "rgba(255, 176, 0, 0.15)");
      sweepGrad.addColorStop(1, "rgba(255, 176, 0, 0.0)");
      ctx.fillStyle = sweepGrad;
      ctx.fill();
      ctx.restore();

      const nodeEntries = Object.entries(currentPositions.positions || {});
      const distancesList = currentPositions.distances || [];

      // 4. Draw 3D Pairwise Distance Vectors in Amber
      distancesList.forEach(({ from, to, dist, source }) => {
        const posA = currentPositions.positions?.[from];
        const posB = currentPositions.positions?.[to];
        if (posA && posB) {
          const zA = typeof posA.z === "number" && !isNaN(posA.z) ? posA.z : 0;
          const zB = typeof posB.z === "number" && !isNaN(posB.z) ? posB.z : 0;
          const xA = typeof posA.x === "number" && !isNaN(posA.x) ? posA.x : 0;
          const yA = typeof posA.y === "number" && !isNaN(posA.y) ? posA.y : 0;
          const xB = typeof posB.x === "number" && !isNaN(posB.x) ? posB.x : 0;
          const yB = typeof posB.y === "number" && !isNaN(posB.y) ? posB.y : 0;
          const pA = project3D(xA, yA, zA, centerX, centerY, currentYaw, currentPitch, currentZoom);
          const pB = project3D(xB, yB, zB, centerX, centerY, currentYaw, currentPitch, currentZoom);

          ctx.beginPath();
          ctx.strokeStyle = source === "acoustic" ? "rgba(34, 197, 94, 0.75)" : source === "gps" ? "rgba(56, 189, 248, 0.7)" : "rgba(255, 176, 0, 0.55)";
          ctx.lineWidth = source === "acoustic" ? 2.2 : 1.5;
          ctx.setLineDash(source === "acoustic" ? [] : [4, 4]);
          ctx.moveTo(pA.px, pA.py);
          ctx.lineTo(pB.px, pB.py);
          ctx.stroke();
          ctx.setLineDash([]);

          // 3D Midpoint Distance Badge
          const midPx = (pA.px + pB.px) / 2;
          const midPy = (pA.py + pB.py) / 2;
          ctx.fillStyle = "rgba(27, 31, 34, 0.92)";
          ctx.fillRect(midPx - 22, midPy - 11, 44, 18);
          ctx.strokeStyle = source === "acoustic" ? "#22C55E" : "#FFB000";
          ctx.lineWidth = 1;
          ctx.strokeRect(midPx - 22, midPy - 11, 44, 18);

          const displayDist = typeof dist === "number" && !isNaN(dist) ? dist.toFixed(2) : Number(dist || 0).toFixed(2);
          ctx.fillStyle = source === "acoustic" ? "#22C55E" : "#FFB000";
          ctx.font = "bold 10.5px 'IBM Plex Mono', monospace";
          ctx.textAlign = "center";
          ctx.fillText(`${displayDist}m`, midPx, midPy + 2);
          ctx.textAlign = "left";
        }
      });

      // Sort nodes by 3D depth for back-to-front rendering
      const sortedNodes = nodeEntries.map(([nodeId, pos]) => {
        const z = typeof pos?.z === "number" && !isNaN(pos.z) ? pos.z : 0;
        const x = typeof pos?.x === "number" && !isNaN(pos.x) ? pos.x : 0;
        const y = typeof pos?.y === "number" && !isNaN(pos.y) ? pos.y : 0;
        const projected = project3D(x, y, z, centerX, centerY, currentYaw, currentPitch, currentZoom);
        const groundP = project3D(x, y, 0, centerX, centerY, currentYaw, currentPitch, currentZoom);
        return { nodeId, pos: { ...pos, x, y, z }, z, projected, groundP };
      }).sort((a, b) => (a.projected?.depth || 0) - (b.projected?.depth || 0));

      // 5. Draw 3D Nodes, Ground Shadows, and Laser Height Tethers
      sortedNodes.forEach(({ nodeId, pos, z, projected, groundP }) => {
        const isSelf = nodeId === selfId;
        const rad = (isSelf ? 9 : 7) * projected.scale;

        // Ground Drop Shadow Ring
        ctx.beginPath();
        ctx.ellipse(groundP.px, groundP.py, rad * 1.4, rad * 0.7, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fill();
        ctx.strokeStyle = isSelf ? "rgba(255, 176, 0, 0.3)" : "rgba(56, 189, 248, 0.3)";
        ctx.stroke();

        // Laser Height Tether Line (Z Column)
        if (Math.abs(z) > 0.05) {
          ctx.beginPath();
          ctx.strokeStyle = isSelf ? "#FFB000" : "#38BDF8";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([2, 2]);
          ctx.moveTo(groundP.px, groundP.py);
          ctx.lineTo(projected.px, projected.py);
          ctx.stroke();
          ctx.setLineDash([]);

          // Height Label
          ctx.fillStyle = isSelf ? "#FFB000" : "#38BDF8";
          ctx.font = "10px 'IBM Plex Mono', monospace";
          const midZ = (groundP.py + projected.py) / 2;
          ctx.fillText(`z=+${z.toFixed(1)}m`, groundP.px + 8, midZ);
        }

        // Restrained 3D Orb Halo
        ctx.beginPath();
        ctx.arc(projected.px, projected.py, rad * 1.8, 0, Math.PI * 2);
        const haloGrad = ctx.createRadialGradient(projected.px, projected.py, 0, projected.px, projected.py, rad * 1.8);
        haloGrad.addColorStop(0, isSelf ? "rgba(255, 176, 0, 0.25)" : "rgba(56, 189, 248, 0.2)");
        haloGrad.addColorStop(1, "transparent");
        ctx.fillStyle = haloGrad;
        ctx.fill();

        // 3D Sphere Orb
        ctx.beginPath();
        ctx.arc(projected.px, projected.py, rad, 0, Math.PI * 2);
        const orbGrad = ctx.createRadialGradient(projected.px - rad * 0.3, projected.py - rad * 0.3, rad * 0.1, projected.px, projected.py, rad);
        if (isSelf) {
          orbGrad.addColorStop(0, "#FFE082");
          orbGrad.addColorStop(0.7, "#FFB000");
          orbGrad.addColorStop(1, "#C75B00");
        } else {
          orbGrad.addColorStop(0, "#BAE6FD");
          orbGrad.addColorStop(0.7, "#38BDF8");
          orbGrad.addColorStop(1, "#0369A1");
        }
        ctx.fillStyle = orbGrad;
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Node Label Tag
        ctx.fillStyle = "#FFFFFF";
        ctx.font = isSelf ? "bold 14.5px sans-serif" : "13.5px sans-serif";
        const labelText = `${pos.name || nodeId}${isSelf ? " (You)" : ""}`;
        ctx.fillText(labelText, projected.px + rad + 8, projected.py + 4);

        // 3D Coordinates Text (X, Y, Z)
        ctx.fillStyle = "rgba(240, 244, 252, 0.75)";
        ctx.font = "12.5px monospace";
        ctx.fillText(`(${pos.x.toFixed(2)}m, ${pos.y.toFixed(2)}m, z:${z.toFixed(1)}m)`, projected.px + rad + 8, projected.py + 20);
      });

      // Empty State Overlay
      if (nodeEntries.length === 0) {
        ctx.fillStyle = "rgba(240, 244, 252, 0.85)";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Waiting for EvoSense spatial localization...", centerX, centerY - 15);
        ctx.font = "14px sans-serif";
        ctx.fillStyle = "rgba(240, 244, 252, 0.6)";
        ctx.fillText("Connect another device or click '⚡ Simulate Live 3D Nodes' below", centerX, centerY + 14);
        ctx.textAlign = "left";
      }

      // 3D Orbit Compass Badge
      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      ctx.font = "12.5px monospace";
      ctx.fillText(`3D View: Yaw ${Math.round(currentYaw)}° | Pitch ${Math.round(currentPitch)}°`, 16, height - 16);

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [selfId]);

  // Activate audio context & mic stream
  async function handleActivateAudio() {
    if (!engineRef.current) return;
    const okAudio = await engineRef.current.initAudio();
    if (okAudio) {
      await engineRef.current.startMicrophone();
    }
  }

  function handleTestChirp() {
    if (engineRef.current) {
      engineRef.current.initAudio();
      engineRef.current.playTestChirp();
    }
  }

  function handleTriggerRound() {
    if (engineRef.current) {
      engineRef.current.initAudio().catch(() => {});
      engineRef.current.triggerRound();
    }
  }

  function handleSimulateDemo3D() {
    const id1 = selfId || "node-self";
    const id2 = "node-alice";
    const id3 = "node-bob";
    const id4 = "node-charlie";

    setPositionsData({
      timestamp: Date.now(),
      speedOfSound: 343.0,
      positions: {
        [id1]: { x: 0.0, y: 0.0, z: 0.0, name: selfName || "You (Ground)" },
        [id2]: { x: 2.85, y: 0.5, z: 1.8, name: "Alice's Phone (Floor 1)" },
        [id3]: { x: 1.2, y: 2.4, z: 0.0, name: "Bob's Laptop (Ground)" },
        [id4]: { x: -2.1, y: 1.8, z: 3.5, name: "Charlie's Drone (Floor 2)" },
      },
      distances: [
        { from: id1, to: id2, dist: 2.94, source: "acoustic" },
        { from: id1, to: id3, dist: 2.68, source: "p2p_rtt" },
        { from: id2, to: id3, dist: 2.81, source: "p2p_rtt" },
        { from: id1, to: id4, dist: 4.58, source: "gps" },
      ],
    });

    setRoundState({
      status: "completed",
      roundId: 999,
      pingerName: "3D Spatial Simulation",
      lastUpdated: Date.now(),
    });
  }

  function handleSweepChange(e) {
    const val = e.target.value;
    setSweepRange(val);
    if (!engineRef.current) return;
    if (val === "3-6") {
      engineRef.current.setSweepFrequencies(3000, 6000);
    } else if (val === "15-18") {
      engineRef.current.setSweepFrequencies(15000, 18000);
    } else if (val === "16-20") {
      engineRef.current.setSweepFrequencies(16000, 20000);
    } else {
      engineRef.current.setSweepFrequencies(17000, 19000);
    }
  }

  function handleApplyDistanceCalibration(peerId, dist) {
    if (!engineRef.current || !peerId) return;
    const num = parseFloat(dist);
    if (isNaN(num) || num <= 0) return;
    engineRef.current.reportDistance(peerId, num, "calibrated");
  }

  // Get list of other nodes detected in positions
  const otherNodes = Object.entries(positionsData.positions || {}).filter(([id]) => id !== selfId);

  return (
    <div className="echolocate-container">
      {/* EchoLocate Header Banner */}
      <div className="echolocate-header">
        <div className="echolocate-title">
          <h2>📡 EvoSense Acoustic & P2P Spatial Positioning</h2>
        </div>

        {/* Status Indicators */}
        <div className="echolocate-round-status">
          {roundState.status === "in_progress" && (
            <span className="status-tag status-progress">
              ● Ranging in progress ({roundState.pingerName} chirping...)
            </span>
          )}
          {roundState.status === "chirping_self" && (
            <span className="status-tag status-chirp">
              🔊 Emitting Chirp & Timing Response...
            </span>
          )}
          {roundState.status === "listening" && (
            <span className="status-tag status-listen">
              🎤 Listening for {roundState.pingerName}'s Chirp...
            </span>
          )}
          {roundState.status === "completed" && (
            <span className="status-tag status-done">
              ✓ 3D Position Updated {secondsAgo !== null ? `${secondsAgo}s ago` : "just now"}
            </span>
          )}
          {roundState.status === "idle" && (
            <span className="status-tag status-idle">
              ○ Live Tracking ({secondsAgo !== null ? `Last updated ${secondsAgo}s ago` : "Waiting for peers"})
            </span>
          )}
        </div>
      </div>

      {/* Control Bar */}
      <div className="echolocate-controls">
        <div className="control-group">
          {!engineStatus.audioReady || !engineStatus.micActive ? (
            <button className="primary-btn pulse" onClick={handleActivateAudio}>
              🎤 Activate Mic & Web Audio
            </button>
          ) : (
            <span className="mic-active-badge">✓ Mic & Audio Active</span>
          )}

          <button className="secondary-btn" onClick={handleTestChirp}>
            🔊 Play Test Chirp
          </button>

          <button className="secondary-btn" onClick={handleTriggerRound}>
            ↻ Run Acoustic Round
          </button>

          <button
            className="secondary-btn"
            style={{ borderColor: "var(--accent-primary)", color: "var(--accent-primary)", fontWeight: 700 }}
            onClick={handleSimulateDemo3D}
          >
            ⚡ Simulate Live 3D Nodes
          </button>
        </div>

        <div className="control-group">
          <label className="sweep-label">
            Frequency Range:
            <select value={sweepRange} onChange={handleSweepChange} className="sweep-select">
              <option value="3-6">3 kHz – 6 kHz (Audible Test - All Devices)</option>
              <option value="15-18">15 kHz – 18 kHz (Mobile Friendly)</option>
              <option value="17-19">17 kHz – 19 kHz (Ultrasonic Default)</option>
              <option value="16-20">16 kHz – 20 kHz (Wide Band)</option>
            </select>
          </label>
        </div>
      </div>

      {/* Insecure Context Alert */}
      {isLocalIpInsecure && (
        <div className="echolocate-error-banner" style={{ background: "rgba(240, 166, 60, 0.15)", color: "#F0A63C", borderColor: "rgba(240, 166, 60, 0.3)" }}>
          🔒 <strong>Browser Security Notice:</strong> Unencrypted HTTP over LAN IP disables microphone.<br />
          EvoSense is automatically using <strong>WebRTC P2P Ping RTT Ranging</strong> to compute real distances!
        </div>
      )}

      {/* 3D Radar Canvas Container */}
      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          className="radar-canvas"
        />
      </div>

      {/* 3D Orbit Control Bar */}
      <div className="canvas-bottom-bar">
        <button
          className={`hud-orbit-btn ${autoRotate ? "active" : ""}`}
          onClick={() => setAutoRotate(r => !r)}
        >
          {autoRotate ? "⏸ 3D Orbiting (Pause)" : "▶ Start 3D Orbit"}
        </button>
        <span className="canvas-bottom-hint">
          {autoRotate ? "Auto-Rotating 35° tilt orbit view" : "Paused fixed angle view"}
        </span>
      </div>

      {/* Live Peer Distance & Ranging Matrix */}
      <div className="evosense-distance-table-card" style={{
        marginTop: "14px",
        background: "var(--surface-card, #1B1F22)",
        borderRadius: "12px",
        border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
        padding: "16px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
          <h3 style={{ margin: 0, fontSize: "15px", color: "var(--text-primary, #FFFFFF)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📏 Live Peer Distances & Multilateration Status</span>
            <span style={{ fontSize: "12px", padding: "2px 8px", background: "rgba(255, 176, 0, 0.15)", color: "#FFB000", borderRadius: "12px", fontWeight: "bold" }}>
              {positionsData.distances?.length || 0} Distance Vectors
            </span>
          </h3>
          <span style={{ fontSize: "12px", color: "var(--text-muted, rgba(255,255,255,0.6))" }}>
            Speed of Sound: {positionsData.speedOfSound || 343.0} m/s
          </span>
        </div>

        {positionsData.distances?.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", color: "var(--text-secondary, #A0AEC0)" }}>
                  <th style={{ padding: "8px 10px" }}>Node Pair</th>
                  <th style={{ padding: "8px 10px" }}>Real Distance</th>
                  <th style={{ padding: "8px 10px" }}>Ranging Method</th>
                  <th style={{ padding: "8px 10px" }}>Relative (X, Y)</th>
                  <th style={{ padding: "8px 10px" }}>Calibrate Distance</th>
                </tr>
              </thead>
              <tbody>
                {positionsData.distances.map((d, idx) => {
                  const nodeA = positionsData.positions[d.from];
                  const nodeB = positionsData.positions[d.to];
                  const nameA = nodeA?.name || d.from;
                  const nameB = nodeB?.name || d.to;
                  const otherId = d.from === selfId ? d.to : d.from;

                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "10px", fontWeight: "bold", color: "#FFFFFF" }}>
                        {nameA} ↔ {nameB}
                      </td>
                      <td style={{ padding: "10px" }}>
                        <span style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontWeight: "bold",
                          fontFamily: "monospace",
                          fontSize: "14px",
                          background: d.dist < 3.0 ? "rgba(34, 197, 94, 0.15)" : d.dist < 8.0 ? "rgba(255, 176, 0, 0.15)" : "rgba(56, 189, 248, 0.15)",
                          color: d.dist < 3.0 ? "#22C55E" : d.dist < 8.0 ? "#FFB000" : "#38BDF8",
                          border: `1px solid ${d.dist < 3.0 ? "rgba(34, 197, 94, 0.3)" : d.dist < 8.0 ? "rgba(255, 176, 0, 0.3)" : "rgba(56, 189, 248, 0.3)"}`
                        }}>
                          {d.dist.toFixed(2)} m
                        </span>
                      </td>
                      <td style={{ padding: "10px" }}>
                        <span style={{
                          fontSize: "11.5px",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          background: d.source === "acoustic" ? "rgba(34, 197, 94, 0.2)" : d.source === "gps" ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 176, 0, 0.2)",
                          color: d.source === "acoustic" ? "#22C55E" : d.source === "gps" ? "#38BDF8" : "#FFB000"
                        }}>
                          {d.source === "acoustic" ? "🔊 Acoustic Chirp ToF" : d.source === "gps" ? "🛰 GPS Fix" : d.source === "calibrated" ? "🎯 Manual Calibrated" : "⚡ WebRTC P2P RTT"}
                        </span>
                      </td>
                      <td style={{ padding: "10px", fontFamily: "monospace", fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>
                        {nodeB ? `(${nodeB.x.toFixed(2)}m, ${nodeB.y.toFixed(2)}m)` : "—"}
                      </td>
                      <td style={{ padding: "10px" }}>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          {[1.5, 3.0, 6.0, 12.0].map((distPreset) => (
                            <button
                              key={distPreset}
                              onClick={() => handleApplyDistanceCalibration(otherId, distPreset)}
                              style={{
                                padding: "3px 7px",
                                fontSize: "11px",
                                borderRadius: "4px",
                                background: Math.abs(d.dist - distPreset) < 0.3 ? "var(--accent-primary, #FFB000)" : "rgba(255,255,255,0.08)",
                                color: Math.abs(d.dist - distPreset) < 0.3 ? "#000000" : "#FFFFFF",
                                border: "1px solid rgba(255,255,255,0.15)",
                                cursor: "pointer",
                                fontWeight: "600"
                              }}
                            >
                              {distPreset}m
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "20px 10px", textAlign: "center", color: "rgba(255,255,255,0.6)" }}>
            <p style={{ margin: "0 0 8px 0", fontSize: "14px" }}>
              No peer distance vectors reported yet. Connect another browser tab or device on your network!
            </p>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted, rgba(255,255,255,0.4))" }}>
              Tip: Click <strong>"⚡ Simulate Live 3D Nodes"</strong> above to preview multi-node 3D positioning!
            </p>
          </div>
        )}

        {/* Live Distance Calibrator Slider */}
        {otherNodes.length > 0 && (
          <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: "bold", color: "var(--text-primary, #FFFFFF)" }}>
                🎯 Fine Distance Calibrator ({selectedTargetPeer ? (positionsData.positions[selectedTargetPeer]?.name || selectedTargetPeer) : (otherNodes[0]?.[1]?.name || otherNodes[0]?.[0])}):
              </span>
              <span style={{ fontSize: "14px", fontWeight: "bold", color: "var(--accent-primary, #FFB000)", fontFamily: "monospace" }}>
                {calibratedDistance} meters
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <select
                value={selectedTargetPeer || otherNodes[0]?.[0]}
                onChange={(e) => setSelectedTargetPeer(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  background: "rgba(0,0,0,0.4)",
                  color: "#FFFFFF",
                  border: "1px solid rgba(255,255,255,0.2)",
                  fontSize: "12.5px"
                }}
              >
                {otherNodes.map(([id, pos]) => (
                  <option key={id} value={id}>
                    {pos.name || id}
                  </option>
                ))}
              </select>

              <input
                type="range"
                min="0.5"
                max="25.0"
                step="0.1"
                value={calibratedDistance}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setCalibratedDistance(val);
                  const target = selectedTargetPeer || otherNodes[0]?.[0];
                  if (target) {
                    handleApplyDistanceCalibration(target, val);
                  }
                }}
                style={{ flex: 1, minWidth: "160px", accentColor: "var(--accent-primary, #FFB000)" }}
              />

              <button
                onClick={() => {
                  const target = selectedTargetPeer || otherNodes[0]?.[0];
                  if (target) handleApplyDistanceCalibration(target, calibratedDistance);
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  background: "var(--accent-primary, #FFB000)",
                  color: "#000000",
                  border: "none",
                  fontWeight: "bold",
                  fontSize: "12px",
                  cursor: "pointer"
                }}
              >
                Apply Range
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { EvoSensePanel as EchoLocatePanel };


