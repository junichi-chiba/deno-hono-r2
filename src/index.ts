import { Hono } from "hono";
import { api } from "./api/index.ts";
import "./cron.ts";
import { healthRoutes } from "./routes/health.ts";
import { welcomeRoutes } from "./welcome.tsx";
import { objectPageRoutes } from "./objects.tsx";

const app = new Hono()
  .route("/", welcomeRoutes)
  .route("/", objectPageRoutes)
  .route("/health", healthRoutes)
  .route("/api", api);

export default app;

if (import.meta.main) Deno.serve(app.fetch);
