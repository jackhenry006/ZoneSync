import React, { useEffect, useRef, useState } from "react";
import { EchoLocateEngine } from "../services/echoLocate.js";

export function EchoLocatePanel({ socket, selfId, selfName }) {
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

  // 3D Projection Camera State & Live Refs
  const [autoRotate, setAutoRotate] = useState(true);
  const [zoomScale, setZoomScale] = useState(() => {
    try {
      return typeof window !== "undefined" && window.innerWidth < 640 ? 44 : 65;
    } catch (e) {
      return 65;
    }
  });

  const yawRef = useRef(45);
  const pitchRef = useRef(35);
  const zoomScaleRef = useRef(typeof window !== "undefined" && window.innerWidth < 640 ? 44 : 65);
  const autoRotateRef = useRef(true);
  const positionsDataRef = useRef(positionsData);

  const isDraggingRef = useRef(false);
  const lastPointerPosRef = useRef({ x: 0, y: 0 });
  const lastTouchDistRef = useRef(null);

  // Keep refs synced with props / state
  useEffect(() => {
    positionsDataRef.current = positionsData;
  }, [positionsData]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    zoomScaleRef.current = zoomScale;
  }, [zoomScale]);

  const isLocalIpInsecure =
    typeof window !== "undefined" &&
    window.isSecureContext === false &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  // Initialize EchoLocate engine on mount
  useEffect(() => {
    if (!socket || !selfId) return;

    const engine = new EchoLocateEngine(socket, selfId, selfName || "Device", {
      onStatusChange: (st) => setEngineStatus((prev) => ({ ...prev, ...st })),
      onRoundState: (rst) => setRoundState((prev) => ({ ...prev, ...rst })),
      onPositions: (pos) => setPositionsData(pos),
      onError: (err) => console.warn("[EchoLocate]", err),
    });

    engineRef.current = engine;
    engine.connectServer();
  }, [socket, selfId, selfName]);

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

  // Touch and Pointer Event Handlers for 3D Orbit & Zoom (Buttery smooth 60fps)
  const handlePointerDown = (e) => {
    isDraggingRef.current = true;
    lastPointerPosRef.current = { x: e.clientX, y: e.clientY };
    autoRotateRef.current = false;
    setAutoRotate(false);
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastPointerPosRef.current.x;
    const dy = e.clientY - lastPointerPosRef.current.y;
    lastPointerPosRef.current = { x: e.clientX, y: e.clientY };

    yawRef.current = (yawRef.current + dx * 0.45 + 360) % 360;
    pitchRef.current = Math.max(5, Math.min(85, pitchRef.current - dy * 0.35));
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      lastPointerPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      autoRotateRef.current = false;
      setAutoRotate(false);
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDistRef.current = dist;
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && isDraggingRef.current) {
      const dx = e.touches[0].clientX - lastPointerPosRef.current.x;
      const dy = e.touches[0].clientY - lastPointerPosRef.current.y;
      lastPointerPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      yawRef.current = (yawRef.current + dx * 0.5 + 360) % 360;
      pitchRef.current = Math.max(5, Math.min(85, pitchRef.current - dy * 0.4));
    } else if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const diff = dist - lastTouchDistRef.current;
      lastTouchDistRef.current = dist;
      const nextZoom = Math.max(25, Math.min(130, zoomScaleRef.current + diff * 0.3));
      zoomScaleRef.current = nextZoom;
      setZoomScale(Math.round(nextZoom));
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    lastTouchDistRef.current = null;
  };

  const handleWheel = (e) => {
    const nextZoom = Math.max(25, Math.min(130, zoomScaleRef.current - Math.sign(e.deltaY) * 6));
    zoomScaleRef.current = nextZoom;
    setZoomScale(Math.round(nextZoom));
  };

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
      const rings = [1, 2, 3, 5, 8, 12];
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
      distancesList.forEach(({ from, to, dist }) => {
        const posA = currentPositions.positions[from];
        const posB = currentPositions.positions[to];
        if (posA && posB) {
          const zA = posA.z || 0;
          const zB = posB.z || 0;
          const pA = project3D(posA.x, posA.y, zA, centerX, centerY, currentYaw, currentPitch, currentZoom);
          const pB = project3D(posB.x, posB.y, zB, centerX, centerY, currentYaw, currentPitch, currentZoom);

          ctx.beginPath();
          ctx.strokeStyle = "rgba(255, 176, 0, 0.45)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.moveTo(pA.px, pA.py);
          ctx.lineTo(pB.px, pB.py);
          ctx.stroke();
          ctx.setLineDash([]);

          // 3D Midpoint Distance Badge
          const midPx = (pA.px + pB.px) / 2;
          const midPy = (pA.py + pB.py) / 2;
          ctx.fillStyle = "rgba(27, 31, 34, 0.9)";
          ctx.fillRect(midPx - 18, midPy - 10, 36, 16);
          ctx.strokeStyle = "rgba(255, 176, 0, 0.5)";
          ctx.lineWidth = 1;
          ctx.strokeRect(midPx - 18, midPy - 10, 36, 16);

          ctx.fillStyle = "#FFB000";
          ctx.font = "bold 10px 'IBM Plex Mono', monospace";
          ctx.textAlign = "center";
          ctx.fillText(`${dist}m`, midPx, midPy + 2);
          ctx.textAlign = "left";
        }
      });

      // Sort nodes by 3D depth for back-to-front rendering
      const sortedNodes = nodeEntries.map(([nodeId, pos]) => {
        const z = pos.z || 0;
        const projected = project3D(pos.x, pos.y, z, centerX, centerY, currentYaw, currentPitch, currentZoom);
        const groundP = project3D(pos.x, pos.y, 0, centerX, centerY, currentYaw, currentPitch, currentZoom);
        return { nodeId, pos, z, projected, groundP };
      }).sort((a, b) => a.projected.depth - b.projected.depth);

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
        ctx.fillText("Waiting for acoustic 3D spatial localization round...", centerX, centerY - 15);
        ctx.font = "14px sans-serif";
        ctx.fillStyle = "rgba(240, 244, 252, 0.6)";
        ctx.fillText("Click '⚡ Simulate 3D Multi-Floor Plot' below for instant 3D spatial plot", centerX, centerY + 14);
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
        { from: id1, to: id2, dist: 2.94 },
        { from: id1, to: id3, dist: 2.68 },
        { from: id2, to: id3, dist: 2.81 },
        { from: id1, to: id4, dist: 4.58 },
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
    if (val === "15-18") {
      engineRef.current.setSweepFrequencies(15000, 18000);
    } else if (val === "16-20") {
      engineRef.current.setSweepFrequencies(16000, 20000);
    } else {
      engineRef.current.setSweepFrequencies(17000, 19000);
    }
  }

  return (
    <div className="echolocate-container">
      {/* EchoLocate Header Banner */}
      <div className="echolocate-header">
        <div className="echolocate-title">
          <h2>📡 EvoSense</h2>
        </div>

        {/* Status Indicators */}
        <div className="echolocate-round-status">
          {roundState.status === "in_progress" && (
            <span className="status-tag status-progress">
              ● Round in progress ({roundState.pingerName} chirping...)
            </span>
          )}
          {roundState.status === "chirping_self" && (
            <span className="status-tag status-chirp">
              🔊 Emitting Chirp & Listening...
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
              ○ Waiting for next round ({secondsAgo !== null ? `Last updated ${secondsAgo}s ago` : "No round data yet"})
            </span>
          )}
        </div>
      </div>

      {/* Control Bar */}
      <div className="echolocate-controls">
        <div className="control-group">
          {!engineStatus.audioReady || !engineStatus.micActive ? (
            <button className="primary-btn pulse" onClick={handleActivateAudio}>
              🎤 Activate Mic & Audio Context
            </button>
          ) : (
            <span className="mic-active-badge">✓ Mic & Audio Active</span>
          )}

          <button className="secondary-btn" onClick={handleTestChirp}>
            🔊 Play Test Chirp
          </button>

          <button className="secondary-btn" onClick={handleTriggerRound}>
            ↻ Run 3D Round
          </button>

          <button className="secondary-btn" style={{ borderColor: "var(--accent-primary)", color: "var(--accent-primary)", fontWeight: 700 }} onClick={handleSimDemo3D => handleSimulateDemo3D()}>
            ⚡ Simulate 3D Multi-Floor Plot
          </button>
        </div>

        <div className="control-group">
          <label className="sweep-label">
            Frequency Sweep:
            <select value={sweepRange} onChange={handleSweepChange} className="sweep-select">
              <option value="17-19">17 kHz – 19 kHz (Default)</option>
              <option value="15-18">15 kHz – 18 kHz (Phone Compatible)</option>
              <option value="16-20">16 kHz – 20 kHz (Wide Range)</option>
            </select>
          </label>
        </div>
      </div>

      {/* Insecure Context Alert */}
      {isLocalIpInsecure && (
        <div className="echolocate-error-banner" style={{ background: "rgba(240, 166, 60, 0.15)", color: "#F0A63C", borderColor: "rgba(240, 166, 60, 0.3)" }}>
          🔒 <strong>Browser Security Notice:</strong> Unencrypted HTTP over local IP (<code>{window.location.host}</code>) disables microphone access.<br />
          Click <strong>"⚡ Simulate 3D Multi-Floor Plot"</strong> above to test 3D spatial canvas rendering!
        </div>
      )}

      {/* 3D Radar Canvas Container */}
      <div className="canvas-wrapper">
        {/* Floating Top-Left HUD Zoom & Camera Control Widget */}
        <div className="canvas-hud-controls top-left">
          <div className="hud-group">
            <span className="hud-title">🔍 3D CAMERA ZOOM</span>
            <div className="hud-zoom-buttons">
              <button
                className="hud-btn"
                title="Zoom In (+)"
                onClick={() => {
                  const next = Math.min(130, zoomScaleRef.current + 10);
                  zoomScaleRef.current = next;
                  setZoomScale(next);
                }}
              >
                +
              </button>
              <span className="hud-val">{zoomScale} <small>px/m</small></span>
              <button
                className="hud-btn"
                title="Zoom Out (-)"
                onClick={() => {
                  const next = Math.max(25, zoomScaleRef.current - 10);
                  zoomScaleRef.current = next;
                  setZoomScale(next);
                }}
              >
                −
              </button>
              <button
                className="hud-btn reset"
                title="Reset 3D Camera View"
                onClick={() => {
                  const defaultZoom = typeof window !== "undefined" && window.innerWidth < 640 ? 44 : 65;
                  zoomScaleRef.current = defaultZoom;
                  yawRef.current = 45;
                  pitchRef.current = 35;
                  setZoomScale(defaultZoom);
                }}
              >
                ↺ Reset View
              </button>
            </div>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          className="radar-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          style={{ touchAction: "none", cursor: isDraggingRef.current ? "grabbing" : "grab" }}
        />
      </div>

      {/* 3D Orbit Control Bar (Placed Below 3D View) */}
      <div className="canvas-bottom-bar">
        <button
          className={`hud-orbit-btn ${autoRotate ? "active" : ""}`}
          onClick={() => setAutoRotate(r => !r)}
        >
          {autoRotate ? "⏸ 3D Orbiting (Pause)" : "▶ Start 3D Orbit"}
        </button>
      </div>
    </div>
  );
}
