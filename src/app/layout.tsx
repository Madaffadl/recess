import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteBackground } from "@/components/site-background";
import { Navbar } from "@/components/navbar";
import { SiteFooter } from "@/components/site-footer";
import { LoungeDock } from "@/components/lounge-dock";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Recess — Your Office's Digital Break Room",
  description:
    "Play multiplayer games, meet coworkers, and survive boring work hours together. Recess is the digital break room for office workers — one hub for games, rooms, and an always-on anonymous lounge.",
  keywords: [
    "office break room",
    "multiplayer games",
    "coworker games",
    "anonymous chat",
    "work break",
    "team games",
  ],
  openGraph: {
    title: "Recess — Your Office's Digital Break Room",
    description:
      "Play games, meet coworkers, and survive boring work hours together.",
    type: "website",
  },
  // Disable browser auto-translation. It rewrites DOM text nodes out from
  // under React, which crashes live/interactive views (games, chat, presence)
  // with "insertBefore ... not a child of this node". The app UI is English.
  other: {
    google: "notranslate",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      translate="no"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground font-sans">
        <Providers>
          <SiteBackground />
          <div className="relative flex min-h-screen flex-col">
            <Navbar />
            <div className="flex flex-1">
              <main className="min-w-0 flex-1">{children}</main>
              <LoungeDock />
            </div>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
