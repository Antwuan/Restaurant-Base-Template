# Restaurant Ordering System

Web-only Expo app for restaurant ordering with Supabase and Stripe Connect.

## Prerequisites

- Node.js 18+
- Supabase project with `restaurants`, menu tables, and Edge Function **`create-payment-intent`** deployed
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
| `EXPO_PUBLIC_BACKEND_URL` | Edge functions base URL (defaults to `{SUPABASE_URL}/functions/v1` if omitted) |
| `EXPO_PUBLIC_RESTAURANT_SLUG` | Default slug on localhost when query param is missing |

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

4. **Auth settings** (Dashboard → Authentication):
   - Configure Site URL / redirect URLs for your web app
   - Email confirmation on/off affects customer sign-up UX (app shows a message if confirmation is required)

5. **Verify RLS** (SQL Editor, as anon role or with anon key):

   ```sql
   SELECT * FROM menu_carousel_slides
   WHERE restaurant_id = '<your-restaurant-uuid>' AND is_active;
   ```

### Video upload notes for staff

- Recommended: 16:9 aspect ratio, H.264/MP4 for web compatibility
- Set reasonable max file size limits in Storage bucket settings

## Stripe / Edge Function

The client calls:

```http
POST {EXPO_PUBLIC_BACKEND_URL}/create-payment-intent
Authorization: Bearer {EXPO_PUBLIC_SUPABASE_ANON_KEY}
Content-Type: application/json

{ "amount": <cents>, "restaurantId": "<uuid>", "currency": "usd", "email": "customer@example.com" }
```

Response must include `{ "clientSecret": "pi_..." }`. Email is required at checkout so Stripe can set `receipt_email` on the PaymentIntent.

Ensure your deployed function matches that contract. Set `restaurants.stripe_account_id` for Connect destinations.

## Resend email (order / marketing / reviews)

### 1. Run migration

```bash
# File: supabase/migrations/20260730_email_resend.sql
```

Adds restaurant domain columns, customer `marketing_opt_in`, and order `*_email_sent_at` timestamps.

### 2. Deploy Edge Functions + secrets

```bash
supabase secrets set RESEND_API_KEY=re_... RESEND_WEBHOOK_SECRET=whsec_...
supabase functions deploy create-payment-intent
supabase functions deploy send-order-email
supabase functions deploy sync-marketing-contact
supabase functions deploy send-broadcast
supabase functions deploy manage-email-domain
supabase functions deploy resend-webhook
```

Do **not** put Resend keys in `EXPO_PUBLIC_*` env vars.

### 3. Database Webhooks (recommended)

Dashboard → Database → Webhooks:

| Name | Table | Events | URL |
|------|-------|--------|-----|
| order-email-insert | `orders` | INSERT | `…/functions/v1/send-order-email` |
| order-email-update | `orders` | UPDATE | `…/functions/v1/send-order-email` |

Header: `Authorization: Bearer <SERVICE_ROLE_KEY>`.

The function is idempotent (`order-confirm/{id}`, `order-ready/{id}`, `review-request/{id}`). The client also invokes it as a fallback after `createOrder` / status updates.

### 4. Resend webhook

Point Resend → `…/functions/v1/resend-webhook` for `email.bounced`, `email.complained`, and store the signing secret as `RESEND_WEBHOOK_SECRET`.

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
| `/checkout` | Checkout |
| `/confirmation` | Order confirmed |
| `/admin` | Admin (staff) — includes **Promo** tab for carousel management |

## Connect a new restaurant

```bash
node scripts/createRestaurant.js --slug my-cafe --name "My Cafe"
```

Then add menu data in Supabase and set `stripe_account_id` on the restaurant row.
