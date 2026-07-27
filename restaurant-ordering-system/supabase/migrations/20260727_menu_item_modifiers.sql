-- Menu item customizations: option groups (single/multi) + priced options/add-ons.

CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  selection_type text NOT NULL DEFAULT 'single'
    CHECK (selection_type IN ('single', 'multi')),
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 1,
  is_required boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_item_modifier_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES menu_item_modifier_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta numeric NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modifier_groups_item
  ON menu_item_modifier_groups(menu_item_id, display_order);

CREATE INDEX IF NOT EXISTS idx_modifier_options_group
  ON menu_item_modifier_options(group_id, display_order);

ALTER TABLE menu_item_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_modifier_options ENABLE ROW LEVEL SECURITY;

-- Public read (customer menu)
DROP POLICY IF EXISTS "Public read modifier groups" ON menu_item_modifier_groups;
CREATE POLICY "Public read modifier groups"
  ON menu_item_modifier_groups FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Public read modifier options" ON menu_item_modifier_options;
CREATE POLICY "Public read modifier options"
  ON menu_item_modifier_options FOR SELECT
  USING (true);

-- Authenticated staff write (same pattern as other admin tables)
DROP POLICY IF EXISTS "Staff write modifier groups" ON menu_item_modifier_groups;
CREATE POLICY "Staff write modifier groups"
  ON menu_item_modifier_groups FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Staff write modifier options" ON menu_item_modifier_options;
CREATE POLICY "Staff write modifier options"
  ON menu_item_modifier_options FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
