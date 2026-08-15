type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : null;
}

function diagnosticToken(value: unknown) {
  if (typeof value !== "string") return undefined;
  return /^[A-Za-z0-9_.:/-]{1,160}$/.test(value) ? value : undefined;
}

function httpStatus(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

/**
 * Produces an allowlisted log payload without Axios request config, headers,
 * tokens, response bodies, or stack traces.
 */
export function sanitizePlaidError(error: unknown) {
  const root = asRecord(error);
  const response = asRecord(root?.response);
  const data = asRecord(response?.data);

  return {
    name: diagnosticToken(root?.name) ?? "UnknownError",
    httpStatus: httpStatus(response?.status),
    plaidErrorType: diagnosticToken(data?.error_type),
    plaidErrorCode: diagnosticToken(data?.error_code) ?? diagnosticToken(root?.code),
    requestId: diagnosticToken(data?.request_id),
  };
}
