import { text, timestamp, pgTable } from "drizzle-orm/pg-core";

export const productImages = pgTable("product_images", {
  id: text("id").primaryKey(),
  objectPath: text("object_path").notNull().unique(),
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProductImage = typeof productImages.$inferSelect;
