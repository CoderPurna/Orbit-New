import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const meetingStatus = pgEnum("meeting_status", [
  "scheduled",
  "active",
  "ended",
]);

export const meetings = pgTable("meetings", {
  id: uuid("id").defaultRandom().primaryKey(),

  hostId: uuid("host_id")
    .notNull()
    .references(() => users.id),

  title: text("title").notNull(),

  joinCode: text("join_code").notNull().unique(),

  status: meetingStatus("status")
    .default("scheduled")
    .notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  startedAt: timestamp("started_at", {
    withTimezone: true,
  }),

  endedAt: timestamp("ended_at", {
    withTimezone: true,
  }),
});