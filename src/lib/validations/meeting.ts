import { z } from "zod";

export const createMeetingSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Meeting title is required")
    .max(100, "Meeting title must be 100 characters or less"),
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;