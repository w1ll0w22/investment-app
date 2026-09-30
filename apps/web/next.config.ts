import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@investment-app/schemas"],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
