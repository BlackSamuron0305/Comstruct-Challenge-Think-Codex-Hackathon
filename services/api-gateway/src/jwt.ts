import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { generateKeyPair, exportPKCS8, exportSPKI, importPKCS8, importSPKI, SignJWT, jwtVerify, type JWTPayload, type KeyLike } from 'jose';
import { config } from './config.js';

let privateKey: KeyLike | Uint8Array | null = null;
let publicKey: KeyLike | Uint8Array | null = null;

async function ensureKeys(): Promise<void> {
  if (privateKey && publicKey) return;
  if (existsSync(config.jwtPrivateKeyPath) && existsSync(config.jwtPublicKeyPath)) {
    const [priv, pub] = await Promise.all([
      readFile(config.jwtPrivateKeyPath, 'utf8'),
      readFile(config.jwtPublicKeyPath, 'utf8'),
    ]);
    privateKey = await importPKCS8(priv, 'RS256');
    publicKey = await importSPKI(pub, 'RS256');
    return;
  }
  // Dev fallback: generate ephemeral keypair (token survives only this process).
  // For production, mount real PEM files via secrets.
  console.warn('[jwt] No PEM keys at configured paths — generating ephemeral RS256 keypair (dev only).');
  const kp = await generateKeyPair('RS256', { extractable: true });
  privateKey = kp.privateKey;
  publicKey = kp.publicKey;
  // Print SPKI public key once so other services can pick it up if needed
  try {
    const spki = await exportSPKI(kp.publicKey);
    console.log('[jwt] ephemeral public key (PEM):\n' + spki);
    void exportPKCS8;
  } catch { /* ignore */ }
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
