import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
  outputFileTracingIncludes: { "/api/agent/script": ["./agent/**/*"] },
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
