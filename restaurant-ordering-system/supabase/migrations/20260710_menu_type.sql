-- Add menu_type to menu_categories to support separate Normal and Catering menus.
-- Existing categories default to 'regular'.
ALTER TABLE menu_categories
  ADD COLUMN IF NOT EXISTS menu_type text NOT NULL DEFAULT 'regular'
  CHECK (menu_type IN ('regular', 'catering'));
