#!/usr/bin/env node
/**
 * Test: generate a PBKDF2 hash and immediately verify it
 * to confirm the script is self-consistent.
 */
const encoder = new TextEncoder();

const HASH_NAME = "PBKDF2";
const DIGEST = "SHA-256";
const ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;
const FORMAT = "pbkdf2-sha256";

function utf8(value) { return encoder.encode(value); }

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i) ?? 0;
  return bytes;
}

async function derive(password, salt, pepper = "") {
  const material = utf8(`${password}\u0000${pepper}`);
  const key = await crypto.subtle.importKey("raw", material, HASH_NAME, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: HASH_NAME, hash: DIGEST, salt, iterations: ITERATIONS },
    key, KEY_LENGTH_BITS
  );
  return new Uint8Array(bits);
}

async function hashPassword(password, pepper = "") {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, pepper);
  return `${FORMAT}$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

async function verifyPassword(password, storedHash, pepper = "") {
  const [format, iterations, salt, expected] = storedHash.split("$");
  if (format !== FORMAT || !salt || !expected) return false;
  const iters = Number(iterations);
  if (iters !== ITERATIONS) return false;
  const actual = await derive(password, base64ToBytes(salt), pepper);
  return bytesToBase64(actual) === expected;
}

// Test
const password = process.env.TEST_PASSWORD || "TestPass123"; // NOSONAR - test fixture password, never used in production
const pepper = "";

console.log("=== Self-consistency test ===");
const hash = await hashPassword(password, pepper);
console.log("Generated hash:", hash);

const ok = await verifyPassword(password, hash, pepper);
console.log("Verify with same pepper:", ok ? "✅ PASS" : "❌ FAIL");

const fail = await verifyPassword(password, hash, "wrong-pepper");
console.log("Verify with wrong pepper:", !fail ? "✅ correctly rejected" : "❌ should have failed");

// Now test with the hash from the database
console.log("\n=== Test with DB hash ===");
// NOSONAR - test vector for backward-compatibility verification
const dbHash = process.env.TEST_DB_HASH || "pbkdf2-sha256$100000$x798XmxiUfIFW+3Di0zJAA==$vJcZ1g0oCRiTGG4PkQ+1F7hWjhR0UL7vPn2vqJpmDFE=";
const dbOk = await verifyPassword("Ledjer123", dbHash, "");
console.log("Verify DB hash with '' pepper:", dbOk ? "✅ PASS" : "❌ FAIL");
const dbOk2 = await verifyPassword("Ledjer123", dbHash, undefined);
console.log("Verify DB hash with undefined pepper:", dbOk2 ? "✅ PASS" : "❌ FAIL");
