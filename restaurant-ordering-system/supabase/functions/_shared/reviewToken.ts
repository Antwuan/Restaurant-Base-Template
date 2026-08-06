/**
 * HMAC-signed review tokens for in-app review links.
 * Payload: orderId, restaurantId, exp (unix seconds).
 * Format: base64url(json).base64url(hmac-sha256)
 */

const enc = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export type ReviewTokenPayload = {
  orderId: string;
  restaurantId: string;
  exp: number;
};

export async function signReviewToken(
  payload: { orderId: string; restaurantId: string; expiresInSeconds?: number },
  secret: string,
): Promise<string> {
  const expiresIn = payload.expiresInSeconds ?? 30 * 24 * 60 * 60; // ~30 days
  const body: ReviewTokenPayload = {
    orderId: payload.orderId,
    restaurantId: payload.restaurantId,
    exp: Math.floor(Date.now() / 1000) + expiresIn,
  };
  const bodyB64 = toBase64Url(enc.encode(JSON.stringify(body)));
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(bodyB64));
  return `${bodyB64}.${toBase64Url(sig)}`;
}

export async function verifyReviewToken(
  token: string,
  secret: string,
): Promise<ReviewTokenPayload> {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('Invalid review token');

  const [bodyB64, sigB64] = parts;
  const key = await importKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(sigB64),
    enc.encode(bodyB64),
  );
  if (!valid) throw new Error('Invalid review token signature');

  let payload: ReviewTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(bodyB64)));
  } catch {
    throw new Error('Invalid review token payload');
  }

  if (!payload?.orderId || !payload?.restaurantId || !payload?.exp) {
    throw new Error('Invalid review token payload');
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Review token expired');
  }
  return payload;
}
