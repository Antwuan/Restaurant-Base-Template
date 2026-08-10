-- Focus Mode: restrict admin sidebar to selected tabs until unlocked with PIN/password.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS focus_mode_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS focus_pin_hash text,
  ADD COLUMN IF NOT EXISTS focus_mode_allowed_tabs text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.restaurants.focus_mode_enabled IS
  'When true, admin sidebar locks tabs not listed in focus_mode_allowed_tabs until session unlock.';
COMMENT ON COLUMN public.restaurants.focus_pin_hash IS
  'SHA-256 hex digest of restaurant_id || '':'' || 4-digit PIN.';
COMMENT ON COLUMN public.restaurants.focus_mode_allowed_tabs IS
  'AdminSidebar NAV_ITEMS keys visible without Focus Mode unlock.';
