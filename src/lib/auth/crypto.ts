import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set in production");
  return s ?? "dev-only-insecure-secret";
}

export function hmac(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function newCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}
