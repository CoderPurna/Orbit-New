import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { meetings } from "./meetings";
import { users } from "./users";

export const messages = pgTable("messages", {
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

  content: text("content").notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});