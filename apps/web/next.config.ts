import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@asi/ui"],
  distDir: process.env.ASI_UI_DIST_DIR ?? ".next",
  async rewrites() {
    if (process.env.NEXT_PUBLIC_ASI_UI_MODE === "demo") return [{ source: "/api/ui/v1/:path*", destination: "http://127.0.0.1:4300/api/ui/v1/:path*" }];
    const gatewayOrigin = process.env.ASI_UI_GATEWAY_ORIGIN;
    if (gatewayOrigin) return [{ source: "/api/ui/v1/:path*", destination: `${gatewayOrigin}/api/ui/v1/:path*` }];
    return [];
  },
};
export default config;
