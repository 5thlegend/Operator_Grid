import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { siteUrl, cn } from "@/lib/utils";
import { APP_FULL_NAME, APP_TAGLINE } from "@/lib/constants";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jet", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-space", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${APP_FULL_NAME} — Operator Core`,
    template: `%s · NRO`,
  },
  description: APP_TAGLINE,
  openGraph: {
    title: `${APP_FULL_NAME} — Operator Core`,
    description: APP_TAGLINE,
    url: siteUrl(),
    siteName: "Next Realm Operators",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_FULL_NAME} — Operator Core`,
    description: APP_TAGLINE,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={cn(
          inter.variable,
          mono.variable,
          display.variable,
          "min-h-screen antialiased",
        )}
        style={{
          fontFamily:
            "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
