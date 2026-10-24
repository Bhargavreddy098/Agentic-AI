import type { NextConfig } from "next";
import { resolveApiOrigin } from "./lib/api/config";

export { resolveApiOrigin };

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    const origin = resolveApiOrigin(process.env);
    return [
      { source: '/api/v1/:path*', destination: `${origin}/api/v1/:path*` },
      { source: '/health/:path*', destination: `${origin}/health/:path*` },
    ];
  },
  experimental: {
    cpus: 1,
    agentFeedback: false,
  },
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
