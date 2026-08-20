#!/usr/bin/env node
/**
 * Shared PBKDF2 password helpers + password-policy validation for the
 * admin/ops CLI scripts (create-admin, reset-password).
 *
 * PBKDF2 config MUST match apps/web/worker/auth/password.ts.
 */
import { randomBytes } from "node:crypto";

const encoder = new TextEncoder();

const HASH_NAME = "PBKDF2";
const DIGEST = "SHA-256";
const ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;
const FORMAT = "pbkdf2-sha256";

function utf8(value) {
  return encoder.encode(value);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
}

async function deriveBits(password, salt, pepper = "") {
  const material = utf8(`${password}\u0000${pepper}`);
  const key = await crypto.subtle.importKey(
    "raw", material, HASH_NAME, false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: HASH_NAME, hash: DIGEST, salt, iterations: ITERATIONS },
    key,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password, pepper = "") {
  const salt = randomBytes(SALT_BYTES);
  const hash = await deriveBits(password, salt, pepper);
  return `${FORMAT}$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

/** Validate password policy (min 8 chars, uppercase + digit); exits on failure. */
export function validatePasswordOrExit(password) {
  if (password.length < 8) {
    console.error("❌ Password must be at least 8 characters");
    process.exit(1);
  }
  if (!/[A-Z]/.test(password)) {
    console.error("❌ Password must contain at least 1 uppercase letter");
    process.exit(1);
  }
  if (!/\d/.test(password)) {
    console.error("❌ Password must contain at least 1 digit");
    process.exit(1);
  }
}