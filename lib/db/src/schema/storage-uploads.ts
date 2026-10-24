import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const storageUploads = pgTable("storage_uploads", {
  objectPath: text("object_path").primaryKey(),
  userId: text("user_id").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
});

export type StorageUpload = typeof storageUploads.$inferSelect;
