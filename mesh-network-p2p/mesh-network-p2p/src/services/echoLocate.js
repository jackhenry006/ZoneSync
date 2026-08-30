// ===== EchoLocate Client Audio Engine & Network Coordinator =====
// Handles Web Audio API setup, LFM chirp signal generation, mic audio capture,
// matched-filter cross-correlation for arrival timing, and WebSocket coordination.

export class EchoLocateEngine {
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

    // Config defaults
    this.config = {
      speedOfSound: 343.0,
      sweepStartHz: 17000,
      sweepEndHz: 19000,
      chirpDurationSec: 0.035, // 35 ms
      ackDurationSec: 0.025,   // 25 ms
    };

    this.chirpTemplate = null;
    this.ackTemplate = null;
    this.currentRound = null;
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

    // Primary Chirp: LFM Sweep from 17kHz to 19kHz with Tukey windowing
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

    // ACK Tone: Downward LFM Sweep 19kHz -> 17.5kHz for response ACK
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

  // Set sweep frequencies for real-device hardware compatibility (e.g. 15kHz-18kHz)
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
    this.socket.on("echolocate:registered", (data) => {
      if (data && data.config) {
        this.config.speedOfSound = data.config.SPEED_OF_SOUND || 343.0;
      }
      this.callbacks.onStatusChange({ registered: true });
    });

    this.socket.on("echolocate:round_started", (data) => {
      this.currentRound = data;
      this.callbacks.onRoundState({ status: "in_progress", roundId: data.roundId });
    });

    this.socket.on("echolocate:pinger_turn", async (turnData) => {
      await this.handlePingerTurn(turnData);
    });

    this.socket.on("echolocate:positions_updated", (posData) => {
      this.callbacks.onPositions(posData);
      this.callbacks.onRoundState({ status: "completed", roundId: posData.roundId, lastUpdated: Date.now() });
    });

    this.socket.emit("echolocate:register", { id: this.nodeId, name: this.nodeName });
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

      // Ensure minimum input energy to prevent silence static false triggers
      if (inputEnergy > 0.0002) {
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
    if (!this.audioCtx) return;
    const { roundId, pingerId, responderSlots, baseDelayMs, stepDelayMs } = turnData;

    if (pingerId === this.nodeId) {
      // THIS NODE IS THE PINGER: Chirp, listen for responder ACKs, time RTTs
      this.callbacks.onRoundState({ status: "chirping_self", roundId, pingerName: "You" });

      const emitTime = this.audioCtx.currentTime + 0.05; // 50ms ahead
      this.playBuffer(this.chirpTemplate, emitTime);

      const measurements = {};
      const responderList = Object.entries(responderSlots); // [ [targetId, slotIdx], ... ]

      if (responderList.length === 0 || !this.micStream) {
        setTimeout(() => {
          this.socket.emit("echolocate:report_measurements", { roundId, measurements });
        }, 800);
        return;
      }

      // Record mic audio safely without audio feedback loop
      const micSource = this.audioCtx.createMediaStreamSource(this.micStream);
      const bufferSize = 4096;
      const scriptNode = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);
      const sampleRate = this.audioCtx.sampleRate;

      // Silent gain node prevents mic audio from playing out of speakers (no feedback screech)
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

      // Listen for total window duration
      const listenDurationMs = baseDelayMs + (responderList.length + 1) * stepDelayMs + 400;

      setTimeout(() => {
        // Stop recording
        scriptNode.disconnect();
        silentGain.disconnect();
        micSource.disconnect();

        // Concatenate recorded mic audio buffer
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
          const windowStartSec = (expectedDelayMs - 60) / 1000;
          const windowEndSec = (expectedDelayMs + 180) / 1000;

          const startSample = Math.max(0, Math.floor(windowStartSec * sampleRate));
          const endSample = Math.min(fullMicAudio.length, Math.floor(windowEndSec * sampleRate));

          if (endSample > startSample && endSample - startSample > (this.ackTemplate?.length || 100)) {
            const subSlice = fullMicAudio.subarray(startSample, endSample);
            const corr = this.crossCorrelate(subSlice, this.ackTemplate || this.chirpTemplate);

            if (corr.maxCorrelation > 0.12 && corr.peakIndex >= 0) {
              const detectedSampleOffset = startSample + corr.peakIndex;
              const detectedDelaySec = detectedSampleOffset / sampleRate;

              // Round-trip travel time = (detectedDelaySec - expectedDelaySec)
              // One-way acoustic travel time = RTT / 2
              const rttSec = Math.max(0.001, detectedDelaySec - (expectedDelayMs / 1000));
              const oneWaySec = rttSec / 2;
              const distanceMeters = oneWaySec * this.config.speedOfSound;

              if (distanceMeters > 0.1 && distanceMeters < 40.0) {
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
      if (slotIdx === undefined) return; // Not included in turn

      this.callbacks.onRoundState({
        status: "listening",
        roundId,
        pingerName: turnData.pingerName,
      });

      if (!this.micStream) return;

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

        if (corr.maxCorrelation > 0.15 && corr.peakIndex >= 0) {
          detected = true;
          const detectTime = this.audioCtx.currentTime;

          // Schedule ACK response chirp at fixed slot delay
          const delayMs = baseDelayMs + slotIdx * stepDelayMs;
          const targetAckTime = detectTime + (delayMs / 1000);

          this.playBuffer(this.ackTemplate || this.chirpTemplate, targetAckTime);

          scriptNode.disconnect();
          silentGain.disconnect();
          micSource.disconnect();
        }
      };

      micSource.connect(scriptNode);
      scriptNode.connect(silentGain);
      silentGain.connect(this.audioCtx.destination);

      // Stop listening after timeout if chirp not heard
      setTimeout(() => {
        if (!detected) {
          scriptNode.disconnect();
          silentGain.disconnect();
          micSource.disconnect();
        }
      }, 1500);
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
}
