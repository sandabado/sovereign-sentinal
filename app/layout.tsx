import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sovereign — Family Financial Operating System",
  description:
    "A protected command center for family wealth, shared obligations, and legal entities.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
