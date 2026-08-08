import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  handleDeleteObject,
  handleGetObject,
  handlePutObject,
} from "./handler.ts";
import { objectKeySchema } from "./schema.ts";
import { validateUpload } from "./validation.ts";

export const objectRoutes = new Hono()
  .get(
    "/:key{.+}",
    zValidator("param", objectKeySchema),
    handleGetObject,
  )
  .put(
    "/:key{.+}",
    zValidator("param", objectKeySchema),
    validateUpload,
    handlePutObject,
  )
  .delete(
    "/:key{.+}",
    zValidator("param", objectKeySchema),
    handleDeleteObject,
  );
