---
target: home
total_score: 17
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 2
timestamp: 2026-08-12T03-17-38Z
slug: ordering-system-src-screens-customer-homescreen-js
---
Method: dual-agent (A: 417e629c-2a49-44d0-bd7a-77d785f12bce · B: daa8eb18-a8ce-4ea8-8066-d778f8e1fb41)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Full-page loader; open/closed not in hero |
| 2 | Match System / Real World | 2 | No pickup/delivery language; stock About/Rewards copy |
| 3 | User Control and Freedom | 3 | Modals closable; autoplay hero no pause; loader blocks |
| 4 | Consistency and Standards | 2 | Three order labels; cart omitted on Home |
| 5 | Error Prevention | 2 | Order Now without hours/closed cue; live placeholders |
| 6 | Recognition Rather Than Recall | 3 | Labeled CTAs solid; cart invisible on Home |
| 7 | Flexibility and Efficiency | n/a | Persuade landing — expert accelerators not the job |
| 8 | Aesthetic and Minimalist Design | 1 | Brochure stack + duplicate copy + Rewards interrupt |
| 9 | Error Recovery | 2 | Media timeout ok; empty About shows unfinished state |
| 10 | Help and Documentation | n/a | Persuade storefront — phone/location is the help |
| **Total** | | **17/32** | **Acceptable** |

#### Design Specificity Verdict

**LLM assessment**: Category-interchangeable white-label template. Brand color/name swap in; Ken Burns hero, dashed “Image coming soon,” Rewards band, map card, dark footer could belong to any cuisine. Typography is default RN weight/size stacking; rounded-full CTAs and generic fallbacks (“Fresh food, made with care…”) lack tenant place. Persuade job diluted by brochure IA.

**Deterministic scan**: `detect.mjs --json` on HomeScreen (+ CustomerNavbar, LocationCard, motion helpers) → `[]`, exit 0. Zero antipattern hits. Behavioral gaps (cart missing, pickup/closed cue) not static-detectable.

**Visual overlays**: No reliable overlay. Home is reachable (HTTP 200) but browser tabs could not be retained for inject/`detect.js`.

#### Overall Impression

Strong Order Now → Menu handoff and brand-color wiring, undercut by a brochure scroll that never answers “can I get food from *this* place *now*?” Biggest opportunity: first viewport that closes pickup/open status + one CTA, then hide empty tenant slots.

#### What's Working

1. Hero **Order Now** → Menu is the right primary Operate handoff.
2. Tenant brand color wired through navbar, eyebrows, CTAs, Rewards band.
3. LocationCard hours modal + map supports visit trust without dumping the week inline.

#### Priority Issues

**[P0] First viewport doesn’t close the order decision**
- **What**: Hero sells name/Order Now but not pickup vs delivery, open/closed, or ETA.
- **Why**: Hungry guests decide “can I order *now*?” — without that they bounce.
- **Fix**: One line under CTA: open status + pickup/delivery; kill competing first-screen jobs.
- **Suggested command**: `/impeccable clarify home`

**[P1] About is redundant trust-killer**
- **What**: Same description as hero; “Image coming soon” when about image missing.
- **Why**: Noise + unfinished tenant content on a live guest path.
- **Fix**: Hide About when no unique content/image; never ship placeholder chrome.
- **Suggested command**: `/impeccable distill home`

**[P1] Rewards banner interrupts the order path**
- **What**: Full-bleed Join Rewards above Location, equal weight to ordering.
- **Why**: Loyalty is post-conversion; steals Menu handoff attention.
- **Fix**: Demote to footer or post-order; one secondary path max below hero.
- **Suggested command**: `/impeccable quieter home`

**[P2] Cart missing on Home**
- **What**: Navbar without `onOpenCart` on Home.
- **Why**: Mid-order guests lose cart recognition.
- **Fix**: Pass cart open handler like Menu.
- **Suggested command**: `/impeccable harden home`

**[P2] Template-generic visual language**
- **What**: Default type, pill CTAs, white slabs, Ken Burns as default flavor.
- **Why**: Color alone isn’t restaurant atmosphere.
- **Fix**: Food-led first composition, curated type, fewer equal sections.
- **Suggested command**: `/impeccable bolder home`

#### Persona Red Flags

**Jordan**: Menu + Catering + Careers before understanding ordering; three order labels; no pickup/delivery explanation.

**Casey**: Mid-hero CTA thumb-hostile; full-page loader; long scroll before hours/address; no sticky order after leaving hero.

**Riley**: Missing about image → placeholder; autoplay no pause; closed state not at Order Now; duplicate description looks like CMS bug.

**Hungry Guest**: Can’t tell pickup vs delivery or open kitchen from Home; cart invisible mid-order; Rewards/Careers compete with “I just want food.”

#### Minor Observations

- Hero 48px title likely oversized on narrow phones.
- Footer Careers duplicates nav Hiring.
- Home not in NAV_LINKS — no active home link.
- Motion budget high for ops-first guest path.

#### Questions to Consider

1. If Home’s only job is decide → Menu, why keep a multi-section brochure?
2. Would removing About + Rewards from the default scroll raise order starts more than hero polish?
3. What one line closes the first viewport: open/closed + pickup/delivery + Order?
4. Should empty tenant slots hide entirely instead of “coming soon”?
5. Are Catering/Careers in primary nav worth first-visit confusion for tonight’s order?
