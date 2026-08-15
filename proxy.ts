import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/auth";

const PUBLIC_ASSET = /\.(?:avif|css|gif|ico|jpe?g|js|map|png|svg|webp|woff2?|ttf)$/i;

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/api/plaid/webhook" ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    PUBLIC_ASSET.test(pathname)
  );
}

function loginRedirect(request: NextRequest, reason?: string) {
  const loginUrl = new URL("/auth/login", request.url);
  loginUrl.searchParams.set("next", safeRedirectPath(`${request.nextUrl.pathname}${request.nextUrl.search}`));
  if (reason) loginUrl.searchParams.set("error", reason);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
    }
    return loginRedirect(request, "not_configured");
  }

  let authHeaders: Record<string, string> = {};
  let response = NextResponse.next({ request: { headers: request.headers } });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        authHeaders = headers;
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const withAuthState = (target: NextResponse) => {
    response.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
    Object.entries(authHeaders).forEach(([name, value]) => target.headers.set(name, value));
    return target;
  };

  const { data, error } = await supabase.auth.getClaims();
  if (!error && data?.claims.sub) {
    const pathname = request.nextUrl.pathname;
    const isPageRead = (request.method === "GET" || request.method === "HEAD") && !pathname.startsWith("/api/");
    if (isPageRead && pathname !== "/onboarding") {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("onboarding_complete")
        .eq("id", data.claims.sub)
        .maybeSingle();
      if (profile?.onboarding_complete === false) {
        const onboardingUrl = new URL("/onboarding", request.url);
        return withAuthState(NextResponse.redirect(onboardingUrl));
      }
    }
    return response;
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return withAuthState(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  return withAuthState(loginRedirect(request));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
