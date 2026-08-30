# MeshGrid P2P & Disaster Rescue Suite (v3.0)
# CrisisLink — P2P & Disaster Rescue Suite (v3.0)

> **Zero-Install, Zero-Cloud P2P Mesh Network, Acoustic Positioning & Passive Victim Detection**

---

## Executive Summary

When catastrophic disasters strike—such as earthquakes, severe floods, or building collapses—cellular towers fail, power grids blackout, and traditional cloud services go dark. Emergency teams waste precious Golden Hours searching blindly, while unconscious or trapped victims are rendered unable to press SOS buttons or signal for help.

**CrisisLink (v3.0)** solves both critical gaps with a browser-based, zero-install, zero-cloud platform:
- **Serverless WebRTC P2P Mesh**: Devices route messages hop-by-hop directly to each other without central servers. If the signaling server dies, the mesh keeps operating.
- **On-Device AI Urgency Classification & Adaptive QoS**: On-device NLP classifies message lethality, while Dijkstra-based congestion prediction reroutes around bottlenecked links and sheds low-priority traffic.
- **End-to-End Encryption (ECDH + ECDSA)**: On-device Web Crypto keys protect text, photos, and voice notes so intermediate relays carry opaque ciphertext.
- **EchoLocate (Acoustic Indoor Positioning)**: Plots relative 2D positions of devices without GPS or WiFi RSSI using Time-Division Acoustic Round-Trip Time (RTT) and 2D least-squares multilateration.
- **PulseSeeker (Passive Victim Detection)**: Uses browser sensors (Web Audio MFCC/rhythm analysis + `DeviceMotion` accelerometer) and 100% offline TinyML to detect rhythmic tapping on debris and prolonged unconscious stillness, auto-dispatching high-priority emergency beacons.
- **Lifeboat Routing System**: Server-side multi-sensor lethality calculator and 4-tier priority queue (`critical`, `elevated`, `normal`, `low`) that scores victims (0–100) from barometers, accelerometers, ambient light, keywords, and water proximity to direct rescue teams.

---

## 💻 Complete Command Reference

Navigate to the project workspace directory `mesh-flow/mesh-network-p2p/mesh-network-p2p` before running commands:

```bash
cd mesh-network-p2p/mesh-network-p2p
npm install
```

### 1. Run the Primary Signaling Server (Port 4001)
*Hosts WebRTC bootstrap signaling and mounts EchoLocate handlers:*
```bash
npm run start:signaling
```

### 2. Run the Cloud Sync & Remote Ops Server (Port 4002)
*Optional cloud tier for remote monitoring & live AI model distribution:*
```bash
npm run start:cloud
```

### 3. Run the Standalone EchoLocate Positioning Server (Port 4003)
*Optional standalone acoustic positioning server:*
```bash
npm run start:echolocate
```

### 4. Run the Lifeboat Priority Queue API Server (Port 4004)
*Hosts lethality scoring, heartbeat processing, and rescuer dispatch queues:*
```bash
npm run start:lifeboat
```

### 5. Run the Automated Lifeboat Test Suite
*Executes all 5 unit and 15,000-message queue overload test cases:*
```bash
npm run test:lifeboat
```

### 6. Run the Frontend Development Server (Port 3000 / Network Access)
*Launches Vite dev server accessible over local network IP:*
```bash
npm run dev -- --host
```

### 7. Production Build
*Builds production bundle to `/public`:*
```bash
npm run build
```

---

## 🎯 System Architecture & Detailed Feature Workflows

### Workflow 1: Serverless P2P Mesh & Distributed Gossip Routing
- **How to Explain to Judges**:
  > *"Most emergency apps rely on cloud servers or local gateways. In MeshGrid, devices form a self-healing, P2P mesh network using WebRTC data channels. The signaling server is only used for the initial 2-second handshake. Once connected, every device runs its own OSPF-style link-state routing engine locally. You can kill the signaling server mid-demo, and nodes continue routing messages across multiple hops completely serverlessly."*
- **Technical Flow**:
  1. Device A registers with `signaling-server.js` over Socket.io on port 4001.
  2. Server suggests 1–2 existing peers to form a sparse mesh (not full mesh).
  3. Nodes exchange SDP offers/answers and ICE candidates to open direct WebRTC `RTCDataChannel` connections.
  4. Link-state topology adverts are gossiped across peers. Each node maintains its own local graph and computes shortest paths via Dijkstra's algorithm.

---

### Workflow 2: On-Device AI Urgency Classification & Adaptive QoS Rerouting
- **How to Explain to Judges**:
  > *"When network links get congested during a disaster, critical SOS messages can't afford to be delayed. Our browser engine runs on-device AI text classification. In addition, nodes monitor neighbor RTT latency trends to predict congestion BEFORE links drop. If a link degrades, Dijkstra edge costs increase (1x -> 1.6x -> 3.5x penalty) to automatically reroute traffic, while adaptive QoS queues throttle low-priority traffic to guarantee critical SOS delivery."*
- **Technical Flow**:
  1. Input text is tokenized on-device via `classifyUrgency()`. Words like *"bleeding"*, *"trapped"*, or *"cannot breathe"* trigger a `critical` rating.
  2. `MeshNode` maintains a rolling window of measured RTTs per peer and computes slope metrics to predict congestion (`normal` -> `watch` -> `congested`).
  3. Per-peer priority queues (`critical`, `elevated`, `normal`) are drained every 60ms. When congestion is detected, normal traffic is shed (dropped oldest-first) while critical traffic maintains dedicated bandwidth.

---

### Workflow 3: On-Device End-to-End Encryption (ECDH + ECDSA)
- **How to Explain to Judges**:
  > *"In disaster scenarios, privacy and authenticity are essential to prevent panic and malicious message injection. Every device generates ephemeral ECDH (P-256) encryption keypairs and ECDSA (P-256) signing keypairs locally. Public keys are gossiped across the mesh. Messages and location coordinates are encrypted with AES-256-GCM and signed on-device. Relay nodes carry opaque ciphertext—they route the payload without reading it."*
- **Technical Flow**:
  1. Sender derives a shared key using ECDH private key and recipient's gossiped public key.
  2. Message text and GPS coordinates are encrypted via AES-256-GCM.
  3. Sender signs the envelope using ECDSA private key.
  4. Recipient decrypts and verifies the signature, confirming authenticity.

---

### Workflow 4: EchoLocate — Acoustic-Only Indoor 2D Positioning
- **How to Explain to Judges**:
  > *"GPS doesn't work inside collapsed concrete buildings, and browsers have no API to read WiFi RSSI signal strength. EchoLocate solves indoor positioning using pure acoustics and Web Audio. Because browser clocks are unsynchronized across devices, we designed a Time-Division Acoustic Round-Trip Time (RTT) protocol. Devices take turns emitting 17-19kHz LFM chirps. Other devices measure response arrival times on their local hardware clocks using matched-filter cross-correlation. Pairwise distances are converted into relative (x, y) 2D coordinates via least-squares multilateration and plotted on a live radar canvas."*
- **Technical Flow**:
  1. Server initiates a localization round every 15s. Device X is designated as Pinger.
  2. Device X plays an LFM sweep (17–19 kHz) at local time $T_{\text{emit}}$.
  3. Listener devices $Y_k$ detect X's chirp using matched-filter cross-correlation against the reference template and schedule ACK tones at time-division slot offsets ($D_{\text{base}} + k \cdot D_{\text{step}}$).
  4. Device X detects response chirps at $T_{\text{recv},k}$, computes one-way travel time $\tau = \frac{\Delta T_{\text{RTT}}}{2}$, and calculates distance $d = \tau \times 343\text{ m/s}$.
  5. Server solves 2D least-squares multilateration and broadcasts relative $(x, y)$ coordinates to all radar canvases.

---

### Workflow 5: PulseSeeker — AI-Powered Passive Victim Detection
- **How to Explain to Judges**:
  > *"70% of victims trapped under collapsed rubble are unconscious or pinned and cannot call for help or press panic buttons. PulseSeeker is a zero-install, 100% offline TinyML module that passively monitors browser sensors. It analyzes microphone audio for 2-4 Hz rhythmic tapping on pipes/walls (using MFCCs, zero-crossing rate, and spectral centroids) and tracks DeviceMotion accelerometer data to detect prolonged stillness (>5 mins). When a victim is detected, PulseSeeker automatically dispatches high-priority emergency beacons across the P2P mesh network."*
- **Technical Flow**:
  1. Web Audio API extracts 25-dimensional feature vectors (13 MFCC sub-bands, ZCR, Spectral Centroid, 5 Rhythm features, 5 Motion features).
  2. Embedded 2-layer neural matrix classifier computes output probabilities for `[tapping, inertia_unconscious, normal, noise]`.
  3. Environmental classifier identifies `basement`, `rooftop`, or `collapsed-structure`.
  4. Upon confidence $> 80\%$, an emergency beacon payload is constructed and automatically broadcasted across the P2P mesh network (`meshNode.broadcastLocationToAll`) and posted to `/api/auto-beacon`.

---

### Workflow 6: Lifeboat Priority Routing & Multi-Sensor Lethality Scoring
- **How to Explain to Judges**:
  > *"Rescuers in the field cannot read thousands of raw messages during a disaster. The Lifeboat Routing System is a server-side intelligence engine that computes a lethality score (0-100) from multi-sensor telemetry and message keywords, routing messages into a 4-tier priority queue (Critical, Elevated, Normal, Low). Critical cases (score >= 80) jump to the very front of the queue and trigger immediate rescue dispatch instructions."*
- **Technical Flow**:
  1. `POST /api/heartbeat` receives sensor telemetry and message payload.
  2. `LethalityCalculator` evaluates factors:
     - Barometer drop > 5 hPa/min (+50 pts)
     - Prolonged inertia > 5 mins (+15 pts)
     - Ambient light < 5 lux (+30 pts)
     - Injury keywords (*bleeding, trapped, crush*) (+25 pts each)
     - Flood keywords (*water, rising, drowning*) (+20 pts each)
     - Collapse keywords (*rubble, debris, crushed*) (+25 pts each)
     - Vulnerable person keywords (*baby, elderly, pregnant*) (+15 pts each)
     - Battery < 20% (+10 pts)
     - Proximity to water (+15 pts)
  3. `LifeboatPriorityQueue` routes entry into `critical`, `elevated`, `normal`, or `low`.
  4. Enforces 10,000 max queue size (evicting oldest low/normal entries) and 1-hour TTL cleanup.
  5. Rescuers call `GET /api/priority/critical` or `POST /api/alert/send` to pull prioritized dispatch lists.

---

### Workflow 7: Opportunistic Cloud Sync & Real-Time AI Model Distribution
- **How to Explain to Judges**:
  > *"While the mesh operates 100% offline, whenever a device occasionally gains internet access, it opportunistically syncs telemetry to a cloud dashboard. Operations teams can update AI classification keywords (e.g. adding 'landslide' -> weight 9) on the cloud server. The next time any device syncs, it automatically pulls the updated model and immediately begins using the new weights for on-device AI classification."*
- **Technical Flow**:
  1. Opt-in background timer POSTs node telemetry, RTT stats, and QoS events to `cloud-server.js` on port 4002 (`POST /sync`).
  2. Remote dashboard (`http://localhost:4002/dashboard.html`) displays aggregate stats and model controls.
  3. Admin posts new AI terms (`POST /model`).
  4. Nodes pull the new model on next sync round and update `aiTerms` in real time.

---

## 🎬 Step-by-Step Live Demo Script for Judges ("The 5-Minute Pitch")

1. **Step 1: P2P Mesh Connection & Serverless Resilience**
   - Open 3 browser tabs on `http://localhost:3000/`. Join as *"Alpha"*, *"Beta"*, and *"Gamma"*.
   - Point out direct WebRTC link creation in the canvas.
   - **Kill `signaling-server.js` (Ctrl+C in terminal)**. Send a message between tabs — show that already-connected devices **continue sending messages peer-to-peer with zero server dependency**.

2. **Step 2: On-Device AI & Adaptive QoS Rerouting**
   - Type `"trapped under rubble, bleeding heavily"` in a message box.
   - Show the on-device AI urgency preview tag (`CRITICAL`).
   - Click **"Simulate Failure"** on a relay node — show remaining nodes detecting the link loss and re-gossiping to re-route messages around the dead node automatically.

3. **Step 3: End-to-End Encryption & Fingerprint Verification**
   - Highlight the sidebar **"🔒 End-to-End Encryption — Active"** badge and public key fingerprint.
   - Point out that message logs confirm `"🔒 encrypted, ✓ verified"`.

4. **Step 4: EchoLocate Acoustic Indoor Positioning**
   - Navigate to `http://localhost:3000/echolocate`.
   - Click **`⚡ Simulate Demo Plot`** to showcase the 2D radar canvas with grid scale rings, coordinates, and pairwise distance vectors.
   - Click **`🔊 Play Test Chirp`** to demonstrate hardware acoustic LFM sweep playback.

5. **Step 5: PulseSeeker Passive Victim Detection**
   - Navigate to `http://localhost:3000/pulseseeker`.
   - Click **`🛡️ Activate Passive Detection Sensors`**.
   - Click **`🔨 Simulate Tapping (3.2 Hz)`** — show tapping pattern confidence rise to 94% and auto-dispatch an emergency survivor beacon across the P2P mesh network!
   - Show the received beacon appearing in the **Survivor Beacons Feed**.

6. **Step 6: Lifeboat Priority Queue & Lethality Calculator**
   - Run `npm run test:lifeboat` in terminal or send a test payload to `POST http://localhost:4004/api/heartbeat`.
   - Show the lethality score (100/100), critical priority classification, and generated rescue recommendations.

---

## 🛠️ API & Endpoint Reference

| Endpoint | Method | Port | Description |
|---|---|---|---|
| `/socket.io` | WS / HTTP | 4001 | WebRTC signaling & EchoLocate socket handlers |
| `/sync` | POST | 4002 | Opportunistic cloud telemetry sync |
| `/model` | GET / POST | 4002 | AI classifier model distribution & updates |
| `/echolocate-api/status` | GET | 4003 | EchoLocate server status & active round metrics |
| `/api/auto-beacon` | POST | 4001 / 4004 | Ingests PulseSeeker passive survivor beacons |
| `/api/heartbeat` | POST | 4004 | Lifeboat multi-sensor lethality scoring & enqueuing |
| `/api/priority/queue` | GET | 4004 | Returns queue metrics & next critical messages |
| `/api/priority/critical` | GET | 4004 | Returns all active critical messages with coordinates |
| `/api/alert/send` | POST | 4004 | Triggers emergency alert dispatch for critical queue |
| `/api/priority/stats` | GET | 4004 | Returns detailed queue stats & throughput trends |

---

## 💡 Honest Limitations & Roadmap (Builds Judge Credibility)

- **Acoustic Attenuation**: High-frequency acoustic chirps (17–19 kHz) attenuate through thick concrete walls. EchoLocate exposes configurable frequency ranges (e.g. 15–18 kHz) for real-device hardware tuning.
- **Browser Secure Context Rules**: Browsers block `getUserMedia` (microphone) and Geolocation APIs over unencrypted HTTP when accessed via local IP (`http://10.215.226.153:3000`). Solved via localhost testing, HTTPS, or Chrome flag `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
- **Time-Division Round Interval**: Acoustic positioning uses discrete 15-second time-division rounds to avoid clock sync issues, providing periodic re-localization rather than continuous 60fps tracking.
- **PKI / Key Pairing Roadmap**: Current identity uses unauthenticated ECDH/ECDSA keypairs generated per session. Production deployment would pre-provision device fingerprints via QR-code pairing prior to field deployment.
