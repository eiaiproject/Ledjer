import { base64ToBytes, bytesToBase64, utf8 } from "./encoding";
import { randomBytes } from "./tokens";

const HASH_NAME = "PBKDF2";
const DIGEST = "SHA-256";
const ITERATIONS = 210_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;
const FORMAT = "pbkdf2-sha256";

function passwordMaterial(password: string, pepper = ""): Uint8Array {
  return utf8(`${password}\u0000${pepper}`);
}

async function derive(password: string, salt: Uint8Array, pepper?: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    passwordMaterial(password, pepper),
    HASH_NAME,
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: HASH_NAME,
      hash: DIGEST,
      salt,
      iterations: ITERATIONS,
    },
    key,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, pepper?: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(password, salt, pepper);
  return `${FORMAT}$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  pepper?: string,
): Promise<boolean> {
  const [format, iterations, salt, expected] = storedHash.split("$");
  if (format !== FORMAT || iterations !== String(ITERATIONS) || !salt || !expected) {
    return false;
  }

  const actual = await derive(password, base64ToBytes(salt), pepper);
  return timingSafeEqual(bytesToBase64(actual), expected);
}

export function timingSafeEqual(a: string, b: string): boolean {
  const left = utf8(a);
  const right = utf8(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }

  return diff === 0;
}
