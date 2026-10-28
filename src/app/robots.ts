import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/chat",
        "/decisions",
        "/configure",
        "/login",
      ],
    },
    sitemap: "https://machax.xyz/sitemap.xml",
  };
}
