import type { MetadataRoute } from "next";
import { websiteContentRepository } from "@/lib/content-repository/default-repository";
import { contentSitemapRoutes } from "@/lib/content-repository/routes";

const baseUrl = "https://sycszy.icu";
const locales = ["zh", "en"] as const;
const sections = ["team", "research", "live-feeds", "collaboration", "outputs", "tutorials", "algae", "news", "about", "contact", "privacy", "insights"];
const legacyLastModified = new Date("2026-07-12");

export default function sitemap(): MetadataRoute.Sitemap {
  const sectionEntries: MetadataRoute.Sitemap = locales.flatMap((locale) =>
    ["", ...sections].map((path) => ({
      url: `${baseUrl}/${locale}${path ? `/${path}` : ""}`,
      lastModified: legacyLastModified,
      changeFrequency: path === "" ? "weekly" : "monthly",
      priority: path === "" ? 1 : 0.8,
      alternates: {
        languages: {
          "zh-CN": `${baseUrl}/zh${path ? `/${path}` : ""}`,
          en: `${baseUrl}/en${path ? `/${path}` : ""}`,
          "x-default": `${baseUrl}/zh${path ? `/${path}` : ""}`,
        },
      },
    })),
  );
  const detailEntries: MetadataRoute.Sitemap = contentSitemapRoutes(
    websiteContentRepository,
  ).map((route) => ({
    url: `${baseUrl}/${route.path}`,
    lastModified:
      route.source === "legacy" ? legacyLastModified : new Date(route.updatedAt),
    changeFrequency: "monthly",
    priority: 0.65,
    alternates: {
      languages: Object.fromEntries(
        Object.entries(route.alternates).map(([key, path]) => [
          key,
          `${baseUrl}${path}`,
        ]),
      ),
    },
  }));

  return [...sectionEntries, ...detailEntries];
}
