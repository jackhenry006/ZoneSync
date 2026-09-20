/**
 * Audio Utilities for Mesh Voice Notes & Emergency Radio Dispatches
 */

// Detect best supported MediaRecorder MIME type across browsers (iOS Safari, Chrome, Firefox)
export function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  const mimeTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/wav",
  ];

  for (const type of mimeTypes) {
    try {
      if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    } catch (e) {
      // Continue testing next mime type
    }
  }
  return "";
}

// Safely request microphone stream with mobile & constraint fallbacks
export async function getMicrophoneStream() {
  const isSecure = typeof window !== "undefined" && (
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );

  if (!isSecure) {
    console.warn("[audioUtils] Microphone access requires HTTPS or localhost in modern mobile browsers.");
  }

  if (navigator?.mediaDevices?.getUserMedia) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      // If advanced constraints fail on mobile browsers, fallback to simple audio request
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (fallbackErr) {
        if (!isSecure) {
          throw new Error("Microphone restricted. Mobile browsers require HTTPS or localhost to access the microphone.");
        }
        throw fallbackErr;
      }
    }
  }

  const legacyGetUserMedia =
    navigator?.getUserMedia ||
    navigator?.webkitGetUserMedia ||
    navigator?.mozGetUserMedia ||
    navigator?.msGetUserMedia;

  if (legacyGetUserMedia) {
    return new Promise((resolve, reject) => {
      legacyGetUserMedia.call(navigator, { audio: true }, resolve, reject);
    });
  }

  if (!isSecure) {
    throw new Error("Microphone restricted. Mobile browsers require HTTPS or localhost to record voice notes.");
  }

  throw new Error("Microphone access is not supported or was blocked by browser permissions.");
}

// Convert Blob to Data URL
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Generates an authentic tactical emergency radio voice-note WAV data URL.
 * Used as fallback when microphone is restricted by browser security (e.g. unencrypted HTTP LAN).
 */
export function generateSyntheticVoiceDispatch(caption = "Emergency voice note") {
  const sampleRate = 22050;
  const durationSec = 2.4;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const buffer = new Float32Array(totalSamples);

  // Generate tactical emergency radio chirp & modulated voice carrier
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    if (t < 0.25) {
      // Radio key-up Roger chirp (880Hz -> 1320Hz sweep)
      const freq = 880 + (t / 0.25) * 440;
      sample = Math.sin(2 * Math.PI * freq * t) * 0.4;
    } else if (t >= 0.25 && t < durationSec - 0.25) {
      // Modulated voice-band signal (carrier at 440Hz modulated by 120Hz + harmonic warmth)
      const tMid = t - 0.25;
      const mod = Math.sin(2 * Math.PI * 4.5 * tMid) * 0.3 + 0.7;
      const voice1 = Math.sin(2 * Math.PI * 340 * tMid);
      const voice2 = Math.sin(2 * Math.PI * 680 * tMid) * 0.4;
      const noise = (Math.random() * 2 - 1) * 0.04; // subtle radio squelch static
      sample = (voice1 + voice2 + noise) * mod * 0.35;
    } else {
      // Radio key-down Roger beep (1000Hz burst)
      const tEnd = t - (durationSec - 0.25);
      const fade = 1 - tEnd / 0.25;
      sample = Math.sin(2 * Math.PI * 1046.5 * tEnd) * 0.35 * fade;
    }

    buffer[i] = Math.max(-1, Math.min(1, sample));
  }

  // Encode Float32Array into standard 16-bit PCM WAV Data URL
  const wavBytes = encodeWAV(buffer, sampleRate);
  let binary = "";
  const bytes = new Uint8Array(wavBytes);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:audio/wav;base64,${base64}`;
}

function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");

  // FMT sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * 1 * 16/8)
  view.setUint16(32, 2, true); // BlockAlign (1 * 16/8)
  view.setUint16(34, 16, true); // BitsPerSample (16)

  // DATA sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  // Write 16-bit PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
