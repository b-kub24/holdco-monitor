import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Holdco Monitor \u2014 Product Health Dashboard",
  description:
    "Real-time health monitoring for all holdco products. Tracks uptime, SSL, and response time.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
