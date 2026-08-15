const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const encoded = process.env.PLAID_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("PLAID_TOKEN_ENCRYPTION_KEY is not configured");
  const raw = base64ToBytes(encoded);
  if (raw.byteLength !== 32) {
    throw new Error("PLAID_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptAccessToken(token: string) {
  if (!token) throw new Error("Cannot encrypt an empty Plaid access token");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    encoder.encode(token),
  );
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptAccessToken(value: string) {
  const [version, iv, payload] = value.split(":");
  if (version !== "v1" || !iv || !payload) throw new Error("Unsupported encrypted token format");
  const ivBytes = base64ToBytes(iv);
  const payloadBytes = base64ToBytes(payload);
  if (ivBytes.byteLength !== 12 || payloadBytes.byteLength < 17) {
    throw new Error("Encrypted Plaid token is malformed");
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    await encryptionKey(),
    payloadBytes,
  );
  return decoder.decode(decrypted);
}
