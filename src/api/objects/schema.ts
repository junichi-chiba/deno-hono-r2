import { z } from "zod";

export const ObjectKeySchema = z.object({
  key: z.string().trim().min(1).max(1024),
});
