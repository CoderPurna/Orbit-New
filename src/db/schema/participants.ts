import {
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { meetings } from "./meetings";
import { users } from "./users";

export const participantRole = pgEnum("participant_role", [
  "host",
  "participant",
]);

export const participants = pgTable("participants", {
  id: uuid("id").defaultRandom().primaryKey(),

  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, {
      onDelete: "cascade",
    }),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  role: participantRole("role")
    .default("participant")
    .notNull(),

  joinedAt: timestamp("joined_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  leftAt: timestamp("left_at", {
    withTimezone: true,
  }),
});