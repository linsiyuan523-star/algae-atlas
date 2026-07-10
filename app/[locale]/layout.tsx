import type { Metadata, Viewport } from "next";
import "../globals.css";
import { site, type Locale } from "@/lib/site-data";

export const metadata: Metadata = {
  metadataBase: new URL("https://sycszy.icu"),
  title: {
    default: "藻境 · Algae Atlas",
    template: "%s · 藻境",
  },
  description: site.description.zh,
  applicationName: "藻境 Algae Atlas",
  authors: [{ name: "Algae Atlas" }],
  creator: "Algae Atlas",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "藻境 Algae Atlas",
    title: "藻境 · Algae Atlas",
    description: site.description.zh,
  },
  twitter: {
    card: "summary",
    title: "藻境 · Algae Atlas",
    description: site.description.zh,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#06271f",
  colorScheme: "light",
};

export function generateStaticParams() {
  return [{ locale: "zh" }, { locale: "en" }];
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const normalizedLocale: Locale = locale === "en" ? "en" : "zh";

  return (
    <html lang={normalizedLocale === "zh" ? "zh-CN" : "en"}>
      <body>{children}</body>
    </html>
  );
}
