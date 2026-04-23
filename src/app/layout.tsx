import type { Metadata } from "next";
import { Space_Grotesk, Fraunces, Caveat, JetBrains_Mono } from "next/font/google";
import ConvexClientProvider from "./convex-provider";
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
  title: "MachaX — Dimaag ki parliament, pocket mein.",
  description:
    "Dump your messiest thought. Your council of AI agents debates it, picks one action, drops it in Notion, and nudges you on WhatsApp.",
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
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
