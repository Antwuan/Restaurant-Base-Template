---
target: menu
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-11T20-23-22Z
slug: ordering-system-src-screens-customer-menuscreen-js
---
Method: dual-agent (A: 72abe721-b852-4463-b13b-47faeb76e3c4 · B: 4f1a97ee-2f43-471a-b496-9bb2c181687a)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Add-from-card “+” has weak confirmation; category active state doesn’t track scroll |
| 2 | Match System / Real World | 3 | Familiar menu language; “Open Now” may oversimplify vs hours |
| 3 | User Control and Freedom | 3 | Clear search/modal/cart exits; no undo after add |
| 4 | Consistency and Standards | 1 | Card opens customize modal; “+” adds without required modifiers |
| 5 | Error Prevention | 2 | Modal validates mods; quick-add bypasses; location enforced late |
| 6 | Recognition Rather Than Recall | 3 | Categories, search, images, prices visible |
| 7 | Flexibility and Efficiency | 2 | Search + sticky cats help; dual add paths uneven, not accelerators |
| 8 | Aesthetic and Minimalist Design | 2 | Clean but chrome-heavy and generic; brand-tinted descriptions add noise |
| 9 | Error Recovery | 3 | Retry, clear search, modifier errors; empty states exist |
| 10 | Help and Documentation | 1 | Thin hints; faux “Sign in” link in points block |
| **Total** | | **22/40** | **Acceptable** |

#### Design Specificity Verdict

**LLM assessment**: Mostly category-interchangeable — competent Toast/DoorDash-adjacent ordering menu, not a distinctive restaurant storefront. Flat white canvas, system typography, hairline rules, and image-right cards could swap any QSR brand. Per-restaurant identity is accent paint (spinner, chips, CTA, oddly item descriptions) rather than place. `MenuCarousel` exists but is not mounted on the customer menu path. Hard-coded greys bypass theme tokens.

**Deterministic scan**: `detect.mjs --json` on MenuScreen + related menu/cart/nav components → `[]`, exit 0. Zero automated antipattern hits. Detector did not surface the P0 modifier bypass (behavioral, not static pattern).

**Visual overlays**: No reliable user-visible overlay. App serves `http://localhost:8081/menu` (HTTP 200), but browser automation could not hold/navigate a tab, so `detect.js` injection never ran.

#### Overall Impression

Solid operate IA (categories → items → modal → cart) with good state coverage, undermined by a critical inconsistency on the primary add control and a chrome-heavy first viewport that delays “food.” Biggest opportunity: make “+” mean the same as “customize when required,” then lead the screen with food instead of shell chrome.

#### What's Working

1. **Category operate pattern** — Desktop sticky sidebar + mobile chips + search is the right IA for finding food fast.
2. **State coverage** — Loading, error+Retry, empty, no-results, closed banner, unavailable cards/modal.
3. **Item card + modal craft** — Image-right cards, labeled “+”, and a modal with modifiers/qty/price footer support the core flow when guests open customize.

#### Priority Issues

**[P0] Card “+” bypasses required customizations**
- **What**: `MenuItem` “+” calls `onAddToCart(item)` while card press opens `MenuItemModal`; required `modifier_groups` can be skipped.
- **Why it matters**: Wrong tickets, kitchen errors, guest confusion — breaks Operate trust.
- **Fix**: “+” opens modal when required modifiers exist; quick-add only when none are required.
- **Suggested command**: `/impeccable harden menu` (or `/impeccable clarify` for the dual-path UX)

**[P1] Chrome stack vs single operate focus**
- **What**: Navbar (Menu/Catering/Careers) + info bar + pickup + search/cats before items.
- **Why it matters**: Hungry Guest’s primary task is delayed; first viewport isn’t food.
- **Fix**: Collapse meta, demote non-order nav, lead with categories/items (or carousel).
- **Suggested command**: `/impeccable layout menu` · `/impeccable distill menu`

**[P1] Weak tenant place / brand specificity**
- **What**: Flat white + system type; brand as accents; menu carousel unused on this surface.
- **Why it matters**: Feels like a template, not this restaurant’s storefront.
- **Fix**: Atmosphere plane, tenant type/color ownership, stop hard-coding greys; mount carousel or equivalent food imagery.
- **Suggested command**: `/impeccable bolder menu` · `/impeccable document` (if recording the incumbent first)

**[P2] Weak add confirmation & fake loyalty CTA**
- **What**: Quick-add = button spring only; modal “Sign in” is non-interactive text styled as a link.
- **Why it matters**: Guests unsure item was added; dead affordance erodes trust.
- **Fix**: Toast/badge pulse + open-cart cue; real sign-in control or remove.
- **Suggested command**: `/impeccable animate menu` · `/impeccable clarify menu`

**[P2] Deferred location gate**
- **What**: Browse/add before pickup; checkout blocks with `Alert`.
- **Why it matters**: Late emotional valley; mobile guests lose momentum.
- **Fix**: Soft-block earlier or keep location always visible with stronger status.
- **Suggested command**: `/impeccable harden menu` · `/impeccable onboard menu`

#### Persona Red Flags

**Jordan (First-Timer)**: Unclear card vs “+”; “+” may skip options they didn’t know existed; Catering/Careers confuse “I just want food”; faux Sign in looks broken.

**Casey (Distracted Mobile)**: Cart/hamburger top-heavy (thumb-hostile); pickup auto-open interrupts browse; category chips + search + long list lose place after interruption (active cat not scroll-synced).

**Riley (Stress Tester)**: Required modifiers vs quick-add inconsistency; non-working Sign in; `max_select` silently rotates selections.

**Hungry Guest (project)**: Friction is chrome before food, location nag, loyalty mid-customize, and fear that “+” didn’t customize — brand accent alone doesn’t sell appetite.

#### Minor Observations

- Brand-colored item descriptions read like links/promos.
- `infoBar` name duplicates navbar restaurant name.
- “Pay with points” always shown mid-customize.
- Web search focus ring removed (`outlineStyle: 'none'`).
- Suggestion placeholder uses emoji vs ionicon elsewhere.

#### Questions to Consider

1. If the first screenful had only categories + food, would conversion rise?
2. Should “+” mean instant add only when there are zero required modifiers?
3. What would make this feel like this restaurant’s room without slowing Operate?
4. Is pickup a gate before browse or a checkout detail — pick one?
5. Does “Pay with points” belong on the add-item modal at all?
