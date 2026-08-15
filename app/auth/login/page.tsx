import { safeRedirectPath } from "@/lib/auth";
import LoginForm from "./login-form";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = safeRedirectPath(first(params.next) ?? first(params.redirect));
  return <LoginForm nextPath={nextPath} initialError={first(params.error) ?? null} />;
}
