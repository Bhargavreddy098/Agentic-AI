import { serve } from "@hono/node-server";
import { createDemoGateway } from "./scenarios.js";
serve({ fetch: createDemoGateway().fetch, hostname: "127.0.0.1", port: 4300 });
console.log("Synthetic demo Gateway listening on http://127.0.0.1:4300; no real effects enabled.");
