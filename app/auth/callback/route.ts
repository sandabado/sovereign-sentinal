import { NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeRedirectPath(url.searchParams.get("next"));
  if (!code) return NextResponse.redirect(new URL(`/auth/login?error=missing_code&next=${encodeURIComponent(nextPath)}`, url.origin));
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return NextResponse.redirect(new URL(nextPath, url.origin));
  } catch {
    return NextResponse.redirect(new URL(`/auth/login?error=auth_failed&next=${encodeURIComponent(nextPath)}`, url.origin));
  }
}
