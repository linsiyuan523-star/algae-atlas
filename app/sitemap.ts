import type { MetadataRoute } from "next";
import { algae, applications, articles, projects } from "@/lib/site-data";

const baseUrl = "https://sycszy.icu";
const locales = ["zh", "en"] as const;
const sections = ["algae", "applications", "projects", "insights", "about", "contact", "privacy"];

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "",
    ...sections,
    ...algae.map((item) => `algae/${item.id}`),
    ...applications.map((item) => `applications/${item.id}`),
    ...projects.map((item) => `projects/${item.id}`),
    ...articles.map((item) => `insights/${item.id}`),
  ];

  return locales.flatMap((locale) =>
    paths.map((path) => ({
      url: `${baseUrl}/${locale}${path ? `/${path}` : ""}`,
      lastModified: new Date("2026-07-10"),
      changeFrequency: path === "" ? "weekly" : "monthly",
      priority: path === "" ? 1 : path.includes("/") ? 0.65 : 0.8,
      alternates: {
        languages: {
          "zh-CN": `${baseUrl}/zh${path ? `/${path}` : ""}`,
          en: `${baseUrl}/en${path ? `/${path}` : ""}`,
        },
      },
    })),
  );
}
