type BlogPostingData = {
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  image?: string;
  url: string;
};

type FAQItem = {
  question: string;
  answer: string;
};

type FAQPageData = {
  items: FAQItem[];
};

type HowToStep = {
  name: string;
  text: string;
  image?: string;
};

type HowToData = {
  name: string;
  description: string;
  steps: HowToStep[];
};

type OrganizationData = {
  name: string;
  url: string;
  logo: string;
  sameAs?: string[];
};

type WebSiteData = {
  name: string;
  url: string;
  searchUrl?: string;
};

type StructuredDataProps =
  | { type: "BlogPosting"; data: BlogPostingData }
  | { type: "FAQPage"; data: FAQPageData }
  | { type: "HowTo"; data: HowToData }
  | { type: "Organization"; data: OrganizationData }
  | { type: "WebSite"; data: WebSiteData };

function buildBlogPosting(data: BlogPostingData) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: data.headline,
    description: data.description,
    datePublished: data.datePublished,
    ...(data.dateModified ? { dateModified: data.dateModified } : {}),
    ...(data.image ? { image: data.image } : {}),
    url: data.url,
    author: {
      "@type": "Organization",
      name: "MachaX",
      url: "https://machax.xyz",
    },
    publisher: {
      "@type": "Organization",
      name: "MachaX",
      url: "https://machax.xyz",
      logo: {
        "@type": "ImageObject",
        url: "https://machax.xyz/blog/landing-page.png",
      },
    },
  };
}

function buildFAQPage(data: FAQPageData) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: data.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

function buildHowTo(data: HowToData) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: data.name,
    description: data.description,
    step: data.steps.map((step) => ({
      "@type": "HowToStep",
      name: step.name,
      text: step.text,
      ...(step.image ? { image: step.image } : {}),
    })),
  };
}

function buildOrganization(data: OrganizationData) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: data.name,
    url: data.url,
    logo: data.logo,
    ...(data.sameAs ? { sameAs: data.sameAs } : {}),
  };
}

function buildWebSite(data: WebSiteData) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: data.name,
    url: data.url,
    ...(data.searchUrl
      ? {
          potentialAction: {
            "@type": "SearchAction",
            target: data.searchUrl,
            "query-input": "required name=search_term_string",
          },
        }
      : {}),
  };
}

export function StructuredData(props: StructuredDataProps) {
  let jsonLd: Record<string, unknown>;

  switch (props.type) {
    case "BlogPosting":
      jsonLd = buildBlogPosting(props.data);
      break;
    case "FAQPage":
      jsonLd = buildFAQPage(props.data);
      break;
    case "HowTo":
      jsonLd = buildHowTo(props.data);
      break;
    case "Organization":
      jsonLd = buildOrganization(props.data);
      break;
    case "WebSite":
      jsonLd = buildWebSite(props.data);
      break;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
