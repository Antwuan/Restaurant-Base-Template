# Restaurant Ordering System

Web-only Expo app for restaurant ordering with Supabase and Stripe Connect.

## Prerequisites

- Node.js 18+
- Supabase project with `restaurants`, menu tables, and Edge Functions **`create-payment-intent`** + **`stripe-webhook`** deployed
- Stripe Connect: each restaurant needs `stripe_account_id` (`acct_...`) in Supabase

## Quick start

```bash
cd restaurant-ordering-system
npm install
cp .env.example .env   # fill in your keys
npm start
```

Open **http://localhost:8081/?restaurant=test-restaurant** (replace slug with yours).

After the first load, the app remembers the slug in `sessionStorage`, so **http://localhost:8081/menu** still resolves the same restaurant.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon key (used for Edge Function `Authorization` header) |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe.js publishable key (`pk_test_...`) |
| `EXPO_PUBLIC_BACKEND_URL` | Functions **base** only: `https://<project>.supabase.co/functions/v1`. Defaults to `{SUPABASE_URL}/functions/v1` if omitted. Never a single function URL (e.g. `…/create-checkout-session` or `…/create-payment-intent`). |
| `EXPO_PUBLIC_RESTAURANT_SLUG` | Default slug on localhost when query param is missing |

Expo inlines `EXPO_PUBLIC_*` at **build time**. After changing these on Vercel, trigger a new deploy/rebuild — a runtime env change alone will not update the client.

## Database migrations

Run the carousel + customer migration in Supabase SQL Editor (or via CLI):

```bash
# File: supabase/migrations/20260529_carousel_customers.sql
```

This adds:

- **`menu_carousel_slides`** — promo images/videos on the menu (public read for active slides; staff CRUD)
- **`restaurant_customers`** — per-restaurant customer profiles linked to `auth.users`
- **`is_staff_for_restaurant()`** helper and `updated_at` triggers
- RLS policies for both tables

### Manual Supabase steps (required)

1. **Run the SQL migration** in Dashboard → SQL Editor (paste contents of `supabase/migrations/20260529_carousel_customers.sql`).

2. **Storage bucket** — create public bucket `menu-images` if it does not exist (Dashboard → Storage). Carousel media is stored at `{restaurant_id}/carousel/{slide_id}.{jpg|mp4}`.

3. **Storage policies** — uncomment and run the storage policy block at the bottom of the migration file (requires the bucket to exist first). Staff can upload/delete; public can read.

4. **Auth settings** (Dashboard → Authentication → URL Configuration):
   - Add the custom domain customers use to **Site URL** and the **redirect URL allowlist** (include `www` and/or apex as needed). Signup sets `emailRedirectTo` to `window.location.origin`.
   - Email confirmation on/off affects customer sign-up UX (app shows a message if confirmation is required).
   - Optional backfill if confirm-email signups never got a `restaurant_customers` row: `supabase/migrations/20260803_backfill_restaurant_customers.sql`.
   - Canonical host: set `restaurants.domain` to the host customers actually use (`www` vs apex). Auth JWT is stored in `localStorage` per origin; the app redirects the other host to that canonical domain.

5. **Verify RLS** (SQL Editor, as anon role or with anon key):

   ```sql
   SELECT * FROM menu_carousel_slides
   WHERE restaurant_id = '<your-restaurant-uuid>' AND is_active;
   ```

### Video upload notes for staff

- Recommended: 16:9 aspect ratio, H.264/MP4 for web compatibility
- Set reasonable max file size limits in Storage bucket settings

### Checkout hardening (required for payments)

Apply these after the carousel/customer migration:

```bash
# Files:
#   supabase/migrations/20260819200000_checkout_hardening_ledger.sql
#   supabase/migrations/20260819201000_quote_customer_order.sql
```

Adds `payment_ledger`, tax rates, `orders.customer_id`, tracker RLS, and `quote_customer_order` (server-side cart pricing).

## Stripe / Edge Function

Checkout uses Stripe **Payment Element** initialized with `client_secret` from `create-payment-intent`. The server prices the cart (`quote_customer_order`); the client sends **items + `idempotencyKey`**, not `amount`.

```http
POST {EXPO_PUBLIC_BACKEND_URL}/create-payment-intent
Authorization: Bearer {EXPO_PUBLIC_SUPABASE_ANON_KEY}
Content-Type: application/json

{
  "restaurantId": "<uuid>",
  "items": [{ "id": "<menu-item-uuid>", "quantity": 1, "selectedModifiers": [], "specialInstructions": "" }],
  "idempotencyKey": "<16–128 chars>",
  "email": "customer@example.com"
}
```

Optional: `promoCode` / `promoCodeId`, `pickupLocationId`. Response: `{ "clientSecret", "paymentIntentId", "amountCents", ... }`. Email is used for Stripe `receipt_email`. Set `restaurants.stripe_account_id` for Connect destinations.

### Stripe webhook

Point Stripe → `https://<project>.supabase.co/functions/v1/stripe-webhook` and subscribe to:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`

Store the signing secret as `STRIPE_WEBHOOK_SECRET`. In `supabase/config.toml`, `[functions.stripe-webhook] verify_jwt = false` (Stripe cannot send a user JWT).

### Functions to deploy (checkout hardening)

```bash
supabase functions deploy create-payment-intent
supabase functions deploy stripe-webhook
supabase functions deploy ensure-customer-profile
supabase functions deploy send-broadcast
supabase functions deploy manage-email-domain
supabase functions deploy backfill-marketing-contacts
```

Admin functions (`send-broadcast`, `manage-email-domain`, `backfill-marketing-contacts`) require a **staff JWT** (signed-in `restaurant_staff` for that restaurant). The order tracker loads open orders via RLS (`getOpenOrdersForCustomer`); it no longer calls `get-orders-by-phone`.

## Resend email (order / marketing / reviews)

### 1. Run migration

```bash
# File: supabase/migrations/20260730_email_resend.sql
```

Adds restaurant domain columns, customer `marketing_opt_in`, and order `*_email_sent_at` timestamps.

### 2. Deploy Edge Functions + secrets

```bash
supabase secrets set RESEND_API_KEY=re_... RESEND_WEBHOOK_SECRET=whsec_... STRIPE_WEBHOOK_SECRET=whsec_... REVIEW_TOKEN_SECRET=<long-random> PUBLIC_APP_ORIGIN=https://your-app.example
supabase functions deploy create-payment-intent
supabase functions deploy stripe-webhook
supabase functions deploy ensure-customer-profile
supabase functions deploy send-order-email
supabase functions deploy submit-order-review
supabase functions deploy sync-marketing-contact
supabase functions deploy send-broadcast
supabase functions deploy manage-email-domain
supabase functions deploy backfill-marketing-contacts
supabase functions deploy resend-webhook
```

Do **not** put Resend keys in `EXPO_PUBLIC_*` env vars. `send-broadcast`, `manage-email-domain`, and `backfill-marketing-contacts` require a staff JWT (anon/service-role bearer is rejected).

Also run `supabase/migrations/20260731_order_reviews_broadcasts.sql` for `order_reviews`, `email_broadcasts`, and webhook event idempotency.

### 3. Database Webhooks (recommended)

Dashboard → Database → Webhooks:

| Name | Table | Events | URL |
|------|-------|--------|-----|
| order-email-insert | `orders` | INSERT | `…/functions/v1/send-order-email` |
| order-email-update | `orders` | UPDATE | `…/functions/v1/send-order-email` |

Header: `Authorization: Bearer <SERVICE_ROLE_KEY>`.

The function is idempotent (`order-confirm/{id}`, `order-ready/{id}`, `review-request/{id}`). The client also invokes it as a fallback after `createOrder` / status updates.

### 4. Resend webhook

Point Resend → `…/functions/v1/resend-webhook` and subscribe to at least:

- `email.bounced`, `email.complained` (opt-out sync)
- `email.delivered`, `email.opened`, `email.clicked` (Marketing broadcast counters)

Store the signing secret as `RESEND_WEBHOOK_SECRET`. Open/click/delivered events are attributed to a row in `email_broadcasts` when the payload includes `broadcast_id` (idempotent via `email_broadcast_events`).

### 5. Per-restaurant domain

Admin → Settings → Transactional email: create sending subdomain, add DNS, verify. Marketing/Reviews stay blocked until `email_domain_status = verified`.

### Test cards

- Success: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`

Any future expiry and any CVC.

## Routes

| Path | Screen / behavior |
|------|-------------------|
| `/menu` | Menu (carousel + categories; header has sign-in + cart) |
| `/cart` | Opens menu with cart drawer (same as cart icon) |
| `/checkout` | Checkout (Payment Element) |
| `/confirmation` | Order confirmed |
| `/tracker` | Open orders for the signed-in customer (RLS; sign-in required) |
| `/admin` | Admin (staff) — includes **Promo** tab for carousel management |

## Connect a new restaurant

```bash
node scripts/createRestaurant.js --slug my-cafe --name "My Cafe"
```

Then add menu data in Supabase and set `stripe_account_id` on the restaurant row.

For a custom domain, set `restaurants.domain` to the **canonical** host customers use (`www.example.com` or `example.com`, not both). That value is the JWT origin.
