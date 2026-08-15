import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from "plaid";

export const plaidEnvironment = process.env.PLAID_ENV ?? "sandbox";

const environmentMap = {
  sandbox: PlaidEnvironments.sandbox,
  development: PlaidEnvironments.development,
  production: PlaidEnvironments.production,
} as const;

export function hasPlaidConfig() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

const configuration = new Configuration({
  basePath:
    environmentMap[plaidEnvironment as keyof typeof environmentMap] ??
    PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
      "PLAID-SECRET": process.env.PLAID_SECRET ?? "",
    },
  },
});

export const plaidClient = new PlaidApi(configuration);
export const PLAID_PRODUCTS = [Products.Transactions];
export const PLAID_OPTIONAL_PRODUCTS = [Products.Liabilities, Products.Investments];
export const PLAID_COUNTRY_CODES = [CountryCode.Us];

export function publicAppUrl(request?: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) {
    const url = new URL(configured);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production");
    }
    return url.origin;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL must be configured in production");
  }
  if (request) {
    const origin = new URL(request.url).origin;
    if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return origin;
  }
  return "http://localhost:3000";
}
