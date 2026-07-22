-- Add optional cost (COGS) column to menu_items for profit margin tracking.
-- Nullable so existing items are unaffected; admin can fill in cost over time.
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS cost numeric DEFAULT NULL;
