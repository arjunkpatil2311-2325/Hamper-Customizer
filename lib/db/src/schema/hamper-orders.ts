import { index, date, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type HamperOrderItemRecord = {
  productId: string;
  name: string;
  category: "sweet" | "savoury" | "self-care" | "home" | "keepsake";
  quantity: number;
  unitPrice: number;
  imageUrl: string;
  imageAlt: string;
};

export type DeliveryAddressRecord = {
  recipientName: string;
  recipientPhone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export const hamperOrders = pgTable(
  "hamper_orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    status: text("status").notNull().default("placed"),
    items: jsonb("items").$type<HamperOrderItemRecord[]>().notNull(),
    budget: integer("budget").notNull(),
    itemsSubtotal: integer("items_subtotal").notNull(),
    packagingFee: integer("packaging_fee").notNull(),
    deliveryFee: integer("delivery_fee").notNull(),
    total: integer("total").notNull(),
    packagingOption: text("packaging_option").notNull(),
    personalizationName: text("personalization_name"),
    giftMessage: text("gift_message"),
    photoObjectPath: text("photo_object_path"),
    deliveryDate: date("delivery_date", { mode: "string" }).notNull(),
    deliveryAddress: jsonb("delivery_address")
      .$type<DeliveryAddressRecord>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("hamper_orders_user_created_idx").on(table.userId, table.createdAt)],
);

export type HamperOrder = typeof hamperOrders.$inferSelect;
export type NewHamperOrder = typeof hamperOrders.$inferInsert;
