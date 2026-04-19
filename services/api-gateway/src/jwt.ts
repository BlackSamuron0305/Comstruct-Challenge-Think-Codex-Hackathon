import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { generateKeyPair, exportSPKI, SignJWT, jwtVerify, type JWTPayload, type KeyLike } from 'jose';
import { config } from './config.js';

let privateKey: KeyLike | Uint8Array | null = null;
let publicKey: KeyLike | Uint8Array | null = null;

async function ensureKeys(): Promise<void> {
  if (privateKey && publicKey) return;

  if (existsSync(config.jwtPrivateKeyPath) && existsSync(config.jwtPublicKeyPath)) {
    try {
      const [priv, pub] = await Promise.all([
        readFile(config.jwtPrivateKeyPath, 'utf8'),
        readFile(config.jwtPublicKeyPath, 'utf8'),
      ]);
      privateKey = createPrivateKey(priv);
      publicKey = createPublicKey(pub);
      return;
    } catch (error) {
      console.warn('[jwt] Failed to parse configured PEM keys, falling back to ephemeral dev keys.', error);
    }
  }

  // Dev fallback: generate ephemeral keypair (token survives only this process).
  // For production, mount real PEM files via secrets.
  console.warn('[jwt] No usable PEM keys at configured paths — generating ephemeral RS256 keypair (dev only).');
  const kp = await generateKeyPair('RS256', { extractable: true });
  privateKey = kp.privateKey;
  publicKey = kp.publicKey;

  try {
    const spki = await exportSPKI(kp.publicKey);
    console.log('[jwt] ephemeral public key (PEM):\n' + spki);
  } catch {
    // ignore logging failures
  }
}

export interface JwtClaims extends JWTPayload {
  sub: string;          // user id
  role: string;
  company_id: string;
  email: string;
  name: string;
}

export async function signAccessToken(claims: Omit<JwtClaims, 'iat' | 'exp' | 'iss' | 'aud'>): Promise<string> {
  await ensureKeys();
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(config.jwtIssuer)
    .setAudience(config.jwtAudience)
    .setIssuedAt()
    .setExpirationTime(config.jwtAccessTtl)
    .sign(privateKey!);
}

export async function signRefreshToken(sub: string): Promise<string> {
  await ensureKeys();
  return await new SignJWT({ sub, type: 'refresh' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(config.jwtIssuer)
    .setAudience(config.jwtAudience)
    .setIssuedAt()
    .setExpirationTime(config.jwtRefreshTtl)
    .sign(privateKey!);
}

export async function verifyToken(token: string): Promise<JwtClaims> {
  await ensureKeys();
  const { payload } = await jwtVerify(token, publicKey!, {
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });
  return payload as JwtClaims;
}
