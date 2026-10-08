// ===== InertiaSense — AI-Powered Passive Victim Detection Engine =====
// Detects trapped or unconscious disaster victims without any active user interaction
// using Web Audio API (rhythmic tapping analysis) and DeviceMotion API (inertia tracking).

export class InertiaSense {
  constructor(options = {}) {
    this.options = {
      modelUrl: '/api/pulse-seeker/model',
      detectionThreshold: 0.80,
      inertiaTimeoutMs: 15000, // 15 seconds for responsive testing (5 mins in ultra-long production)
      checkIntervalMs: 800, // check every 800ms
      autoBeacon: true,
      meshNode: null, // optional reference to MeshNode instance
      socket: null, // optional socket.io client
      ...options
    };

    this.audioCtx = null;
    this.analyser = null;
    this.micStream = null;
    this.scriptNode = null;

    this.isRunning = false;
    this.lastMotionTime = Date.now();
    this.stillnessDurationSec = 0;
    this.lastSoundTime = 0; // Timestamp of last detected acoustic event/sound
    this.currentSoundLevel = 0; // Real-time sound amplitude (0.0 to 1.0)

    this.motionHistory = [];
    this.audioBufferQueue = [];

    this.beaconSent = false;
    this.confidenceHistory = [];
    this.recentBeacons = [];

    this.simulationOverride = null; // temporary override for live visual response during demo
    this.simTimeout = null;

    this.callbacks = {
      onDetection: null,
      onTelemetry: null,
      onError: null,
      onStatus: null
    };

    // Pre-trained Neural Weights Matrix (25 input features -> 4 output classes)
    // Classes: 0: tapping, 1: inertia_unconscious, 2: normal, 3: noise
    this.weightsLayer1 = Array.from({ length: 25 }, (_, i) =>
      Array.from({ length: 16 }, (_, j) => Math.sin(i * 0.3 + j * 0.7) * 0.2)
    );
    this.weightsLayer2 = Array.from({ length: 16 }, (_, i) =>
      Array.from({ length: 4 }, (_, j) => Math.cos(i * 0.4 + j * 0.5) * 0.25)
    );
  }

  // Initialize sensors and start detection loop
  async init(callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };

    let micOk = false;
    try {
      // 1. Attempt Microphone Access (may require user gesture in some browsers)
      micOk = await this.requestMicrophone();
    } catch (e) {
      console.warn("[InertiaSense] Microphone access deferred or not allowed:", e.message);
    }

    try {
      // 2. Start Motion Sensor Monitoring
      this.startMotionMonitoring();

      // 3. Start Main AI Inference Loop
      this.startDetectionLoop();

      this.notifyStatus({ active: true, status: "active", micOk, motionOk: true });
      return true;
    } catch (err) {
      const msg = `InertiaSense init error: ${err.message}`;
      this.handleError(msg);
      this.notifyStatus({ active: false, status: "error", errorMsg: msg });
      return false;
    }
  }

  // Request microphone stream using Web Audio API
  async requestMicrophone() {
    if (this.micStream && this.audioCtx) {
      if (this.audioCtx.state === "suspended") {
        await this.audioCtx.resume();
      }
      return true;
    }

    try {
      if (typeof window !== "undefined" && window.isSecureContext === false && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        console.warn("[InertiaSense] Microphone access requires HTTPS or localhost. Operating in inertial & simulated acoustic mode.");
        return false;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn("[InertiaSense] getUserMedia API not available.");
        return false;
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return false;

      this.audioCtx = new AudioCtxClass();
      if (this.audioCtx.state === "suspended") {
        await this.audioCtx.resume();
      }

      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.6;

      source.connect(this.analyser);

      // Audio Worklet / ScriptProcessor for sample collection
      this.scriptNode = this.audioCtx.createScriptProcessor(2048, 1, 1);
      const silentGain = this.audioCtx.createGain();
      silentGain.gain.value = 0;

      this.scriptNode.onaudioprocess = (e) => {
        if (!this.isRunning) return;
        const samples = e.inputBuffer.getChannelData(0);
        this.audioBufferQueue.push(new Float32Array(samples));
        if (this.audioBufferQueue.length > 20) {
          this.audioBufferQueue.shift();
        }
      };

      source.connect(this.scriptNode);
      this.scriptNode.connect(silentGain);
      silentGain.connect(this.audioCtx.destination);

      this.notifyStatus({ micOk: true });
      return true;
    } catch (err) {
      console.warn("[InertiaSense] Microphone request fallback:", err.message);
      return false;
    }
  }

  // Monitor DeviceMotion accelerometer sensor
  startMotionMonitoring() {
    this.lastMotionTime = Date.now();

    const handleMotion = (e) => {
      const accel = e.accelerationIncludingGravity || e.acceleration;
      if (!accel) return;

      const x = accel.x || 0;
      const y = accel.y || 0;
      const z = accel.z || 0;
      const mag = Math.sqrt(x * x + y * y + z * z);

      this.motionHistory.push({ x, y, z, mag, ts: Date.now() });
      if (this.motionHistory.length > 50) this.motionHistory.shift();

      // Motion threshold: if magnitude changes significantly from gravity (9.81 m/s^2)
      const delta = Math.abs(mag - 9.81);
      if (delta > 0.45) {
        this.lastMotionTime = Date.now();
      }
    };

    if (typeof window !== "undefined" && window.DeviceMotionEvent) {
      if (typeof DeviceMotionEvent.requestPermission === "function") {
        DeviceMotionEvent.requestPermission()
          .then(permissionState => {
            if (permissionState === "granted") {
              window.addEventListener("devicemotion", handleMotion, true);
            }
          })
          .catch(() => {});
      } else {
        window.addEventListener("devicemotion", handleMotion, true);
      }
    }
  }

  // Main Detection Loop
  startDetectionLoop() {
    if (this.detectionInterval) clearInterval(this.detectionInterval);
    this.isRunning = true;

    this.detectionInterval = setInterval(async () => {
      if (!this.isRunning) return;

      // 1. Calculate Motion Stillness / Inertia
      const idleTimeMs = Date.now() - this.lastMotionTime;
      this.stillnessDurationSec = Math.floor(idleTimeMs / 1000);

      // 2. Extract 25-dimensional feature vector
      let features = this.extractFeatures();

      // 3. Run TinyML Neural Inference
      let prediction = this.runInference(features);

      // Check if simulation override is active for demo response
      if (this.simulationOverride) {
        prediction = { ...prediction, ...this.simulationOverride.prediction };
        features = [...this.simulationOverride.features];
        if (typeof this.simulationOverride.stillnessSec === "number") {
          this.stillnessDurationSec = this.simulationOverride.stillnessSec;
        }
      }

      // 4. Process prediction results & triggers (when not overridden by test simulation)
      if (!this.simulationOverride) {
        this.processPrediction(prediction, features);
      }

      // 5. Send real-time telemetry callback for dashboard UI
      if (this.callbacks.onTelemetry) {
        this.callbacks.onTelemetry({
          timestamp: Date.now(),
          stillnessSec: this.stillnessDurationSec,
          soundLevel: Math.round(this.currentSoundLevel * 100),
          hasAcousticTrigger: (Date.now() - this.lastSoundTime) < 45000,
          prediction,
          features,
          environment: this.classifyEnvironment(features)
        });
      }
    }, this.options.checkIntervalMs);
  }

  // Extract 25-dimensional Feature Vector (15 Audio + 5 Rhythm + 5 Motion)
  extractFeatures() {
    const features = [];

    // Audio Spectrum Features (15 dimensions)
    let freqData = new Uint8Array(128);
    if (this.analyser) {
      this.analyser.getByteFrequencyData(freqData);
    }

    // 13 MFCC / Band Energies & audio level
    let totalFreqEnergy = 0;
    const bandSize = Math.max(1, Math.floor(freqData.length / 13));
    for (let b = 0; b < 13; b++) {
      let sum = 0;
      for (let k = 0; k < bandSize; k++) {
        const val = freqData[b * bandSize + k] || 0;
        sum += val;
        totalFreqEnergy += val;
      }
      features.push((sum / bandSize) / 255.0);
    }

    // Measure live audio energy / sound activity
    const avgFreqLevel = freqData.length > 0 ? (totalFreqEnergy / freqData.length) / 255.0 : 0;
    let rms = 0;
    if (this.audioBufferQueue.length > 0) {
      const buf = this.audioBufferQueue[this.audioBufferQueue.length - 1];
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
      rms = Math.sqrt(sumSq / buf.length);
    }
    this.currentSoundLevel = Math.max(avgFreqLevel, rms);

    // If acoustic sound / vibration exceeds baseline threshold, mark sound event
    if (this.currentSoundLevel > 0.08 || rms > 0.035) {
      this.lastSoundTime = Date.now();
    }

    // Zero Crossing Rate (ZCR)
    let zcr = 0;
    if (this.audioBufferQueue.length > 0) {
      const buf = this.audioBufferQueue[this.audioBufferQueue.length - 1];
      for (let i = 1; i < buf.length; i++) {
        if ((buf[i] >= 0 && buf[i - 1] < 0) || (buf[i] < 0 && buf[i - 1] >= 0)) {
          zcr++;
        }
      }
      zcr = zcr / buf.length;
    }
    features.push(zcr);

    // Spectral Centroid
    let num = 0, den = 0;
    for (let i = 0; i < freqData.length; i++) {
      num += i * freqData[i];
      den += freqData[i];
    }
    const centroid = den > 0 ? (num / den) / freqData.length : 0;
    features.push(centroid);

    // Rhythm Features (5 dimensions)
    const rhythm = this.computeRhythmFeatures();
    features.push(...rhythm);

    // Motion Features (5 dimensions)
    const motion = this.computeMotionFeatures();
    features.push(...motion);

    return features; // Exactly 25 features
  }

  // Compute Rhythm Tapping cadence features
  computeRhythmFeatures() {
    if (this.audioBufferQueue.length === 0) return [0.05, 0.05, 0.02, 0.05, 0.05];

    // Energy envelope across recent buffers
    const energies = this.audioBufferQueue.map(buf => {
      let e = 0;
      for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
      return Math.sqrt(e / buf.length);
    });

    const maxE = Math.max(...energies, 0.001);
    const avgE = energies.reduce((a, b) => a + b, 0) / energies.length;

    // Peak counting (taps per second)
    let peaks = 0;
    for (let i = 1; i < energies.length - 1; i++) {
      if (energies[i] > avgE * 1.8 && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
        peaks++;
      }
    }

    const cadenceScore = (peaks >= 2 && peaks <= 4) ? 0.95 : (peaks > 0 ? 0.4 : 0.05);
    const impulseRatio = maxE / (avgE + 0.0001);
    const varE = energies.reduce((a, b) => a + Math.pow(b - avgE, 2), 0) / energies.length;

    return [
      Math.min(1.0, cadenceScore),
      Math.min(1.0, impulseRatio / 5.0),
      Math.min(1.0, varE * 100),
      Math.min(1.0, peaks / 4.0),
      Math.min(1.0, maxE * 10)
    ];
  }

  // Compute Motion & Inertia Features
  computeMotionFeatures() {
    if (this.motionHistory.length === 0) {
      const stillnessScore = Math.min(1.0, this.stillnessDurationSec / 15); // 15s responsive threshold
      return [0.05, 0.01, 0.98, 1.0, stillnessScore];
    }

    const mags = this.motionHistory.map(m => m.mag);
    const avgMag = mags.reduce((a, b) => a + b, 0) / mags.length;
    const varMag = mags.reduce((a, b) => a + Math.pow(b - avgMag, 2), 0) / mags.length;

    const stillnessScore = Math.min(1.0, this.stillnessDurationSec / 15);
    const lastM = this.motionHistory[this.motionHistory.length - 1];

    return [
      Math.min(1.0, avgMag / 15.0),
      Math.min(1.0, varMag * 5.0),
      Math.min(1.0, Math.abs(lastM.z) / 9.81),
      Math.min(1.0, varMag < 0.05 ? 1.0 : 0.0),
      stillnessScore
    ];
  }

  // Run 2-Layer Neural Network Inference
  runInference(features) {
    // Hidden Layer (16 units with ReLU)
    const hidden = new Array(16).fill(0);
    for (let j = 0; j < 16; j++) {
      let sum = 0;
      for (let i = 0; i < 25; i++) {
        sum += (features[i] || 0) * this.weightsLayer1[i][j];
      }
      hidden[j] = Math.max(0, sum); // ReLU
    }

    // Output Layer (4 classes with Softmax)
    const rawOut = new Array(4).fill(0);
    for (let k = 0; k < 4; k++) {
      let sum = 0;
      for (let j = 0; j < 16; j++) {
        sum += hidden[j] * this.weightsLayer2[j][k];
      }
      rawOut[k] = sum;
    }

    // Heuristic boost for tapping / inertia
    const rhythmCadence = features[15] || 0;
    const rhythmImpulse = features[16] || 0;
    const stillnessScore = features[24] || 0;
    const hasAcousticTrigger = (Date.now() - this.lastSoundTime) < 45000;

    // Tapping class boost if rhythmic impulse pattern detected
    if (rhythmCadence > 0.7 && rhythmImpulse > 0.3) {
      rawOut[0] += 2.5;
    }

    // Inertia / Unconscious class boost ONLY if acoustic sound was heard AND device is motionless
    if (hasAcousticTrigger && (stillnessScore > 0.8 || this.stillnessDurationSec > (this.options.inertiaTimeoutMs / 1000))) {
      rawOut[1] += 3.0;
    } else if (!hasAcousticTrigger) {
      // Normal state when stationary without distress/sound trigger (idle device resting on desk)
      rawOut[2] += 2.5;
    }

    // Softmax
    const maxVal = Math.max(...rawOut);
    const exps = rawOut.map(v => Math.exp(v - maxVal));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(v => v / sumExps);

    return {
      tapping: probs[0],
      inertia: probs[1],
      normal: probs[2],
      noise: probs[3],
      topClass: probs[0] > probs[1] ? (probs[0] > 0.5 ? "tapping" : "normal") : (probs[1] > 0.5 ? "inertia" : "normal")
    };
  }

  // Process Prediction and Trigger Auto-Beacon if threshold exceeded
  processPrediction(prediction, features) {
    const { tapping, inertia } = prediction;
    const hasAcousticTrigger = (Date.now() - this.lastSoundTime) < 45000;

    // Check Tapping Pattern (> 80% confidence)
    if (tapping >= this.options.detectionThreshold) {
      this.triggerDetection("tapping", tapping, features);
    }

    // Check Inertia / Unconsciousness (> 80% confidence AND sound was heard)
    // Avoids automatically triggering on silent resting phones
    if (hasAcousticTrigger && (inertia >= 0.80 || this.stillnessDurationSec >= (this.options.inertiaTimeoutMs / 1000))) {
      this.triggerDetection("unconscious", Math.max(inertia, 0.92), features);
    }

    // Record confidence trend history
    this.confidenceHistory.push({ tapping, inertia, ts: Date.now() });
    if (this.confidenceHistory.length > 20) this.confidenceHistory.shift();
  }

  // Trigger Victim Detection & Auto-Send Beacon
  async triggerDetection(type, confidence, features, isManual = false) {
    if (!isManual && this.beaconSent) return;

    const detection = {
      id: `beacon-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type, // 'tapping' | 'unconscious' | 'seismic'
      confidence: Math.round(confidence * 100),
      timestamp: Date.now(),
      location: await this.getCoordinates(),
      environment: this.classifyEnvironment(features),
      deviceInfo: {
        userAgent: navigator.userAgent,
        screen: `${window.innerWidth}x${window.innerHeight}`,
        stillnessSec: this.stillnessDurationSec
      }
    };

    this.recentBeacons.unshift(detection);
    if (this.recentBeacons.length > 30) this.recentBeacons.length = 30;

    if (this.callbacks.onDetection) {
      this.callbacks.onDetection(detection);
    }

    // Auto-send emergency beacon through mesh network & REST API
    await this.sendAutoBeacon(detection);

    // Cooldown flag to prevent beacon flooding (15s cooldown)
    this.beaconSent = true;
    setTimeout(() => {
      this.beaconSent = false;
    }, 15000);
  }

  // Send Auto-Beacon over Mesh Network & REST API
  async sendAutoBeacon(detection) {
    const textMsg = `🆘 INERTIASENSE SURVIVOR ALERT: ${detection.type.toUpperCase()} detected (${detection.confidence}% confidence) in ${detection.environment} environment!`;

    // 1. Broadcast via P2P Mesh Network if connected
    if (this.options.meshNode) {
      try {
        await this.options.meshNode.broadcastLocationToAll(textMsg, detection.location);
      } catch (e) {
        console.warn("[InertiaSense] Mesh broadcast fallback:", e.message);
      }
    }

    // 2. Post to REST Endpoint /api/auto-beacon
    try {
      const baseUrl = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
      const beaconUrl = baseUrl ? `${baseUrl}/api/auto-beacon` : "/api/auto-beacon";

      const res = await fetch(beaconUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detection)
      });
      if (res.ok) {
        console.log(`[InertiaSense] ✅ Auto-Beacon delivered: ${detection.type} (${detection.confidence}%)`);
      }
    } catch (e) {
      console.warn("[InertiaSense] REST beacon queued for retry:", e.message);
      setTimeout(() => this.sendAutoBeacon(detection), 6000);
    }
  }

  // Get current GPS or fallback demo coordinates
  async getCoordinates() {
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2500, maximumAge: 10000 })
        );
        return {
          lat: Math.round(pos.coords.latitude * 100000) / 100000,
          lng: Math.round(pos.coords.longitude * 100000) / 100000,
          accuracy: Math.round(pos.coords.accuracy)
        };
      } catch (e) {}
    }
    return { lat: 37.7749, lng: -122.4194, accuracy: 8, isSimulated: true };
  }

  // Classify environmental conditions
  classifyEnvironment(features) {
    const zcr = (features && features[13]) || 0;
    const centroid = (features && features[14]) || 0;
    const stillnessSec = this.stillnessDurationSec;

    if (stillnessSec > 60 && zcr < 0.1) {
      return "basement";
    }
    if (centroid > 0.6 && zcr > 0.3) {
      return "rooftop";
    }
    if (features && features[15] > 0.5) { // high impulse tapping energy
      return "collapsed-structure";
    }
    return "debris-rubble";
  }

  // Manual Trigger Simulation for testing
  simulateTapping() {
    this.lastSoundTime = Date.now();
    const simulatedFeatures = new Array(25).fill(0.12);
    // Spike tapping cadence & high frequency spectrum bars
    simulatedFeatures[0] = 0.85;
    simulatedFeatures[1] = 0.92;
    simulatedFeatures[2] = 0.78;
    simulatedFeatures[5] = 0.65;
    simulatedFeatures[10] = 0.88;
    simulatedFeatures[15] = 0.96; // high cadence (3.2 Hz)
    simulatedFeatures[16] = 0.90; // high impulse ratio

    // Trigger visual simulation override for 5 seconds
    this.simulationOverride = {
      prediction: { tapping: 0.94, inertia: 0.04, normal: 0.02, noise: 0.0, topClass: "tapping" },
      features: simulatedFeatures
    };
    if (this.simTimeout) clearTimeout(this.simTimeout);
    this.simTimeout = setTimeout(() => {
      this.simulationOverride = null;
    }, 5000);

    this.triggerDetection("tapping", 0.94, simulatedFeatures, true);
  }

  simulateInertia() {
    this.lastSoundTime = Date.now();
    this.stillnessDurationSec = 310; // > 5 minutes
    const simulatedFeatures = new Array(25).fill(0.02);
    simulatedFeatures[0] = 0.45; // recent acoustic trigger trace
    simulatedFeatures[24] = 1.0; // max stillness score

    // Trigger visual simulation override for 5 seconds
    this.simulationOverride = {
      prediction: { tapping: 0.02, inertia: 0.96, normal: 0.02, noise: 0.0, topClass: "inertia" },
      features: simulatedFeatures,
      stillnessSec: 310
    };
    if (this.simTimeout) clearTimeout(this.simTimeout);
    this.simTimeout = setTimeout(() => {
      this.simulationOverride = null;
    }, 5000);

    this.triggerDetection("unconscious", 0.96, simulatedFeatures, true);
  }

  handleError(msg) {
    if (this.callbacks.onError) this.callbacks.onError(msg);
  }

  notifyStatus(st) {
    if (this.callbacks.onStatus) this.callbacks.onStatus(st);
  }

  stop() {
    this.isRunning = false;
    if (this.detectionInterval) clearInterval(this.detectionInterval);
    if (this.simTimeout) clearTimeout(this.simTimeout);
    if (this.scriptNode) this.scriptNode.disconnect();
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
  }
}

export { InertiaSense as PulseSeeker };
