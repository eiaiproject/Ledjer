import { bytesToBase64Url, bytesToHex, utf8 } from "./encoding";

export function generateId(): string {
  return crypto.randomUUID();
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function generateToken(byteLength = 32): string {
  return bytesToBase64Url(randomBytes(byteLength));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}
