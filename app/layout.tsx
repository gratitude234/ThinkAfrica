import type { Metadata, Viewport } from "next";
import { Inter, Bodoni_Moda } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";
import ServiceWorkerRegister from "@/components/push/ServiceWorkerRegister";

const bodoniModa = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-bodoni",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: "Indegenius - Africa's Intellectual Social Network",
    template: "%s - Indegenius",
  },
  description:
    "Research, essays, and policy briefs from African university students.",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Indegenius - Africa's Intellectual Social Network",
    description:
      "Research, essays, and policy briefs from African university students.",
    url: SITE_URL,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Indegenius - Africa's Intellectual Social Network",
    description:
      "Research, essays, and policy briefs from African university students.",
    images: [absoluteUrl(DEFAULT_OG_IMAGE)],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/indegenius-app-icon-transparent-192.png", sizes: "192x192", type: "image/png" },
      { url: "/indegenius-app-icon-transparent-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/indegenius-app-icon-white-bg-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Indegenius",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#073929",
};

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bodoniModa.variable} ${inter.variable}`}>
      <body className="font-sans">
        {children}
        <ServiceWorkerRegister />
      </body>
      {GA_MEASUREMENT_ID ? <GoogleAnalytics gaId={GA_MEASUREMENT_ID} /> : null}
    </html>
  );
}
