export function cryptoIsAvailable() {
  return typeof window !== "undefined" && window.isSecureContext && !!(window.crypto && window.crypto.subtle);
}

export function ab2b64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function b642ab(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function generateIdentityKeys() {
  const ecdh = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const sign = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { ecdh, sign };
}

export async function exportRawB64(publicKey) {
  const raw = await crypto.subtle.exportKey("raw", publicKey);
  return ab2b64(raw);
}

export async function importEcdhPub(b64) {
  return crypto.subtle.importKey("raw", b642ab(b64), { name: "ECDH", namedCurve: "P-256" }, true, []);
}

export async function importSignPub(b64) {
  return crypto.subtle.importKey("raw", b642ab(b64), { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
}

export async function fingerprintOf(b64) {
  const hash = await crypto.subtle.digest("SHA-256", b642ab(b64));
  const bytes = new Uint8Array(hash).slice(0, 4);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptPayload(sharedKey, payloadObj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(payloadObj));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, data);
  return { iv: ab2b64(iv), ciphertext: ab2b64(ciphertext) };
}

export async function decryptPayload(sharedKey, ivB64, ciphertextB64) {
  const iv = new Uint8Array(b642ab(ivB64));
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sharedKey, b642ab(ciphertextB64));
  return JSON.parse(new TextDecoder().decode(data));
}

export async function signEnvelope(signPrivateKey, msgId, from, to, ivB64, ciphertextB64) {
  const data = new TextEncoder().encode(`${msgId}|${from}|${to}|${ivB64}|${ciphertextB64}`);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signPrivateKey, data);
  return ab2b64(sig);
}

export async function verifyEnvelope(signPublicKey, msgId, from, to, ivB64, ciphertextB64, sigB64) {
  const data = new TextEncoder().encode(`${msgId}|${from}|${to}|${ivB64}|${ciphertextB64}`);
  try {
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, signPublicKey, b642ab(sigB64), data);
  } catch (e) {
    return false;
  }
}
