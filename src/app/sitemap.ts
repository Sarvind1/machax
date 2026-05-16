import type { MetadataRoute } from "next";

const BASE_URL = "https://machax.xyz";

const blogSlugs = [
  "3am",
  "agents",
  "argument-is-the-decision",
  "decisions",
  "dimaag-ki-parliament",
  "echo-chamber",
  "how-it-works",
  "multiple-agents-in-your-brain",
  "one-chat",
  "overthinking",
  "paradox-of-advice",
];

const seoPages = [
  "decision-paralysis",
  "how-to-stop-overthinking",
  "ai-decision-making-tool",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/landing`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  const seoPageEntries: MetadataRoute.Sitemap = seoPages.map((slug) => ({
    url: `${BASE_URL}/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const blogEntries: MetadataRoute.Sitemap = blogSlugs.map((slug) => ({
    url: `${BASE_URL}/blog/${slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticPages, ...seoPageEntries, ...blogEntries];
}
