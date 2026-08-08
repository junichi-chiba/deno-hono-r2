import { z } from "zod";

export const objectKeySchema = z.object({
  key: z.string().trim().min(1).max(1024),
});
