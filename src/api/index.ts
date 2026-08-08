import { Hono } from "hono";
import { objectRoutes } from "./objects/routes.ts";
import { uploadRoutes } from "./uploads/index.ts";

export const api = new Hono()
  .route("/objects", objectRoutes)
  .route("/uploads", uploadRoutes);
