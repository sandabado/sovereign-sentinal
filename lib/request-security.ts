export class RequestSecurityError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RequestSecurityError";
  }
}

function trustedOrigin(request: Request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

export function isTrustedMutationRequest(request: Request) {
  const expected = trustedOrigin(request);
  if (!expected) return false;

  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;

  const origin = request.headers.get("Origin");
  return !origin || origin === expected;
}

export async function readBoundedJson(request: Request, maxBytes = 32_768): Promise<unknown> {
  const contentType = request.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new RequestSecurityError("Content-Type must be application/json", 415);
  }

  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestSecurityError("Request body is too large", 413);
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    throw new RequestSecurityError("Request body is too large", 413);
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new RequestSecurityError("Request body must contain valid JSON", 400);
  }
}
