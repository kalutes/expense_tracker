import { cookies } from 'next/headers';

export const SESSION_COOKIE_NAME = 'expense_tracker_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

export function getAppPassword(): string {
  return process.env.APP_PASSWORD || 'admin';
}

/**
 * Creates a signed HMAC-SHA256 session token using Web Crypto API.
 */
export async function createSessionToken(): Promise<string> {
  const secret = getAppPassword();
  const encoder = new TextEncoder();
  const payload = JSON.stringify({
    authenticated: true,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  });

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const base64Payload = Buffer.from(payload).toString('base64url');
  const base64Signature = Buffer.from(signature).toString('base64url');

  return `${base64Payload}.${base64Signature}`;
}

/**
 * Verifies a signed session token. Returns true if valid and not expired.
 */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [base64Payload, base64Signature] = parts;
    const payloadJson = Buffer.from(base64Payload, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson);

    if (!payload.authenticated || typeof payload.exp !== 'number' || payload.exp < Date.now()) {
      return false;
    }

    const secret = getAppPassword();
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = Buffer.from(base64Signature, 'base64url');
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(payloadJson)
    );

    return isValid;
  } catch {
    return false;
  }
}

/**
 * Verifies if the current request has a valid session cookie (for server components / server actions).
 */
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  return verifySessionToken(sessionCookie?.value);
}
