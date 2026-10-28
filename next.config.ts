import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=xyz.machax.app";

const nextConfig: NextConfig = {
  ...(isCapacitorBuild
    ? {
        output: "export",
        images: { unoptimized: true },
      }
    : {
        // Short links for social bios; static export can't serve redirects.
        async redirects() {
          return [
            {
              source: "/instagram",
              destination: PLAY_STORE_URL,
              permanent: false,
            },
          ];
        },
      }),
};

export default nextConfig;
