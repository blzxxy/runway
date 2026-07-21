import type { Metadata, Viewport } from "next";
import { Instrument_Serif } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "react-hot-toast";
import type { ReactNode } from "react";
import PWARegister from "@/components/pwa-register";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-money",
  display: "swap",
});
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
    <html lang="en" className={`${GeistSans.variable} ${instrumentSerif.variable}`}>
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
      <body className="text-zinc-100 antialiased font-sans">
        <div aria-hidden className="aurora">
          <div className="aurora-blob aurora-amber" />
          <div className="aurora-blob aurora-violet" />
          <div className="aurora-blob aurora-emerald" />
        </div>
        {children}
        <Toaster
          position="bottom-center"
          containerStyle={{ bottom: 110 }}
          toastOptions={{
            duration: 4000,
            style: {
              background: "#27272a",
              color: "#f4f4f5",
              border: "1px solid #3f3f46",
              borderRadius: "16px",
              fontSize: "14px",
            },
          }}
        />
        <PWARegister />
      </body>
    </html>
  );
}
