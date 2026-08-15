const APP_ORIGIN = "https://sovereign.local";

export function safeRedirectPath(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, APP_ORIGIN);
    if (url.origin !== APP_ORIGIN || url.pathname.startsWith("/auth")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function authCallbackUrl(origin: string, nextPath: string) {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeRedirectPath(nextPath));
  return callback.toString();
}
