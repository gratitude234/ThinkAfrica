import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
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
    icon: "/logo.png",
    apple: "/icon.png",
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
  themeColor: "#10B981",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
