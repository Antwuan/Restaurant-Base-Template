/**
 * SHA-256 hex digest for Focus Mode PINs.
 * Salted as `${restaurantId}:${pin}` so hashes are restaurant-scoped.
 */

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Minimal SHA-256 for environments without crypto.subtle (e.g. some RN runtimes). */
function sha256Fallback(message) {
  // Based on public-domain SHA-256 reference implementation (compact).
  function rotr(n, x) {
    return (x >>> n) | (x << (32 - n));
  }
  function ch(x, y, z) {
    return (x & y) ^ (~x & z);
  }
  function maj(x, y, z) {
    return (x & y) ^ (x & z) ^ (y & z);
  }
  function sigma0(x) {
    return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
  }
  function sigma1(x) {
    return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
  }
  function gamma0(x) {
    return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
  }
  function gamma1(x) {
    return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);
  }

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const utf8 = unescape(encodeURIComponent(message));
  const msgLen = utf8.length;
  const bitLen = msgLen * 8;
  const withOne = msgLen + 1;
  let padLen = withOne % 64;
  if (padLen <= 56) padLen = 56 - padLen;
  else padLen = 120 - padLen;

  const totalLen = withOne + padLen + 8;
  const bytes = new Array(totalLen);
  for (let i = 0; i < msgLen; i++) bytes[i] = utf8.charCodeAt(i);
  bytes[msgLen] = 0x80;
  for (let i = msgLen + 1; i < totalLen - 8; i++) bytes[i] = 0;
  // length as 64-bit big-endian (high 32 bits zero for practical PIN strings)
  for (let i = 0; i < 4; i++) bytes[totalLen - 8 + i] = 0;
  bytes[totalLen - 4] = (bitLen >>> 24) & 0xff;
  bytes[totalLen - 3] = (bitLen >>> 16) & 0xff;
  bytes[totalLen - 2] = (bitLen >>> 8) & 0xff;
  bytes[totalLen - 1] = bitLen & 0xff;

  let [h0, h1, h2, h3, h4, h5, h6, h7] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const w = new Array(64);
  for (let i = 0; i < totalLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      const j = i + t * 4;
      w[t] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let t = 16; t < 64; t++) {
      w[t] = (gamma1(w[t - 2]) + w[t - 7] + gamma0(w[t - 15]) + w[t - 16]) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + sigma1(e) + ch(e, f, g) + K[t] + w[t]) >>> 0;
      const t2 = (sigma0(a) + maj(a, b, c)) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (words[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (words[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (words[i] >>> 8) & 0xff;
    out[i * 4 + 3] = words[i] & 0xff;
  }
  return bytesToHex(out);
}

async function sha256Hex(message) {
  const subtle = globalThis?.crypto?.subtle;
  if (subtle && typeof TextEncoder !== 'undefined') {
    const data = new TextEncoder().encode(message);
    const digest = await subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(digest));
  }
  return sha256Fallback(message);
}

export function isValidFocusPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

export async function hashFocusPin(restaurantId, pin) {
  if (!restaurantId) throw new Error('Restaurant id required to hash Focus Mode PIN.');
  if (!isValidFocusPin(pin)) throw new Error('PIN must be exactly 4 digits.');
  return sha256Hex(`${restaurantId}:${pin}`);
}

export async function verifyFocusPinHash(restaurantId, pin, expectedHash) {
  if (!expectedHash) return false;
  const hash = await hashFocusPin(restaurantId, pin);
  return hash === expectedHash;
}
