import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { healthRoutes } from "./health.ts";

Deno.test({
  name: "GET /health returns a healthy response",
  async fn(): Promise<void> {
    const app = new Hono();
    app.route("/health", healthRoutes);

    const response = await app.request("/health");

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { status: "ok" });
  },
});
