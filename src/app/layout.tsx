import type { Metadata } from "next";
import { Space_Grotesk, Fraunces, Caveat, JetBrains_Mono } from "next/font/google";
import ConvexClientProvider from "./convex-provider";
import { StructuredData } from "@/components/structured-data";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
});

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://machax.xyz"),
  title: "MachaX — Dimaag ki parliament, pocket mein.",
  description:
    "Dump your messiest thought. Your council of AI agents debates it, picks one action, drops it in Notion, and nudges you on WhatsApp.",
  openGraph: {
    siteName: "MachaX",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "https://machax.xyz/blog/landing-page.png",
        width: 1200,
        height: 630,
        alt: "MachaX \u2014 AI decision-making companion",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["https://machax.xyz/blog/landing-page.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${fraunces.variable} ${caveat.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <StructuredData
          type="Organization"
          data={{
            name: "MachaX",
            url: "https://machax.xyz",
            logo: "https://machax.xyz/blog/landing-page.png",
          }}
        />
        <StructuredData
          type="WebSite"
          data={{
            name: "MachaX",
            url: "https://machax.xyz",
          }}
        />
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
