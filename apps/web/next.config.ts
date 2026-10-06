import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@asi/ui"],
  async rewrites() {
    return process.env.NEXT_PUBLIC_ASI_UI_MODE === "demo" ? [{ source: "/api/ui/v1/:path*", destination: "http://127.0.0.1:4300/api/ui/v1/:path*" }] : [];
  },
};
export default config;
