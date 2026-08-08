import { Hono } from "hono";
import { objectRoutes } from "./objects/routes.ts";

export const api = new Hono()
  .route("/objects", objectRoutes);
