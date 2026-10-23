import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: 'http://127.0.0.1:3100/api/v1/:path*' },
      { source: '/health/:path*', destination: 'http://127.0.0.1:3100/health/:path*' },
    ];
  },
  /* config options here */
  experimental: {
    agentFeedback: false,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

