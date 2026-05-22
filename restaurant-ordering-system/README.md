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

## Stripe / Edge Function

The client calls:

```http
POST {EXPO_PUBLIC_BACKEND_URL}/create-payment-intent
Authorization: Bearer {EXPO_PUBLIC_SUPABASE_ANON_KEY}
Content-Type: application/json

{ "amount": <cents>, "restaurantId": "<uuid>", "currency": "usd" }
```

Response must include `{ "clientSecret": "pi_..." }`.

Ensure your deployed function matches that contract. Set `restaurants.stripe_account_id` for Connect destinations.

### Test cards

- Success: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`

Any future expiry and any CVC.

## Routes

| Path | Screen |
|------|--------|
| `/menu` | Menu |
| `/cart` | Cart |
| `/checkout` | Checkout |
| `/confirmation` | Order confirmed |
| `/admin` | Admin (staff) |

## Connect a new restaurant

```bash
node scripts/createRestaurant.js --slug my-cafe --name "My Cafe"
```

Then add menu data in Supabase and set `stripe_account_id` on the restaurant row.
