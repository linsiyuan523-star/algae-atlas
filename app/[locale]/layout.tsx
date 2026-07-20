import type { Metadata, Viewport } from "next";
import "../globals.css";
import { site, type Locale } from "@/lib/site-data";

export const metadata: Metadata = {
  metadataBase: new URL("https://sycszy.icu"),
  title: {
    default: "广东海洋大学藻类团队｜微藻、大型海藻与实验教学",
    template: "%s",
  },
  description: site.description.zh,
  applicationName: "广东海洋大学藻类团队",
  authors: [{ name: "Algae Research Team, Guangdong Ocean University" }],
  creator: "Algae Research Team, Guangdong Ocean University",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "广东海洋大学藻类团队",
    title: "广东海洋大学藻类团队",
    description: site.description.zh,
  },
  twitter: {
    card: "summary_large_image",
    title: "广东海洋大学藻类团队",
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
