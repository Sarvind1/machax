import type { Metadata } from "next";

const BASE_URL = "https://machax.xyz";
const DEFAULT_IMAGE = {
  url: `${BASE_URL}/blog/landing-page.png`,
  width: 1200,
  height: 630,
  alt: "MachaX \u2014 AI decision-making companion",
};

type SEOProps = {
  title: string;
  description: string;
  slug: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  keywords?: string[];
  image?: string;
};

export function createMetadata({
  title,
  description,
  slug,
  type = "website",
  publishedTime,
  modifiedTime,
  keywords,
  image,
}: SEOProps): Metadata {
  const url = slug ? `${BASE_URL}/${slug}` : BASE_URL;
  const fullTitle = `${title} \u2014 MachaX`;
  const ogImage = image
    ? { url: image, width: 1200, height: 630, alt: title }
    : DEFAULT_IMAGE;

  return {
    title: fullTitle,
    description,
    keywords,
    authors: [{ name: "MachaX" }],
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: "MachaX",
      type,
      locale: "en_US",
      images: [ogImage],
      ...(type === "article" && publishedTime
        ? { publishedTime }
        : {}),
      ...(type === "article" && modifiedTime
        ? { modifiedTime }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [ogImage.url],
    },
  };
}
