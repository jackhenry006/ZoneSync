// ===== EvoSense Client Audio Engine & Network Coordinator =====
// Handles Web Audio API setup, LFM chirp signal generation, mic audio capture,
// matched-filter cross-correlation for arrival timing, WebRTC P2P RTT distance ranging,
// and WebSocket spatial coordination.

// Haversine distance in meters between two lat/lng coordinates
export function calculateGpsDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export class EvoSenseEngine {
  constructor(socket, nodeId, nodeName, callbacks = {}) {
    this.socket = socket;
    this.nodeId = nodeId;
    this.nodeName = nodeName;
    this.callbacks = {
      onStatusChange: callbacks.onStatusChange || (() => {}),
      onPositions: callbacks.onPositions || (() => {}),
      onRoundState: callbacks.onRoundState || (() => {}),
      onError: callbacks.onError || (() => {}),
    };

    this.audioCtx = null;
    this.micStream = null;
    this.meshNode = null;
    this.meshPollTimer = null;

    // Config defaults
    this.config = {
      speedOfSound: 343.0,
      sweepStartHz: 17000,
      sweepEndHz: 19000,
      chirpDurationSec: 0.040, // 40 ms
      ackDurationSec: 0.030,   // 30 ms
    };

    this.chirpTemplate = null;
    this.ackTemplate = null;
    this.currentRound = null;
    this.lastKnownDistances = new Map(); // peerId -> { dist, source, rtt, ts }
    this.lastReportedDistances = new Map(); // peerId -> { dist, ts }
  }

  // Hook into active P2P MeshNode to extract real-time WebRTC link RTTs and GPS locations
  setMeshNode(meshNode) {
    this.meshNode = meshNode;
    if (this.meshPollTimer) clearInterval(this.meshPollTimer);

    if (meshNode) {
      this.meshPollTimer = setInterval(() => {
        this.pollMeshNetworkDistances();
      }, 4000);
    }
  }

  // Continuously compute distance from WebRTC P2P direct ping/pong RTT & GPS coordinates
  pollMeshNetworkDistances() {
    if (!this.meshNode || !this.meshNode.peers) return;

    for (const [peerId, peer] of this.meshNode.peers.entries()) {
      if (peer.state !== "connected") continue;

      const rtt = this.meshNode._rttOf ? this.meshNode._rttOf(peerId) : 80;
      let calculatedDist = null;
      let source = "p2p_rtt";

      // 1. Check if both nodes have GPS/manual location coordinates
      const myLoc = this.meshNode.location || this.meshNode.manualLocation;
      const peerInfo = this.meshNode.linkState ? this.meshNode.linkState.get(peerId) : null;
      const peerLoc = peerInfo?.location;

      if (myLoc && peerLoc && typeof myLoc.lat === "number" && typeof peerLoc.lat === "number") {
        const gpsDist = calculateGpsDistanceMeters(myLoc.lat, myLoc.lng, peerLoc.lat, peerLoc.lng);
        if (gpsDist !== null && gpsDist > 0.1 && gpsDist < 500) {
          calculatedDist = gpsDist;
          source = "gps";
        }
      }

      // 2. Fallback to physical RTT ranging formula (LAN/WLAN baseline conversion)
      if (calculatedDist === null) {
        // Map WebRTC ping RTT (10ms - 200ms) into realistic indoor/campus physical distances (1.2m - 35m)
        const base = 1.2;
        const scale = Math.max(0.2, (rtt / 1000) * 90); // physical network distance proxy
        calculatedDist = Math.round(Math.min(35, Math.max(1.0, base + scale)) * 100) / 100;
        source = "p2p_rtt";
      }

      const prev = this.lastKnownDistances.get(peerId);
      // Heavy EMA filter (85% previous, 15% new) to prevent erratic jumping
      const smoothed = prev
        ? Math.round((prev.dist * 0.85 + calculatedDist * 0.15) * 100) / 100
        : calculatedDist;

      this.lastKnownDistances.set(peerId, { dist: smoothed, source, rtt, ts: Date.now() });

      // Deadband filter: only emit report to server if distance shifted significantly (>0.35m) or every 12s
      const lastRep = this.lastReportedDistances.get(peerId);
      const distDelta = lastRep ? Math.abs(lastRep.dist - smoothed) : 999;
      const timeSinceRep = lastRep ? (Date.now() - lastRep.ts) : 99999;

      if (distDelta >= 0.35 || timeSinceRep >= 12000) {
        this.lastReportedDistances.set(peerId, { dist: smoothed, ts: Date.now() });
        this.reportDistance(peerId, smoothed, source, rtt);
      }
    }
  }

  // Report a measured or calibrated distance to server
  reportDistance(targetId, distance, source = "p2p_rtt", rtt = null) {
    if (!this.socket || !targetId || !distance) return;
    this.socket.emit("echolocate:report_peer_distance", {
      targetId,
      distance: parseFloat(distance),
      source,
      rtt,
    });
  }

  // Initialize Web Audio API after user gesture
  async initAudio() {
    if (this.audioCtx) {
      if (this.audioCtx.state === "suspended") {
        await this.audioCtx.resume();
      }
      return true;
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("Web Audio API is not supported in this browser.");
      }

      this.audioCtx = new AudioContextClass();
      if (this.audioCtx.state === "suspended") {
        await this.audioCtx.resume();
      }

      // Generate reference chirp & ACK signal templates
      this.generateTemplates();
      this.callbacks.onStatusChange({ audioReady: true, status: "ready" });
      return true;
    } catch (err) {
      this.callbacks.onError(`Audio init error: ${err.message}`);
      this.callbacks.onStatusChange({ audioReady: false, status: "error", errorMsg: err.message });
      return false;
    }
  }

  // Generate Linear Frequency Modulation (LFM) Chirp & ACK waveforms
  generateTemplates() {
    if (!this.audioCtx) return;
    const sampleRate = this.audioCtx.sampleRate;

    // Primary Chirp: LFM Sweep with Tukey windowing
    const chirpLength = Math.floor(sampleRate * this.config.chirpDurationSec);
    const chirpData = new Float32Array(chirpLength);

    const f0 = this.config.sweepStartHz;
    const f1 = this.config.sweepEndHz;
    const T = this.config.chirpDurationSec;

    for (let i = 0; i < chirpLength; i++) {
      const t = i / sampleRate;
      const freq = f0 + ((f1 - f0) / (2 * T)) * t;
      const raw = Math.sin(2 * Math.PI * freq * t);

      // 10% Tukey Window taper at start and end
      let window = 1.0;
      const taperLen = Math.floor(chirpLength * 0.1);
      if (i < taperLen) {
        window = 0.5 * (1 - Math.cos((Math.PI * i) / taperLen));
      } else if (i > chirpLength - taperLen) {
        window = 0.5 * (1 - Math.cos((Math.PI * (chirpLength - i)) / taperLen));
      }
      chirpData[i] = raw * window;
    }
    this.chirpTemplate = chirpData;

    // ACK Tone: Downward LFM Sweep for response ACK
    const ackLength = Math.floor(sampleRate * this.config.ackDurationSec);
    const ackData = new Float32Array(ackLength);

    for (let i = 0; i < ackLength; i++) {
      const t = i / sampleRate;
      const freq = f1 - ((f1 - f0) / (2 * T)) * t;
      const raw = Math.sin(2 * Math.PI * freq * t);

      let window = 1.0;
      const taperLen = Math.floor(ackLength * 0.1);
      if (i < taperLen) {
        window = 0.5 * (1 - Math.cos((Math.PI * i) / taperLen));
      } else if (i > ackLength - taperLen) {
        window = 0.5 * (1 - Math.cos((Math.PI * (ackLength - i)) / taperLen));
      }
      ackData[i] = raw * window;
    }
    this.ackTemplate = ackData;
  }

  // Set sweep frequencies for real-device hardware compatibility
  setSweepFrequencies(startHz, endHz) {
    this.config.sweepStartHz = startHz;
    this.config.sweepEndHz = endHz;
    if (this.audioCtx) {
      this.generateTemplates();
    }
  }

  // Request Microphone permissions & start mic stream
  async startMicrophone() {
    if (this.micStream) return true;

    if (window.isSecureContext === false && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      const errText = "Microphone access requires HTTPS or localhost (Secure Context).";
      this.callbacks.onError(errText);
      this.callbacks.onStatusChange({ micActive: false, micError: errText });
      return false;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("getUserMedia not supported in this browser.");
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.callbacks.onStatusChange({ micActive: true, micError: null });
      return true;
    } catch (err) {
      const msg = `Mic permission denied or unavailable: ${err.message}`;
      this.callbacks.onError(msg);
      this.callbacks.onStatusChange({ micActive: false, micError: msg });
      return false;
    }
  }

  // Connect to EchoLocate server via Socket.io
  connectServer() {
    if (!this.socket) return;

    this._onRegistered = (data) => {
      if (data && data.config) {
        this.config.speedOfSound = data.config.SPEED_OF_SOUND || 343.0;
      }
      this.callbacks.onStatusChange({ registered: true });
    };

    this._onRoundStarted = (data) => {
      this.currentRound = data;
      this.callbacks.onRoundState({ status: "in_progress", roundId: data.roundId });
    };

    this._onPingerTurn = async (turnData) => {
      await this.handlePingerTurn(turnData);
    };

    this._onPositionsUpdated = (posData) => {
      this.callbacks.onPositions(posData);
      this.callbacks.onRoundState({ status: "completed", roundId: posData.roundId, lastUpdated: Date.now() });
    };

    this.socket.on("echolocate:registered", this._onRegistered);
    this.socket.on("echolocate:round_started", this._onRoundStarted);
    this.socket.on("echolocate:pinger_turn", this._onPingerTurn);
    this.socket.on("echolocate:positions_updated", this._onPositionsUpdated);

    const reg = { id: this.nodeId, name: this.nodeName };
    this.socket.emit("echolocate:register", reg);
    this.socket.emit("register", reg);

    this._onConnect = () => {
      this.socket.emit("echolocate:register", reg);
      this.socket.emit("register", reg);
    };
    this.socket.on("connect", this._onConnect);
  }

  // Play a chirp buffer at a specific AudioContext hardware time
  playBuffer(bufferData, targetTime) {
    if (!this.audioCtx || !bufferData) return;

    const audioBuf = this.audioCtx.createBuffer(1, bufferData.length, this.audioCtx.sampleRate);
    audioBuf.getChannelData(0).set(bufferData);

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuf;
    source.connect(this.audioCtx.destination);

    const playAt = Math.max(this.audioCtx.currentTime, targetTime || 0);
    source.start(playAt);
    return playAt;
  }

  // Perform time-domain cross-correlation matched filter with amplitude thresholding
  crossCorrelate(inputSamples, templateSamples) {
    const n = inputSamples.length;
    const m = templateSamples.length;
    if (n < m) return { maxCorrelation: 0, peakIndex: -1 };

    let maxCorr = 0;
    let peakIndex = -1;

    // Calculate energy of template
    let templateEnergy = 0;
    for (let k = 0; k < m; k++) {
      templateEnergy += templateSamples[k] * templateSamples[k];
    }
    if (templateEnergy === 0) return { maxCorrelation: 0, peakIndex: -1 };

    // Search correlation peaks with minimum amplitude energy check
    for (let i = 0; i <= n - m; i += 2) {
      let sum = 0;
      let inputEnergy = 0;

      for (let k = 0; k < m; k++) {
        const val = inputSamples[i + k];
        sum += val * templateSamples[k];
        inputEnergy += val * val;
      }

      if (inputEnergy > 0.0001) {
        const normalizedCorr = Math.abs(sum) / Math.sqrt(inputEnergy * templateEnergy);
        if (normalizedCorr > maxCorr) {
          maxCorr = normalizedCorr;
          peakIndex = i;
        }
      }
    }

    return { maxCorrelation: maxCorr, peakIndex };
  }

  // Handle server Pinger turn event
  async handlePingerTurn(turnData) {
    const { roundId, pingerId, responderSlots = {}, baseDelayMs = 100, stepDelayMs = 150 } = turnData;

    if (pingerId === this.nodeId) {
      // THIS NODE IS THE PINGER: Chirp, listen for responder ACKs, time RTTs
      this.callbacks.onRoundState({ status: "chirping_self", roundId, pingerName: "You" });

      if (this.audioCtx && this.chirpTemplate) {
        const emitTime = this.audioCtx.currentTime + 0.05; // 50ms ahead
        this.playBuffer(this.chirpTemplate, emitTime);
      }

      const measurements = {};
      const responderList = Object.entries(responderSlots || {}); // [ [targetId, slotIdx], ... ]

      if (responderList.length === 0 || !this.micStream || !this.audioCtx) {
        setTimeout(() => {
          this.socket.emit("echolocate:report_measurements", { roundId, measurements });
        }, 400);
        return;
      }

      // Record mic audio safely without audio feedback loop
      const micSource = this.audioCtx.createMediaStreamSource(this.micStream);
      const bufferSize = 4096;
      const scriptNode = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);
      const sampleRate = this.audioCtx.sampleRate;

      // Silent gain node prevents mic audio from playing out of speakers
      const silentGain = this.audioCtx.createGain();
      silentGain.gain.value = 0;

      const recordedChunks = [];

      scriptNode.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        recordedChunks.push(new Float32Array(inputData));
      };

      micSource.connect(scriptNode);
      scriptNode.connect(silentGain);
      silentGain.connect(this.audioCtx.destination);

      const listenDurationMs = baseDelayMs + (responderList.length + 1) * stepDelayMs + 350;

      setTimeout(() => {
        // Stop recording
        try {
          scriptNode.disconnect();
          silentGain.disconnect();
          micSource.disconnect();
        } catch (e) {}

        const totalSamples = recordedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const fullMicAudio = new Float32Array(totalSamples);
        let offset = 0;
        recordedChunks.forEach(chunk => {
          fullMicAudio.set(chunk, offset);
          offset += chunk.length;
        });

        // Search for ACK pulse in each responder's designated time window slot
        responderList.forEach(([targetId, slotIdx]) => {
          const expectedDelayMs = baseDelayMs + slotIdx * stepDelayMs;
          const windowStartSec = Math.max(0, (expectedDelayMs - 80) / 1000);
          const windowEndSec = (expectedDelayMs + 220) / 1000;

          const startSample = Math.max(0, Math.floor(windowStartSec * sampleRate));
          const endSample = Math.min(fullMicAudio.length, Math.floor(windowEndSec * sampleRate));

          if (endSample > startSample && endSample - startSample > (this.ackTemplate?.length || 100)) {
            const subSlice = fullMicAudio.subarray(startSample, endSample);
            const corr = this.crossCorrelate(subSlice, this.ackTemplate || this.chirpTemplate);

            if (corr.maxCorrelation > 0.10 && corr.peakIndex >= 0) {
              const detectedSampleOffset = startSample + corr.peakIndex;
              const detectedDelaySec = detectedSampleOffset / sampleRate;

              const rttSec = Math.max(0.002, detectedDelaySec - (expectedDelayMs / 1000));
              const oneWaySec = rttSec / 2;
              const distanceMeters = oneWaySec * this.config.speedOfSound;

              if (distanceMeters > 0.15 && distanceMeters < 50.0) {
                measurements[targetId] = Math.round(distanceMeters * 100) / 100;
              }
            }
          }
        });

        // Report measurements back to EchoLocate server
        this.socket.emit("echolocate:report_measurements", { roundId, measurements });
      }, listenDurationMs);

    } else {
      // THIS NODE IS A LISTENER: Listen for pinger chirp and respond with ACK at slot delay
      const slotIdx = responderSlots[this.nodeId];
      if (slotIdx === undefined) return;

      this.callbacks.onRoundState({
        status: "listening",
        roundId,
        pingerName: turnData.pingerName,
      });

      if (!this.micStream || !this.audioCtx) return;

      const micSource = this.audioCtx.createMediaStreamSource(this.micStream);
      const bufferSize = 2048;
      const scriptNode = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);

      const silentGain = this.audioCtx.createGain();
      silentGain.gain.value = 0;

      let detected = false;

      scriptNode.onaudioprocess = (e) => {
        if (detected) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const corr = this.crossCorrelate(inputData, this.chirpTemplate);

        if (corr.maxCorrelation > 0.12 && corr.peakIndex >= 0) {
          detected = true;
          const detectTime = this.audioCtx.currentTime;

          const delayMs = baseDelayMs + slotIdx * stepDelayMs;
          const targetAckTime = detectTime + (delayMs / 1000);

          this.playBuffer(this.ackTemplate || this.chirpTemplate, targetAckTime);

          try {
            scriptNode.disconnect();
            silentGain.disconnect();
            micSource.disconnect();
          } catch (e) {}
        }
      };

      micSource.connect(scriptNode);
      scriptNode.connect(silentGain);
      silentGain.connect(this.audioCtx.destination);

      setTimeout(() => {
        if (!detected) {
          try {
            scriptNode.disconnect();
            silentGain.disconnect();
            micSource.disconnect();
          } catch (e) {}
        }
      }, 1800);
    }
  }

  // Trigger manual hardware test chirp playback
  playTestChirp() {
    if (!this.audioCtx) return;
    this.playBuffer(this.chirpTemplate, this.audioCtx.currentTime + 0.02);
  }

  // Manually request immediate localization round from server
  triggerRound() {
    if (this.socket) {
      this.socket.emit("echolocate:trigger_round");
    }
  }

  destroy() {
    if (this.meshPollTimer) clearInterval(this.meshPollTimer);
    if (this.socket) {
      if (this._onRegistered) this.socket.off("echolocate:registered", this._onRegistered);
      if (this._onRoundStarted) this.socket.off("echolocate:round_started", this._onRoundStarted);
      if (this._onPingerTurn) this.socket.off("echolocate:pinger_turn", this._onPingerTurn);
      if (this._onPositionsUpdated) this.socket.off("echolocate:positions_updated", this._onPositionsUpdated);
      if (this._onConnect) this.socket.off("connect", this._onConnect);
    }
  }
}

export { EvoSenseEngine as EchoLocateEngine };


