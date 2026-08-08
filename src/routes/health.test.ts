import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { healthRoutes } from "./health.ts";

Deno.test("GET /health returns a healthy response", async () => {
  const app = new Hono();
  app.route("/health", healthRoutes);

  const response = await app.request("/health");

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { status: "ok" });
});
