import { Hono } from "hono";
import objectRoutes from "./objects.ts";

export const api = new Hono()
  .route("/objects", objectRoutes);
