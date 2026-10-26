import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { productImages } from "./product-images";

export type ProductCategoryValue =
  | "sweet"
  | "savoury"
  | "self-care"
  | "home"
  | "keepsake";

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").$type<ProductCategoryValue>().notNull(),
    price: integer("price").notNull(),
    imageUrl: text("image_url").notNull(),
    imageAlt: text("image_alt").notNull(),
    imageId: text("image_id").references(() => productImages.id),
    featured: boolean("featured").notNull().default(false),
    stock: integer("stock").notNull().default(0),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("products_price_positive", sql`${table.price} > 0`),
    check("products_stock_nonnegative", sql`${table.stock} >= 0`),
  ],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
