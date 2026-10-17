import { serve } from "@hono/node-server";
import { createDemoGateway } from "./scenarios.js";

function flag(name: string): boolean {
  const value = process.env[name];
  if (value !== undefined && value !== "true" && value !== "false") throw new Error(`${name} must be true or false`);
  return value === "true";
}
const hostname = "127.0.0.1";
const app = createDemoGateway({
  previewOrigins: process.env.ASI_DEMO_PREVIEW_ORIGINS?.split(",").map(origin => origin.trim()) ?? [],
  trustedProxy: flag("ASI_DEMO_TRUST_PROXY"),
  crossSiteCookies: flag("ASI_DEMO_CROSS_SITE_COOKIES"),
});
const server = serve({ fetch: app.fetch, hostname, port: 4300 }, () => {
  console.log("Synthetic demo Gateway ready on port 4300; no real effects enabled.");
});
server.on("error", () => { console.error("Demo Gateway could not listen on port 4300."); process.exitCode = 1; });
