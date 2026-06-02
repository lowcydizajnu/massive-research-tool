import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Moved out of `experimental` in Next 15.5.
  typedRoutes: true,
};

export default nextConfig;
