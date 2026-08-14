---
target: cart
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-12T01-39-55Z
slug: urant-ordering-system-src-components-cartdrawer-js
---
Method: dual-agent (A: 316c0e5c-cabe-4bd2-ba72-a6d6ff57d581 · B: 57568a9d-3068-40a1-8616-58263b5fcf52)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Totals update; pickup readiness invisible until Alert after Proceed |
| 2 | Match System / Real World | 3 | Guest language OK; hardcoded Pickup + Tax (8%) feel template |
| 3 | User Control and Freedom | 2 | Close/backdrop OK; Clear all & remove irreversible; no edit-item |
| 4 | Consistency and Standards | 2 | “Cart” vs “Your Order”; drawer ignores theme; OrderSummary palette drifts |
| 5 | Error Prevention | 1 | Clear all unconfirmed; Proceed can fail after drawer closes |
| 6 | Recognition Rather Than Recall | 2 | No item images; mods truncated; location/order type not on surface |
| 7 | Flexibility and Efficiency | 2 | Qty ± works; can’t reopen customize; no useful accelerators |
| 8 | Aesthetic and Minimalist Design | 3 | Operate-clean; dual headers + per-line cards add chrome |
| 9 | Error Recovery | 1 | No undo after clear/remove; checkout fail dismisses drawer then Alert |
| 10 | Help and Documentation | 1 | Empty-state hint only; no tax/pickup/edit guidance |
| **Total** | | **19/40** | **Poor** |

#### Design Specificity Verdict

**LLM assessment**: Category-generic ecommerce cart drawer. Hard-coded white/`#111` chrome, dual “Cart” / “Your Order” titles, emoji empty state, brand only on accents (Browse Menu, qty, Proceed). Forced `orderType="pickup"` and fixed Tax (8%) could belong to any QSR template. No dish imagery, restaurant name, pickup address, or ETA—white-label-safe, identity-weak.

**Deterministic scan**: `detect.mjs --json` on CartDrawer.js + CartPanel.js + CartItem.js → `[]`, exit 0 (multi-path and per-file). Zero automated antipattern hits. Detector did not surface the P0 checkout handoff (behavioral, not static pattern).

**Visual overlays**: No reliable user-visible overlay. App serves `http://localhost:8081/menu` (HTTP 200), but browser automation could not retain/navigate a tab, so mutation preflight, live-server, and `detect.js` injection were skipped.

#### Overall Impression

Competent Operate shell (sticky Proceed / Add More, readable line items) undermined by a hostile checkout handoff and template-level truth gaps (location, order type, tax). Biggest opportunity: make the drawer tell the truth about where/when the order goes and never dismiss itself on a blocked Proceed.

#### What's Working

1. **Sticky bottom bar** — Brand **Proceed to Checkout** + **+ Add More** keeps primary/secondary clear and thumb-reachable.
2. **Line review density** — Name, unit price, line total, notes, modifiers, Remove, and ± are present for Operate review.
3. **Empty → menu path** — “Your cart is empty” + **Browse Menu** is the right recovery loop.

#### Priority Issues

**[P0] Proceed closes drawer then Alerts “Pickup location needed”**
- **What**: `handleCheckout` can dismiss the cart, then block with an Alert when pickup isn’t set.
- **Why it matters**: Peak-end failure at payment intent; feels broken after the guest committed to checkout.
- **Fix**: Disable/block Proceed until location is set; show selected location in-drawer; keep drawer open on fail.
- **Suggested command**: `/impeccable harden cart`

**[P1] Forced Pickup badge + always Tax (8%)**
- **What**: `OrderSummary` hardcodes pickup and 8% tax regardless of tenant/order type.
- **Why it matters**: Misstates delivery and tax before Stripe—trust break.
- **Fix**: Bind real order type/schedule; show real tax label or omit false precision.
- **Suggested command**: `/impeccable clarify cart`

**[P1] Clear all / Remove with no confirm or undo**
- **What**: One tap can wipe the cart or delete a line; qty→0 removes silently.
- **Why it matters**: Hungry guests on mobile mis-tap under stress; no recovery.
- **Fix**: Confirm Clear all; toast/undo for remove; clearer destroy vs edit for qty→0.
- **Suggested command**: `/impeccable harden cart`

**[P2] Dual titles “Cart” + “Your Order”**
- **What**: Drawer header and panel header compete.
- **Why it matters**: Hierarchy noise; feels unfinished/template.
- **Fix**: One title (e.g. “Your order (3)”); demote Clear.
- **Suggested command**: `/impeccable distill cart`

**[P2] No edit path for modifiers/notes from cart line**
- **What**: Wrong build forces delete/re-add.
- **Why it matters**: First-timers and stress testers bounce instead of fixing the line.
- **Fix**: Tap line → reopen customize; show full mod list.
- **Suggested command**: `/impeccable shape cart`

#### Persona Red Flags

**Casey (Distracted Mobile)**: Top Clear all vs bottom Proceed—easy mis-tap; qty targets ~30×30; drawer lost after failed Proceed Alert.

**Jordan (First-Timer)**: Cart vs Your Order confusion; 🏪 Pickup looks confirmed but is hardcoded; no help on tax/location.

**Riley (Stress Tester)**: Clear all unguarded; Proceed + missing pickup state machine smell; truncated mods hide wrong builds; restaurant switch clears cart with no in-drawer explanation.

**Hungry Guest (project)**: Can’t verify location, ASAP vs schedule, or pickup vs delivery before paying; handoff friction spikes abandonment when already decided.

#### Minor Observations

- Empty-state emoji undermines white-label craft.
- Per-line card shadows vs flat list on long orders.
- OrderSummary flush vs item margins.
- CartScreen.js deprecated re-export—full-page cart parity gone.
- Clear all / Proceed a11y names weaker than Close.

#### Questions to Consider

1. If the drawer can’t show where and when food arrives, should Proceed even enable?
2. Would one title—“Your order (3)”—beat the double header?
3. What belongs in the last 200px before pay: address + ASAP, or another totals card?
4. Should qty→0 feel like edit or destroy—and does the UI say which?
5. If brand color is the only tenant signal, is this still a restaurant storefront?
