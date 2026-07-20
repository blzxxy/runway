import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import PWARegister from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Runway",
  description: "Cash runway, savings goals, and flip tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Runway",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* iOS splash screens (generated in /public/splash) */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"
          href="/splash/splash-1170x2532.png"
        />
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)"
          href="/splash/splash-1179x2556.png"
        />
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)"
          href="/splash/splash-1290x2796.png"
        />
      </head>
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
