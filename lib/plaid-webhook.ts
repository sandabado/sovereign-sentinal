import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { plaidClient, plaidEnvironment } from "@/lib/plaid";

const keyCache = new Map<string, { key: CryptoKey; expiresAt: number }>();

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function verificationKey(kid: string) {
  const cached = keyCache.get(kid);
  if (cached && cached.expiresAt > Date.now()) return cached.key;
  const response = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
  const key = await importJWK(response.data.key as JWK, "ES256");
  keyCache.set(kid, { key: key as CryptoKey, expiresAt: Date.now() + 15 * 60_000 });
  return key;
}

export async function verifyPlaidWebhook(rawBody: string, signature: string | null) {
  const maySkip =
    plaidEnvironment === "sandbox" &&
    process.env.NODE_ENV !== "production" &&
    process.env.PLAID_SKIP_WEBHOOK_VERIFICATION === "true";
  if (maySkip) return true;
  if (!signature) return false;

  try {
    const header = decodeProtectedHeader(signature);
    if (header.alg !== "ES256" || !header.kid) return false;
    const { payload } = await jwtVerify(signature, await verificationKey(header.kid), {
      algorithms: ["ES256"],
      maxTokenAge: "5 minutes",
      clockTolerance: 5,
    });
    const expectedHash = payload.request_body_sha256;
    if (typeof expectedHash !== "string") return false;
    const actualHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody)));
    return constantTimeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}
