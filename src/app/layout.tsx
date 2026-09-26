import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Lumière Studio — Photography Studio Management",
    template: "%s · Lumière Studio",
  },
  description:
    "Premium photography studio management: online booking, calendar scheduling, photographer assignment, payments, private client galleries and automated notifications.",
};

export const viewport: Viewport = {
  themeColor: "#050506",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen bg-ink-950 font-sans text-zinc-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
