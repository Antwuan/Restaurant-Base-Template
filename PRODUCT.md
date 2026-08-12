# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: restaurant guests ordering food online for pickup or delivery from a specific restaurant’s storefront.
Secondary: restaurant staff and owners operating the day-to-day control panel (menu, orders, promos/carousel, rewards, marketing email, settings).

## Product Purpose

A white-label restaurant ordering base that restaurants can deploy as their own first-party ordering site. Guests browse the menu, customize items, pay, and track order status. Staff manage menu content, fulfill orders, run promotions, and communicate with customers. Success means guests complete orders without friction and staff can run service without leaving the admin.

## Positioning

Ops-first for staff, clean and fast for guests. The durable advantage is operational control—menu editing, order flow, carousel/promos, rewards, Resend email domain—more than marketplace or marketing flash. Each tenant is a restaurant-owned storefront (slug/domain), not a multi-restaurant marketplace.

## Operating Context

- Multi-tenant by restaurant slug or hostname; session remembers the active restaurant.
- Guest paths: home, menu (carousel + categories), cart drawer, checkout (Stripe), confirmation.
- Staff paths: admin for orders, menu editor, carousel/promo, rewards, marketing/broadcasts, applications/hiring, home page editor, settings (including transactional email domain).
- Backing stack in use: Expo (web), Supabase (Auth, DB, Storage, Edge Functions), Stripe Connect, Resend for order and marketing email.

## Capabilities and Constraints

- Confirmed: menu browsing and cart; pickup/delivery order types; Stripe Connect payments; staff admin; carousel slides; customer profiles/sign-in; rewards; promo validation; order emails and review requests; marketing broadcasts; hiring/applications; per-restaurant brand color theming.
- Web-only product surface (Expo web); native mobile apps are not the design target.
- Open: product market name beyond the working title “Restaurant Ordering System”; WCAG/accessibility compliance level; commercial packaging (how restaurants are sold/onboarded).

## Brand Commitments

Working product name: Restaurant Ordering System. Per-restaurant brand identity (name, description, brand color, imagery) is tenant data, not a single global brand. No binding platform voice or identity system has been confirmed beyond that.

## Evidence on Hand

- Runnable app under `restaurant-ordering-system/` with customer and admin screens, theme tokens, and Supabase/Stripe/Resend integrations documented in the README.
- No confirmed customer testimonials, press, pricing tiers, or real restaurant case studies for the template itself—future work must not fabricate those.

## Product Principles

1. Guest paths stay clear and fast; expression never blocks ordering.
2. Staff tooling is a first-class product surface—operational clarity beats decoration.
3. Each restaurant owns its storefront identity; the template must stay white-label and tenant-safe.
4. Preserve real payment, auth, and email contracts; do not invent business proof or claims.
5. Prefer durable, multi-tenant-safe patterns over one-off restaurant-specific chrome in the base.
