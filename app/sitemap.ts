import type { MetadataRoute } from "next";
import { algae, articles, projects } from "@/lib/site-data";
import { researchAreas, tutorials } from "@/lib/team-data";

const baseUrl = "https://sycszy.icu";
const locales = ["zh", "en"] as const;
const sections = ["team", "research", "outputs", "tutorials", "algae", "news", "about", "contact", "privacy", "insights"];

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "",
    ...sections,
    ...researchAreas.map((item) => `research/${item.id}`),
    ...tutorials.map((item) => `tutorials/${item.id}`),
    ...algae.map((item) => `algae/${item.id}`),
    ...articles.map((item) => `insights/${item.id}`),
    ...projects.map((item) => `insights/${item.id}`),
  ];

  return locales.flatMap((locale) =>
    paths.map((path) => ({
      url: `${baseUrl}/${locale}${path ? `/${path}` : ""}`,
      lastModified: new Date("2026-07-11"),
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
