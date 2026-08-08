import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  handleDeleteObject,
  handleGetObject,
  handlePutObject,
} from "./handler.ts";
import { ObjectKeySchema } from "./schema.ts";
import { validateUpload } from "./validation.ts";

export const objectRoutes = new Hono()
  .get(
    "/:key{.+}",
    zValidator("param", ObjectKeySchema),
    handleGetObject,
  )
  .put(
    "/:key{.+}",
    zValidator("param", ObjectKeySchema),
    validateUpload,
    handlePutObject,
  )
  .delete(
    "/:key{.+}",
    zValidator("param", ObjectKeySchema),
    handleDeleteObject,
  );
